# Feature 004 — Account Contracts

Each file in this directory documents one server action exposed by `lib/accounts/actions.ts`. All five share the same envelope shape:

```ts
type Result<TData> =
  | { data: TData }
  | { error: ErrorEnvelope }

type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "archived_field_locked"; message: string; field: "type" | "startingBalance" }
  | { code: "internal_error"; message: string }
```

The matching constants (codes, messages) live in `lib/accounts/errors.ts` (lands in the implementation phase). Every action returns this envelope; redirects on the success path of form-bound actions are described per-file.

## Shared session contract (all actions)

Every action calls:

```ts
const session = await auth()
if (!session?.user?.id) {
  return { error: { code: "unauthenticated", message: "Sign in to manage accounts." } }
}
const userId = session.user.id
```

`userId` is **never** read from request input. The user-id is passed as the first argument to the relevant `lib/accounts/queries.ts` helper.

## Shared DTO

The "account" shape returned to client code (in `data` payloads) is:

```ts
type AccountDTO = {
  id: string
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT" | "CASH" | "INVESTMENT" | "OTHER"
  currency: string          // ISO 4217 alpha-3 uppercase
  startingBalance: string   // canonical decimal string, e.g., "1250.00", "-500.00", "0"
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string         // ISO 8601 UTC
  updatedAt: string         // ISO 8601 UTC
}
```

The mapping from the Prisma row to `AccountDTO` is centralized in `lib/accounts/serialize.ts` (lands in the implementation phase). `Decimal` → `string` via `.toString()`. `Date` → `string` via `.toISOString()`.

## Files

- `createAccount.md` — Create a new account for the session's user.
- `updateAccount.md` — Update an existing account (subject to FR-007 currency-immutability and FR-009a archived-field-lock).
- `archiveAccount.md` — Set `archivedAt = now()` on an existing account.
- `unarchiveAccount.md` — Clear `archivedAt` on an existing account.
- `listAccounts.md` — Read the session's user's accounts, with optional inclusion of archived rows.
