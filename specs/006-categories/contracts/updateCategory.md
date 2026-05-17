# Server Action — `updateCategory`

Updates an existing `Category` row owned by the session's user. Branches on the pre-fetched row's `archivedAt` to pick the right Zod schema and on the row's child count to enforce `kind_change_blocked`.

## Location

`lib/categories/actions.ts`. Marked `"use server"`. Invoked from the edit form inside the categories page's side sheet, bound via React 19 `useActionState`.

## Signature

```ts
async function updateCategory(
  prevState: UpdateCategoryResult | null,
  formData: FormData,
): Promise<UpdateCategoryResult>

type UpdateCategoryResult =
  | { data: { category: CategoryDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | The category to update. The session's user must own it; otherwise → `not_found`. |
| `name` | string | yes | Trim → non-empty → max 80 chars (FR-004). Always editable, including in `edit-archived` mode. |
| `kind` | string | yes (mode = `edit`); ignored (mode = `edit-archived`) | Member of `{ INCOME, EXPENSE }`. If row has children, MUST equal row's current `kind`, else → `kind_change_blocked` (FR-005). |
| `color` | string | yes (mode = `edit`); ignored (mode = `edit-archived`) | Must be in `CATEGORY_COLOR_TOKENS`. |
| `icon` | string | yes (mode = `edit`); ignored (mode = `edit-archived`) | Must be in `CATEGORY_ICON_NAMES`. |
| `parentId` | string | no (mode = `edit`); ignored (mode = `edit-archived`) | If present and non-empty: same FR-006/FR-009 rules as create. ALSO must not equal `id` (no-self-parent, FR-006). |

In `edit-archived` mode, any non-`id` and non-`name` field present in the request body is rejected with `archived_field_locked` (the FR-009a-equivalent rule adopted per research.md R14).

## Zod schemas

There are two schemas, picked by the action body after pre-fetching the row:

```ts
// 1. Active row: full schema, with all four parent rules + the kind_change_blocked check.
export function makeUpdateActiveCategorySchema(userId: string, row: Category, hasChildren: boolean) {
  return z
    .object({
      id: z.string().min(1, "Missing category id"),
      name: z.string().trim().min(1).max(80),
      kind: z.enum(["INCOME", "EXPENSE"]),
      color: z.string().refine(isCategoryColor),
      icon: z.string().refine(isCategoryIcon),
      parentId: z.string().trim().transform((v) => (v === "" ? null : v)).pipe(z.string().nullable()),
    })
    .superRefine(async (value, ctx) => {
      // Rule: kind_change_blocked
      if (hasChildren && value.kind !== row.kind) {
        ctx.addIssue({
          path: ["kind"],
          code: "custom",
          message: "Cannot change kind: this category has children. Move or archive its children first.",
          params: { errorCode: "kind_change_blocked" },
        })
        // Continue with other checks so the form sees all relevant errors at once.
      }

      // Rule: no-self-parent
      if (value.parentId === value.id) {
        ctx.addIssue({
          path: ["parentId"],
          code: "custom",
          message: "A category cannot be its own parent",
          params: { errorCode: "hierarchy_violation" },
        })
        return
      }

      if (value.parentId === null) return  // top-level: no further parent-related refinement

      // Rule: parent must exist and be owned by this user
      const parent = await getCategoryForUser(userId, value.parentId)
      if (!parent) {
        ctx.addIssue({
          path: ["parentId"],
          code: "custom",
          message: "Parent category not found",
          params: { errorCode: "not_found" },
        })
        return
      }
      // Rule: parent must be top-level
      if (parent.parentId !== null) {
        ctx.addIssue({
          path: ["parentId"],
          code: "custom",
          message: "Parent must be a top-level category",
          params: { errorCode: "hierarchy_violation" },
        })
      }
      // Rule: parent kind must match
      if (parent.kind !== value.kind) {
        ctx.addIssue({
          path: ["parentId"],
          code: "custom",
          message: "Parent and child must share a kind",
          params: { errorCode: "kind_mismatch" },
        })
      }
    })
}

