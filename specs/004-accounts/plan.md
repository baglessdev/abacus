# Implementation Plan: Accounts

**Branch**: `004-accounts` | **Date**: 2026-05-16 | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0 (multi-user from day one; data-scoping convention binding from feature 004 onward)

## Summary

This feature lands the first money-touching domain model in Abacus. It introduces the `Account` Prisma model (the first row to carry a `userId` FK and the first column to use `Decimal`), the `lib/money/` module (the canonical home for the `Money` wrapper around `Prisma.Decimal`, the bundled ISO 4217 active-list, the currency-aware validation rules, and the display formatter), the `lib/accounts/` module (server actions + Zod schemas + Prisma helpers that always inject `userId` from the session), and the real `/dashboard/accounts` UI: a server-rendered table with a "Show archived" toggle, a single `<AccountForm>` rendered inside a shadcn `Sheet` that supports three modes (`create`, `edit`, `edit-archived`), and a searchable currency combobox built on `cmdk` + Radix `Popover`. Archive is soft-only; the row is never hard-deleted. Cross-user reads collapse to a `not_found` envelope so "belongs to another user" is indistinguishable from "does not exist". The constitution-mandated unit tests for money correctness ship in this feature (Principle IV / FR-022); the constitution-mandated E2E (transactions + transfers) does NOT ship here — it belongs to feature 006.

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19, Node 20.x |
| **Framework** | Next.js 16 (App Router), Auth.js v5 (NextAuth), Prisma 7 |
| **Storage** | PostgreSQL 16 (docker-compose, local only) |
| **ORM driver** | `@prisma/adapter-pg` (already wired) |
| **Auth** | Auth.js Credentials + JWT-only sessions (from feature 003); `await auth()` at server-action boundary; no `userId` from request input ever |
| **Money** | `Prisma.Decimal` (`decimal.js` v10 under the hood), re-exported as `Money` from `lib/money/decimal.ts`; never `Float` or `Number` |
| **Currency allow-list** | Bundled `lib/money/currencies.ts` const, ~170 active ISO 4217 codes, each with `{ code, name, decimals, symbol }` |
| **UI primitives in use** | shadcn `button`, `input`, `label`, `card`, `alert`, `dropdown-menu`, `sheet` (already on file); **new this feature**: `command`, `popover`, `switch`, `alert-dialog`, `table`, `badge` |
| **New runtime deps** | `cmdk`, `@radix-ui/react-popover`, `@radix-ui/react-switch`, `@radix-ui/react-alert-dialog` |
| **Validation** | Zod at every server-action input boundary; `superRefine` for the cross-field starting-balance rule |
| **Testing** | Vitest (unit) — four money-suite files required by FR-022; Playwright (E2E) — one accounts flow (US1+US2 round-trip) |
| **Target platform** | Local dev only (no production deployment in scope) |
| **Performance** | Pessimistic UI; one Prisma roundtrip per mutation; list query is a single indexed read; sub-100ms perceived latency for every interaction |
| **Constraints** | No `db push` (FR-001); `userId` is the FK and the filter on every query (FR-002, FR-003); currency immutable post-create (FR-007); name-only editable while archived (FR-009a) |
| **Scale** | "A few dozen accounts" per user (spec assumption); no enforced upper bound (FR-024); the indexed list query stays fast well into the thousands if a future user ever needs it |

## Constitution Check

*Evaluated against `.specify/memory/constitution.md` v0.2.0. Re-evaluated after Phase 1 design (see end of doc).*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | YES | PASS | `Account.startingBalance` is `Decimal @db.Decimal(20, 8)` (Postgres `NUMERIC`); the `Money` wrapper from `lib/money/decimal.ts` is the only handle for monetary arithmetic; `lib/money/` is the boundary (FR-016); display formatting happens at the UI edge via `formatAmount` (FR-011); currency is stored on the row alongside the amount (FR-005). Atomic save: every mutation is a single Prisma statement; no partial states. Transfers do not exist in this feature — that's feature 006. |
| **II — Type safety end-to-end** | YES | PASS | Strict TS already enabled; no `any` introduced. Zod schemas at every server-action boundary. Prisma is the source of truth for the schema; the `AccountType` enum is generated from the Prisma enum. The `Money` type and `Currency` type both produce strict types downstream. (FR-021) |
| **III — Validate at boundaries, trust internally** | YES | PASS | `createAccount`, `updateAccount`, `archiveAccount`, `unarchiveAccount` each run `safeParse` before touching any helper. `listAccounts` takes a typed options object from in-process callers and trusts it (Principle III explicitly allows this for internal functions). Auth is checked once at the action boundary; no helper re-checks. (FR-014) |
| **IV — Test the money paths** | YES | PASS | Four unit-test files cover the constitution's money-correctness bar (Decimal abstraction, currency-aware decimal rule, per-type negative rule, per-currency display formatter). The constitution's E2E mandate for **transfers** belongs to feature 006, not this one; this feature ships a Playwright spec for the US1+US2 happy path (signup → create → edit → archive → unarchive) which exceeds the constitution's signup→login→logout bar already satisfied in feature 003. (FR-022, SC-010) |
| **V — Spec-driven development** | YES | PASS | Spec exists and is approved (0 open clarifications). Plan flows spec → plan → tasks per workflow. Single feature in flight (`004-accounts`); no parallel branches. |

