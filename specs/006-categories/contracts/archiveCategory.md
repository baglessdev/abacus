# Server Action — `archiveCategory`

Sets `archivedAt = new Date()` on an existing `Category` row owned by the session's user. Archiving a parent does NOT cascade to its children (FR-010).

## Location

`lib/categories/actions.ts`. Marked `"use server"`. Invoked from the archive-confirm dialog inside the categories page, bound via React 19 `useActionState`.

## Signature

```ts
async function archiveCategory(
  prevState: ArchiveCategoryResult | null,
  formData: FormData,
): Promise<ArchiveCategoryResult>

type ArchiveCategoryResult =
  | { data: { category: CategoryDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | The category to archive. The session's user must own it; otherwise → `not_found`. |

## Zod schema

```ts
export const archiveCategorySchema = z.object({
  id: z.string().min(1, "Missing category id"),
})
```

## Behavior

1. `const session = await auth()`. On missing → `unauthenticated`.
2. `safeParse` with `archiveCategorySchema`. On failure → `validation_failed`.
3. `await setArchivedAtForUser(session.user.id, parsed.data.id, new Date())`. The helper does `prisma.category.updateMany({ where: { id, userId }, data: { archivedAt } })` and returns the updated row, or `null` if the row didn't match (cross-user or non-existent).
4. If `null` → `not_found`.
5. On success: call `revalidatePath("/dashboard/categories")` and return `{ data: { category: CategoryDTO } }`.

The timestamp is ALWAYS set server-side from `new Date()`; never accepted from the client. (This is a sub-rule of FR-010 — the action sets the timestamp itself, the client just signals intent.)

## Success — `data` shape

```ts
{
  data: {
    category: CategoryDTO  // archivedAt is now non-null
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

- Sets `archivedAt = now()` on one row (the row's `updatedAt` is bumped by Prisma).
- Children of the archived row are NOT modified (FR-010). Their `parentId` continues to reference this (now-archived) row's id; they remain visible in the default list view.
- Calls `revalidatePath("/dashboard/categories")` on success.
- Does NOT redirect.

## Applicable FRs

FR-002, FR-003, FR-010, FR-013, FR-014, FR-015, FR-021.

## Applicable SCs

SC-005, SC-007.
