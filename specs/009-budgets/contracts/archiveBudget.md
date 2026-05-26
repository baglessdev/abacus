# Server Action — `archiveBudget`

Soft-archives a `Budget` row by setting `archivedAt = new Date()`.

## Location

`lib/budgets/actions.ts`. Marked `"use server"`. Invoked from `<ArchiveConfirmDialog>`.

## Signature

```ts
async function archiveBudget(
  prevState: ArchiveBudgetResult | null,
  formData: FormData,
): Promise<ArchiveBudgetResult>

type ArchiveBudgetResult =
  | { data: { budget: BudgetDTO } }
  | { error: BudgetErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Trim → non-empty. The budget MUST exist and belong to the session's user. |

## Zod schema sketch

```ts
export const archiveBudgetSchema = z.object({
  id: z.string().trim().min(1, "Missing budget id"),
})
```

## Behavior

1. `await auth()` → on missing return `unauthenticated`.
2. `safeParse` the FormData. On failure → `validation_failed`.
3. Call `setArchivedAtForUser(session.user.id, parsed.data.id, new Date())`.
4. If null returned → `not_found`.
5. On success: `revalidatePath("/dashboard/budgets")` + `revalidatePath("/dashboard")`. Return `{ data: { budget: serializeBudget(updated) } }`.

## Success — `data` shape

```ts
{ data: { budget: BudgetDTO } }   // archivedAt set to ISO 8601 UTC timestamp
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Missing or empty id | `fieldErrors` |
| `not_found` | Budget id does not exist or belongs to another user | — |
| `internal_error` | Prisma threw on update | — |

## Side effects

- Sets `archivedAt` on one row in `Budget`. Does NOT cascade to anything else.
- Does NOT touch transactions referencing this category — actuals on the dashboard cash-flow widget remain identical (US3 ac.7).
- Calls `revalidatePath("/dashboard/budgets")` and `revalidatePath("/dashboard")` on success.

## Applicable FRs

FR-008, FR-018, FR-022.

## Applicable SCs

SC-005.
