# Server Action — `updateAccount`

Updates an existing `Account` row owned by the session's user. Honors the FR-007 currency-immutability rule and the FR-009a archived-field-lock rule.

## Location

`lib/accounts/actions.ts`. Marked `"use server"`. Invoked from the edit form inside the accounts page's side sheet, bound via React 19 `useActionState`.

## Signature

```ts
async function updateAccount(
  prevState: UpdateAccountResult | null,
  formData: FormData,
): Promise<UpdateAccountResult>

type UpdateAccountResult =
  | { data: { account: AccountDTO } }
  | { error: ErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Non-empty. Identifies the row to update. |
| `name` | string | yes | Same shape as `createAccount`. |
| `type` | string | conditional | Required when the target row is active. Rejected when the target row is archived (FR-009a). |
| `startingBalance` | string | conditional | Required when the target row is active. Rejected when the target row is archived (FR-009a). |
| `currency` | — | NEVER accepted | Even if posted, ignored at parse (FR-007). The schema does not declare a `currency` field. |

## Zod schema sketch — two shapes selected at runtime

```ts
// lib/accounts/schemas.ts (shape only)

export const updateActiveAccountSchema = z
  .object({
    id: z.string().min(1),
    name: baseFields.name,
    type: baseFields.type,
    startingBalance: baseFields.startingBalance,
  })
  .superRefine((value, ctx) => {
    // need the row's currency to validate startingBalance; passed in via closure
    const result = validateStartingBalance({
      type: value.type,
      currency: <bound currency>,
      amount: value.startingBalance,
    })
    if (!result.ok) ctx.addIssue({ path: ["startingBalance"], code: "custom", message: result.message })
  })

export const updateArchivedAccountSchema = z.object({
  id: z.string().min(1),
  name: baseFields.name,
})
```

The action **pre-fetches** the row to determine `archivedAt` before parsing, then picks the appropriate schema. The currency is also pulled from the pre-fetched row and bound into the `superRefine` closure (it isn't accepted from the request).

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Read `id` from `formData`. Reject (`validation_failed`) if missing or empty.
3. Call `getAccountForUser(session.user.id, id)`. On `null` → `{ error: { code: "not_found", … } }` (FR-013; same envelope for "doesn't exist" and "belongs to another user").
4. Inspect the row's `archivedAt`. If non-null, select `updateArchivedAccountSchema`; otherwise select `updateActiveAccountSchema` (with the row's `currency` bound into the closure).
5. If the row is archived AND the payload contains `type` or `startingBalance` keys with non-empty values that differ from the persisted values, short-circuit with `{ error: { code: "archived_field_locked", field: <"type" | "startingBalance">, message: "This field is locked while the account is archived." } }`. (Practical implementation note: the schema-selection step prevents these fields from reaching the success path; the explicit short-circuit ensures the dedicated error code is returned rather than a generic `validation_failed` with a stripped-field message.)
6. `safeParse` with the chosen schema. On failure → `{ error: { code: "validation_failed", message, fieldErrors } }`.
7. Call `updateAccountForUser(session.user.id, id, patch)` (helper in `lib/accounts/queries.ts`). The helper applies only the fields present in the patch.
8. On Prisma error → `{ error: { code: "internal_error", message: "Could not save changes." } }`.
9. On success: call `revalidatePath("/dashboard/accounts")` and return `{ data: { account: AccountDTO } }`.

## Success — `data` shape

```ts
{
  data: {
    account: AccountDTO
  }
}
```

## Errors

| Code | When | Payload extras |
|---|---|---|
| `unauthenticated` | No session | — |
| `not_found` | Target row does not exist OR belongs to another user (FR-013) | — |
| `archived_field_locked` | Payload attempts to mutate `type` or `startingBalance` on an archived row (FR-009a) | `field: "type" \| "startingBalance"` |
| `validation_failed` | Any Zod check fails (name shape, type enum, startingBalance shape/sign/decimals) | `fieldErrors` |
| `internal_error` | Prisma threw on update | — |

## Side effects

- Updates one row in `Account` (`name`, optionally `type` and `startingBalance`).
- Calls `revalidatePath("/dashboard/accounts")` on success.
- Does NOT redirect.
- Does NOT touch `archivedAt`, `currency`, `createdAt`, `userId` (FR-007, FR-002, FR-009a).

## Atomicity

The update is a single Prisma `update` — all-or-nothing per US4 acceptance scenario 7. If validation fails, the persisted row is unchanged. If Prisma errors after Zod passes, the persisted row is unchanged (Prisma update is one statement).

## Applicable FRs

FR-002, FR-003, FR-004, FR-006, FR-007, FR-009a, FR-013, FR-014, FR-015, FR-016, FR-021.

## Applicable SCs

SC-004, SC-007, SC-008, SC-009, SC-014.
