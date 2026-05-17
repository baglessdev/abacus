# Feature 006 — Category Contracts

Each file in this directory documents one server action exposed by `lib/categories/actions.ts`, plus the `<CategoryPicker>` UI contract for the canonical reusable picker. All five actions share the same envelope shape:

```ts
type Result<TData> =
  | { data: TData }
  | { error: ErrorEnvelope }

type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "hierarchy_violation"; message: string; field: "parentId" }
  | { code: "kind_mismatch"; message: string; field: "parentId" | "kind" }
  | { code: "kind_change_blocked"; message: string; field: "kind" }
  | { code: "archived_field_locked"; message: string; field: "name" | "kind" | "color" | "icon" | "parentId" }
  | { code: "internal_error"; message: string }
```

The matching constants (codes, messages) live in `lib/categories/errors.ts` (lands in the implementation phase). Every action returns this envelope.

## Shared session contract (all actions)

Every action calls:

```ts
const session = await auth()
if (!session?.user?.id) {
  return { error: { code: "unauthenticated", message: "Sign in to manage categories." } }
}
const userId = session.user.id
```

`userId` is **never** read from request input. The user-id is passed as the first argument to the relevant `lib/categories/queries.ts` helper.

## Shared DTO

The "category" shape returned to client code (in `data` payloads) is:

```ts
type CategoryDTO = {
  id: string
  userId: string
  name: string
  kind: "INCOME" | "EXPENSE"
  parentId: string | null
  color: string             // a token from CATEGORY_COLORS, e.g., "violet"
  icon: string              // a name from CATEGORY_ICONS, e.g., "utensils"
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string         // ISO 8601 UTC
  updatedAt: string         // ISO 8601 UTC
}
```

The mapping from the Prisma row to `CategoryDTO` is centralized in `lib/categories/serialize.ts`. `Date` → `string` via `.toISOString()`. There is no `Decimal` field; nothing else needs special serialization treatment.

## Cross-user collapse rule (binding)

For every action that takes a category `id` (or `parentId`) from request input, a target that does not exist OR belongs to a different user surfaces as `{ error: { code: "not_found", message: "Category not found." } }`. The two cases are indistinguishable in the response body, response headers, and response timing (FR-013, SC-007).

This is enforced **structurally** by `lib/categories/queries.ts`'s `where: { id, userId }` shape — there is no separate "is this category yours?" check anywhere.

## Files

- `createCategory.md` — Create a new category for the session's user.
- `updateCategory.md` — Update an existing category (subject to FR-005 kind-change-blocked, FR-009 kind-match, FR-009a-equivalent archived-field-locked).
- `archiveCategory.md` — Set `archivedAt = now()` on an existing category.
- `unarchiveCategory.md` — Clear `archivedAt` on an existing category.
- `listCategories.md` — Read the session's user's categories, with optional inclusion of archived rows and optional `kind` filter.
- `CategoryPicker.md` — The UI contract for the reusable `<CategoryPicker>` consumed in this feature's form and in future features 006 and 008.
