# Server Action — `createTransfer`

Atomically creates **two** `Transaction` rows of `type === "TRANSFER"` sharing a server-generated `transferGroupId`. **This is the load-bearing atomicity contract** for the entire feature (FR-014, constitution Principle I).

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from the create form inside the transfer side sheet (`<TransferFormSheet>` in `create` mode), bound via React 19 `useActionState`.

## Signature

```ts
async function createTransfer(
  prevState: CreateTransferResult | null,
  formData: FormData,
): Promise<CreateTransferResult>

type CreateTransferResult =
  | { data: { transfer: TransferPairDTO } }
  | { error: ErrorEnvelope }

type TransferPairDTO = {
  source: TransactionDTO       // amount < 0
  destination: TransactionDTO  // amount > 0
}
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `fromAccountId` | string | yes | Non-empty; references an `Account` owned by the session's user and non-archived. |
| `toAccountId` | string | yes | Non-empty; references an `Account` owned by the session's user and non-archived. **MUST differ from `fromAccountId`** (FR-014). **MUST share currency with the `fromAccount`** (FR-015). |
| `date` | string | yes | `YYYY-MM-DD` ISO calendar date. Normalized to UTC midnight via `normalizeToUtcDay`. |
| `amount` | string | yes | User-entered **positive magnitude** as canonical decimal string (e.g., `"500.00"`). Magnitude strictly > 0. Currency-aware decimal-place rule per the from-account's currency (which equals the to-account's currency by FR-015). |
| `notes` | string | no | Trimmed; empty-after-trim → `null`. Max 500 chars. Applied to BOTH legs. |

`transferGroupId`, `type`, `currency`, `userId`, `categoryId`, `payee` are **never** accepted from input. Transfers have no category (FR-006) and no payee (FR-024). `transferGroupId` is server-generated inside the transaction (`research.md` R3).

## Zod schema sketch

```ts
// lib/transactions/schemas.ts (shape only)

export function makeCreateTransferSchema(userId: string) {
  return z
    .object({
      fromAccountId: z.string().min(1, "Pick a source account"),
      toAccountId: z.string().min(1, "Pick a destination account"),
      date: z.string().refine(isISODateString, "Pick a date"),
      amount: z.string().trim().refine(v => /^\d+(\.\d+)?$/.test(v), "Enter a positive amount"),
      notes: z.string().trim().transform(v => v === "" ? null : v).pipe(z.string().max(500).nullable()),
    })
    .superRefine(async (value, ctx) => {
      // Boundary check 1: distinct accounts (FR-014)
      if (value.fromAccountId === value.toAccountId) {
        ctx.addIssue({
          path: ["toAccountId"], code: "custom",
          message: "Source and destination must be different accounts",
          params: { errorCode: "transfer_same_account" },
        })
        return
      }
      // Boundary check 2: both accounts owned + non-archived
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
      // Boundary check 3: same currency (FR-015)
      if (fromAccount && toAccount && fromAccount.currency !== toAccount.currency) {
        ctx.addIssue({
          path: ["toAccountId"], code: "custom",
          message: "Cross-currency transfers are not supported in this version",
          params: { errorCode: "transfer_cross_currency" },
        })
      }
      // Boundary check 4: magnitude validation (currency-aware decimals, > 0)
      if (fromAccount) {
        const amountResult = validateTransactionAmount({
          type: "TRANSFER", amount: value.amount, currency: fromAccount.currency,
        })
        if (!amountResult.ok) {
          ctx.addIssue({ path: ["amount"], code: "custom", message: amountResult.message })
        }
      }
    })
}
```

The `params.errorCode` tag is read by the action body to map a custom Zod issue to the right top-level error envelope code (`transfer_same_account` / `archived_account_blocked` / `transfer_cross_currency`). Otherwise it maps to `validation_failed`.

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Build `makeCreateTransferSchema(session.user.id)`; `await schema.safeParseAsync({ ...formData })`.
3. On schema failure, inspect issues for `params.errorCode` tags and route to the appropriate top-level error code; default to `validation_failed`.
4. **The atomic step.** Open the transaction:
   ```ts
   const pair = await prisma.$transaction(async (tx) => {
     const transferGroupId = createId() // server-side cuid, never from input
     const currency = fromAccount.currency // already verified to equal toAccount.currency
     const magnitude = new Money(parsed.amount)
     const date = normalizeToUtcDay(parsed.date)

     const source = await tx.transaction.create({
       data: {
         userId: session.user.id,
         accountId: parsed.fromAccountId,
         categoryId: null,
         date,
         amount: magnitude.negated(),  // negative leg
         currency,
         type: "TRANSFER",
         payee: null,
         notes: parsed.notes,
         transferGroupId,
       },
     })
     const destination = await tx.transaction.create({
       data: {
         userId: session.user.id,
         accountId: parsed.toAccountId,
         categoryId: null,
         date,
         amount: magnitude,            // positive leg
         currency,
         type: "TRANSFER",
         payee: null,
         notes: parsed.notes,
         transferGroupId,
       },
     })
     return { source, destination }
   })
   ```
5. On Prisma error (either leg's `create` throws) → Postgres rolls back the entire transaction; the action surfaces `internal_error`. **NEVER persists just one leg.**
6. On success: call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` and return `{ data: { transfer: { source, destination } } }`.

## Success — `data` shape

```ts
{
  data: {
    transfer: {
      source: TransactionDTO       // amount < 0; accountId = fromAccountId
      destination: TransactionDTO  // amount > 0; accountId = toAccountId
    }
  }
}
```

Both rows share: `userId`, `currency`, `date`, `type === "TRANSFER"`, `notes`, `transferGroupId`, `payee === null`, `categoryId === null`, `archivedAt === null`.

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Zod parse failed for shape reasons (missing required, malformed amount, magnitude ≤ 0, decimals > currency decimals, notes > 500) | `fieldErrors` keyed by failing field |
| `transfer_same_account` | `fromAccountId === toAccountId` | `field: "toAccountId"` |
| `transfer_cross_currency` | The two accounts have different currencies (FR-015) | `field: "toAccountId"` |
| `archived_account_blocked` | Either account is archived | `field: "fromAccountId"` or `field: "toAccountId"` |
| `internal_error` | Prisma threw on either leg (or the transaction itself) | — |

Cross-user references (the user submits an `accountId` belonging to another user) collapse to `archived_account_blocked` or, more precisely, to `validation_failed` with the field error "Account not found or archived" — the response is structurally indistinguishable from "your own archived account", which satisfies the FR-013 cross-user-collapse rule.

## Side effects

- Inserts **exactly two** rows into `Transaction` (or zero — never one).
- Both rows share a server-generated `transferGroupId`.
- Calls `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` on success.

## Atomicity

`prisma.$transaction(async (tx) => { create-source; create-destination })`. Postgres rollback semantics guarantee both-or-neither. **This is the constitution-mandated atomicity invariant** (Principle I).

If a future maintainer breaks the wrapping (e.g., extracts the `create` calls outside the `$transaction` callback by accident), the unit suite for transfer-pair invariant catches it (FR-032), AND the money-reviewer grep audit catches it (R26 in `research.md`).

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-022, FR-024, FR-027, FR-028, FR-031.

## Applicable SCs

SC-003, SC-006, SC-010, SC-011, SC-012, SC-013, SC-015, SC-017.
