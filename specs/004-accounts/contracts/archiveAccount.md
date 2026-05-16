# Server Action — `archiveAccount`

Sets `archivedAt = now()` on an existing `Account` row owned by the session's user.

## Location

`lib/accounts/actions.ts`. Marked `"use server"`. Invoked from the edit sheet's "Archive" button (after the shadcn `AlertDialog` confirmation), bound as a plain `<form action={…}>` with a hidden `id` input.

## Signature

```ts
async function archiveAccount(
  prevState: ArchiveAccountResult | null,
  formData: FormData,
): Promise<ArchiveAccountResult>

type ArchiveAccountResult =
  | { data: { account: AccountDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty. Identifies the row to archive. |

## Zod schema sketch

```ts
// lib/accounts/schemas.ts (shape only)

export const archiveAccountSchema = z.object({
  id: z.string().min(1, "Missing account id"),
})
```

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. `safeParse` with `archiveAccountSchema`. On failure → `{ error: { code: "validation_failed", message, fieldErrors } }`.
3. Call `setArchivedAtForUser(session.user.id, id, new Date())` (helper in `lib/accounts/queries.ts`). The helper does `prisma.account.updateMany({ where: { id, userId }, data: { archivedAt: new Date() } })`. The `updateMany` returns `{ count }`; a `count === 0` means the row didn't exist OR didn't belong to the session's user — both collapse to `not_found` (FR-013).
4. On `count === 0` → `{ error: { code: "not_found", message: "Account not found." } }`.
5. On Prisma error → `{ error: { code: "internal_error", message: "Could not archive account." } }`.
6. On success: re-fetch the row (or take the returned row from the helper if the helper does a follow-up read), call `revalidatePath("/dashboard/accounts")`, and return `{ data: { account: AccountDTO } }`.

The action is **idempotent**: archiving an already-archived row succeeds and returns the row (with `archivedAt` unchanged or updated to now() — implementer decides; the spec does not require preserving the original archive timestamp on a re-archive).

## Success — `data` shape

```ts
{
  data: {
    account: AccountDTO  // with archivedAt now set to a non-null ISO timestamp
  }
}
```

## Errors

| Code | When | Payload extras |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Missing or empty `id` | `fieldErrors` |
| `not_found` | Target row does not exist OR belongs to another user (FR-013) | — |
| `internal_error` | Prisma threw | — |

`archived_field_locked` is not reachable for this action — it operates on `archivedAt` itself, which is not a "field" in the FR-009a sense.

## Side effects

- Updates `Account.archivedAt` for one row.
- Calls `revalidatePath("/dashboard/accounts")` on success.
- Does NOT redirect.
- Does NOT touch any other column.

## Applicable FRs

FR-002, FR-003, FR-008, FR-013, FR-014, FR-015, FR-021.

## Applicable SCs

SC-005, SC-008.
