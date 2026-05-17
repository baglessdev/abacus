# Server Action — `archiveTransaction`

Sets `archivedAt = new Date()` on a transaction owned by the session's user. **Auto-detects TRANSFER legs** and cascades atomically to both legs of the pair (FR-018, constitution Principle I).

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from the archive-confirmation dialog (`<ArchiveConfirmDialog>`) which appears when the user clicks "Archive" on a transaction or transfer in the list / edit sheet.

## Signature

```ts
async function archiveTransaction(
  prevState: ArchiveTransactionResult | null,
  formData: FormData,
): Promise<ArchiveTransactionResult>

type ArchiveTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: ErrorEnvelope }
```

For a TRANSFER, the action returns the **originating** row (the leg the user clicked on); the caller knows both legs were archived together.

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty; references a `Transaction` owned by the session's user. Either a single-leg row OR a TRANSFER leg. |

## Zod schema sketch

```ts
// lib/transactions/schemas.ts (shape only)

export const archiveTransactionSchema = z.object({
  id: z.string().min(1, "Missing transaction id"),
})
```

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. `archiveTransactionSchema.safeParse({ id: formData.get("id") })`. On failure → `{ error: { code: "validation_failed", fieldErrors } }`.
3. **Pre-fetch the row** via `getTransactionForUser(session.user.id, parsed.id)`. On miss → `{ error: { code: "not_found", … } }`.
4. **Branch by `type`:**
   - **`row.type === "INCOME"` or `row.type === "EXPENSE"`** (single-leg path):
     ```ts
     const updated = await archiveSingleForUser(session.user.id, row.id, new Date())
     ```
     `archiveSingleForUser` is a single `prisma.transaction.updateMany({ where: { id, userId }, data: { archivedAt } })`.
   - **`row.type === "TRANSFER"`** (transfer path):
     ```ts
     const updated = await prisma.$transaction(async (tx) => {
       const result = await tx.transaction.updateMany({
         where: { userId: session.user.id, transferGroupId: row.transferGroupId, archivedAt: null },
         data: { archivedAt: new Date() },
       })
       if (result.count !== 2) {
         throw new Error("Transfer pair archive expected 2 rows, found " + result.count)
       }
       return await tx.transaction.findFirst({ where: { id: row.id } })
     })
     ```
     The `result.count !== 2` guard catches a malformed pair (e.g., a stale dataset where one leg is already archived); throwing rolls back the transaction. The `archivedAt: null` predicate in the `where` clause keeps the operation idempotent — if both legs are already archived, `result.count === 0`, which the guard also rejects (forcing `internal_error`); the action's `unarchive` symmetric path handles re-archival of an already-archived row gracefully via the same idempotency guard.

   *(Note: an alternative implementation makes the action a no-op when the row is already archived (returning the row as-is). That is also acceptable; the contract is "either both legs are archived or neither is, and the operation surfaces success on either path." The implementer picks one and documents.)*
5. On Prisma error → `{ error: { code: "internal_error", … } }`.
6. On success: call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` (balance is recomputed without this row) and return `{ data: { transaction: TransactionDTO } }` (the originating row, with `archivedAt` now set).

## Success — `data` shape

```ts
{
  data: {
    transaction: TransactionDTO   // the originating row, with archivedAt set to the new timestamp
  }
}
```

For a TRANSFER, the second leg is **also** archived (same `archivedAt` timestamp) but is not returned in the response shape; the caller knows the pair was archived together. A subsequent `listTransactions` call returns both archived legs together.

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Missing or empty `id` | `fieldErrors: { id: [...] }` |
| `not_found` | Transaction id does not exist OR belongs to another user | — |
| `internal_error` | Prisma threw on update, OR the two-leg cascade found ≠ 2 active rows for a TRANSFER | — |

## Side effects

- For INCOME / EXPENSE: updates the single targeted row's `archivedAt`.
- For TRANSFER: updates BOTH legs' `archivedAt` to the same timestamp.
- Calls `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` on success (balance excludes archived rows per FR-019a).

## Atomicity

- Single-leg path: single `updateMany` (atomic by default).
- Transfer path: `prisma.$transaction(async (tx) => { updateMany filtered by transferGroupId })`. Postgres rollback semantics guarantee both-or-neither.

## Applicable FRs

FR-001, FR-002, FR-003, FR-013, FR-017, FR-018, FR-019, FR-019a, FR-024, FR-025, FR-027, FR-028.

## Applicable SCs

SC-005, SC-007, SC-010, SC-015, SC-017.
