# Server Action — `listBudgets`

Returns the session's user's budgets WITH ACTUALS computed, optionally including archived rows.

## Location

`lib/budgets/actions.ts`. Marked `"use server"`. Invoked from:

- `/dashboard/budgets` (page-level server component, on initial render with `includeArchived: false`).
- `<BudgetsList>` (client component, when the "Show archived" toggle flips, and after every successful mutation closes the sheet).
- `<BudgetsWidget>` on `/dashboard` (with `limit: 5` AND `sortByStatusAndProgress: true`).

## Signature

```ts
async function listBudgets(
  opts?: {
    includeArchived?: boolean
    limit?: number
    sortByStatusAndProgress?: boolean
  },
): Promise<ListBudgetsResult>

type ListBudgetsResult =
  | { data: { budgets: BudgetWithActualsDTO[] } }
  | { error: BudgetErrorEnvelope }
```

The argument is a typed in-process options object, NOT a request body. Per Principle III, no Zod boundary.

## Input

| Field | Type | Default | Effect |
|---|---|---|---|
| `includeArchived` | `boolean` | `false` | When `false`, rows with `archivedAt !== null` are filtered out (FR-016). When `true`, all rows are returned regardless of archive state. |
| `limit` | `number` | `undefined` | When set, applies the limit AFTER sort (so the top-N by status priority are returned). Used by `<BudgetsWidget>` with `5`. |
| `sortByStatusAndProgress` | `boolean` | `false` | When `true`, applies the status-priority + progressRatio-desc + name-asc sort (R5). When `false`, returns budgets in default order (createdAt desc). |

## Behavior

1. `const session = await auth()`. On missing → `unauthenticated`.
2. Call `listBudgetsWithActualsForUser(session.user.id, { includeArchived, limit, sortByStatusAndProgress })` from `lib/budgets/queries.ts`. The helper:
   - Fetches all budgets via `prisma.budget.findMany({ where: { userId, ...optional archived filter }, include: { category: true } })`.
   - Groups by period; computes the MONTHLY and YEARLY date ranges; calls `sumExpenseByCategoryForBudgetsForUser` (in `lib/transactions/queries.ts`) AT MOST TWICE (one MONTHLY + one YEARLY) in parallel via `Promise.all`. R3.
   - Builds the actuals Map keyed by `${period}::${categoryId}::${currency}`.
   - Calls `attachActualsToBudgets(budgets, actualsMap)` from `lib/budgets/aggregations.ts` to produce `BudgetWithActuals[]`.
   - If `sortByStatusAndProgress` → calls `sortBudgetsByStatusAndProgress(...)` from `lib/budgets/aggregations.ts`.
   - If `limit` → slices to the top-N.
   - Returns the array.
3. Each element is serialized to `BudgetWithActualsDTO` via `serializeBudgetWithActuals(...)` from `lib/budgets/serialize.ts`.
4. On Prisma error → `internal_error`.

No `revalidatePath` (read action).

## Success — `data` shape

```ts
{
  data: {
    budgets: BudgetWithActualsDTO[]  // see data-model.md §BudgetWithActualsDTO
  }
}
```

The array order:

- When `sortByStatusAndProgress: true`: over → near → under, then progressRatio desc, then category.name asc.
- Otherwise: by `createdAt` desc (newest first — the default Prisma findMany returns insertion order; we apply an explicit `orderBy: { createdAt: "desc" }` for determinism).

Empty array is a valid response (a user with no budgets, or all archived + `includeArchived: false`).

## Errors

| Code | When |
|---|---|
| `unauthenticated` | No session |
| `internal_error` | Prisma threw |

## Side effects

- None. Read-only action.
- Issues at most 3 Prisma queries: 1 for the budget list + at most 2 for the actuals fan-out (MONTHLY + YEARLY).

## Performance

The actuals fan-out is bounded at 2 queries regardless of budget count (R3). Even with 50 budgets, the page renders well within the 2s SC-001 budget on local Postgres.

## Applicable FRs

FR-016, FR-022, FR-023, FR-027, FR-028.

## Applicable SCs

SC-002, SC-004, SC-013, SC-017.
