# Server Action — `updateTransaction`

Updates a single `Transaction` row of `type === "INCOME"` or `type === "EXPENSE"` owned by the session's user. **Rejects TRANSFER legs** with `transfer_leg_isolated` — TRANSFER edits route through `updateTransfer`.

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from the edit form inside the transactions page's side sheet (`<TransactionFormSheet>` in `edit` mode), bound via React 19 `useActionState`.

## Signature

```ts
async function updateTransaction(
  prevState: UpdateTransactionResult | null,
  formData: FormData,
): Promise<UpdateTransactionResult>

type UpdateTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty; references a `Transaction` owned by the session's user with `type !== "TRANSFER"`. |
| `accountId` | string | yes | Non-empty; references an `Account` owned by the session's user. The account may be either non-archived OR the row's existing `accountId` (a user editing a transaction on an account they've since archived must be allowed to save the rest of the edit). Currency MUST equal the existing row's currency (`currency_mismatch` otherwise — FR-007). |
| `categoryId` | string | no | Empty-string treated as `null`. When non-null: references a `Category` owned by the session's user with `kind` matching the submitted `type`. Archived categories accepted on edit (the user may keep the currently-archived selection). |
| `date` | string | yes | `YYYY-MM-DD` ISO calendar date. Normalized to UTC midnight. |
| `amount` | string | yes | User-entered **positive magnitude** as canonical decimal string. Magnitude > 0. Currency-aware decimal-place rule. The form prepends `-` per `type` before posting; the schema accepts a signed value and validates sign-must-match-type. |
| `type` | string | yes | One of `"INCOME"`, `"EXPENSE"`. `"TRANSFER"` is rejected. |
| `payee` | string | no | Trimmed; empty → `null`. Max 120. |
| `notes` | string | no | Trimmed; empty → `null`. Max 500. |

`transferGroupId`, `archivedAt`, `currency`, `userId` are **never** accepted from input.

## Zod schema sketch

```ts
// lib/transactions/schemas.ts (shape only)

export function makeUpdateTransactionSchema(userId: string, existingCurrency: string) {
  return z
    .object({
      id: z.string().min(1, "Missing transaction id"),
      accountId: z.string().min(1, "Pick an account"),
      categoryId: z.string().transform(v => v === "" ? null : v).pipe(z.string().nullable()),
      date: z.string().refine(isISODateString, "Pick a date"),
      amount: z.string().trim().refine(v => /^-?\d+(\.\d+)?$/.test(v), "Enter a valid amount"),
      type: z.enum(["INCOME", "EXPENSE"], { message: "Pick INCOME or EXPENSE" }),
      payee: z.string().trim().transform(v => v === "" ? null : v).pipe(z.string().max(120).nullable()),
      notes: z.string().trim().transform(v => v === "" ? null : v).pipe(z.string().max(500).nullable()),
    })
    .superRefine(async (value, ctx) => {
      // 1: account ownership + currency-must-match-existing
      const account = await getAccountForUser(userId, value.accountId)
      if (!account) {
        ctx.addIssue({ path: ["accountId"], code: "custom", message: "Account not found" })
        return
      }
      if (account.currency !== existingCurrency) {
        ctx.addIssue({
          path: ["accountId"], code: "custom",
          message: "Cannot reassign to an account in a different currency",
          params: { errorCode: "currency_mismatch" },
        })
      }
      // 2: category ownership + kind-match
      if (value.categoryId !== null) {
        const category = await getCategoryForUser(userId, value.categoryId)
        if (!category) {
          ctx.addIssue({ path: ["categoryId"], code: "custom", message: "Category not found" })
        } else if (category.kind !== value.type) {
          ctx.addIssue({ path: ["categoryId"], code: "custom", message: "Category kind must match transaction type" })
        }
      }
      // 3: validateTransactionAmount
      const amountResult = validateTransactionAmount({ type: value.type, amount: value.amount, currency: existingCurrency })
      if (!amountResult.ok) {
        ctx.addIssue({ path: ["amount"], code: "custom", message: amountResult.message })
      }
    })
}
```

Note: the schema takes `existingCurrency` as a closure argument because currency is the row's immutable invariant (denormalized from the original account at create time; cannot change via reassign per FR-007). The action body pre-fetches the row to compute this value.

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Extract `id` from `formData`; trim. Reject if empty.
3. **Pre-fetch the row** via `getTransactionForUser(session.user.id, id)`. On miss → `{ error: { code: "not_found", … } }`.
4. **Reject TRANSFER legs.** If `row.type === "TRANSFER"` (equivalently: `row.transferGroupId !== null`), return `{ error: { code: "transfer_leg_isolated", … } }`. (User must edit via `updateTransfer`.)
5. Build `makeUpdateTransactionSchema(session.user.id, row.currency)`; `await schema.safeParseAsync({ id, ...formData })`.
6. On schema failure, inspect issues for `params.errorCode` (currently only `currency_mismatch`); default to `validation_failed`.
7. Compute the **signed amount** to persist (same rule as `createTransaction`).
8. Call `updateTransactionForUser(session.user.id, id, { accountId, categoryId, date, amount: signedAmount, type, payee, notes })`.
9. On Prisma error → `{ error: { code: "internal_error", … } }`.
10. On success: call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` and return `{ data: { transaction: TransactionDTO } }`.

## Success — `data` shape

```ts
{
  data: {
    transaction: TransactionDTO   // see contracts/README.md
  }
}
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `not_found` | Transaction id does not exist OR belongs to another user | — |
| `transfer_leg_isolated` | The row's `type === "TRANSFER"` — must edit via `updateTransfer` | — |
| `validation_failed` | Zod parse failed (missing required, malformed amount, cross-user accountId, cross-user/kind-mismatched categoryId, magnitude ≤ 0, decimals > currency, payee > 120, notes > 500) | `fieldErrors` keyed by failing field |
| `currency_mismatch` | The new `accountId` references an account whose currency differs from the row's existing currency | `field: "accountId"` |
| `internal_error` | Prisma threw on update | — |

## Side effects

- Updates the single targeted row.
- Calls `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` on success.

## Atomicity

Single `prisma.transaction.updateMany({ where: { id, userId, type: { not: "TRANSFER" } }, data: ... })`. The `type: { not: "TRANSFER" }` predicate is belt-and-braces — the action body already pre-fetches and rejects TRANSFER rows; this prevents a race where a row's type changed between the pre-fetch and the update (which can't happen in practice since `type` is never edited, but it's free defense-in-depth).

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-013, FR-016, FR-024, FR-027, FR-028, FR-031.

## Applicable SCs

SC-002, SC-007, SC-010, SC-012, SC-013, SC-015.