**Conventions check.**

| Convention | Status | Note |
|---|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS | All new files land under these. New: `lib/money/`, `lib/accounts/`, `app/(shell)/dashboard/accounts/_components/`. |
| **Money helpers — all monetary operations go through `lib/money/`** | PASS | FR-016 binds this feature to the rule; the file layout (research.md R17) enforces it. No file outside `lib/money/` performs arithmetic on monetary amounts. |
| Migrations (no `db push`) | PASS | One generated migration: `db/migrations/<timestamp>_add_account/migration.sql`. FR-001. |
| Secrets (`.env.local` only) | PASS | No env vars added by this feature. |
| API response envelope `{ data } \| { error: { code, message } }` | PASS | All five server actions return this shape; `error.code` is one of five values (research.md R16, contracts/README.md). |
| Dates UTC | PASS | `createdAt`, `updatedAt`, `archivedAt` all stored as `DateTime` (UTC). Rendered in user timezone at the UI edge by the formatter. |
| CSV exports | N/A | Not in this feature. |
| **Data scoping — every domain row owned by `userId`; queries filter by session** | PASS | **First feature to exercise this rule.** `Account.userId` FK, `ON DELETE CASCADE`. Every query through `lib/accounts/queries.ts` takes `userId` as the first positional arg, supplied by the action from `session.user.id`. No action accepts `userId` from request input (FR-003, FR-013). |

**No violations.** No justification required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-accounts/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log (R1..R19)
├── data-model.md        # Phase 1 — Account model + indexes + scoping rule
├── quickstart.md        # Phase 1 — local-run delta over features 001/002/003
├── contracts/           # Phase 1 — one file per server action
│   ├── README.md
│   ├── createAccount.md
│   ├── updateAccount.md
│   ├── archiveAccount.md
│   ├── unarchiveAccount.md
│   └── listAccounts.md
├── spec.md              # Approved, 0 open clarifications
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

### Source code (after this feature)

```text
abacus/
├── app/
│   ├── (shell)/dashboard/accounts/
│   │   ├── page.tsx                       # MODIFIED — real list page, replaces placeholder
│   │   └── _components/
│   │       ├── accounts-list.tsx          # NEW — table + Show archived toggle + Add button
│   │       ├── account-form.tsx           # NEW — 3-mode form (create/edit/edit-archived)
│   │       ├── account-form-sheet.tsx     # NEW — Sheet wrapper owning open/close state
│   │       ├── currency-picker.tsx        # NEW — Command-in-Popover combobox
│   │       └── archive-confirm-dialog.tsx # NEW — AlertDialog wrapper around archive action
│   ├── (auth)/                            # unchanged
│   ├── (marketing)/                       # unchanged
│   ├── api/                               # unchanged
│   └── (shell)/{layout,error,loading}.tsx # unchanged
├── components/
│   ├── ui/
│   │   ├── command.tsx                    # NEW — shadcn primitive (cmdk + Radix Popover)
│   │   ├── popover.tsx                    # NEW — shadcn primitive (@radix-ui/react-popover)
│   │   ├── switch.tsx                     # NEW — shadcn primitive (@radix-ui/react-switch)
│   │   ├── alert-dialog.tsx               # NEW — shadcn primitive (@radix-ui/react-alert-dialog)
│   │   ├── table.tsx                      # NEW — shadcn primitive (pure markup)
│   │   ├── badge.tsx                      # NEW — shadcn primitive (pure markup)
│   │   └── …                              # existing primitives unchanged
│   ├── shell/                             # unchanged
│   └── marketing/                         # unchanged
├── lib/
│   ├── money/                             # NEW DIRECTORY (boundary per FR-016)
│   │   ├── decimal.ts                     # NEW — Money = Prisma.Decimal + arithmetic helpers
│   │   ├── currencies.ts                  # NEW — CURRENCIES, CURRENCY_CODES, getCurrency
│   │   ├── validate.ts                    # NEW — validateStartingBalance + allowsNegative
│   │   ├── format.ts                      # NEW — formatAmount(amount, currency)
│   │   └── index.ts                       # NEW — barrel
│   ├── accounts/                          # NEW DIRECTORY
│   │   ├── actions.ts                     # NEW — 5 server actions
│   │   ├── queries.ts                     # NEW — only file that touches prisma.account.*
│   │   ├── schemas.ts                     # NEW — Zod schemas per action
│   │   ├── serialize.ts                   # NEW — Prisma row → AccountDTO
│   │   ├── errors.ts                      # NEW — error code constants + messages
│   │   └── index.ts                       # NEW — barrel (server-only exports)
│   ├── auth/                              # unchanged
│   ├── env.ts                             # unchanged
│   ├── prisma.ts                          # unchanged
│   └── utils.ts                           # unchanged
├── db/
│   ├── schema.prisma                      # MODIFIED — adds Account + AccountType + User.accounts
│   └── migrations/
│       ├── 20260516153045_add_user/       # unchanged (feature 003)
│       └── <timestamp>_add_account/       # NEW
│           └── migration.sql              # NEW — generated by pnpm db:migrate
└── tests/
    ├── unit/
    │   ├── auth-password.test.ts          # unchanged
    │   ├── auth-schemas.test.ts           # unchanged
    │   ├── env.test.ts                    # unchanged
    │   ├── money-decimal.test.ts          # NEW — FR-022 / SC-010
    │   ├── money-currencies.test.ts       # NEW — FR-022 / SC-010
    │   ├── money-validate.test.ts         # NEW — FR-022 / SC-010
    │   └── money-format.test.ts           # NEW — FR-022 / SC-010
    └── e2e/
        ├── auth.spec.ts                   # unchanged
        ├── health.spec.ts                 # unchanged
        └── accounts.spec.ts               # NEW — US1+US2 round-trip
```

