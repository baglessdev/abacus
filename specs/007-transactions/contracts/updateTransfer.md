# Server Action — `updateTransfer`

Atomically updates **both legs** of an existing TRANSFER pair. The two legs are identified by their shared `transferGroupId`; the user submits one `id` (either leg), and the action reconciles to both. **This is the second load-bearing atomicity contract** (FR-016, constitution Principle I).

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from the edit form inside the transfer side sheet (`<TransferFormSheet>` in `edit` mode), bound via React 19 `useActionState`.

## Signature

```ts
async function updateTransfer(
  prevState: UpdateTransferResult | null,
  formData: FormData,
): Promise<UpdateTransferResult>

type UpdateTransferResult =
  | { data: { transfer: TransferPairDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty; references EITHER leg of a TRANSFER pair owned by the session's user. The action pre-fetches by id, then locates both legs via the shared `transferGroupId`. |
| `fromAccountId` | string | yes | Non-empty; references an `Account` owned by the session's user and non-archived. |
| `toAccountId` | string | yes | Non-empty; references an `Account` owned by the session's user and non-archived. **MUST differ from `fromAccountId`**. **MUST share currency with the `fromAccount`** AND with the existing transfer's `currency` (FR-007, FR-015). |
| `date` | string | yes | `YYYY-MM-DD` ISO calendar date. Normalized to UTC midnight. Applied to BOTH legs. |
| `amount` | string | yes | User-entered **positive magnitude**. Magnitude > 0. Currency-aware decimal-places per the from-account's currency. |
| `notes` | string | no | Trimmed; empty → `null`. Max 500. Applied to BOTH legs. |

`transferGroupId`, `type`, `currency`, `userId`, `categoryId`, `payee` are **never** accepted from input. The `transferGroupId` is the existing row's value (unchanged across the edit); `currency` is the existing row's value (also unchanged — same-currency invariant means swapping account-currency is not allowed); `categoryId` stays `null`; `payee` stays `null`.

## Zod schema sketch

```ts
// lib/transactions/schemas.ts (shape only)

