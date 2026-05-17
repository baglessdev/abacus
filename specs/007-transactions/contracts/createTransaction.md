# Server Action — `createTransaction`

Creates a single `Transaction` row of `type === "INCOME"` or `type === "EXPENSE"` owned by the session's user. **Does NOT create a TRANSFER** — TRANSFER creation uses `createTransfer`.

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from the create form inside the transactions page's side sheet (`<TransactionFormSheet>` in `create` mode), bound via React 19 `useActionState`.

## Signature

```ts
async function createTransaction(
  prevState: CreateTransactionResult | null,
  formData: FormData,
): Promise<CreateTransactionResult>

type CreateTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: ErrorEnvelope }
```

The first argument is the previous-state slot mandated by `useActionState`; the action does not branch on it.

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `accountId` | string | yes | Non-empty; references an `Account` owned by the session's user and non-archived. Cross-user / non-existent / archived → field error on `accountId`. |
| `categoryId` | string | no | Empty-string treated as `null`. When non-null: references a `Category` owned by the session's user with `kind` matching the submitted `type` (INCOME ↔ INCOME, EXPENSE ↔ EXPENSE). Archived categories are accepted (FR-006a). |
| `date` | string | yes | `YYYY-MM-DD` ISO calendar date. Normalized to UTC midnight (`new Date(Date.UTC(y, m, d))`) via `normalizeToUtcDay`. No upper/lower bound. |
| `amount` | string | yes | User-entered **positive magnitude** as canonical decimal string (e.g., `"87.43"`). Currency-aware decimal-place rule per the account's currency. Magnitude > 0. The form prepends `-` before posting when `type === "EXPENSE"`; the schema also accepts a pre-signed value and validates sign-must-match-type. |
| `type` | string | yes | One of `"INCOME"`, `"EXPENSE"`. `"TRANSFER"` is **rejected** with `validation_failed { fieldErrors: { type: ["Use Add transfer for transfers"] } }`. |
| `payee` | string | no | Trimmed; empty-after-trim → `null`. Max 120 chars. |
| `notes` | string | no | Trimmed; empty-after-trim → `null`. Max 500 chars. |

`transferGroupId`, `archivedAt`, `currency`, and `userId` are **never** accepted from input (FR-003, FR-007, FR-012). Any keys present in the payload are silently dropped at the Zod boundary (`.strip()` default).

## Zod schema sketch

```ts
// lib/transactions/schemas.ts (shape only)

export function makeCreateTransactionSchema(userId: string) {
  return z
    .object({
      accountId: z.string().min(1, "Pick an account"),
      categoryId: z.string().transform(v => v === "" ? null : v).pipe(z.string().nullable()),
      date: z.string().refine(isISODateString, "Pick a date"),
      amount: z.string().trim().refine(v => /^-?\d+(\.\d+)?$/.test(v), "Enter a valid amount"),
      type: z.enum(["INCOME", "EXPENSE"], { message: "Pick INCOME or EXPENSE" }),
      payee: z.string().trim().transform(v => v === "" ? null : v).pipe(z.string().max(120).nullable()),
      notes: z.string().trim().transform(v => v === "" ? null : v).pipe(z.string().max(500).nullable()),
    })
    .superRefine(async (value, ctx) => {
      // Boundary check 1: account ownership + non-archived + read currency
      const account = await getAccountForUser(userId, value.accountId)
      if (!account || account.archivedAt !== null) {
        ctx.addIssue({ path: ["accountId"], code: "custom", message: "Account not found or archived" })
        return
      }
      // Boundary check 2: category ownership + kind-match (when categoryId is non-null)
      if (value.categoryId !== null) {
        const category = await getCategoryForUser(userId, value.categoryId)
        if (!category) {
          ctx.addIssue({ path: ["categoryId"], code: "custom", message: "Category not found" })
        } else if (category.kind !== value.type) {
          ctx.addIssue({ path: ["categoryId"], code: "custom", message: "Category kind must match transaction type" })
        }
      }
      // Boundary check 3: validateTransactionAmount (sign-must-match-type + decimals + magnitude > 0)
      const amountResult = validateTransactionAmount({ type: value.type, amount: value.amount, currency: account.currency })
      if (!amountResult.ok) {
        ctx.addIssue({ path: ["amount"], code: "custom", message: amountResult.message })
      }
    })
}
```

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Build `makeCreateTransactionSchema(session.user.id)`; `await schema.safeParseAsync({ ...formData })`.
3. On schema failure → `{ error: { code: "validation_failed", fieldErrors } }`.
4. Determine the **signed amount** to persist:
   - If the parsed `amount` is positive and `type === "EXPENSE"`, multiply by `-1`.
   - If the parsed `amount` is negative and `type === "INCOME"`, the schema already rejected this; unreachable.
   - Otherwise persist as-is.
5. Call `createTransactionForUser(session.user.id, { ...parsed, amount: signedAmount, currency: account.currency })` (helper in `lib/transactions/queries.ts`). The helper persists with `archivedAt: null` and `transferGroupId: null`.
6. On Prisma error → `{ error: { code: "internal_error", … } }`. The error is logged server-side; the user-visible message does not echo the raw error.
7. On success: call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` (the latter because the account balance display depends on this insert) and return `{ data: { transaction: TransactionDTO } }`.

## Success — `data` shape

```ts
{
  data: {
    transaction: TransactionDTO   // see contracts/README.md
  }
}
```

The returned row's `amount` is the **signed** canonical decimal string (negative for EXPENSE, positive for INCOME). The form's "Amount" input retains the user's positive magnitude only via local React state; the persisted value is always signed.

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Zod parse failed (missing required field, malformed amount, cross-user accountId, archived accountId, cross-user categoryId, kind mismatch, magnitude ≤ 0, decimals > currency decimals, payee > 120, notes > 500, `type === "TRANSFER"`) | `fieldErrors` keyed by failing field |
| `internal_error` | Prisma threw on insert | — |

The codes `currency_mismatch`, `sign_mismatch`, `transfer_cross_currency`, `transfer_same_account`, `transfer_leg_isolated`, and `archived_account_blocked` are **not reachable** for `createTransaction`:

- Currency is server-derived from the account (the action does not read `currency` from input); there is no inequality to detect.
- Sign is server-applied per `type`; the schema rejects pre-signed mismatches as `validation_failed` rather than `sign_mismatch` (the dedicated code is reserved for cases where an explicit signed amount is rejected — see `updateTransaction.md`).
- Transfer codes are unreachable: `type === "TRANSFER"` is rejected by the Zod enum.
- Archived-account is reported as `validation_failed` (via the `superRefine` field error), not the dedicated code — the dedicated code is reserved for transfer-archived-account scenarios.

## Side effects

- Inserts one row into `Transaction` with `archivedAt: null`, `transferGroupId: null`.
- Calls `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` on success.
- Does NOT redirect (the form's parent owns the sheet-close behavior).

## Atomicity

Single `prisma.transaction.create`. No `prisma.$transaction` wrapper needed.

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-013, FR-027, FR-028, FR-031.

## Applicable SCs

SC-001, SC-002, SC-010, SC-011, SC-012, SC-013, SC-015.
