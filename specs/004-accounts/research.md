# Feature 004 — Phase 0 Research

Non-obvious decisions taken during planning. Each entry: Decision / Rationale / Alternatives considered. Inputs locked by the spec's Clarifications section are NOT re-litigated here; the entries below cover only the choices the spec deliberately left to the plan.

---

## R1. Decimal library — `Prisma.Decimal` as the single canonical wrapper

**Decision.** Standardize the whole codebase on `Prisma.Decimal` (the `Decimal` type exported by `@prisma/client`, which is `decimal.js` v10 under the hood). `lib/money/decimal.ts` re-exports it under the project-native name `Money`. Every monetary value — whether read from the DB, parsed from a form, returned by a server action, or compared in a unit test — flows through this single type. No file outside `lib/money/` performs arithmetic on monetary values (FR-016); arithmetic helpers live in `lib/money/decimal.ts` and call through to `Decimal`'s `.plus`/`.minus`/`.times`/`.div`/`.cmp`.

**Rationale.**

- Prisma already ships `decimal.js` as a transitive dep. Adopting it adds zero new runtime dependencies. Adopting `big.js` or `dinero.js` instead would add a parallel decimal implementation, two arithmetic surfaces to keep in sync, and two import paths developers have to remember.
- `Prisma.Decimal` is what Prisma's generated types use for the `Decimal` column. Anything else means a manual conversion on every DB boundary, which is the kind of paper cut that grows into a class of bugs (constitution Principle I).
- Renaming the import to `Money` at the boundary (`export const Money = Prisma.Decimal`) keeps the call sites readable and decouples the public name from the underlying library — if we ever swap implementations, the change is one file.

**Alternatives considered.**

- *`big.js`.* Smaller and arguably nicer API. Rejected — would coexist with Prisma's own `Decimal` (you cannot stop Prisma from returning its own type on `findMany`), so we'd be running two libraries.
- *`dinero.js` (immutable-money library).* Tempting because it bundles currency into the value. Rejected for two reasons: (a) it stores integer minor units, which means a translation layer between Postgres `NUMERIC` and `Dinero`'s internal representation every read/write; (b) the currency-aware decimal-place rule we already need (FR-006) covers the same ground at lower cost.
- *Plain `number` (JavaScript `Number`).* Rejected by the constitution (Principle I, "no float").

---

## R2. Serialization of `Decimal` over the React server-component boundary

**Decision.** Server actions return monetary values **as `string`** (the canonical ISO-style decimal string, e.g., `"1250.00"`, `"-500.00"`, `"0"`), not as `Prisma.Decimal` instances. The client side re-wraps with `new Money(str)` if it needs to do arithmetic; for pure display it formats the string directly.

**Rationale.**

- `Prisma.Decimal` is not POJO-serializable. Returning it raw from a server action would result in `{}` after React's serialization or a runtime warning, depending on the Next.js version.
- Strings round-trip losslessly through React's serialization. They preserve the exact precision Postgres stored. The boundary `JSON.stringify(decimal)` already produces the canonical string form via `.toString()`.
- Keeping the wire format string-typed (and never `number`) preserves Principle I across the network edge, where the float trap is at its most dangerous.

**Alternatives considered.**

- *Serialize as `{ amount: string, currency: string }` object.* Adopted for response payloads where the value is presented as part of an account row (the `listAccounts` and `createAccount` response shapes are object-typed and include `currency` alongside). For raw single-value passing inside the codebase, the bare string is enough.
- *Serialize as `number`.* Rejected — Principle I. JPY survives, USD/EUR mostly survive, but BHD with three decimals already starts to lose precision on values past ~9 trillion. Pointless risk.

---

## R3. ISO 4217 allow-list — bundled TypeScript constant, no runtime fetch

**Decision.** `lib/money/currencies.ts` exports a const `CURRENCIES: readonly Currency[]` containing every currently-active ISO 4217 code (~170 entries), where each entry is shaped:

