# Server Action — `createAccount`

Creates a new `Account` row owned by the session's user.

## Location

`lib/accounts/actions.ts`. Marked `"use server"`. Invoked from the create form inside the accounts page's side sheet, bound via React 19 `useActionState`.

## Signature

```ts
async function createAccount(
  prevState: CreateAccountResult | null,
  formData: FormData,
): Promise<CreateAccountResult>

type CreateAccountResult =
  | { data: { account: AccountDTO } }
  | { error: ErrorEnvelope }
```

The first argument is the previous-state slot mandated by `useActionState`; the action itself does not branch on it.

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `name` | string | yes | Trim → non-empty after trim → max 80 chars (FR-004). |
| `type` | string | yes | Member of `AccountType` enum (`CHECKING` / `SAVINGS` / `CREDIT` / `CASH` / `INVESTMENT` / `OTHER`). |
| `currency` | string | yes | 3-letter alpha-3. Upper-cased at boundary. Must be in `CURRENCY_CODES` (FR-005). |
| `startingBalance` | string | yes | Parseable as `Money`. Decimal-place count must not exceed the chosen currency's `decimals` (FR-006). Sign must match the type rule: `< 0` only allowed for `CREDIT` and `OTHER` (FR-006). |

## Zod schema sketch

```ts
// lib/accounts/schemas.ts (shape only)

import { ACCOUNT_TYPES } from "./constants"

const baseFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be at most 80 characters"),
  type: z.enum(ACCOUNT_TYPES),
  currency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(isCurrencyCode, "Pick a valid currency"),
  startingBalance: z
    .string()
    .trim()
    .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Enter a valid amount"),
}

export const createAccountSchema = z
  .object(baseFields)
  .superRefine((value, ctx) => {
    const result = validateStartingBalance({
      type: value.type,
      currency: value.currency,
      amount: value.startingBalance,
    })
    if (!result.ok) {
      ctx.addIssue({
        path: ["startingBalance"],
        code: "custom",
        message: result.message,
      })
    }
  })
```

The `validateStartingBalance` helper is from `lib/money/validate.ts` (research.md R5).

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Coerce the four `FormData` keys to strings; `safeParse` with `createAccountSchema`. On failure → `{ error: { code: "validation_failed", message, fieldErrors } }` where `fieldErrors` is the flattened Zod field-errors map.
3. Call `createAccountForUser(session.user.id, parsed.data)` (helper in `lib/accounts/queries.ts`). The helper persists with `archivedAt: null`, `startingBalance: new Money(parsed.data.startingBalance)`.
4. On Prisma error → `{ error: { code: "internal_error", message: "Could not save account." } }`. The error is logged server-side; the user-visible message does not echo the raw error.
5. On success: call `revalidatePath("/dashboard/accounts")` and return `{ data: { account: AccountDTO } }`.

The form on the client closes the side sheet on a success result; on an error result, it re-renders with the field errors highlighted.

## Success — `data` shape

```ts
{
  data: {
    account: AccountDTO  // see contracts/README.md
  }
}
```

## Errors

| Code | When | `fieldErrors` populated? |
|---|---|---|
| `unauthenticated` | No session | no |
| `validation_failed` | Zod parse failed (any of: empty/oversized name, unknown type, invalid currency, malformed/excess-decimals/negative-disallowed startingBalance) | yes, with the failing field name(s) as keys |
| `internal_error` | Prisma threw on insert | no |

`not_found` is **not** reachable for create (there's no target row to miss).
`archived_field_locked` is **not** reachable for create (there's no archived state to violate).

## Side effects

- Inserts one row into `Account`.
- Calls `revalidatePath("/dashboard/accounts")` on success.
- Does NOT redirect (the form's parent owns the sheet-close behavior).

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-014, FR-015, FR-016, FR-021.

## Applicable SCs

SC-001, SC-002, SC-007.
