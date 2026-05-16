# Server Action — `listAccounts`

Reads the session's user's accounts, with optional inclusion of archived rows.

## Location

`lib/accounts/actions.ts`. Marked `"use server"`. Invoked from the accounts page's server component during render. Also callable from the page after a client-side `Switch` toggle (the "Show archived" control re-fetches with `includeArchived: true`).

## Signature

`listAccounts` is **not form-bound** — it takes a plain options object, not a `FormData`. This is the only action in this feature that diverges from the FormData-only pattern.

```ts
async function listAccounts(
  opts: { includeArchived?: boolean } = {},
): Promise<ListAccountsResult>

type ListAccountsResult =
  | { data: { accounts: AccountDTO[] } }
  | { error: ErrorEnvelope }
```

## Input

| Field | Type | Required | Validation |
|---|---|---|---|
| `includeArchived` | `boolean` | no (defaults to `false`) | Coerced to boolean. Anything truthy means "include archived rows". |

The accounts page calls `listAccounts({ includeArchived })` directly from a server component; no Zod boundary is needed here because the input is an in-process object, not request-shaped, and the page's "Show archived" switch is the sole caller. (Per the constitution Principle III, internal helpers trust their typed inputs.)

That said, the action signature uses `z.boolean()` defensively inside a thin parse if/when a future caller wires it from a client URL parameter — left as a low-cost defensive layer in the implementation.

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Call `listAccountsForUser(session.user.id, { includeArchived })` (helper in `lib/accounts/queries.ts`).
3. The helper issues:
   ```ts
   prisma.account.findMany({
     where: includeArchived ? { userId } : { userId, archivedAt: null },
     orderBy: { name: "asc" },
   })
   ```
   See research.md R13 for the sort-rule discussion.
4. Map each row to `AccountDTO` via `serializeAccount`.
5. Return `{ data: { accounts: AccountDTO[] } }`.

No mutation; no `revalidatePath`. The action is a pure read.

## Success — `data` shape

```ts
{
  data: {
    accounts: AccountDTO[]  // sorted alphabetically by name, case-insensitive ASC
  }
}
```

An empty array is the success shape when the user has zero accounts (the accounts page treats this as "render the empty state").

## Errors

| Code | When | Payload extras |
|---|---|---|
| `unauthenticated` | No session | — |
| `internal_error` | Prisma threw | — |

`validation_failed`, `not_found`, and `archived_field_locked` are not reachable for this action.

## Side effects

- None. Pure read.

## Cross-user isolation

The `where: { userId }` clause ensures only the session's user's accounts are returned. There is no parameter that could shift this. The helper does not accept `userId` from input; it takes it as its first positional argument, which the action populates from `session.user.id`.

## Empty-state contract

The action returning `{ data: { accounts: [] } }` is the signal for the page to render the empty state from `components/shell/empty-state.tsx` with the "Add your first account" CTA (FR-010, US1).

## Applicable FRs

FR-002, FR-003, FR-009, FR-010, FR-012, FR-012a, FR-013, FR-014, FR-015, FR-021.

## Applicable SCs

SC-002, SC-003, SC-005, SC-008, SC-011, SC-015.
