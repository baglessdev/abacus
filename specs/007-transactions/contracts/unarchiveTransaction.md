# Server Action — `unarchiveTransaction`

Clears `archivedAt` (sets to `null`) on a transaction owned by the session's user. **Auto-detects TRANSFER legs** and cascades atomically to both legs of the pair (symmetric to `archiveTransaction`).

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from the "Unarchive" button rendered on an archived row in the list when "Show archived" is toggled on.

## Signature

```ts
async function unarchiveTransaction(
  prevState: UnarchiveTransactionResult | null,
  formData: FormData,
): Promise<UnarchiveTransactionResult>

type UnarchiveTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty; references a `Transaction` owned by the session's user. Either a single-leg row OR a TRANSFER leg. |

## Zod schema sketch

```ts
// lib/transactions/schemas.ts (shape only)

export const unarchiveTransactionSchema = z.object({
  id: z.string().min(1, "Missing transaction id"),
})
```

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. `unarchiveTransactionSchema.safeParse({ id: formData.get("id") })`. On failure → `{ error: { code: "validation_failed", fieldErrors } }`.
3. **Pre-fetch the row** via `getTransactionForUser(session.user.id, parsed.id)`. On miss → `{ error: { code: "not_found", … } }`. Cross-user collapse is structural via the `where: { id, userId }` shape.
4. **Branch by `type`:**
   - **`row.type === "INCOME"` or `row.type === "EXPENSE"`** (single-leg path):
     ```ts
     const updated = await unarchiveSingleForUser(session.user.id, row.id)
     ```
     Single `prisma.transaction.updateMany({ where: { id, userId }, data: { archivedAt: null } })`.
   - **`row.type === "TRANSFER"`** (transfer path):
     ```ts
     const updated = await prisma.$transaction(async (tx) => {
       const result = await tx.transaction.updateMany({
         where: { userId: session.user.id, transferGroupId: row.transferGroupId, archivedAt: { not: null } },
         data: { archivedAt: null },
       })
       if (result.count !== 2) {
         throw new Error("Transfer pair unarchive expected 2 rows, found " + result.count)
       }
       return await tx.transaction.findFirst({ where: { id: row.id } })
     })
     ```
     The `archivedAt: { not: null }` predicate keeps the operation idempotent: if both legs are already active, `result.count === 0` and the throw rolls back; the action surfaces this as `internal_error`. (Same alternative implementation-as-no-op acceptable here as in `archiveTransaction`.)
5. On Prisma error → `{ error: { code: "internal_error", … } }`.
6. On success: call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` (balance re-includes this row) and return `{ data: { transaction: TransactionDTO } }`.

## Success — `data` shape

```ts
{
  data: {
    transaction: TransactionDTO   // the originating row, with archivedAt now null
  }
}
```

For a TRANSFER, both legs have `archivedAt === null` after this call.

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Missing or empty `id` | `fieldErrors: { id: [...] }` |
| `not_found` | Transaction id does not exist OR belongs to another user | — |
| `internal_error` | Prisma threw on update, OR the two-leg cascade found ≠ 2 archived rows for a TRANSFER | — |

## Side effects

- For INCOME / EXPENSE: updates the single targeted row's `archivedAt` to `null`.
- For TRANSFER: updates BOTH legs' `archivedAt` to `null`.
- Calls `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` on success.

## Atomicity

Symmetric to `archiveTransaction`. Single-leg path is a single `updateMany`. Transfer path wraps `updateMany` in `prisma.$transaction` with the two-row count guard.

## Applicable FRs

FR-001, FR-002, FR-003, FR-013, FR-017, FR-018, FR-019, FR-019a, FR-024, FR-025, FR-027, FR-028.

## Applicable SCs

SC-005, SC-007, SC-010, SC-015.