```ts
type Currency = {
  code: string      // ISO 4217 alpha-3, uppercase (e.g., "USD")
  name: string      // English name (e.g., "United States Dollar")
  decimals: 0 | 2 | 3 | 4  // ISO 4217 "default fraction digits" (E.4)
  symbol: string    // Display symbol (e.g., "$", "€", "¥"); fall back to code if no widely-recognized symbol exists
}
```

The same file exports:

- `CURRENCY_CODES: ReadonlySet<string>` — a `Set` of uppercase codes built once at module load for O(1) membership checks (the validator hot path).
- `getCurrency(code: string): Currency | undefined` — lookup by uppercase code.
- `isCurrencyCode(code: string): code is Currency["code"]` — type guard for narrowing in TS.

The list is the **single source of truth** for FR-005 (validate against active ISO 4217) and FR-006 (currency-aware decimal places). Updates ship with a code release. Obsolete codes (e.g., `DEM`, `FRF`, `XEU`) are excluded.

**Rationale.**

- Hardcoding ~170 entries is ~6KB of TS source. Trivial. The file is human-readable and one PR away from a fix if ISO publishes a change.
- Avoids a new runtime dependency just to access a static list. `iso-4217` and `currency-codes` on npm both ship the same data with a thin API; adopting one is more lock-in than value.
- Building the `Set` once at module load is faster than re-scanning the array on every validation, and the membership check is the hot path on every create/edit.
- A single file means one place to lookup "what does USD do?" — `decimals: 2, symbol: "$"`. Symbol and decimals do not get to live in two places.

**Alternatives considered.**

- *`iso-4217` npm package.* Adds a dep for data we can inline. Marginal upkeep cost for the inline list (the ISO 4217 active set turns over slowly — handful of changes per decade).
- *Postgres-backed currency table.* Rejected — runtime DB lookup for a static list is a regression versus the in-process Set. Also adds a migration and a seed step.
- *JSON file loaded at startup.* No-op compared to a TS const; loses TS literal typing and adds a parse step.

---

## R4. Currency decimal-place rule lives with the allow-list

**Decision.** The fractional-digit count for each currency lives on the same `Currency` record as the code/name/symbol. The validator `validateStartingBalanceDecimals(amount, currency)` looks up the record once and rejects amounts whose decimal-place count exceeds `currency.decimals`. JPY (0) refuses `0.5`; USD (2) refuses `1.234`; BHD (3) accepts `1.234`.

**Rationale.**

- One source of truth per currency. The decimals don't get to drift between "what the validator thinks" and "what the formatter renders".
- The rule expressed in spec FR-006 is mechanical given the data: count the digits after the decimal point in the user's submitted string, compare to `currency.decimals`. No business logic required.

**Alternatives considered.**

- *Separate file mapping `Record<string, number>`.* Adopted for one feature, then would split as soon as we needed name/symbol elsewhere. Co-locating now avoids the split.
- *Run `Intl.NumberFormat(locale, { currency }).resolvedOptions().maximumFractionDigits`.* Rejected — depends on `Intl` data which is environment-specific (Node ICU build, browser, etc.) and not strictly the ISO 4217 list. We want the ISO definition, not a locale's display preference.

---

## R5. Negative-balance rule — a helper, not a Zod refinement library

**Decision.** `lib/money/validate.ts` exports two pure functions:

```ts
export function allowsNegativeStartingBalance(type: AccountType): boolean
// returns true iff type === "CREDIT" || type === "OTHER"

export function validateStartingBalance(input: {
  type: AccountType
  currency: string  // ISO 4217 code, already uppercased
  amount: string    // ISO decimal string (the wire form from R2)
}): { ok: true } | { ok: false; code: ValidationCode; message: string }
```

The Zod schema in `lib/accounts/schemas.ts` calls `validateStartingBalance` inside a `.superRefine` over the parsed object, attaching the failure (if any) to the `startingBalance` field path. Two cases produce a `false`: more decimal places than the currency supports, and negative on a non-`CREDIT`/non-`OTHER` type. Both are rejected at the Zod boundary (FR-006), never reaching persistence.

**Rationale.**