export function makeUpdateTransferSchema(userId: string, existingCurrency: string) {
  return z
    .object({
      id: z.string().min(1, "Missing transaction id"),
      fromAccountId: z.string().min(1, "Pick a source account"),
      toAccountId: z.string().min(1, "Pick a destination account"),
      date: z.string().refine(isISODateString, "Pick a date"),
      amount: z.string().trim().refine(v => /^\d+(\.\d+)?$/.test(v), "Enter a positive amount"),
      notes: z.string().trim().transform(v => v === "" ? null : v).pipe(z.string().max(500).nullable()),
    })
    .superRefine(async (value, ctx) => {
      if (value.fromAccountId === value.toAccountId) {
        ctx.addIssue({
          path: ["toAccountId"], code: "custom",
          message: "Source and destination must be different accounts",
          params: { errorCode: "transfer_same_account" },
        })
        return
      }
      const fromAccount = await getAccountForUser(userId, value.fromAccountId)
      const toAccount = await getAccountForUser(userId, value.toAccountId)
      if (!fromAccount || fromAccount.archivedAt !== null) {
        ctx.addIssue({
          path: ["fromAccountId"], code: "custom",
          message: "Source account not found or archived",
          params: { errorCode: "archived_account_blocked" },
        })
      }
      if (!toAccount || toAccount.archivedAt !== null) {
        ctx.addIssue({
          path: ["toAccountId"], code: "custom",
          message: "Destination account not found or archived",
          params: { errorCode: "archived_account_blocked" },
        })
      }
      // Currency invariants:
      //   - from-account currency == existing-transfer currency
      //   - to-account   currency == existing-transfer currency
      // (Both equivalent to: cannot swap to a different-currency account.)
      if (fromAccount && fromAccount.currency !== existingCurrency) {
        ctx.addIssue({
          path: ["fromAccountId"], code: "custom",
          message: "Cannot change to a different-currency account",
          params: { errorCode: "currency_mismatch" },
        })
      }
      if (toAccount && toAccount.currency !== existingCurrency) {
        ctx.addIssue({
          path: ["toAccountId"], code: "custom",
          message: "Cannot change to a different-currency account",
          params: { errorCode: "currency_mismatch" },
        })
      }
      // Cross-currency check between the two new accounts (defense-in-depth)
      if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
        ctx.addIssue({
          path: ["toAccountId"], code: "custom",
          message: "Cross-currency transfers are not supported in this version",
          params: { errorCode: "transfer_cross_currency" },
        })
      }
      // Magnitude validation
      const amountResult = validateTransactionAmount({
        type: "TRANSFER", amount: value.amount, currency: existingCurrency,
      })
      if (!amountResult.ok) {
        ctx.addIssue({ path: ["amount"], code: "custom", message: amountResult.message })
      }
    })
}
```

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Extract `id` from `formData`; trim. Reject if empty.
3. **Pre-fetch the row** via `getTransactionForUser(session.user.id, id)`. On miss → `{ error: { code: "not_found", … } }`.
4. **Reject non-TRANSFER rows.** If `row.type !== "TRANSFER"` OR `row.transferGroupId === null`, return `{ error: { code: "validation_failed", fieldErrors: { id: ["This row is not a transfer; use updateTransaction"] } } }`. (Distinct from `transfer_leg_isolated`, which means the inverse misroute.)
5. **Reject archived transfers.** If `row.archivedAt !== null`, return `{ error: { code: "not_found", … } }` (archived rows are not editable; the user must unarchive first).
6. **Fetch both legs.** `const legs = await getTransferLegsForUser(session.user.id, row.transferGroupId)`. Expect `legs.length === 2`; if not, return `internal_error` (impossible-state defensive guard).
7. Build `makeUpdateTransferSchema(session.user.id, row.currency)`; `await schema.safeParseAsync({ id, ...formData })`.
8. On schema failure, route per `params.errorCode` (`transfer_same_account` / `archived_account_blocked` / `currency_mismatch` / `transfer_cross_currency`); default to `validation_failed`.
9. **The atomic step.** Open the transaction:
   ```ts
   const pair = await prisma.$transaction(async (tx) => {
     const sourceLeg = legs.find(l => new Money(l.amount).isNegative())!
     const destLeg   = legs.find(l => !new Money(l.amount).isNegative())!
     const magnitude = new Money(parsed.amount)
     const date = normalizeToUtcDay(parsed.date)
     const updatedSource = await tx.transaction.update({
       where: { id: sourceLeg.id },
       data: {
         accountId: parsed.fromAccountId,
         amount: magnitude.negated(),
         date,
         notes: parsed.notes,
         // currency / type / transferGroupId / categoryId / userId / payee are NEVER changed
       },
     })
     const updatedDest = await tx.transaction.update({
       where: { id: destLeg.id },
       data: {
         accountId: parsed.toAccountId,
         amount: magnitude,
         date,
         notes: parsed.notes,
       },
     })
     return { source: updatedSource, destination: updatedDest }
   })
   ```
10. On Prisma error (either leg's `update` throws) → Postgres rolls back the entire transaction; the action surfaces `internal_error`. **NEVER persists a half-edit.**
11. On success: call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` and return `{ data: { transfer: { source, destination } } }`.

## Success — `data` shape

```ts
{
  data: {
    transfer: {
      source: TransactionDTO       // amount < 0; updated accountId = fromAccountId
      destination: TransactionDTO  // amount > 0; updated accountId = toAccountId
    }
  }
}
```

Both rows share (unchanged across the edit): `userId`, `currency`, `type === "TRANSFER"`, `transferGroupId`, `categoryId === null`, `payee === null`, `archivedAt === null`.

Both rows share (updated by the edit): `date`, `notes`, `updatedAt`.

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `not_found` | Transaction id does not exist, belongs to another user, OR is archived (must unarchive first) | — |
| `validation_failed` | Row is not a transfer, OR Zod parse failed for shape reasons (missing required, malformed amount, magnitude ≤ 0, decimals > currency, notes > 500) | `fieldErrors` keyed by failing field |
| `transfer_same_account` | `fromAccountId === toAccountId` | `field: "toAccountId"` |
| `transfer_cross_currency` | The two NEW accounts differ in currency from each other | `field: "toAccountId"` |
| `currency_mismatch` | Either new account's currency differs from the existing transfer's currency | `field: "fromAccountId"` or `field: "toAccountId"` |
| `archived_account_blocked` | Either new account is archived | `field: "fromAccountId"` or `field: "toAccountId"` |
| `internal_error` | Prisma threw on either leg's update, OR the two-leg fetch returned ≠ 2 rows | — |

## Side effects

- Updates **exactly two** rows (or zero — never one).
- Calls `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` on success.

## Atomicity

`prisma.$transaction(async (tx) => { update-source; update-destination })`. Postgres rollback semantics guarantee both-or-neither. This is the second of the two constitution-mandated atomicity invariants (the first is `createTransfer`).

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-010, FR-012, FR-013, FR-015, FR-016, FR-022, FR-024, FR-025, FR-027, FR-028, FR-031.

## Applicable SCs

SC-004, SC-006, SC-010, SC-012, SC-013, SC-015, SC-017.
