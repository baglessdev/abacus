# Server Action — `unarchiveAccount`

Clears `archivedAt` on an existing `Account` row owned by the session's user.

## Location

`lib/accounts/actions.ts`. Marked `"use server"`. Invoked from the edit sheet's "Unarchive" button (no confirmation; research.md R11), bound as a plain `<form action={…}>` with a hidden `id` input.

## Signature

```ts
async function unarchiveAccount(
  prevState: UnarchiveAccountResult | null,
  formData: FormData,
): Promise<UnarchiveAccountResult>

type UnarchiveAccountResult =
  | { data: { account: AccountDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty. Identifies the row to unarchive. |

## Zod schema sketch

```ts
// lib/accounts/schemas.ts (shape only)

export const unarchiveAccountSchema = z.object({
  id: z.string().min(1, "Missing account id"),
})
```

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. `safeParse` with `unarchiveAccountSchema`. On failure → `{ error: { code: "validation_failed", message, fieldErrors } }`.
3. Call `setArchivedAtForUser(session.user.id, id, null)` (helper in `lib/accounts/queries.ts`). Same shape as archive but passing `null`. Same `count === 0` → `not_found` mapping.
4. On Prisma error → `{ error: { code: "internal_error", message: "Could not unarchive account." } }`.
5. On success: `revalidatePath("/dashboard/accounts")`, return `{ data: { account: AccountDTO } }`.

The action is **idempotent**: unarchiving an already-active row succeeds and returns the row (with `archivedAt: null`).

## Success — `data` shape

```ts
{
  data: {
    account: AccountDTO  // with archivedAt: null
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

## Side effects

- Updates `Account.archivedAt` to `NULL` for one row.
- Calls `revalidatePath("/dashboard/accounts")` on success.
- Does NOT redirect.
- Does NOT touch any other column.

## Applicable FRs

FR-002, FR-003, FR-008, FR-013, FR-014, FR-015, FR-021.

## Applicable SCs

SC-005, SC-008.