**Structure Decision:** the established `lib/<feature>/` convention from feature 003 is extended with one twist — `lib/money/` is a horizontal shared module (not a vertical feature), and `lib/accounts/` is the feature module. The shadcn primitives all land under `components/ui/` as usual. The accounts page-local components live under `app/(shell)/dashboard/accounts/_components/` (Next.js's `_`-prefixed directory excludes them from routing).

## Data Model Changes

The full reference lives in [`data-model.md`](./data-model.md). Summary here.

### Prisma schema diff

**Add:**

```prisma
model Account {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String      @db.VarChar(80)
  type            AccountType
  currency        String      @db.Char(3)
  startingBalance Decimal     @db.Decimal(20, 8)
  archivedAt      DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([userId])
  @@index([userId, archivedAt])
}

enum AccountType {
  CHECKING
  SAVINGS
  CREDIT
  CASH
  INVESTMENT
  OTHER
}
```

**Modify** (back-relation only — no SQL):

```prisma
model User {
  // … unchanged fields …
  accounts Account[]
}
```

### Migration

Generated via:

```bash
pnpm db:migrate -- --name add_account
```

Lands at:

```text
db/migrations/<timestamp>_add_account/migration.sql
```

The SQL creates (in order): the `AccountType` enum, the `Account` table, both indexes, and the FK constraint. No `db push` (FR-001).

### Indexes & constraints

- `@@index([userId])` — primary lookup path. Every read is by user.
- `@@index([userId, archivedAt])` — composite index for the default list query (`WHERE userId = ? AND archivedAt IS NULL`) and the "show archived" variant.
- Foreign key `Account.userId → User.id ON DELETE CASCADE`.
- No unique constraint on `name` (intentional; spec edge case).

### Decimal precision

`NUMERIC(20, 8)`. Wide enough for every active ISO 4217 currency (BHD is the largest at 3 decimals; we keep 8 for safety). 20 total digits covers ~1 trillion units at full precision — far beyond personal-finance reality. Discussion in research.md R18.

## API Surface

Five server actions in `lib/accounts/actions.ts`. Full per-action contracts in `contracts/`. Compressed table here.

| Action | Input | Success | Error codes | FRs |
|---|---|---|---|---|
| `createAccount` | `FormData` { name, type, currency, startingBalance } | `{ data: { account: AccountDTO } }` | `unauthenticated`, `validation_failed`, `internal_error` | FR-001..006, 014..016, 021 |
| `updateAccount` | `FormData` { id, name, [type, startingBalance] } | `{ data: { account: AccountDTO } }` | `unauthenticated`, `not_found`, `archived_field_locked`, `validation_failed`, `internal_error` | FR-002..004, 006, 007, 009a, 013..016, 021 |
| `archiveAccount` | `FormData` { id } | `{ data: { account: AccountDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-002, 003, 008, 013..015, 021 |
| `unarchiveAccount` | `FormData` { id } | `{ data: { account: AccountDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-002, 003, 008, 013..015, 021 |
| `listAccounts` | `{ includeArchived?: boolean }` | `{ data: { accounts: AccountDTO[] } }` | `unauthenticated`, `internal_error` | FR-002, 003, 009, 010, 012, 012a, 013..015, 021 |

### Error envelope

```ts
type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "archived_field_locked"; message: string; field: "type" | "startingBalance" }
  | { code: "internal_error"; message: string }
```

Catalog and rationale in research.md R16. "not yours" and "does not exist" both surface as `not_found` (FR-013, SC-008) — the collapse is structural, enforced by the `where: { id, userId }` query shape in `lib/accounts/queries.ts`.

### Shared DTO

```ts
type AccountDTO = {
  id: string
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT" | "CASH" | "INVESTMENT" | "OTHER"
  currency: string          // ISO 4217 alpha-3
  startingBalance: string   // canonical decimal string ("1250.00", "-500.00", "0")
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string         // ISO 8601 UTC
  updatedAt: string         // ISO 8601 UTC
}
```

Why `startingBalance` is a string: see research.md R2. `Decimal` is not POJO-serializable; the canonical string round-trips losslessly through the React Server Component boundary.

### No route handlers

No file under `app/api/*` is added or modified. The Auth.js catch-all at `app/api/auth/[...nextauth]/route.ts` is unchanged. Discussion of "why server actions, not REST" in research.md R6.

## UI Surface

### Page

| URL | File | Renders |
|---|---|---|
| `/dashboard/accounts` | `app/(shell)/dashboard/accounts/page.tsx` | Server component. Calls `auth()`, calls `listAccounts({ includeArchived: false })` to seed initial data, hydrates the client `<AccountsList>` with that data. |

The placeholder at this URL (which today renders an empty state via `components/shell/empty-state.tsx`) is replaced; the `EmptyState` primitive is still used inside the new page when the user has zero accounts (FR-010, US1).

### Client components

All under `app/(shell)/dashboard/accounts/_components/`:

| Component | Purpose | Key shadcn primitives |
|---|---|---|
| `AccountsList` | Owns the "Show archived" toggle and the table; receives `initialAccounts: AccountDTO[]` as a prop; re-fetches via the server action when the toggle flips | `Table`, `Switch`, `Badge`, `Button` |
| `AccountForm` | Renders the form in `create` / `edit` / `edit-archived` mode; bound to a server action via `useActionState`; preserves entered values across server rejects | `Input`, `Label`, `Button` |
| `AccountFormSheet` | The `Sheet` wrapper owning open/close state; chooses which mode the inner form renders | `Sheet`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetContent` |
| `CurrencyPicker` | The searchable combobox over ~170 ISO 4217 codes; props `{ value, onChange, disabled }`; disabled renders as a read-only `Input` (edit mode) | `Command`, `Popover`, `Button` |
| `ArchiveConfirmDialog` | The "Archive this account?" confirmation gating `archiveAccount`; props `{ accountId, accountName }` | `AlertDialog` |

The single `AccountForm` with `mode` switching keeps the diff against any of the three render shapes obvious. Discussion in research.md R10.

### Empty state

When `listAccounts` returns `{ data: { accounts: [] } }`, the page renders `<EmptyState>` (already on file at `components/shell/empty-state.tsx`) with:

- Icon: `Wallet` (already on file at the existing placeholder).
- Title: "No accounts yet".
- Description: short copy explaining what an account is.
- Action: `{ label: "Add your first account", onClick: openCreateSheet }`.

The empty state CTA opens the same `AccountFormSheet` in `"create"` mode (FR-010).

### Charts

None this feature (FR-023; Recharts lands with feature 015).

### Currency display

The `formatAmount(amount, currency)` helper from `lib/money/format.ts` is the only path through which a stored balance becomes a rendered string. Output examples (using the bundled symbols + `Intl.NumberFormat` with explicit `currency.decimals`):

| amount | currency | output |
|---|---|---|
| `"1250.00"` | `USD` | `$1,250.00` |
| `"800"` | `EUR` | `€800.00` |
| `"0"` | `JPY` | `¥0` |
| `"-500"` | `USD` | `-$500.00` |
| `"1.234"` | `BHD` | `د.ب 1.234` (or `BHD 1.234` fallback) |

The helper never rounds (FR-011); it pads to the currency's `decimals` count but does not truncate digits beyond it (the boundary validator already rejects over-precision input).

## File-Level Layout

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/money/decimal.ts` | Re-export `Prisma.Decimal` as `Money`; thin arithmetic wrappers (`plus`, `minus`, `cmp`, `isZero`, `isNegative`) for any in-`lib/money/` math. |
| `lib/money/currencies.ts` | `CURRENCIES: readonly Currency[]`, `CURRENCY_CODES: ReadonlySet<string>`, `getCurrency(code): Currency \| undefined`, `isCurrencyCode(code): code is string`. ~170 entries hardcoded. |
| `lib/money/validate.ts` | `allowsNegativeStartingBalance(type): boolean`; `validateStartingBalance({ type, currency, amount }): { ok: true } \| { ok: false; code; message }`. |
| `lib/money/format.ts` | `formatAmount(amount: string \| Money, currency: string): string`. Uses `Intl.NumberFormat` keyed by `currency.decimals`. |
| `lib/money/index.ts` | Barrel re-exporting `Money`, `Currency`, `CURRENCIES`, `getCurrency`, `isCurrencyCode`, `allowsNegativeStartingBalance`, `validateStartingBalance`, `formatAmount`, `AccountType`-bound `ACCOUNT_TYPES_ALLOWING_NEGATIVE`. |
| `lib/accounts/actions.ts` | The five server actions (`createAccount`, `updateAccount`, `archiveAccount`, `unarchiveAccount`, `listAccounts`). All `"use server"`. |
| `lib/accounts/queries.ts` | `listAccountsForUser`, `getAccountForUser`, `createAccountForUser`, `updateAccountForUser`, `setArchivedAtForUser`. **The only file that touches `prisma.account.*`.** First positional arg of every helper is `userId: string` (research.md R15). |
| `lib/accounts/schemas.ts` | Zod schemas: `createAccountSchema`, `updateActiveAccountSchema`, `updateArchivedAccountSchema`, `archiveAccountSchema`, `unarchiveAccountSchema`. |
| `lib/accounts/serialize.ts` | `serializeAccount(row: Account): AccountDTO`. Converts `Decimal` → string and `Date` → ISO string. |
| `lib/accounts/errors.ts` | Error code constants + canonical user-facing messages. |
| `lib/accounts/index.ts` | Server-only barrel re-exporting actions + types. |
| `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` | Client component: the table + "Show archived" `Switch` + "Add account" button. |
| `app/(shell)/dashboard/accounts/_components/account-form.tsx` | Client component: 3-mode form bound to server actions via `useActionState`. |
| `app/(shell)/dashboard/accounts/_components/account-form-sheet.tsx` | Client component: `Sheet` wrapper owning the open/close + mode-selection state. |
| `app/(shell)/dashboard/accounts/_components/currency-picker.tsx` | Client component: `Command` inside `Popover`, searchable, keyboard-accessible. |
| `app/(shell)/dashboard/accounts/_components/archive-confirm-dialog.tsx` | Client component: `AlertDialog` around the archive button. |
| `components/ui/command.tsx` | shadcn `Command` primitive (wraps `cmdk`). |
| `components/ui/popover.tsx` | shadcn `Popover` primitive (wraps `@radix-ui/react-popover`). |
| `components/ui/switch.tsx` | shadcn `Switch` primitive (wraps `@radix-ui/react-switch`). |
| `components/ui/alert-dialog.tsx` | shadcn `AlertDialog` primitive (wraps `@radix-ui/react-alert-dialog`). |
| `components/ui/table.tsx` | shadcn `Table` primitive (pure markup, no Radix). |
| `components/ui/badge.tsx` | shadcn `Badge` primitive (pure markup). |
| `tests/unit/money-decimal.test.ts` | Money-wrapper round-trip + arithmetic identities. |
| `tests/unit/money-currencies.test.ts` | Allow-list shape; obsolete-code rejection; case-sensitive lookup. |
| `tests/unit/money-validate.test.ts` | Currency-aware decimal-place rule; per-type negative-balance rule. |
| `tests/unit/money-format.test.ts` | Display formatter per currency family. |
| `tests/e2e/accounts.spec.ts` | US1+US2 round-trip: signup → empty state → create → edit → archive → toggle → unarchive. |
| `db/migrations/<timestamp>_add_account/migration.sql` | Generated migration. |

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `db/schema.prisma` | Add `model Account`, `enum AccountType`, and `User.accounts` back-relation. |
| `app/(shell)/dashboard/accounts/page.tsx` | Replace the current `<EmptyState>` placeholder with a server component that calls `auth()` + `listAccounts({ includeArchived: false })` and renders `<AccountsList initialAccounts={…} />` (or `<EmptyState>` if zero). |
| `package.json` | Add `cmdk`, `@radix-ui/react-popover`, `@radix-ui/react-switch`, `@radix-ui/react-alert-dialog` as runtime deps. |

### Files NOT touched

`lib/auth/*` (the auth surface is stable), `app/(auth)/*`, `app/(marketing)/*`, `middleware.ts`, `components/shell/*` (except via reuse of `EmptyState`), `app/api/*`, `next.config.*`. None of these need to know about Accounts.

## Money & Currency Notes

This is the feature where `lib/money/` and the Decimal column **enter the codebase**. Every constitution Principle I commitment is enforced here:

- `startingBalance` is `Decimal @db.Decimal(20, 8)` — Postgres `NUMERIC`. **Never** `Float` / `Number` anywhere in the data path.
- `currency` is stored alongside `startingBalance` on the same row (FR-005). No "implicit primary currency" lookup happens anywhere.
- Display formatting (`formatAmount`) happens only at the UI edge (`AccountsList` row rendering, `AccountForm` balance display). The stored `Decimal` is never rounded by the database, the helper, or business logic (FR-011).
- The currency-aware decimal-place rule (FR-006) is enforced at the Zod boundary via `validateStartingBalance`; obsolete or unknown codes are rejected by `isCurrencyCode`.
- The negative-balance rule (FR-006) is enforced at the same boundary by `allowsNegativeStartingBalance`. Single helper; two unit-test paths (allows / rejects).
- **FX conversion is OUT OF SCOPE** (FR-023). Multi-currency users see each balance in its own currency; no aggregated total widget (FR-012a). When feature 020 lands, it adds the aggregation surface — this feature's display contract is forward-compatible because every balance string is already accompanied by its currency code.
- **Transfers are OUT OF SCOPE** (FR-023). The constitution's atomicity rule for transfers binds feature 006, not this one.
- **No file outside `lib/money/` performs arithmetic on monetary amounts** (FR-016). The implementer will grep for `Decimal\.|new Decimal|.plus\(|.minus\(|.times\(|.div\(` paths and verify each lives under `lib/money/`. The barrel re-exports the high-level helpers (`formatAmount`, `validateStartingBalance`, etc.); callers consume those, not raw arithmetic.

## Auth & Validation Boundaries

### Auth required at

- Every server action in `lib/accounts/actions.ts` (`createAccount`, `updateAccount`, `archiveAccount`, `unarchiveAccount`, `listAccounts`). Enforced by `await auth()` at the top of each action body. On missing session → `unauthenticated` envelope.
- `/dashboard/accounts` route — already gated by `middleware.ts` from feature 003 (matcher includes `/dashboard/:path*`). The route's server component additionally calls `auth()` for defense-in-depth (via the surrounding `(shell)/layout.tsx`).

### Auth NOT required at

- N/A — this feature adds no public surface. The marketing page does not link to any per-account URL.

### Zod validation at

- `createAccount` server action — `createAccountSchema.safeParse({ name, type, currency, startingBalance })` before any helper call.
- `updateAccount` server action — branching `updateActiveAccountSchema` or `updateArchivedAccountSchema` based on the pre-fetched row's `archivedAt`. (See `contracts/updateAccount.md`.) The `currency` field is **never** part of either schema (FR-007 enforced by schema shape).
- `archiveAccount` / `unarchiveAccount` server actions — `archiveAccountSchema` / `unarchiveAccountSchema` (each just an `id` field) before any helper call.
- `listAccounts` — internal helper input; no Zod boundary (Principle III's "trust internally" applies because the input is a typed in-process options object, not a request body).

### Trust-internally rule

Once a Zod schema has validated input, downstream helpers (`createAccountForUser`, `updateAccountForUser`, `setArchivedAtForUser`, etc.) treat their inputs as typed and do **not** re-validate (Principle III, FR-014). This means: the helper does not check that `currency` is in the allow-list; it does not check that `name` is non-empty; it does not check that `startingBalance` has the right decimal count. All of those are upstream guarantees.

### Cross-user isolation pattern

The single most load-bearing rule in this feature, restated for emphasis:

1. `await auth()` at the action boundary.
2. `userId = session.user.id`.
3. Pass `userId` as the first positional arg to every `lib/accounts/queries.ts` helper.
4. Every Prisma `where:` clause for the `account` table includes `userId`.
5. **No code path** in the app passes a `userId` derived from request input to the helpers.

Cross-user `read`/`update`/`archive`/`unarchive` attempts collapse to a `not_found` envelope by structure (the `where: { id, userId }` returns `null` indistinguishably for both "doesn't exist" and "belongs to another user"). FR-013, SC-008.

## Testing Strategy

### Unit (Vitest) — required

Four new test files under `tests/unit/` cover the money-correctness paths (FR-022, SC-010 — the constitution Principle IV bar for this feature):

- `money-decimal.test.ts` — `Money` wraps `Prisma.Decimal`; round-trip from string with no precision loss; arithmetic identities (`a.plus("0").eq(a)`, `a.plus(b).eq(b.plus(a))`, etc.).
- `money-currencies.test.ts` — `CURRENCY_CODES` membership for canonical codes (USD, EUR, JPY, BHD, GBP); rejection of obsolete codes (DEM, FRF, XEU); case-sensitivity of `getCurrency` (uppercased input only).
- `money-validate.test.ts` — `validateStartingBalance` accepts `"0"` for every type; rejects `"-1"` on CHECKING/SAVINGS/CASH/INVESTMENT; accepts `"-1"` on CREDIT/OTHER; rejects `"1.234"` on USD; accepts `"1.234"` on BHD; rejects `"1.5"` on JPY; accepts `"1"` on JPY.
- `money-format.test.ts` — `formatAmount("1250.00", "USD")` → `$1,250.00`; `formatAmount("0", "JPY")` → `¥0`; `formatAmount("-500", "USD")` → `-$500.00`; thousands separator behavior; sign placement.

Each file is self-contained — no Prisma, no DB, no auth. Pure functions over pure data.

### E2E (Playwright) — required

One new spec: `tests/e2e/accounts.spec.ts`. Covers the US1+US2 round-trip:

1. `test.beforeAll` truncates `Account` then `User` (cascade isn't necessary, but order is correct).
2. **Empty state → create**. Sign up a fresh user, navigate to `/dashboard/accounts`, assert the empty state with "Add your first account" CTA. Click the CTA, fill the sheet (Chase Checking / CHECKING / USD / 1250.00), submit. Assert the empty state is replaced by a table with exactly one row.
3. **Reload persistence**. Reload the page; assert the row is still present (SC-002).
4. **Edit name**. Click the row, change the name, save. Assert the new name renders in the table.
5. **Currency is read-only in edit mode**. Open the edit sheet; assert the currency control has `aria-disabled="true"` (or equivalent) and the locked caption is rendered (FR-007, US3 scenario 3).
6. **Archive**. Open the edit sheet, click "Archive", confirm in the `AlertDialog`. Assert the row disappears from the default table.
7. **Show archived**. Flip the "Show archived" `Switch`. Assert the archived row reappears with the "Archived" badge.
8. **Archived-row field lock**. Open the archived row's edit sheet. Assert `type` and `startingBalance` are disabled; `name` is editable (FR-009a).
9. **Unarchive**. Click "Unarchive". Toggle "Show archived" off. Assert the row is visible in the active list.
10. **Multi-currency display**. (Optional within this same spec) Create a second account in EUR; assert both rows render with their respective currency codes/symbols and no aggregate total widget appears (SC-011, SC-015, FR-012a).
11. **Cross-user isolation**. Open a fresh context, sign up a second user, navigate to `/dashboard/accounts`. Assert the empty state — the first user's accounts are NOT visible (SC-003, SC-008).

### What can skip tests

- The currency-picker keyboard navigation is covered structurally by `cmdk`'s upstream tests and Radix's Popover; we do not add a Playwright spec asserting individual keypress traversal (the spec only requires the picker is keyboard-operable, which it is by construction).
- Visual styling of the "Archived" badge — covered by the rendering assertion, not a screenshot test.
- The `ArchiveConfirmDialog` cancel path (clicking "Cancel" does not archive) — implicitly covered by the "Archive" success path test; explicit negative-case test is optional.
- Per-currency `formatAmount` smoke for every one of the 170 codes — pointless; the unit suite covers each currency family (zero-decimal, two-decimal, three-decimal).

### Constitution coverage summary

- Principle IV money-paths unit suite: PASS (four new files; FR-022, SC-010).
- Principle IV signup→login→logout E2E: PASS (already covered by feature 003's `auth.spec.ts`).
- Principle IV transfer E2E: deferred to feature 006 (the feature that introduces transfers).

## Risks & Trade-offs

1. **Decimal serialization as string.** Returning monetary values as `string` over the RSC boundary is correct (research.md R2) but means client code that wants to do arithmetic on a `startingBalance` must `new Money(str)` first. **Decision: accept.** The alternative is shipping `Prisma.Decimal` instances over the boundary, which doesn't serialize, or shipping `number`, which breaks Principle I. The string form is the boring correct choice; the implementer adds a one-line `Money` wrap at the (few) call sites that need arithmetic.

2. **Currency allow-list maintenance.** Hardcoding ~170 codes in `lib/money/currencies.ts` means we ship a code release whenever ISO publishes a change. **Decision: accept.** ISO 4217's active set turns over slowly (a handful of changes per decade); shipping a release on that cadence is fine. The alternative is a runtime dep (`iso-4217`) for static data, which adds supply-chain surface for negligible value.

3. **`updateAccount` pre-fetches the row before parsing.** This is one extra DB read on the hot path of every save. **Decision: accept.** The branching schema (active vs. archived) needs to know which schema to apply, and the `superRefine` for the active schema needs the row's `currency` (which the request doesn't supply because currency is immutable). The extra read is sub-10ms on local Postgres; the alternative is to accept `currency` in the request and verify it matches, which contradicts FR-007's "the schema does not declare a currency field" stance.

4. **No `useOptimistic`.** All four mutations show a brief "submitting" state followed by a fresh server-rendered list. On slow networks (not a v1 concern in local dev) this could feel sluggish. **Decision: defer.** Optimistic UI has a real implementation cost (compensating actions on server-side reject, careful state reconciliation) and the spec's locked clarifications don't require it. Revisit in feature 006 where users actually do many ops in a row.

5. **`AccountType` is a Prisma enum, not a TS string union.** Adding a seventh value (e.g., `RETIREMENT`) requires a Prisma migration AND a TS recompile. **Decision: accept.** The closed-enum choice is locked by the spec (FR-002 implies a finite set; the spec lists six values). The migration cost on a future seventh value is a few minutes; the type-safety win is permanent.

## Constitution Compliance — Post-Design Re-Check

After completing Phase 0 (research) and Phase 1 (data model, contracts, quickstart), the design re-passes every applicable gate:

| Principle | Status | Why |
|---|---|---|
| **I — Money math** | PASS | `Decimal` column, `lib/money/` boundary, currency stored alongside amount, no rounding in business logic, atomic single-statement mutations. |
| **II — Type safety** | PASS | Strict TS; no `any`; Prisma is the data SoT; Zod schemas at every boundary; `AccountType` is a generated enum. |
| **III — Validate at boundaries** | PASS | Zod at each action's input; helpers trust their typed inputs; auth at the action boundary, not in helpers. |
| **IV — Test the money paths** | PASS | Four money-suite unit-test files; one E2E for US1+US2; the constitution's transfer E2E correctly belongs to feature 006. |
| **V — Spec-driven** | PASS | spec → plan → tasks order observed; single feature in flight. |

**Conventions** (after Phase 1 design): all five rows of the convention table still PASS — most importantly, the **data-scoping convention** is enforced by `lib/accounts/queries.ts` always taking `userId` as the first positional arg supplied from `session.user.id`, never from request input.

**No constitution violations identified. No Complexity Tracking entries required.**

## Phase 2 — Task Planning Approach

`/speckit-tasks` will generate `tasks.md` from this plan. Expected task structure (provided here as a guide; the actual task list is produced by `/speckit-tasks`):

1. **Setup / dependencies.** Add the four new runtime deps to `package.json`; install. Generate the six new shadcn primitives under `components/ui/`.
2. **Database.** Update `db/schema.prisma` (add `Account`, `AccountType`, `User.accounts`). Run `pnpm db:migrate -- --name add_account`. Commit the generated SQL.
3. **`lib/money/` — single big task or four sub-tasks.** Land `decimal.ts`, `currencies.ts`, `validate.ts`, `format.ts`, `index.ts` in that order. Each ships with its unit-test file.
4. **`lib/accounts/` — server-side surface.** Land `serialize.ts`, `errors.ts`, `schemas.ts`, `queries.ts`, `actions.ts`, `index.ts` in that order. Implementer should NOT skip ahead to UI before this layer is green.
5. **UI primitives.** Land `command.tsx`, `popover.tsx`, `switch.tsx`, `alert-dialog.tsx`, `table.tsx`, `badge.tsx` under `components/ui/`. (Order doesn't matter; they're independent.)
6. **Accounts page client components.** `currency-picker.tsx`, `account-form.tsx`, `account-form-sheet.tsx`, `archive-confirm-dialog.tsx`, `accounts-list.tsx`. Implement against the server actions from step 4.
7. **Accounts page.** Update `app/(shell)/dashboard/accounts/page.tsx` to wire the server-side `listAccounts` call to `<AccountsList initialAccounts={…} />` (or `<EmptyState>` if zero).
8. **E2E.** Land `tests/e2e/accounts.spec.ts` covering the US1+US2 round-trip + multi-currency assertion + cross-user isolation.
9. **Final lint / typecheck / format.** No `any`; no arithmetic-on-money outside `lib/money/`; constitution gates re-checked.

The implementer SHOULD execute these in order (later steps depend on earlier ones). The `lib/money/` task and the `components/ui/` primitives can in principle parallelize, but the implementer convention is one task at a time; this is just a scheduling note.

The `/speckit-tasks` output will expand each of these into atomic, individually-verifiable units with explicit "DONE" / "DONE_WITH_CONCERNS" criteria.

## Complexity Tracking

No constitution violations. No justification entries required.

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, all five contracts written, data model finalized, no open clarifications, no new env vars
File: /Users/rgederin/git/abacus/specs/004-accounts/plan.md
```
