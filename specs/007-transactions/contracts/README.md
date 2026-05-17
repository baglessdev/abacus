# Feature 007 — Transaction Contracts

Each file in this directory documents one server action exposed by `lib/transactions/actions.ts`. The feature ships **seven actions** (vs. feature 004's five and feature 006's five) — the extra two come from splitting create/update into single-leg vs. transfer-pair shapes per `research.md` R14.

All seven actions share the same envelope shape:

```ts
type Result<TData> =
  | { data: TData }
  | { error: ErrorEnvelope }

type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "currency_mismatch"; message: string; field: "currency" | "accountId" }
  | { code: "sign_mismatch"; message: string; field: "amount" }
  | { code: "transfer_cross_currency"; message: string; field: "toAccountId" }
  | { code: "transfer_same_account"; message: string; field: "toAccountId" }
  | { code: "transfer_leg_isolated"; message: string }
  | { code: "archived_account_blocked"; message: string; field: "accountId" | "fromAccountId" | "toAccountId" }
  | { code: "internal_error"; message: string }
```

The matching constants (codes, messages) live in `lib/transactions/errors.ts`. Every action returns this envelope.

## Shared session contract (all actions)

Every action calls:

```ts
const session = await auth()
if (!session?.user?.id) {
  return { error: { code: "unauthenticated", message: "Sign in to manage transactions." } }
}
const userId = session.user.id
```

`userId` is **never** read from request input (FR-003). It is passed as the first argument to the relevant `lib/transactions/queries.ts` helper.

## Shared DTO

The "transaction" shape returned to client code (in `data` payloads) is:

```ts
type TransactionDTO = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  date: string                                  // ISO 8601 date-only ("2026-05-17")
  amount: string                                // canonical signed decimal string ("-87.43", "3200.00", "-500.00", "500.00")
  currency: string                              // ISO 4217 alpha-3, uppercase
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  payee: string | null
  notes: string | null
  transferGroupId: string | null                // null for INCOME/EXPENSE; non-null for TRANSFER legs
  archivedAt: string | null                     // ISO 8601 UTC, or null
  createdAt: string                             // ISO 8601 UTC, full precision
  updatedAt: string                             // ISO 8601 UTC, full precision
}
```

For TRANSFER pair responses (`createTransfer`, `updateTransfer`), the action returns BOTH legs:

```ts
type TransferPairDTO = {
  source: TransactionDTO       // amount < 0
  destination: TransactionDTO  // amount > 0
}
```

The mapping from the Prisma row to `TransactionDTO` is centralized in `lib/transactions/serialize.ts`. `Decimal` → canonical decimal string via `.toString()`. `Date` (date column) → `YYYY-MM-DD` ISO string. `DateTime` (audit columns) → full ISO 8601 UTC string via `.toISOString()`.

## Cross-user collapse rule (binding)

For every action that takes a transaction `id` from request input, a target that does not exist OR belongs to a different user surfaces as `{ error: { code: "not_found", message: "Transaction not found." } }`. The two cases are indistinguishable in the response body, response headers, and response timing (FR-013, SC-010).

This is enforced **structurally** by `lib/transactions/queries.ts`'s `where: { id, userId }` shape — there is no separate "is this transaction yours?" check anywhere.

The same collapse rule applies to `accountId`, `fromAccountId`, `toAccountId`, and `categoryId` references in payloads — a referenced row that does not exist OR belongs to another user surfaces as the same `not_found`-style result (specifically, `validation_failed` with a field error on the referencing field, because the cross-user reference is detected during boundary validation, not action body execution).

## Atomicity guarantees by action

| Action | Atomicity | Mechanism |
|---|---|---|
| `createTransaction` | Single row insert; atomic by default | Single `prisma.transaction.create` |
| `createTransfer` | Two rows insert; atomic | `prisma.$transaction(async (tx) => { ... })` |
| `updateTransaction` | Single row update; atomic by default | Single `prisma.transaction.updateMany` |
| `updateTransfer` | Two rows update; atomic | `prisma.$transaction(async (tx) => { ... })` |
| `archiveTransaction` (single-leg) | Single row update; atomic | Single `prisma.transaction.updateMany` |
| `archiveTransaction` (transfer leg) | Two rows update; atomic | `prisma.$transaction` + `updateMany` filtered by `transferGroupId` |
| `unarchiveTransaction` | Symmetric | Same as archive, with `archivedAt: null` |
| `listTransactions` | Read-only | No transaction needed |

The transfer-pair atomicity guarantees are the load-bearing part of this feature. Documented in detail in `createTransfer.md`, `updateTransfer.md`, `archiveTransaction.md`.

## Files

- `createTransaction.md` — Create a single INCOME or EXPENSE row for the session's user.
- `createTransfer.md` — Atomically create two TRANSFER legs sharing a `transferGroupId`.
- `updateTransaction.md` — Update a single INCOME or EXPENSE row; rejects TRANSFER legs.
- `updateTransfer.md` — Atomically update both TRANSFER legs of a transfer pair.
- `archiveTransaction.md` — Soft-archive a row. Cascades to BOTH legs if the row is a TRANSFER.
- `unarchiveTransaction.md` — Symmetric to archive.
- `listTransactions.md` — Read the session's user's transactions, filtered by date range, account, category, type, archive state.