- The negative-balance rule and the decimal-place rule both depend on **all three** of `type`, `currency`, and `amount`. They cannot be expressed as field-local Zod refinements; they belong in `.superRefine` over the whole object.
- Keeping the rule as a plain function (not a `z.refine`) means it can also be called from unit tests directly, without spinning up the Zod schema. FR-022 specifically asks for these as unit-test targets.
- The `lib/money/` location enforces FR-016 — the rule is "monetary arithmetic-adjacent", and the constitution wants the boundary clear.

**Alternatives considered.**

- *Inline the check inside `signUp`-style action body.* Rejected — re-implements the boundary in every action that touches a balance. Violates "validate at boundaries" (Principle III) and FR-014.
- *Express as two separate refinements.* Possible but produces less actionable error messages (the user sees two errors when one root cause produced them). Single helper, single message.

---

## R6. Server actions over route handlers for all CRUD

**Decision.** All five Account mutations and the list query live as **Next.js Server Actions** in `lib/accounts/actions.ts`:

- `createAccount`
- `updateAccount`
- `archiveAccount`
- `unarchiveAccount`
- `listAccounts`

Each is `"use server"`, accepts a typed input (a `FormData` for the form-bound ones, a plain object for the programmatic ones), reads the session via `await auth()`, validates with Zod, and returns the constitution-mandated `{ data } | { error: { code, message } }` envelope. Forms (the create + edit + archive flows) bind via `<form action={...}>` and React 19's `useActionState`. Programmatic list-query and the archive/unarchive button actions are called directly from server components.

No public REST endpoint is added under `app/api/*` for accounts; the Auth.js catch-all at `/api/auth/[...nextauth]/route.ts` is unchanged.

**Rationale.**

- Feature 003 set the precedent for server actions for the auth surface; matching the pattern keeps the codebase coherent.
- The accounts surface is form-first (create, edit) and RSC-rendered (list). Server actions are the path-of-least-resistance for both. Route handlers would add public URLs we'd then have to gate, document, and version.
- Server actions get the session via `auth()` "for free" — no manual cookie parsing, no per-route boilerplate.
- The user only ever interacts with their own accounts; no third party calls this surface. There is no API client to support. Public REST adds surface area for no consumer.

**Alternatives considered.**

- *Route handlers under `app/api/accounts/`.* Rejected — adds a parallel surface to maintain, requires explicit auth gating per route, complicates revalidation. Worth it for public APIs (none here).
- *tRPC or similar typed-RPC layer.* Rejected — extra dep, extra build step, extra type-generation pipeline. Server actions already give us end-to-end type safety with zero infrastructure.

---

## R7. Form state — React 19 `useActionState`

**Decision.** Each form (create, edit, edit-archived) uses React 19's `useActionState(action, initialState)` to bind the form to the server action. The action returns the error envelope on validation/auth failure (the form re-renders with field-scoped errors); on success the action `redirect()`s or `revalidatePath("/dashboard/accounts")`s and the form unmounts as the sheet closes.

The form component is a `"use client"` component that takes an `initialAccount?: AccountDTO` prop and a `mode: "create" | "edit" | "edit-archived"` prop. The form decides which fields render disabled based on `mode`. Submission target is always the same action shape `(prev, formData) => Promise<Result>`.

**Rationale.**

- Already proven in feature 003's `login-form.tsx` and `signup-form.tsx` — same pattern, same hooks. No new tooling to learn.
- `useActionState` handles the "form is pending" + "show the error" + "preserve the typed-in values across a server reject" cases out of the box, matching US4 acceptance scenario 6 ("entered values are preserved for the still-valid fields") with zero custom code.
- Server-side rendering of the initial form values for "edit" mode (server component fetches the row, passes it to the client form) avoids a redundant client fetch.

**Alternatives considered.**

- *Formik / React Hook Form.* Rejected — both are great libraries; both are unnecessary here. The form has six fields; `useActionState` covers it. Adding a form library would be premature abstraction.
- *Pure client state with `useState` + manual `fetch`.* Rejected — needs a route handler (rejected in R6) and reinvents what `useActionState` provides.

---

## R8. Currency picker UX — shadcn `Command` (cmdk) in a `Popover`

