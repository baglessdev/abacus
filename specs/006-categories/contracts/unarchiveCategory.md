# Server Action — `unarchiveCategory`

Clears `archivedAt` (sets it to `null`) on an existing `Category` row owned by the session's user.

## Location

`lib/categories/actions.ts`. Marked `"use server"`. Invoked from (a) the "Unarchive" button in the edit-archived form, and (b) the inline "Unarchive" action in the archived-row of the list, both bound via React 19 `useActionState` or `startTransition`.

## Signature

```ts
async function unarchiveCategory(
  prevState: UnarchiveCategoryResult | null,
  formData: FormData,
): Promise<UnarchiveCategoryResult>

type UnarchiveCategoryResult =
  | { data: { category: CategoryDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | The category to unarchive. The session's user must own it; otherwise → `not_found`. |

## Zod schema

```ts
export const unarchiveCategorySchema = z.object({
  id: z.string().min(1, "Missing category id"),
})
```

## Behavior

1. `const session = await auth()`. On missing → `unauthenticated`.
2. `safeParse` with `unarchiveCategorySchema`. On failure → `validation_failed`.
3. `await setArchivedAtForUser(session.user.id, parsed.data.id, null)`. Helper returns the updated row, or `null`.
4. If `null` → `not_found`.
5. On success: call `revalidatePath("/dashboard/categories")` and return `{ data: { category: CategoryDTO } }`.

Unarchiving a row whose **parent is currently archived** is allowed. The row's `parentId` is unchanged; the child is now active even though the parent is archived. This is consistent with the no-cascade-on-archive rule (FR-010): each row's `archivedAt` is independent.

## Success — `data` shape

```ts
{
  data: {
    category: CategoryDTO  // archivedAt is now null
  }
}
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Missing or empty `id` | `fieldErrors: { id: [...] }` |
| `not_found` | Row doesn't exist OR belongs to another user (FR-013) | — |
| `internal_error` | Prisma threw | — |

## Side effects

- Sets `archivedAt = null` on one row (the row's `updatedAt` is bumped by Prisma).
- Other rows (children, parent) are NOT modified.
- Calls `revalidatePath("/dashboard/categories")` on success.
- Does NOT redirect.

## Applicable FRs

FR-002, FR-003, FR-010, FR-013, FR-014, FR-015, FR-021.

## Applicable SCs

SC-005, SC-007.
