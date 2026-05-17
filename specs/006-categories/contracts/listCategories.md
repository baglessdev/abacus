# Server Action — `listCategories`

Returns the session's user's categories, optionally including archived rows and optionally filtered to a single `kind`.

## Location

`lib/categories/actions.ts`. Marked `"use server"`. Invoked from:

- `/dashboard/categories` (the page-level server component, on initial render with `includeArchived: false`).
- `<CategoriesList>` (the client component, when the "Show archived" toggle flips, and after every successful mutation closes the sheet).
- `<CategoryPicker>` (the canonical reusable picker, on mount — called with optional `kind` filter).

## Signature

```ts
async function listCategories(
  opts?: { includeArchived?: boolean; kind?: "INCOME" | "EXPENSE" },
): Promise<ListCategoriesResult>

type ListCategoriesResult =
  | { data: { categories: CategoryDTO[] } }
  | { error: ErrorEnvelope }
```

The argument is a typed in-process options object, NOT a request body. Per Principle III ("trust internally"), there is no Zod schema on this input — the function trusts its caller's TS types.

## Input

| Field | Type | Default | Effect |
|---|---|---|---|
| `includeArchived` | `boolean` | `false` | When `false`, rows with `archivedAt !== null` are filtered out (FR-010, FR-011). When `true`, all rows for the user are returned regardless of archive state. |
| `kind` | `"INCOME" \| "EXPENSE"` | undefined (no filter) | When set, only rows of that kind are returned. Used by `<CategoryPicker>` consumers (Transactions form, Budgets form) that want to surface only one kind. |

## Behavior

1. `const session = await auth()`. On missing → `unauthenticated`.
2. Call `listCategoriesForUser(session.user.id, { includeArchived, kind })`. The helper does:
   ```ts
   prisma.category.findMany({
     where: {
       userId,
       ...(includeArchived ? {} : { archivedAt: null }),
       ...(kind ? { kind } : {}),
     },
     orderBy: [{ kind: "asc" }, { parentId: { sort: "asc", nulls: "first" } }, { name: "asc" }],
   })
   ```
   The `parentId: nulls: "first"` clause ensures top-level categories (parentId null) appear before their children; the consumer (list page or picker) re-groups them under their parents in the rendering layer.
3. On success: return `{ data: { categories: rows.map(serializeCategory) } }`.
4. On Prisma error: return `{ error: { code: "internal_error", message: "Could not load categories." } }`.

No `revalidatePath` (this is a read action; no cache to invalidate).

## Success — `data` shape

```ts
{
  data: {
    categories: CategoryDTO[]  // see contracts/README.md
  }
}
```

The array is sorted: first by `kind` ascending (EXPENSE comes alphabetically before INCOME, but the consumer typically re-orders to put EXPENSE first per research R13), then by `parentId` ASC NULLS FIRST (top-level rows before children), then by `name` ascending (FR-019).

**Empty arrays are valid responses** — a fresh user with all 11 seeded rows archived and `includeArchived: false` returns `{ data: { categories: [] } }`. The page renders the empty state in that case.

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `internal_error` | Prisma threw | — |

`not_found` is **not** reachable for list (there's no target row to miss).
`validation_failed`, `hierarchy_violation`, `kind_mismatch`, `kind_change_blocked`, `archived_field_locked` are **not** reachable for list (no input to validate beyond the typed options object).

## Side effects

- None. Read-only action.

## Applicable FRs

FR-002, FR-003, FR-010, FR-011, FR-013, FR-014, FR-015, FR-019, FR-021.

## Applicable SCs

SC-001, SC-003, SC-005, SC-007, SC-009.
