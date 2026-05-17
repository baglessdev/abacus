# Server Action — `createCategory`

Creates a new `Category` row owned by the session's user.

## Location

`lib/categories/actions.ts`. Marked `"use server"`. Invoked from the create form inside the categories page's side sheet, bound via React 19 `useActionState`. Also indirectly exercised by the signup-time seed mechanism — but the seed uses `createMany` inside the auth transaction directly (research.md R8), not this action, because the action requires an authenticated session and the seed runs as part of the user-creation transaction itself.

## Signature

```ts
async function createCategory(
  prevState: CreateCategoryResult | null,
  formData: FormData,
): Promise<CreateCategoryResult>

type CreateCategoryResult =
  | { data: { category: CategoryDTO } }
  | { error: ErrorEnvelope }
```

The first argument is the previous-state slot mandated by `useActionState`; the action does not branch on it.

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `name` | string | yes | Trim → non-empty after trim → max 80 chars (FR-004). |
| `kind` | string | yes | Member of `CategoryKind` enum (`INCOME` / `EXPENSE`). If `parentId` is also set, MUST equal the parent row's `kind` (FR-005, FR-009). |
| `color` | string | yes | Must be in `CATEGORY_COLOR_TOKENS` (FR-007). |
| `icon` | string | yes | Must be in `CATEGORY_ICON_NAMES` (FR-008). |
| `parentId` | string | no | If present and non-empty: MUST reference an existing `Category` owned by the session's user, with `kind` matching the submitted `kind`, AND with its own `parentId === null` (single-level depth, FR-006, FR-009). |

Empty-string `parentId` (which is what the form posts when the user clears the picker) is treated as "no parent" — the schema coerces it to `null` before refinement.

## Zod schema sketch

```ts
// lib/categories/schemas.ts (shape only)

const baseFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be at most 80 characters"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z
    .string()
    .refine(isCategoryColor, "Pick a valid color"),
  icon: z
    .string()
    .refine(isCategoryIcon, "Pick a valid icon"),
  parentId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().nullable()),
}

// Factory: the schema needs userId to consult the DB inside superRefine.
export function makeCreateCategorySchema(userId: string) {
  return z
    .object(baseFields)
    .superRefine(async (value, ctx) => {
      if (value.parentId === null) return  // top-level: no further refinement

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
      if (parent.parentId !== null) {
        ctx.addIssue({
          path: ["parentId"],
          code: "custom",
          message: "Parent must be a top-level category",
          params: { errorCode: "hierarchy_violation" },
        })
      }
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
```

The `params.errorCode` tag is read by the action body to map a custom Zod issue to the right top-level error envelope code (`not_found` / `hierarchy_violation` / `kind_mismatch`). All other Zod issues map to `validation_failed`.

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Coerce the five `FormData` keys to strings; build `makeCreateCategorySchema(session.user.id)`; `await schema.safeParseAsync(...)` (async because the `superRefine` consults the DB).
3. On schema failure:
   - If any issue has `params.errorCode === "not_found"` → `{ error: { code: "not_found", message: "Parent category not found." } }`. (Distinguishable from validation_failed by code, indistinguishable from "the parent belongs to another user" per FR-013.)
   - If any issue has `params.errorCode === "hierarchy_violation"` → `{ error: { code: "hierarchy_violation", message, field: "parentId" } }`.
   - If any issue has `params.errorCode === "kind_mismatch"` → `{ error: { code: "kind_mismatch", message, field: "parentId" } }`.
   - Otherwise → `{ error: { code: "validation_failed", message, fieldErrors } }`.
4. Call `createCategoryForUser(session.user.id, parsed.data)` (helper in `lib/categories/queries.ts`). The helper persists with `archivedAt: null`.
5. On Prisma error → `{ error: { code: "internal_error", message: "Could not save category." } }`. The error is logged server-side; the user-visible message does not echo the raw error.
6. On success: call `revalidatePath("/dashboard/categories")` and return `{ data: { category: CategoryDTO } }`.

The form on the client closes the side sheet on a success result; on an error result, it re-renders with the field errors highlighted.

## Success — `data` shape

```ts
{
  data: {
    category: CategoryDTO  // see contracts/README.md
  }
}
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Zod parse failed for shape reasons (empty/oversized name, unknown kind, unknown color, unknown icon) | `fieldErrors` keyed by failing field |
| `not_found` | `parentId` references a category that doesn't exist OR belongs to another user (FR-013) | — |
| `hierarchy_violation` | `parentId` references a category whose own `parentId` is non-null (would create a grandchild, FR-006) | `field: "parentId"` |
| `kind_mismatch` | `parentId` references a category whose `kind` differs from the submitted `kind` (FR-009) | `field: "parentId"` |
| `internal_error` | Prisma threw on insert | — |

`archived_field_locked` is **not** reachable for create (no archived state to violate).
`kind_change_blocked` is **not** reachable for create (no existing row whose kind would be changing).

## Side effects

- Inserts one row into `Category`.
- Calls `revalidatePath("/dashboard/categories")` on success.
- Does NOT redirect (the form's parent owns the sheet-close behavior).

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-014, FR-015, FR-016, FR-021.

## Applicable SCs

SC-002, SC-006, SC-007.
