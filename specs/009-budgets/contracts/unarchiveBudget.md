# Server Action — `unarchiveBudget`

Clears `archivedAt` for a `Budget` row, returning it to the active list.

**Race-handling note**: Unarchiving may collide with an existing active budget for the same `(userId, categoryId, currency, period)` tuple if one was created while this row was archived. The uniqueness invariant from R7 applies; both the app-level pre-check AND the schema-level partial unique index catch this.

## Location

`lib/budgets/actions.ts`. Marked `"use server"`. Invoked from the edit sheet when "Show archived" is on (US3).

## Signature

```ts
async function unarchiveBudget(
  prevState: UnarchiveBudgetResult | null,
  formData: FormData,
): Promise<UnarchiveBudgetResult>

type UnarchiveBudgetResult =
  | { data: { budget: BudgetDTO } }
  | { error: BudgetErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Trim → non-empty. The budget MUST exist and belong to the session's user. |

## Zod schema sketch

```ts
export const unarchiveBudgetSchema = z.object({
  id: z.string().trim().min(1, "Missing budget id"),
})
```

## Behavior

1. `await auth()` → on missing return `unauthenticated`.
2. `safeParse` the FormData. On failure → `validation_failed`.
3. Pre-fetch via `getBudgetForUser(session.user.id, id)` for ownership.
4. If null → `not_found`.
5. Read the budget's `(categoryId, currency, period)`. Pre-check via `findExistingActiveBudgetForUser` — if an ACTIVE budget for the same tuple already exists → return `budget_exists`.
6. Call `setArchivedAtForUser(session.user.id, id, null)`. On Prisma `P2002` (race) → return `budget_exists`.
7. On success: `revalidatePath("/dashboard/budgets")` + `revalidatePath("/dashboard")`. Return `{ data: { budget: serializeBudget(updated) } }`.

## Success — `data` shape

```ts
{ data: { budget: BudgetDTO } }   // archivedAt cleared (null)
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Missing or empty id | `fieldErrors` |
| `not_found` | Budget id does not exist or belongs to another user | — |
| `budget_exists` | An ACTIVE budget for the same `(userId, categoryId, currency, period)` already exists (app-level pre-check OR P2002 race) | `field: "categoryId"` |
| `internal_error` | Prisma threw on update (other than P2002) | — |

## Side effects

- Clears `archivedAt` on one row in `Budget`. Does NOT cascade.
- Calls `revalidatePath("/dashboard/budgets")` and `revalidatePath("/dashboard")` on success.

## Applicable FRs

FR-002, FR-008, FR-018, FR-022.

## Applicable SCs

SC-005, SC-006.