// 2. Archived row: name-only schema (mirrors feature 004's FR-009a pattern, per research R14).
export const updateArchivedCategorySchema = z.object({
  id: z.string().min(1, "Missing category id"),
  name: z.string().trim().min(1).max(80),
})
```

## Behavior

1. `const session = await auth()`. On missing → `unauthenticated`.
2. Read `id` from `formData`. If missing/empty → `validation_failed` with `fieldErrors: { id: ["Missing category id"] }`.
3. Pre-fetch the row: `const row = await getCategoryForUser(session.user.id, id)`. If `null` → `not_found`.
4. If `row.archivedAt !== null`:
   - Check that no `kind` / `color` / `icon` / `parentId` keys are present in the request body. If any is present AND differs from the row's current value → `{ error: { code: "archived_field_locked", message, field } }`. (The client form disables those inputs, so this should never trip in normal use; it's the boundary belt to match feature 004's pattern.)
   - Parse with `updateArchivedCategorySchema`. On failure → `validation_failed`.
   - Update: `await updateCategoryForUser(userId, id, { name: parsed.data.name })`. If `null` (race) → `not_found`. Else → success.
5. If `row.archivedAt === null` (active row):
   - Compute `hasChildren = (await countChildrenOfForUser(session.user.id, id)) > 0`.
   - Build `makeUpdateActiveCategorySchema(session.user.id, row, hasChildren)` and `await schema.safeParseAsync(...)`.
   - On schema failure, map custom-coded issues to top-level error envelope codes:
     - `params.errorCode === "kind_change_blocked"` → `{ error: { code: "kind_change_blocked", message, field: "kind" } }`.
     - `params.errorCode === "kind_mismatch"` → `{ error: { code: "kind_mismatch", message, field: "parentId" } }`.
     - `params.errorCode === "hierarchy_violation"` → `{ error: { code: "hierarchy_violation", message, field: "parentId" } }`.
     - `params.errorCode === "not_found"` → `{ error: { code: "not_found", message } }`.
     - Otherwise → `validation_failed` with `fieldErrors`.
   - If multiple custom-coded issues exist, the action picks the FIRST in this priority order: `kind_change_blocked` > `kind_mismatch` > `hierarchy_violation` > `not_found`. This keeps the surfacing deterministic; the validation_failed envelope can still carry secondary issues in `fieldErrors` for the form to display alongside.
   - Update: `await updateCategoryForUser(userId, id, parsed.data)`. If `null` → `not_found`. Else → success.
6. On success: call `revalidatePath("/dashboard/categories")` and return `{ data: { category: CategoryDTO } }`.

## Success — `data` shape

```ts
{
  data: {
    category: CategoryDTO
  }
}
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `not_found` | Row doesn't exist OR belongs to another user (FR-013); OR `parentId` references a non-existent / cross-user row | — |
| `validation_failed` | Zod shape failures (empty/oversized name, unknown enum) | `fieldErrors` |
| `archived_field_locked` | Edit-archived mode, but a locked field was changed | `field` ∈ `{ name (impossible — name IS editable), kind, color, icon, parentId }` |
| `hierarchy_violation` | `parentId === id` (self-parent) OR `parentId`'s own `parentId` is non-null (would-be-grandchild) | `field: "parentId"` |
| `kind_mismatch` | `parentId`'s `kind` differs from submitted `kind` | `field: "parentId"` |
| `kind_change_blocked` | Row has children AND submitted `kind` differs from row's current `kind` | `field: "kind"` |
| `internal_error` | Prisma threw on update | — |

## Side effects

- Updates one row in `Category` (the row's `updatedAt` is bumped by Prisma).
- Calls `revalidatePath("/dashboard/categories")` on success.
- Does NOT redirect.

## Applicable FRs

FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-013, FR-014, FR-015, FR-016, FR-021.

## Applicable SCs

SC-004, SC-006, SC-007.