**Decision.** The currency selector is a searchable combobox built from shadcn's `Command` primitive (which wraps `cmdk`) inside a shadcn `Popover`. The trigger button shows the current selection ("USD — United States Dollar") or a placeholder; clicking opens a popover with a search input and a virtualized list of all ~170 currencies. Filter is fuzzy over `code` + `name`. Keyboard: Up/Down navigates, Enter selects, Esc closes.

**New dependencies and components needed**:

- npm dep: `cmdk` (peer dep of shadcn's Command).
- shadcn primitive: `components/ui/command.tsx` (the shadcn-generated wrapper around `cmdk`).
- shadcn primitive: `components/ui/popover.tsx` (already provided by Radix; this project does not yet have it on file).
- npm dep: `@radix-ui/react-popover` (peer dep of shadcn's Popover; not yet on `package.json`).

In the **edit** mode, the trigger is rendered as a disabled `<Input readOnly>` showing the locked currency, with a one-line caption underneath: "Currency is locked at creation to keep balances consistent." (FR-007 + the US3 scenario 3 acceptance criterion.)

**Rationale.**

- ~170 entries demand a searchable picker. A native `<select>` becomes unusable past ~30 entries.
- shadcn `Command` is the standard project pattern for typeahead pickers; we'll need it again for the category picker (feature 005) and the account picker (feature 006). Investing in the primitive once now amortizes.
- `cmdk` is the project's first non-Radix UI dep; it's tiny (~3KB) and battle-tested.

**Alternatives considered.**

- *Native `<select>` with `<option>` per currency.* Acceptable for FR-005 mechanically but a clear regression on the UX side; the spec says "searchable combobox" (FR-005).
- *Roll our own picker on top of `<Input>` + `<ul>`.* Rejected — re-implements keyboard handling, ARIA, focus management. `cmdk` does it correctly.
- *Headless UI's `Combobox`.* Rejected — would introduce a parallel UI primitive stack alongside Radix; shadcn convention is to stay within the Radix+cmdk world.

---

## R9. Accounts list UX — plain semantic table, no `data-table`

**Decision.** The accounts list is rendered as a plain semantic `<table>` styled with the (new) shadcn `Table` primitive (`components/ui/table.tsx`). The list-level controls are: a "Show archived" `Switch` above the table (FR-009) and a primary "Add account" button. No column sorting (FR-012 locks alphabetical-by-name only). No column filters. No pagination (FR-024 — no enforced upper bound, but the spec's "few dozen accounts" ceiling makes pagination YAGNI for v1).

**New components needed**:

- shadcn primitive: `components/ui/table.tsx`.
- shadcn primitive: `components/ui/switch.tsx` (and `@radix-ui/react-switch`, not yet on `package.json`).
- shadcn primitive: `components/ui/badge.tsx` (for the "Archived" badge; pure CSS — no new dep).

**Rationale.**

- The list has one sort order and one filter toggle. shadcn `data-table` (tanstack-table) is engineered for arbitrary sorting, multi-column filtering, pagination, row-selection — none of which this feature needs. Adopting it would be premature.
- A semantic `<table>` reads cleanly in tests (`getByRole("row")`) and is accessible by default (FR-020).
- The future transactions feature (006) is the first surface that genuinely needs a `data-table`. Land it there.

**Alternatives considered.**

- *shadcn `data-table` (tanstack-table).* Rejected for this feature; ~5KB + a small adapter layer for one filter toggle is poor leverage.
- *A `<ul>`/`<li>` "card list" instead of a table.* Rejected — table-shaped data deserves a `<table>`. Mobile responsiveness is handled by Tailwind utility classes on the cells, not by abandoning the table.

---

## R10. Edit side-sheet — single form with three modes

**Decision.** A single `<AccountForm mode={…} initialAccount={…}>` client component is rendered inside shadcn `Sheet`. The sheet's open/close state is controlled by the parent accounts page (a small client component that wraps the table and manages "which account is the sheet editing" state). The form's mode is one of:

| `mode` | Editable | Read-only | Trigger source |
|---|---|---|---|
| `"create"` | `name`, `type`, `currency`, `startingBalance` | — | "Add account" button |
| `"edit"` | `name`, `type`, `startingBalance` | `currency` (always; FR-007) | Click on an active row |
| `"edit-archived"` | `name` | `type`, `startingBalance`, `currency` (FR-009a) | Click on an archived row (toggle on) |

The form also renders mode-appropriate footer actions:

| `mode` | Primary action | Secondary action |
|---|---|---|
| `"create"` | "Create account" (submits `createAccount`) | "Cancel" |
| `"edit"` | "Save changes" (submits `updateAccount`) | "Archive" (submits `archiveAccount`) |
| `"edit-archived"` | "Save changes" (submits `updateAccount` with name-only) | "Unarchive" (submits `unarchiveAccount`) |

**Rationale.**

- One component, three render modes is materially simpler than three near-identical components. The shape of the form (which fields and which are disabled) is data-driven from `mode`.
- The mode is computed server-side in the parent page (`accountRow.archivedAt ? "edit-archived" : "edit"`); the client form trusts it. This keeps the client free of session/auth reasoning.
- "Unarchive" is exposed only in `edit-archived` mode (FR-009a). "Archive" only in `edit` mode. Each action is one click + a confirmation dialog (shadcn `AlertDialog`, also new — see below).

**Alternatives considered.**

- *Three sibling form components.* Triplicate maintenance burden. Rejected.
- *A separate `/dashboard/accounts/[id]` detail page.* Out of scope (FR-019; spec clarification).

---

## R11. Confirmations — `AlertDialog` for archive, no confirmation for unarchive

**Decision.** Archive is gated by a confirmation step: clicking "Archive" inside the edit sheet opens an `AlertDialog` ("Archive this account?" / "Yes, archive" / "Cancel"). Unarchive is **not** gated — it's a single click with no confirmation. Edit submissions are also not confirmation-gated (a save with bad data shows field errors and stays open).

**New component needed**: shadcn `alert-dialog.tsx` (and `@radix-ui/react-alert-dialog`).

**Rationale.**

- Archive feels destructive to the user (the row disappears from the default view). A confirmation is the standard UX for that signal, even though the operation is fully reversible. Cheap to add, prevents accidental clicks.
- Unarchive is recovery; the user already had to enable "Show archived" + open the sheet to reach it. Triple-gating it would be condescending.
- Save is not destructive. The form's own validation is the only gate it needs.

**Alternatives considered.**

- *No confirmation on archive.* Rejected — the spec's "reversible an arbitrary number of times" wording doesn't mean "frictionless". One confirm step is appropriate.
- *Inline toast + undo affordance (Gmail-style).* Tempting but requires `sonner` and an undo-pipeline that no other feature in this v1 needs yet. Defer.

---

## R12. Pessimistic UI; defer `useOptimistic` to a later feature

**Decision.** All four mutations are pessimistic: the form/button submits, awaits the server action, and lets `revalidatePath("/dashboard/accounts")` refresh the list. No `useOptimistic` shim in this feature.

**Rationale.**

- Local-dev latency to a Postgres adapter-pg connection is sub-50ms for these operations. The pessimistic delay is imperceptible.
- `useOptimistic` shines when the server roundtrip is slow or the user does many actions in a row. Neither is the case here (four CRUD ops, infrequent use).
- Optimistic UX has a real cost: now we have to think about "what does the row look like while it's in flight" + "what does revert look like if the server rejects". For four operations on a feature that ships in a week, that's overhead with no payback.

**Alternatives considered.**

- *Optimistic `useOptimistic` for archive/unarchive.* Defer to feature 006 (transactions), where the user actually does many ops in a row. Document this decision so future-us doesn't re-litigate it.
- *Aggressive client-side state caching (SWR, React Query).* Rejected — Next.js App Router's RSC + `revalidatePath` covers this without a new dep.

---

## R13. Sort — Prisma `orderBy` with `mode: "insensitive"`

**Decision.** `listAccounts` issues:

```ts
prisma.account.findMany({
  where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
  orderBy: { name: "asc" },
})
```

Postgres's default collation on the `name` column produces a case-insensitive `ASC` sort for ASCII names under the standard `pg_catalog`/`en_US.UTF-8` collation. For mixed-case input ("chase Checking" vs. "Chase Checking"), the order is deterministic across reloads (FR-012, SC-002).

If a future locale-specific case-insensitivity ever bites, we move the sort client-side (`.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))`) since the result set is small ("few dozen"). For v1, the DB-side sort is correct and faster.

**Rationale.**

- DB-side sort is faster and atomic with the read; no second pass.
- Case-insensitive on the typical PG collation is "good enough" for the personal-finance ceiling.
- Documenting the fallback explicitly means the implementer won't need to ad-lib if the assertion fails locally on a non-standard collation.

**Alternatives considered.**

- *Add a citext column or a generated `LOWER(name)` column for sort.* Premature; the v1 sort is correct on a default PG locale.
- *Sort in TypeScript after fetch.* Slightly slower; the spec only mentions deterministic ordering, not microsecond optimization. Use as fallback if PG collation diverges.

---

## R14. Migration command and file location

**Decision.** The migration is generated via:

```bash
pnpm db:migrate -- --name add_account
```

which runs `prisma migrate dev --name add_account` against the configured `DATABASE_URL`. The output lands at:

```text
db/migrations/<timestamp>_add_account/migration.sql
```

The migration is **committed**. No `db push` is run against committed code (constitution Conventions, FR-001).

The same migration also adds the `accounts Account[]` back-relation on the `User` model. That is a schema-only change — Prisma does not emit SQL for back-relations — and is bundled inside the same migration metadata.

**Rationale.**

- One migration per feature is the project's working rhythm (feature 003 = `add_user`, feature 004 = `add_account`).
- The back-relation has no SQL footprint; bundling it costs nothing.

**Alternatives considered.** None — this is the constitution-mandated path.

---

## R15. Cross-user isolation — `lib/accounts/queries.ts` always injects `userId` from session

**Decision.** All Prisma access to the `account` table goes through a small set of helpers in `lib/accounts/queries.ts`:

```ts
// shape only — names + signatures the implementer will fill
export async function listAccountsForUser(userId: string, opts: { includeArchived: boolean }): Promise<Account[]>
export async function getAccountForUser(userId: string, accountId: string): Promise<Account | null>
export async function createAccountForUser(userId: string, input: CreateAccountInput): Promise<Account>
export async function updateAccountForUser(userId: string, accountId: string, patch: UpdateAccountPatch): Promise<Account | null>
export async function setArchivedAtForUser(userId: string, accountId: string, archivedAt: Date | null): Promise<Account | null>
```

Every server action calls `await auth()` first, extracts `session.user.id`, and passes it as the **first argument** to the helper. The helpers never accept the `userId` from request input (FR-013). No code outside `lib/accounts/queries.ts` issues a `prisma.account.*` call.

The "not yours vs. doesn't exist" collapse (FR-013, SC-008) is enforced naturally: each query has `where: { id: accountId, userId }` so the row only resolves when both match. A miss returns `null` from the helper; the action returns the `not_found` envelope, which is the **same** envelope used when the id truly does not exist. No log line distinguishes them. No response timing distinguishes them (both paths are a single PG `findUnique`).

**Rationale.**

- Centralizing the Prisma calls in one file makes "did this query forget to scope by userId?" a one-file audit. As the codebase grows (transactions, budgets), the pattern stays consistent.
- The `where: { id, userId }` pattern is structurally identical to feature 003's "no user enumeration" pattern (FR-014 of that feature). Same lesson, new model.
- Cross-user attempts and "real" 404s are indistinguishable by construction — no timing side channel, no shape difference. SC-008 holds without extra logic.

**Alternatives considered.**

- *Single global `prisma.account` access scattered across actions.* Rejected — invites the "did this one forget the userId filter?" class of bug. The constitution's data-scoping rule wants centralization.
- *Row-level security (RLS) in Postgres.* Out of scope. The constitution explicitly defers RLS as a future hardening step (feature 003 research §R10 of the original). Application-level enforcement is sufficient for v1.
- *Pass the whole `Session` object into helpers.* Rejected — couples query helpers to Auth.js types. Just pass the `userId` string.

---

## R16. Error code catalog — five codes total

**Decision.** The server actions return errors using exactly this set of codes:

| Code | When | HTTP-equivalent | Payload extras |
|---|---|---|---|
| `unauthenticated` | `await auth()` returned no session | 401 | none |
| `validation_failed` | Zod parse failed | 400 | `fieldErrors: Partial<Record<FieldName, string[]>>` |
| `not_found` | Target account does not exist OR belongs to another user (FR-013) | 404 | none |
| `archived_field_locked` | Edit payload tries to change `type` or `startingBalance` on an archived account (FR-009a) | 422 | `field: "type" \| "startingBalance"` |
| `internal_error` | Unexpected Prisma / runtime error | 500 | none |

The envelope shape is `{ error: { code, message, ...extras } }`. The success envelope is `{ data }` where `data` is action-specific. Both shapes match the constitution's `{ data } | { error: { code, message } }` convention.

`archived_field_locked` is a distinct code (not `validation_failed`) because its **cause** is structurally different — the input may be perfectly valid Zod-wise; it's the **state of the row** that rejects it. Surfacing the distinction lets the form display a different message ("This field is locked while the account is archived") instead of a generic validation error.

**Rationale.**

- Five codes is the minimum to cover every observable failure mode this feature introduces. Each one corresponds to a distinct user-facing message.
- `not_found` is deliberately the same envelope for "wrong user's account" and "no such account" (FR-013, SC-008). This is enforced by the query helper structure (R15), not by branching in the action.
- Codes are `snake_case` per the existing convention (the auth codes are `SCREAMING_SNAKE` historically; switching to lowercase here aligns with the constitution's drift toward HTTP-status-like names. The auth codes remain unchanged in feature 003.) **Pragmatic note**: if alignment matters more than lowercase, the implementer may keep `SCREAMING_SNAKE_CASE` — the contract files use lowercase as the recommendation; the source of truth is the constants in `lib/accounts/errors.ts` that the implementer will land. **Decision is final** at the contract level: lowercase. Implementer follows.

**Alternatives considered.**

- *Collapse `archived_field_locked` into `validation_failed`.* Rejected — different cause, different message, different UX surface.
- *Add `currency_immutable` for FR-007 violations.* Rejected — currency-change attempts in `update` are caught by `validation_failed` (the Zod schema simply does not include `currency` as an editable field), making the dedicated code redundant.
- *Surface Prisma's error codes (e.g., `P2002`) up the stack.* Rejected — leaks ORM identity to the UI surface. We translate at the boundary.

---

## R17. `lib/money/` module shape

**Decision.** `lib/money/` lands with this exact file layout:

```text
lib/money/
├── decimal.ts        # re-export Prisma.Decimal as `Money`; arithmetic helpers (plus/minus/cmp/etc.)
├── currencies.ts     # CURRENCIES array, CURRENCY_CODES set, getCurrency, isCurrencyCode
├── validate.ts       # allowsNegativeStartingBalance, validateStartingBalance
├── format.ts         # formatAmount(amount, currency) for UI display
└── index.ts          # barrel re-exporting the public surface
```

No file outside `lib/money/` performs arithmetic on monetary amounts (FR-016). The barrel re-exports `Money`, `Currency`, `CURRENCIES`, `getCurrency`, `isCurrencyCode`, `allowsNegativeStartingBalance`, `validateStartingBalance`, and `formatAmount`. Type-only exports use `export type`.

Unit tests under `tests/unit/`:

| File | Covers |
|---|---|
| `tests/unit/money-decimal.test.ts` | `Money` wrapping behavior; round-trip from string; arithmetic identities (associativity, identity element 0, additive inverse) |
| `tests/unit/money-currencies.test.ts` | `CURRENCY_CODES` contains expected codes (USD, EUR, JPY, BHD); rejects obsolete codes (DEM, FRF, XEU); `getCurrency("usd")` returns undefined (case sensitivity); `isCurrencyCode` narrows correctly |
| `tests/unit/money-validate.test.ts` | `allowsNegativeStartingBalance` per type; `validateStartingBalance` rejects 3 decimals on USD, accepts 3 on BHD, rejects negative on CHECKING/SAVINGS/CASH/INVESTMENT, accepts negative on CREDIT/OTHER, accepts 0 everywhere |
| `tests/unit/money-format.test.ts` | `formatAmount("1250.00", "USD")` produces `$1,250.00`; `formatAmount("0", "JPY")` produces `¥0`; `formatAmount("-500", "USD")` produces `-$500.00`; thousands separator behavior |

These four files together cover the SC-010 / FR-022 bar (Principle IV).

**Rationale.**

- One file per concern keeps the diff small and the unit test mapping 1:1 (FR-022).
- The barrel keeps the import surface from the rest of the codebase to one path (`import { … } from "@/lib/money"`).
- Tests target functions, not adapters or fakes, which is exactly what Principle IV asks for ("test the money paths").

**Alternatives considered.**

- *One mega-file `lib/money.ts`.* Hard to test in isolation; harder to grep. Reject.
- *Separate `lib/currencies/` for the allow-list.* Rejected — the currency record carries the decimals field that the money validator depends on. Co-locate.

---

## R18. Decimal precision/scale on the `Account.startingBalance` column

**Decision.** The Prisma column declaration is:

```prisma
startingBalance Decimal @db.Decimal(20, 8)
```

That's 20 total digits with 8 after the decimal point — enough to represent any active ISO 4217 amount with comfortable headroom. BHD's three-decimal precision is covered by margin (8 > 3); BTC-like high-precision currencies (deferred; not in v1's active set) would still fit. The 20-digit total accommodates values up to 999,999,999,999.99999999 (about a trillion dollars at full precision) — more than any realistic personal balance.

**Rationale.**

- A single column shape covers every currency in the allow-list without per-currency branching at the schema level. The currency-aware decimal-place rule (FR-006) is enforced at the Zod boundary, not the column shape.
- Postgres `NUMERIC(20, 8)` is 16 bytes worst-case; storage cost is negligible.
- Wider than minimum (could be `NUMERIC(20, 3)` if we assumed the active set never grows beyond BHD's three decimals) but cheap insurance against the active set evolving.

**Alternatives considered.**

- *`Decimal(18, 4)`.* Tighter, and the four-decimal limit matches some accounting conventions, but rejects BHD's third decimal without app-level branching. Brittle.
- *Two columns: `amountUnits BigInt` + `amountScale Int`.* Adopts the `dinero.js` integer-minor-units model in the DB. Rejected because `NUMERIC` is exactly what Postgres ships for this purpose; reinventing it is premature.

---

## R19. Inherited (unchanged) decisions

These choices, established by features 001 / 002 / 003, are inherited without re-litigation:

| Topic | Source | Status |
|---|---|---|
| Auth.js v5 + Credentials provider; JWT-only sessions | feature 003 | inherited |
| Middleware gates `/dashboard/*`; `app/(shell)/layout.tsx` asserts a session for defense-in-depth | feature 003 | inherited |
| Zod at every boundary; `validateEnv` at startup | feature 003 | inherited |
| TypeScript strict; no `any` | constitution II | inherited |
| `lib/<feature>/` layout convention (`actions.ts`, `schemas.ts`, helpers) | feature 003 | inherited |
| Server-side `auth()`; no `SessionProvider` | feature 003 | inherited |
| shadcn primitives reused: `button`, `input`, `label`, `dropdown-menu`, `sheet`, `card`, `alert` | features 002+003 | inherited |
| `revalidatePath` after mutation; pessimistic UI | (new convention; this feature establishes it) | locked |
| `lib/accounts/queries.ts` is the only file calling `prisma.account.*` | (new convention; this feature establishes it) | locked |

The `Forward-looking data-scoping rule` documented in feature 003's `data-model.md` is now actually exercised by this feature.
