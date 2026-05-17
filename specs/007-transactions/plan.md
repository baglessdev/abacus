# Implementation Plan: Transactions + Transfers

**Branch**: `007-transactions` | **Date**: 2026-05-17 | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0 (multi-user from day one; data-scoping convention binding from feature 004 onward).

## Summary

This feature lands the **third domain entity** in Abacus — `Transaction` — and is the **keystone money-correctness feature** of Tier 1. It is the first feature to: (a) add a `Decimal` column to a domain entity other than `Account`, (b) execute two-row atomic mutations via `prisma.$transaction(async (tx) => ...)` for both create (`createTransfer`) and update (`updateTransfer`), (c) cascade an archive operation atomically across two rows that share a soft pairing key (`transferGroupId`), (d) compute a derived monetary value at render time via a Prisma `aggregate` `SUM`. The constitution's Principle I leaves the spec stage and enters the runtime here; the money-reviewer subagent will audit the resulting PR.

It introduces the `Transaction` Prisma model (four indexes, three FKs with three different on-delete semantics — Cascade on userId, Restrict on accountId, Restrict on categoryId), the `TransactionType` enum (`INCOME | EXPENSE | TRANSFER`), three new helpers in `lib/money/` (`validateTransactionAmount` for the sign-must-match-type and decimals-must-match-currency rules; `sumAmounts` for in-process Decimal aggregation; the date helper `normalizeToUtcDay` lives in `lib/transactions/dates.ts` because dates are not money), the `lib/transactions/` module (seven server actions, queries-layer ownership of `prisma.transaction.*` with one documented exception — `lib/accounts/queries.ts` consumes `sumAmountsForAccountsBatch` for live balance computation), the new `<AccountPicker>` primitive at `components/accounts/account-picker.tsx`, and the real `/dashboard/transactions` UI (replacing the coming-soon placeholder): two distinct primary CTAs ("+ Add transaction" and "+ Add transfer") opening two structurally-different side sheets, URL-encoded date-range + account + category + type + archive-state filters, a "Load older" affordance, and the constitution-mandated Playwright E2E covering the "create transaction + transfer between accounts" path. The accounts-list page is updated to render computed balances (closing feature 004 FR-017's deferred promise). Soft-archive only; cross-user reads collapse to `not_found` envelopes by structure.

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19, Node 20.x — unchanged from feature 006 |
| **Framework** | Next.js 16 (App Router), Auth.js v5 (NextAuth), Prisma 7 — unchanged |
| **Storage** | PostgreSQL 16 (docker-compose, local only) — unchanged |
| **ORM driver** | `@prisma/adapter-pg` — unchanged |
| **Auth** | Auth.js Credentials + JWT-only sessions (from feature 003); `await auth()` at server-action boundary; `userId` from session, never request input |
| **Money** | `Prisma.Decimal` (`decimal.js` v10 under the hood), re-exported as `Money` from `lib/money/decimal.ts`. **This feature is where `lib/money/` becomes the working arithmetic surface** for the codebase. New helpers: `validateTransactionAmount`, `sumAmounts`. |
| **Currency allow-list** | Existing bundled `lib/money/currencies.ts` (from feature 004) — unchanged. |
| **Atomicity primitive** | `prisma.$transaction(async (tx) => { ... })` (interactive transactions). Two call sites for create + update of transfers; two more for archive + unarchive of transfer legs. Same pattern feature 006's signup-seed transaction uses (precedent in `lib/auth/actions.ts`). |
| **UI primitives in use** | All shadcn primitives from features 004 + 006 (`button`, `input`, `label`, `card`, `sheet`, `command`, `popover`, `switch`, `alert-dialog`, `table`, `badge`, `select`). **New this feature**: `calendar` (wraps `react-day-picker`) — for the date inputs in both forms and the date-range picker. |
| **New runtime deps** | `react-day-picker` (for the calendar primitive). The shadcn calendar registry already includes this; no other deps. |
| **Validation** | Zod at every server-action input boundary; `superRefine` (async) for cross-field rules that consult Prisma (account ownership, currency-must-match, category-kind-match, transfer-same-account, transfer-cross-currency). |
| **Testing** | Vitest (unit) — new suite covering transfer-pair invariant, balance computation, sign-must-match-type, currency-must-match-account, cross-currency-transfer rejection, zero-amount rejection, currency-aware decimal-places on transaction amounts, calendar-day normalization. Playwright (E2E) — the constitution-mandated `transactions.spec.ts` covering INCOME + EXPENSE + TRANSFER paths with atomicity assertion. |
| **Target platform** | Local dev only (no production deployment in scope). |
| **Performance** | Default 30-day window keeps row counts bounded; one Prisma round-trip for the list, one for the per-account balance `groupBy` aggregation; sub-100ms perceived latency on every interaction. |
| **Constraints** | No `db push` (FR-001); `userId` is the FK and the filter on every query (FR-002, FR-003); `transferGroupId` server-generated (FR-012); transfers atomic (FR-014, FR-016, FR-018); same-currency transfers only in v1 (FR-015); signed amounts (clarification); calendar-day-only dates (clarification); soft archive only (clarification). |
| **Scale** | "Several thousand transactions per user" per the spec edge case; no enforced hard limit. The 30-day default window keeps the hot path fast; "Load older" extends. |

## Constitution Check

*Evaluated against `.specify/memory/constitution.md` v0.2.0. Re-evaluated after Phase 1 design (see end of doc).*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | YES | PASS | `Transaction.amount` is `Decimal @db.Decimal(20, 8)` (Postgres `NUMERIC`). `Transaction.currency` is stored alongside the amount on every row (FR-007). **Transfers are atomic via `prisma.$transaction`** on create (FR-014), update (FR-016), and archive/unarchive cascade (FR-018). No rounding in business logic (only `formatAmount` at the UI edge rounds for display). All monetary writes go through `lib/money/` helpers (`validateTransactionAmount`, `sumAmounts`, Money arithmetic primitives). **This is the MOST stringent application of Principle I to date.** |
| **II — Type safety end-to-end** | YES | PASS | Strict TS; no `any`. Zod schemas at every server-action input boundary. `TransactionType` is a generated Prisma enum. The signed `Money` (`Prisma.Decimal`) type is the only handle for monetary values; no `number` arithmetic anywhere in the data path. |
| **III — Validate at boundaries, trust internally** | YES | PASS | All seven actions `safeParseAsync` before any helper call. Async `superRefine` consults Prisma for cross-field rules (account ownership + non-archived, category ownership + kind-match, currency-must-match, transfer-same-account, transfer-cross-currency, sign-must-match-type via `validateTransactionAmount`). Internal helpers in `queries.ts` trust their typed inputs. Auth checked at action boundary only. `listTransactions` takes a typed in-process options object — no Zod boundary inside, but the page-level server component validates the URL `searchParams` via `listTransactionsFiltersSchema` (Principle III's "trust internally for in-process objects" rule). |
| **IV — Test the money paths** | YES | PASS | **The constitution-mandated transfer E2E lands here** (FR-033, SC-009). New unit suite covers: transfer-pair invariant (both legs created atomically + share `transferGroupId` + share currency / date / userId + are inverses in amount); balance computation correctness; sign-must-match-type enforcement; currency-must-match-account enforcement; cross-currency-transfer rejection; zero-amount rejection; currency-aware decimal-places for transaction amounts; calendar-day normalization. Existing 134 unit + 30 e2e tests preserved (SC-016). |
| **V — Spec-driven development** | YES | PASS | Spec exists, approved, **0 open clarifications** (resolved in the 2026-05-17 session: signed amounts, calendar-day-only dates, soft archive). Plan flows spec → plan → tasks. Single feature in flight (`007-transactions`); no parallel branches. |

**Conventions check.**

| Convention | Status | Note |
|---|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS | All new files land under these. New: `lib/transactions/`, `app/(shell)/dashboard/transactions/_components/`, `components/accounts/account-picker.tsx`. |
| **Money helpers — all monetary operations go through `lib/money/`** | PASS | FR-028 binds this feature. The audit grep `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/transactions/ lib/accounts/` returns only call sites that consume `lib/money/` helpers; no raw arithmetic. The `sumAmountsForAccount(s)Batch` helpers in `lib/transactions/queries.ts` use Prisma's `aggregate` `_sum` (Postgres-side arithmetic on Decimal) — not JavaScript Decimal math — and wrap the result with `new Money(...)` exclusively from `lib/money/decimal.ts`. |
| Migrations (no `db push`) | PASS | One generated migration: `db/migrations/<timestamp>_add_transaction/migration.sql`. FR-001. |
| Secrets (`.env.local` only) | PASS | No new env vars. |
| API response envelope `{ data } \| { error: { code, message } }` | PASS | All seven server actions return this shape; ten error codes documented in `contracts/README.md` and `lib/transactions/errors.ts`. |
| Dates UTC | PASS | `createdAt`, `updatedAt`, `archivedAt` stored UTC. `date` column is `@db.Date` (Postgres `DATE`, no time component); the boundary normalizes user input to UTC midnight via `normalizeToUtcDay` (research.md R8). |
| CSV exports | N/A | Not in this feature. Feature 014 (CSV export) defers. |
| **Data scoping — every domain row owned by `userId`; queries filter by session** | PASS | **Third feature to exercise this rule.** `Transaction.userId` FK with `ON DELETE CASCADE`. Every helper in `lib/transactions/queries.ts` takes `userId` as the first positional arg, supplied from `session.user.id`, never from request input (FR-003, FR-013). **One documented exception** to the "prisma.X.* lives only in lib/X/queries.ts" rule: `lib/accounts/queries.ts` imports `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts` for live balance computation. The cross-module call site does NOT touch `prisma.transaction.*` directly; it consumes a function. Documented in research.md R6. |

**No violations.** No justification required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-transactions/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log (R1..R26)
├── data-model.md        # Phase 1 — Transaction model + four indexes + FK rules + back-relations
├── quickstart.md        # Phase 1 — local-run walkthrough + money-correctness verification checklist
├── contracts/           # Phase 1 — one file per server action
│   ├── README.md
│   ├── createTransaction.md
│   ├── createTransfer.md
│   ├── updateTransaction.md
│   ├── updateTransfer.md
│   ├── archiveTransaction.md
│   ├── unarchiveTransaction.md
│   └── listTransactions.md
├── spec.md              # Approved, 0 open clarifications
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

### Source code (after this feature)

```text
abacus/
├── app/
│   ├── (shell)/dashboard/transactions/
│   │   ├── page.tsx                              # MODIFIED — replaces coming-soon placeholder
│   │   └── _components/
│   │       ├── transactions-list.tsx             # NEW — list + filters + Load older + paired-leg rendering
│   │       ├── transaction-form.tsx              # NEW — INCOME / EXPENSE form
│   │       ├── transaction-form-sheet.tsx        # NEW — Sheet wrapper for transaction form
│   │       ├── transfer-form.tsx                 # NEW — TRANSFER form (distinct shape)
│   │       ├── transfer-form-sheet.tsx           # NEW — Sheet wrapper for transfer form
│   │       ├── transaction-filters.tsx           # NEW — date range + account + category + type + show archived
│   │       ├── date-range-picker.tsx             # NEW — wraps Calendar primitive in Popover
│   │       └── archive-confirm-dialog.tsx        # NEW — AlertDialog (covers both single + transfer-pair archives)
│   ├── (shell)/dashboard/accounts/
│   │   ├── page.tsx                              # unchanged
│   │   └── _components/
│   │       └── accounts-list.tsx                 # MODIFIED — renders computed balance (closes feature 004 FR-017)
│   ├── (auth)/                                   # unchanged
│   ├── (marketing)/                              # unchanged
│   └── api/                                      # unchanged
├── components/
│   ├── accounts/
│   │   └── account-picker.tsx                    # NEW — reusable Account picker (Command in Popover)
│   ├── categories/
│   │   └── category-picker.tsx                   # unchanged — consumed by transaction-form
│   ├── money/
│   │   └── money.tsx                             # unchanged — consumed in list + forms + accounts list
│   ├── shell/                                    # unchanged
│   └── ui/
│       └── calendar.tsx                          # NEW — shadcn Calendar primitive (wraps react-day-picker)
├── lib/
│   ├── transactions/                             # NEW DIRECTORY
│   │   ├── actions.ts                            # NEW — 7 server actions
│   │   ├── queries.ts                            # NEW — only file that touches prisma.transaction.*
│   │   │                                         #       ALSO exports sumAmountsForAccount(sBatch) consumed by lib/accounts/queries.ts
│   │   ├── schemas.ts                            # NEW — Zod schemas (async with superRefine on Prisma)
│   │   ├── serialize.ts                          # NEW — Prisma row → TransactionDTO
│   │   ├── errors.ts                             # NEW — error code constants + canonical messages + custom errors
│   │   ├── dates.ts                              # NEW — normalizeToUtcDay, startOfUtcDay helpers
│   │   └── index.ts                              # NEW — server-only barrel
│   ├── money/                                    # MODIFIED — extends, does not replace
│   │   ├── decimal.ts                            # MODIFIED — adds sumAmounts(amounts: readonly Money[]): Money
│   │   ├── validate.ts                           # MODIFIED — adds validateTransactionAmount({type, amount, currency})
│   │   ├── index.ts                              # MODIFIED — re-exports the new symbols
│   │   └── …                                     # currencies.ts, format.ts unchanged
│   ├── accounts/
│   │   ├── queries.ts                            # MODIFIED — calls sumAmountsForAccountsBatch for live balances
│   │   ├── serialize.ts                          # MODIFIED — AccountDTO gains optional `balance: string` field
│   │   └── …                                     # actions.ts, schemas.ts, errors.ts, index.ts unchanged
│   ├── auth/                                     # unchanged
│   ├── env.ts                                    # unchanged
│   └── prisma.ts                                 # unchanged
├── db/
│   ├── schema.prisma                             # MODIFIED — adds Transaction + TransactionType + back-relations on User, Account, Category
│   └── migrations/
│       ├── …                                     # unchanged (User, Account, Category)
│       └── <timestamp>_add_transaction/          # NEW
│           └── migration.sql                     # NEW — generated by pnpm db:migrate
└── tests/
    ├── unit/
    │   ├── …                                     # unchanged (auth, money — must keep passing)
    │   ├── money-validate.test.ts                # MODIFIED — extended with validateTransactionAmount cases
    │   ├── money-decimal.test.ts                 # MODIFIED — extended with sumAmounts cases
    │   ├── transactions-dates.test.ts            # NEW — normalizeToUtcDay roundtrip + edge cases
    │   ├── transactions-schemas.test.ts          # NEW — sign-must-match-type, currency-must-match, transfer-same-account, transfer-cross-currency
    │   ├── transactions-queries.test.ts          # NEW — transfer-pair invariant + balance computation + atomicity
    │   └── transactions-serialize.test.ts        # NEW — Decimal → string + Date → ISO conversions
    └── e2e/
        ├── …                                     # unchanged (auth, health, accounts, categories — must keep passing)
        └── transactions.spec.ts                  # NEW — constitution-mandated (FR-033, SC-009)
```

**Structure Decision.** The established `lib/<feature>/` module pattern is duplicated for `lib/transactions/`. The reusable `<AccountPicker>` lives at `components/accounts/account-picker.tsx` (outside the route-bound `_components/`) so future features (008 Budgets, 015 Charts, 016 Reports) can import it without reaching into a routed directory. The `lib/transactions/dates.ts` helper lives in the transactions module rather than `lib/money/` because dates are not money — `lib/money/` stays focused on Decimal arithmetic and currency.

The single cross-module dependency: `lib/accounts/queries.ts` imports `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts` to compute live balances. This is the one documented exception to the "queries.ts files don't import each other" pattern features 004 and 006 set — the function call is the cleanest way to keep the data-scoping convention intact (the prisma.transaction.* surface stays in one file) while still allowing `lib/accounts/` to render computed balances.

## Data Model Changes

The full reference lives in [`data-model.md`](./data-model.md). Summary here.

### Prisma schema diff

**Add:**

```prisma
model Transaction {
  id              String          @id @default(cuid())
  userId          String
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId       String
  account         Account         @relation(fields: [accountId], references: [id], onDelete: Restrict)
  categoryId      String?
  category        Category?       @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  date            DateTime        @db.Date
  amount          Decimal         @db.Decimal(20, 8)
  currency        String          @db.Char(3)
  type            TransactionType
  payee           String?         @db.VarChar(120)
  notes           String?         @db.VarChar(500)
  transferGroupId String?
  archivedAt      DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([userId, date])
  @@index([userId, accountId, date])
  @@index([userId, categoryId])
  @@index([userId, transferGroupId])
}

enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
}
```

**Modify** (back-relations only — no SQL):

```prisma
model User {
  // … unchanged …
  accounts     Account[]
  categories   Category[]
  transactions Transaction[]  // NEW
}

model Account {
  // … unchanged …
  transactions Transaction[]  // NEW
}

model Category {
  // … unchanged …
  transactions Transaction[]  // NEW
}
```

### Migration

```bash
pnpm db:migrate -- --name add_transaction
```

Lands at `db/migrations/<timestamp>_add_transaction/migration.sql`. Creates (in order): the `TransactionType` enum, the `Transaction` table, four indexes, three FK constraints (Cascade on userId, Restrict on accountId, Restrict on categoryId). No `db push`.

**Migration data hazard.** None — existing `main` has zero transactions; the migration is purely additive. Documented in `research.md` R24.

### Indexes & constraints

- `@@index([userId, date])` — supports the default list query: `WHERE userId = ? AND date BETWEEN ? AND ? ORDER BY date DESC`.
- `@@index([userId, accountId, date])` — supports the per-account view AND the balance-computation aggregate `WHERE userId = ? AND accountId = ? AND archivedAt IS NULL`.
- `@@index([userId, categoryId])` — supports the category-filter list shape AND feature 008 / 015 / 016 aggregation queries.
- `@@index([userId, transferGroupId])` — supports the transfer-pair reconciliation lookup (fetch both legs by shared id on edit / archive / unarchive).
- Foreign-key constraints:
  - `Transaction.userId → User.id`, `ON DELETE CASCADE` (data-scoping convention).
  - `Transaction.accountId → Account.id`, `ON DELETE RESTRICT` (an account with transactions is not hard-deletable; feature 004 UI already prevents hard-delete).
  - `Transaction.categoryId → Category.id`, `ON DELETE RESTRICT` (same reasoning; feature 005 UI prevents hard-delete).
- No unique constraint on `(userId, accountId, date, amount)` — duplicate transactions are legitimate (two coffees in one day).

### Decimal precision

`NUMERIC(20, 8)`. Same precision/scale as `Account.startingBalance` from feature 004; the boundary validator already enforces currency-aware decimal-place limits (FR-009).

## API Surface

Seven server actions in `lib/transactions/actions.ts`. Full per-action contracts in `contracts/`. Compressed table here.

| Action | Input | Success | Error codes | FRs |
|---|---|---|---|---|
| `createTransaction` | `FormData` { accountId, categoryId?, date, amount, type, payee?, notes? } | `{ data: { transaction: TransactionDTO } }` | `unauthenticated`, `validation_failed`, `internal_error` | FR-001..011, 013, 027..028, 031 |
| `createTransfer` | `FormData` { fromAccountId, toAccountId, date, amount, notes? } | `{ data: { transfer: TransferPairDTO } }` | `unauthenticated`, `validation_failed`, `transfer_same_account`, `transfer_cross_currency`, `archived_account_blocked`, `internal_error` | FR-001..008, 010..015, 022, 024, 027..028, 031 |
| `updateTransaction` | `FormData` { id, accountId, categoryId?, date, amount, type, payee?, notes? } | `{ data: { transaction: TransactionDTO } }` | `unauthenticated`, `not_found`, `transfer_leg_isolated`, `validation_failed`, `currency_mismatch`, `internal_error` | FR-001..011, 013, 016, 024, 027..028, 031 |
| `updateTransfer` | `FormData` { id, fromAccountId, toAccountId, date, amount, notes? } | `{ data: { transfer: TransferPairDTO } }` | `unauthenticated`, `not_found`, `validation_failed`, `transfer_same_account`, `transfer_cross_currency`, `currency_mismatch`, `archived_account_blocked`, `internal_error` | FR-001..008, 010, 012..016, 022, 024..025, 027..028, 031 |
| `archiveTransaction` | `FormData` { id } | `{ data: { transaction: TransactionDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-001..003, 013, 017..019, 019a, 024..025, 027..028 |
| `unarchiveTransaction` | `FormData` { id } | `{ data: { transaction: TransactionDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-001..003, 013, 017..019, 019a, 024..025, 027..028 |
| `listTransactions` | `{ dateFrom?, dateTo?, accountId?, categoryId?, type?, includeArchived? }` | `{ data: { transactions: TransactionDTO[]; hasOlderMatches: boolean } }` | `unauthenticated`, `internal_error` | FR-001..003, 013, 019, 019a, 020, 022, 026, 026a, 027..028, 031 |

### Error envelope

```ts
type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "currency_mismatch"; message: string; field: "currency" | "accountId" }
  | { code: "sign_mismatch"; message: string; field: "amount" }
  | { code: "transfer_cross_currency"; message: string; field: "toAccountId" }
  | { code: "transfer_same_account"; message: string; field: "toAccountId" }
  | { code: "transfer_leg_isolated"; message: string }
  | { code: "archived_account_blocked"; message: string; field: "accountId" | "fromAccountId" | "toAccountId" }
  | { code: "internal_error"; message: string }
```

Catalog and rationale in `research.md` R15. "not yours" and "does not exist" both surface as `not_found` (FR-013, SC-010) — enforced structurally by the `where: { id, userId }` query shape in `lib/transactions/queries.ts`.

### Shared DTO

```ts
type TransactionDTO = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  date: string                                  // ISO 8601 date-only ("2026-05-17")
  amount: string                                // canonical signed decimal string
  currency: string                              // ISO 4217 alpha-3, uppercase
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  payee: string | null
  notes: string | null
  transferGroupId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

type TransferPairDTO = {
  source: TransactionDTO       // amount < 0
  destination: TransactionDTO  // amount > 0
}
```

Why `amount` is a string: `Decimal` is not POJO-serializable (precedent: `AccountDTO.startingBalance` from feature 004). The canonical signed decimal string round-trips losslessly through the React Server Component boundary.

### Accounts DTO change

`AccountDTO` gains an optional `balance: string` field:

```ts
type AccountDTO = {
  id: string
  userId: string
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT" | "CASH" | "INVESTMENT" | "OTHER"
  currency: string
  startingBalance: string
  balance?: string                              // NEW — computed `startingBalance + Σ(transactions)`; absent when not requested
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

The `balance` field is populated only when the caller passes `{ includeBalance: true }` to `listAccounts(...)` (the accounts list page does; future page-by-page consumers may opt out). For zero transactions, `balance === startingBalance`; the existing feature-004 e2e assertion (`balance shows $1,250.00` for a brand-new account with `startingBalance = 1250.00`) continues to hold.

### No route handlers

No file under `app/api/*` is added or modified. Auth.js catch-all unchanged. Same "server actions, not REST" decision as features 004 + 006.

## UI Surface

### Page

| URL | File | Renders |
|---|---|---|
| `/dashboard/transactions` | `app/(shell)/dashboard/transactions/page.tsx` | Server component. Reads `searchParams` (`from`, `to`, `account`, `category`, `type`, `archived`); validates via `listTransactionsFiltersSchema`; calls `auth()`; calls `listTransactions(filters)`; in parallel calls `listAccounts({ includeArchived: false })` (for the account picker / filter) and `listCategories({ includeArchived: false })` (for the category filter); hydrates `<TransactionsList initial={...}>`. |

The placeholder at this URL is REPLACED (FR-018 / spec edge case "previously a coming-soon placeholder").

### Client components

All page-local under `app/(shell)/dashboard/transactions/_components/`:

| Component | Purpose | Key shadcn / primitives |
|---|---|---|
| `TransactionsList` | The full list view + filters + paired-row rendering for transfers + "Load older" affordance | `Table`, `Badge`, `Button`, plus the form sheets + the archive dialog as siblings |
| `TransactionForm` | INCOME / EXPENSE form bound via `useActionState` to `createTransaction` (create mode) or `updateTransaction` (edit mode) | `Input`, `Label`, `Button`, segmented control for type (radio group styled), `<AccountPicker>`, `<CategoryPicker>` (existing), `<DateRangePicker>` for the date field (single-date mode) |
| `TransactionFormSheet` | The `Sheet` wrapper owning open/close + mode-selection state for `<TransactionForm>` | `Sheet`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetContent` |
| `TransferForm` | TRANSFER form bound via `useActionState` to `createTransfer` (create mode) or `updateTransfer` (edit mode) | `Input`, `Label`, `Button`, two `<AccountPicker>` instances (the to-picker has `excludeIds: [fromAccountId]` AND `currency: fromAccount.currency` to prevent same-account-and-cross-currency at input time), `<DateRangePicker>` (single-date) |
| `TransferFormSheet` | Sheet wrapper for `<TransferForm>` | Same as transaction sheet |
| `TransactionFilters` | Date range + account + category + type + show-archived. State drives URL `searchParams` (Next.js `useRouter` + `useSearchParams`) | `<DateRangePicker>`, `<AccountPicker>` (`allowAll: true`), `<CategoryPicker>` (`allowNone: true`, sentinel `__uncategorized__`), shadcn `Select` for type, `Switch` for archive toggle |
| `DateRangePicker` | Wraps shadcn `Calendar` in `Popover`; supports both single-date (form fields) and range (filter) modes via a `mode` prop | `Calendar`, `Popover`, `Button` |
| `ArchiveConfirmDialog` | The "Archive this transaction / transfer?" confirmation. For TRANSFER targets, the title clarifies "Both legs will be archived together." | `AlertDialog` |

And the **new reusable** component — outside `_components/`:

| Component | Location | Purpose |
|---|---|---|
| `AccountPicker` | `components/accounts/account-picker.tsx` | Canonical reusable Account picker — `Command` in `Popover`, props `{ value, onChange, excludeIds?, includeArchived?, currency?, disabled?, allowAll?, placeholder?, ariaLabel? }`. Consumed in this feature's `TransactionForm`, `TransferForm`, `TransactionFilters`. Future-consumed by feature 008 (Budgets), feature 015 (Charts), feature 016 (Reports). |

### Empty state

- **No accounts state (FR-029)** — when `listAccounts(...)` returns zero rows. Renders `<EmptyState>` with title "Add an account first", description "Transactions are recorded against accounts. Set up your first account to start tracking money in and out.", action `{ label: "Add an account", href: "/dashboard/accounts" }`. The "+ Add transaction" and "+ Add transfer" CTAs are not rendered in this state.
- **No transactions state** — when `listAccounts(...)` returns at least one row AND `listTransactions(...)` returns zero rows. Renders `<EmptyState>` with title "No transactions yet", description "Record your first income, expense, or transfer to start tracking your money.", action `{ label: "Add your first transaction", onClick: openCreateSheet }`. The "+ Add transfer" CTA remains in the header.
- **No matches state** — when filters are applied and zero rows match. Renders an inline message in place of the table: "No transactions match the current filters. Reset filters or try a wider date range."

### Sidebar navigation

`/dashboard/transactions` is already in the TRACK group (feature 002). No change.

### Charts

None this feature (FR-034; Recharts is feature 015).

### Money display

Every monetary value (list row amount, edit-sheet read-only summary, accounts-list balance column) renders through `<Money>` from `components/money/money.tsx`. No new display primitive. The sign-aware color (`text-money-negative` for negative, `text-foreground` for positive, `text-muted-foreground` for zero) handles the EXPENSE-row visual treatment; the rendered string includes the sign character (e.g., `-$87.43`) so color is not the sole carrier of meaning (FR-030).

## File-Level Layout

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/transactions/dates.ts` | `normalizeToUtcDay(input: string \| Date): Date`, `startOfUtcDay(input: Date): Date`, `isISODateString(s: string): boolean`. Used by every server action that handles the `date` field and by `listTransactions` for default-range computation. |
| `lib/transactions/errors.ts` | Error code constants (`ERROR_CODES`), canonical messages, custom error classes (`CurrencyMismatchError`, `TransferAccountMismatchError`, `TransferCrossCurrencyError`, `TransferLegIsolatedError`, `ArchivedAccountBlockedError`), and the overload-typed `errorEnvelope` helper. Mirrors `lib/accounts/errors.ts` shape. |
| `lib/transactions/serialize.ts` | `serializeTransaction(row: Transaction): TransactionDTO`. Converts `Decimal` → canonical string, `Date` → ISO 8601 (date column to `YYYY-MM-DD`; timestamps to full ISO 8601 UTC). |
| `lib/transactions/schemas.ts` | Zod schemas. Three factory functions (`makeCreateTransactionSchema(userId)`, `makeUpdateTransactionSchema(userId, existingCurrency)`, `makeCreateTransferSchema(userId)`, `makeUpdateTransferSchema(userId, existingCurrency)`) for the cross-field rules that consult Prisma; two plain object schemas (`archiveTransactionSchema`, `unarchiveTransactionSchema`); one filter schema (`listTransactionsFiltersSchema`) consumed by the page-level `searchParams` parser. |
| `lib/transactions/queries.ts` | All `prisma.transaction.*` calls. Exports: `listTransactionsForUser`, `getTransactionForUser`, `getTransferLegsForUser`, `createTransactionForUser`, `createTransferForUser` (the `prisma.$transaction` callback site), `updateTransactionForUser`, `updateTransferForUser` (the `prisma.$transaction` callback site), `archiveSingleForUser`, `archiveTransferForUser` (the `prisma.$transaction` callback site), `unarchiveSingleForUser`, `unarchiveTransferForUser` (the `prisma.$transaction` callback site), `sumAmountsForAccount(userId, accountId): Promise<Money>`, `sumAmountsForAccountsBatch(userId, accountIds: readonly string[]): Promise<Map<string, Money>>`. **The only file that touches `prisma.transaction.*`** — except for the documented cross-module consumption of the two `sumAmounts*` helpers from `lib/accounts/queries.ts`. |
| `lib/transactions/actions.ts` | The seven server actions. All `"use server"`. Each follows the pattern: auth → safeParseAsync → action body (with `prisma.$transaction` wrap for transfer paths) → revalidatePath → serialize → return. |
| `lib/transactions/index.ts` | Server-only barrel re-exporting actions, types (`TransactionDTO`, `TransferPairDTO`, `ErrorEnvelope`, `ErrorCode`), and `TRANSACTION_TYPES` const. |
| `app/(shell)/dashboard/transactions/_components/transactions-list.tsx` | Client component: list + filters + Load older + paired-row rendering. |
| `app/(shell)/dashboard/transactions/_components/transaction-form.tsx` | Client component: INCOME/EXPENSE form. |
| `app/(shell)/dashboard/transactions/_components/transaction-form-sheet.tsx` | Sheet wrapper. |
| `app/(shell)/dashboard/transactions/_components/transfer-form.tsx` | Client component: TRANSFER form. |
| `app/(shell)/dashboard/transactions/_components/transfer-form-sheet.tsx` | Sheet wrapper. |
| `app/(shell)/dashboard/transactions/_components/transaction-filters.tsx` | Date range + account + category + type + archive toggle; updates URL `searchParams`. |
| `app/(shell)/dashboard/transactions/_components/date-range-picker.tsx` | `Calendar` in `Popover`, dual-mode (single date / range). |
| `app/(shell)/dashboard/transactions/_components/archive-confirm-dialog.tsx` | AlertDialog around archive action; transfer-aware copy. |
| `components/accounts/account-picker.tsx` | Reusable Account picker (FR-022). |
| `components/ui/calendar.tsx` | shadcn Calendar primitive wrapping `react-day-picker`. |
| `tests/unit/transactions-dates.test.ts` | `normalizeToUtcDay` roundtrip + edge cases (DST, leap-year, ISO string vs. Date input). |
| `tests/unit/transactions-schemas.test.ts` | Sign-must-match-type rejection, currency-must-match rejection, transfer-same-account, transfer-cross-currency, magnitude > 0, decimals match currency, payee / notes length. |
| `tests/unit/transactions-queries.test.ts` | Transfer-pair invariant (both legs share `transferGroupId`, currency, date, userId, are inverses); balance computation correctness; archived rows excluded from sum; cross-user collapse to null. (Uses a Prisma test client or a small in-memory mock per the existing `categories-queries.test.ts` pattern.) |
| `tests/unit/transactions-serialize.test.ts` | Decimal → canonical string, Date → ISO 8601, archived/transfer null handling. |
| `tests/e2e/transactions.spec.ts` | The constitution-mandated E2E (FR-033, SC-009). |
| `db/migrations/<timestamp>_add_transaction/migration.sql` | Generated migration. |

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `db/schema.prisma` | Add `model Transaction`, `enum TransactionType`, and the three back-relations on `User`, `Account`, `Category`. |
| `lib/money/decimal.ts` | Add `sumAmounts(amounts: readonly Money[]): Money` (a thin wrapper around `amounts.reduce((acc, a) => acc.plus(a), new Money(0))`). |
| `lib/money/validate.ts` | Add `validateTransactionAmount({ type, amount, currency })` returning the result-shape established by `validateStartingBalance`. Result codes: `not_a_number`, `too_many_decimals`, `zero_amount`, `sign_mismatch`. |
| `lib/money/index.ts` | Re-export the new symbols. |
| `lib/accounts/queries.ts` | Import `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts`. Extend `listAccountsForUser` to accept an `includeBalance: boolean` option; when true, run the batch and merge balances into each row before returning. |
| `lib/accounts/serialize.ts` | Add optional `balance: string` field to `AccountDTO`. When the row carries a computed balance (via the `includeBalance` flag in the query path), serialize it; otherwise omit. |
| `lib/accounts/actions.ts` | `listAccounts` accepts a new option `includeBalance?: boolean` (default false to preserve existing call sites). When true, propagates to the helper. |
| `app/(shell)/dashboard/accounts/page.tsx` | Pass `{ includeArchived: false, includeBalance: true }` to `listAccounts` so the accounts list renders live balances. |
| `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` | The balance column renders `account.balance ?? account.startingBalance` (the `??` preserves existing behavior in tests / call sites that don't pass `includeBalance: true`). |
| `app/(shell)/dashboard/transactions/page.tsx` | REPLACES the existing coming-soon placeholder. Server component that reads `searchParams`, validates via `listTransactionsFiltersSchema`, calls `auth() + listTransactions + listAccounts + listCategories`, hydrates `<TransactionsList>`. |
| `tests/unit/money-validate.test.ts` | Extend with cases for `validateTransactionAmount` per FR-032 (sign-must-match-type, magnitude > 0, currency-aware decimals on transaction amounts). |
| `tests/unit/money-decimal.test.ts` | Extend with cases for `sumAmounts` (empty array, single-element, multi-element, mixed-sign, large-magnitude). |
| `package.json` | Add `react-day-picker` as a runtime dep (if not already present via the shadcn registry). |

### Files NOT touched

`lib/auth/*` (auth surface stable), `lib/categories/*` (categories module unchanged), `app/(auth)/*`, `app/(marketing)/*`, `middleware.ts`, `app/api/*`, `next.config.*`, `components/categories/*`, `components/money/*`, `components/shell/*`. None of these need to know about Transactions; the consumer surfaces consume the existing primitives unchanged.

## Money & Currency Notes

This is the feature where the `lib/money/` boundary **becomes the working arithmetic surface** of the codebase. Every constitution Principle I commitment is enforced here, at its full sharpness:

- **`Transaction.amount` is `Decimal @db.Decimal(20, 8)`** — Postgres `NUMERIC`. **Never** `Float` / `Number` anywhere in the data path. The schema, the queries layer, the boundary, the serializer all carry `Decimal` (typed as `Money` from `lib/money/decimal.ts`); only at the UI edge does `formatAmount` convert to a display string.
- **`Transaction.currency` is stored alongside `Transaction.amount` on the same row** (FR-007). Denormalized from the parent account; the equality invariant is enforced at the Zod boundary. The denormalization is intentional — every `<Money>` element in the list renders without joining `Account`. The denormalization is also forward-compatible with feature 020 (cross-currency transfers, where the two legs of one transfer will carry different currencies).
- **Display formatting (`formatAmount`)** happens only at the UI edge via `<Money>`. The stored `Decimal` is never rounded by the database, the helpers, or business logic (FR-019a, FR-028).
- **Sign-must-match-type** is enforced at the Zod boundary via `validateTransactionAmount` (new in `lib/money/validate.ts`). Single helper; one canonical test path; clear error message for the user.
- **Currency-must-match-account** is enforced at the Zod boundary via async `superRefine` consulting `getAccountForUser`. The denormalized column on `Transaction` is set server-side from the account, not from the request; payloads that claim a different currency are rejected.
- **Same-currency-only transfers** (FR-015) — cross-currency transfers are out of scope in v1. The `createTransfer` and `updateTransfer` Zod schemas reject mismatched-currency pairs with `transfer_cross_currency`. Cross-currency lands in feature 020.
- **No file outside `lib/money/` performs arithmetic on monetary amounts** (FR-028). The audit grep `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/transactions/ lib/accounts/ app/` returns only call sites that consume `lib/money/` helpers (e.g., `new Money(parsed.amount)` to lift a string to a Decimal, or `magnitude.negated()` for the source-leg sign). The constitution-mandated unit suite verifies the sign convention and the transfer-pair invariant programmatically; the money-reviewer subagent runs the audit grep.
- **Transfer atomicity** — every TRANSFER mutation (create, update, archive cascade, unarchive cascade) runs inside `prisma.$transaction`. The grep `rg "prisma\.\$transaction" lib/transactions/` returns at minimum four matches (one per transfer mutation path). If a future maintainer drops a `$transaction` wrap by accident, the unit suite + the grep audit catch it.
- **Balance computation** — `account.balance = startingBalance + Σ(transaction.amount where archivedAt IS NULL)`. Centralized in `lib/transactions/queries.ts` via `sumAmountsForAccount` / `sumAmountsForAccountsBatch` (Prisma `aggregate` + `groupBy`). Consumed by `lib/accounts/queries.ts` for the accounts-list page. Closes feature 004 FR-017's deferred promise (the column was already wired; only the computation was missing).
- **Calendar-day-only dates** are enforced by both the `@db.Date` storage column AND the application-layer `normalizeToUtcDay` helper at the Zod boundary. Defense-in-depth.
- **FX conversion is OUT OF SCOPE** (FR-034). Multi-currency users see each balance in its own currency; aggregated net-worth across currencies lands with feature 020.

## Auth & Validation Boundaries

### Auth required at

- Every server action in `lib/transactions/actions.ts` (`createTransaction`, `createTransfer`, `updateTransaction`, `updateTransfer`, `archiveTransaction`, `unarchiveTransaction`, `listTransactions`). Enforced by `await auth()` at the top of each action body. On missing session → `unauthenticated` envelope.
- `/dashboard/transactions` route — already gated by `middleware.ts` from feature 003 (matcher includes `/dashboard/:path*`). The route's server component additionally calls `auth()` for defense-in-depth.

### Auth NOT required at

- N/A — this feature adds no public surface.

### Zod validation at

- `createTransaction` — `makeCreateTransactionSchema(userId).safeParseAsync({ ...formData })`. Async `superRefine` consults Prisma for account ownership + non-archived check, category ownership + kind-match check, and runs `validateTransactionAmount` for sign + decimals + magnitude.
- `createTransfer` — `makeCreateTransferSchema(userId).safeParseAsync({ ...formData })`. Async `superRefine` for: distinct accounts, both owned + non-archived, same currency, magnitude valid for the currency's decimals.
- `updateTransaction` — branches on the pre-fetched row's `type`: rejects with `transfer_leg_isolated` if `type === "TRANSFER"`; otherwise builds `makeUpdateTransactionSchema(userId, row.currency)` and `safeParseAsync`. Currency-must-match-existing for the new account.
- `updateTransfer` — pre-fetches the row, rejects with `not_found` if it's archived or not a TRANSFER, fetches both legs, then builds `makeUpdateTransferSchema(userId, row.currency)` and `safeParseAsync`.
- `archiveTransaction` / `unarchiveTransaction` — `archiveTransactionSchema.safeParse({ id })` / `unarchiveTransactionSchema.safeParse({ id })`. The action body branches on `row.type` AFTER schema parsing to choose single-leg vs. transfer-pair path.
- `listTransactions` — **NO Zod boundary inside the action.** The input is a typed `ListTransactionsFilters` object (typed in-process options, per Principle III's "trust internally for in-process objects"). The page-level server component validates the URL `searchParams` via `listTransactionsFiltersSchema` BEFORE calling this action; the action trusts its typed inputs.

### Trust-internally rule

Once a Zod schema has validated input, downstream helpers in `lib/transactions/queries.ts` (`createTransactionForUser`, `createTransferForUser`, `updateTransactionForUser`, `updateTransferForUser`, `archiveSingleForUser`, `archiveTransferForUser`, `unarchiveSingleForUser`, `unarchiveTransferForUser`, `sumAmountsForAccount(s)Batch`, `getTransactionForUser`, `getTransferLegsForUser`, `listTransactionsForUser`) treat their inputs as typed and do NOT re-validate (Principle III).

### Cross-user isolation pattern

Same five-step rule established by features 004 + 006, restated for this entity:

1. `await auth()` at the action boundary.
2. `userId = session.user.id`.
3. Pass `userId` as the first positional arg to every `lib/transactions/queries.ts` helper.
4. Every Prisma `where:` clause for the `transaction` table includes `userId`.
5. **No code path** in the app passes a `userId` derived from request input.

Cross-user reads / writes (including cross-user `accountId`, `categoryId`, `transferGroupId` references in payloads) collapse to `not_found` (for id targets) or to `validation_failed` with a field error (for referenced rows) — both structurally indistinguishable from "this doesn't exist." FR-013, SC-010, SC-011.

## Testing Strategy

### Unit (Vitest) — required (Principle IV)

New + extended test files under `tests/unit/`:

- **`tests/unit/money-validate.test.ts`** (extended) — adds cases for `validateTransactionAmount`:
  - `type=INCOME` with positive amount → ok.
  - `type=INCOME` with negative amount → `sign_mismatch`.
  - `type=EXPENSE` with negative amount → ok.
  - `type=EXPENSE` with positive amount → `sign_mismatch`.
  - `type=TRANSFER` with any non-zero amount → ok.
  - Any type with `amount = 0` → `zero_amount`.
  - Currency-aware decimals: `1.234` rejects on USD, accepts on BHD; `1.5` rejects on JPY, accepts on USD.
  - Non-numeric strings → `not_a_number`.
- **`tests/unit/money-decimal.test.ts`** (extended) — adds cases for `sumAmounts`:
  - Empty array → `Money(0)`.
  - Single-element array preserves precision.
  - Multi-element array sums correctly without rounding.
  - Mixed-sign array (positive + negative) sums to the correct signed result.
  - Large-magnitude precision (10-decimal values) preserved.
- **`tests/unit/transactions-dates.test.ts`** (new) — `normalizeToUtcDay`:
  - ISO date string input → midnight UTC of that calendar day.
  - Date object input → midnight UTC.
  - DST edge cases (March / November in US/Eastern) → still midnight UTC of the calendar day.
  - Leap-year February 29 → handled.
  - Invalid string → throws.
- **`tests/unit/transactions-schemas.test.ts`** (new) — boundary rules per FR-032:
  - `createTransactionSchema` rejects: missing accountId, missing date, blank amount, magnitude ≤ 0, sign-disagrees-with-type, currency-aware-decimals-too-many, payee > 120, notes > 500, type = TRANSFER, kind-mismatched categoryId.
  - `createTransferSchema` rejects: same-account, cross-currency, archived account, magnitude ≤ 0.
  - `updateTransactionSchema` rejects: currency-mismatched new account.
  - `updateTransferSchema` rejects: same-account, cross-currency, archived account.
  - Each test uses a tiny in-memory `getAccountForUser` / `getCategoryForUser` mock per the pattern `categories-schemas.test.ts` established in feature 006.
- **`tests/unit/transactions-queries.test.ts`** (new) — invariants per FR-032:
  - `createTransferForUser` produces exactly two rows sharing `transferGroupId`, same `currency`, same `date`, same `userId`, inverse `amount` (source negative, destination positive, equal magnitude).
  - `updateTransferForUser` keeps both legs' invariants intact across an edit.
  - `archiveTransferForUser` sets `archivedAt` on both legs in one transaction.
  - `unarchiveTransferForUser` clears `archivedAt` on both legs in one transaction.
  - `sumAmountsForAccount` returns the correct sum (positive INCOME + negative EXPENSE + signed TRANSFER legs), excludes archived rows.
  - `sumAmountsForAccountsBatch` produces correct per-account sums for multiple accounts in one round-trip.
  - Cross-user read returns null (a transaction owned by user A cannot be fetched as user B).
- **`tests/unit/transactions-serialize.test.ts`** (new) — DTO correctness:
  - `Decimal` → canonical string (`"3200.00"`, `"-87.43"`).
  - `Date` (date column) → `YYYY-MM-DD`.
  - `DateTime` (timestamps) → ISO 8601 UTC.
  - `archivedAt = null` → `null`.
  - `transferGroupId = null` → `null`; non-null → preserved.

Each file is self-contained where possible; the queries test uses a Prisma test client or an in-memory mock per the existing pattern.

### E2E (Playwright) — required (Principle IV — the constitution-mandated transfer E2E)

One new spec: `tests/e2e/transactions.spec.ts`. Covers:

1. `test.beforeAll` truncates `Transaction` then `Category` then `Account` then `User` in dependency order (or relies on FK cascade).
2. **Setup**. Sign up user A. Create two USD accounts: `Chase Checking` ($1,250.00 starting), `Savings` ($5,000.00 starting). Create one EUR account: `EuroSavings` (€100.00 starting). Verify the seeded 11 categories appear.
3. **No-accounts state (independent test)**. Sign up user B. Visit `/dashboard/transactions`. Assert the no-accounts empty state.
4. **Create EXPENSE**. User A: open Add transaction; type = EXPENSE, account = Chase Checking, category = Groceries (or any EXPENSE category), date = today, amount = `87.43`, payee = "Whole Foods". Submit. Assert the row appears with `-$87.43`. Navigate to `/dashboard/accounts`; assert Chase Checking shows `$1,162.57`.
5. **Create INCOME**. User A: open Add transaction; type = INCOME, account = Chase Checking, category = Salary, amount = `3200.00`, payee = "Acme Corp". Submit. Assert the row appears with `$3,200.00`. Navigate to Accounts; assert Chase Checking shows `$4,362.57`.
6. **Create TRANSFER**. User A: open Add transfer; From = Chase Checking, To = Savings, amount = `500.00`. Submit. Assert TWO rows appear in the list (or one paired row, per the rendering choice in plan-level FR-025): one with `-$500.00` on Chase Checking, one with `+$500.00` on Savings. Navigate to Accounts; assert Chase Checking = `$3,862.57`, Savings = `$5,500.00`. **Atomicity assertion (the constitution-mandated check)**: query the database directly (via a Playwright fixture that opens a Prisma client), assert exactly two TRANSFER rows for user A, sharing the same `transferGroupId`, same `userId`, same `currency`, same `date`, inverse `amount`.
7. **Edit TRANSFER**. User A: click on either leg. The transfer-edit sheet opens. Change amount to `600`. Submit. Assert both legs updated atomically; balance shifts accordingly.
8. **Archive TRANSFER**. User A: open the transfer-edit sheet, click Archive, confirm. Assert both legs disappear from the default list. Toggle Show archived; both reappear with the Archived badge. Database assertion: both rows' `archivedAt` is non-null and equal.
9. **Cross-currency rejection**. User A: open Add transfer; From = Chase Checking (USD), To = EuroSavings (EUR). Submit. Assert form rejection with the cross-currency error. Database assertion: zero new rows created.
10. **Same-account rejection**. User A: open Add transfer; From = Chase Checking, To = Chase Checking. Submit. Assert form rejection. Zero new rows.
11. **Cross-user isolation**. User B (signed up earlier with no accounts/transactions): navigate to `/dashboard/transactions`. Assert the empty state — none of user A's transactions are visible.
12. **Sign-mismatch rejection**. User A: open Add transaction; type = INCOME, amount = `-100` (manually typed negative). Assert form rejection.

The atomicity assertion in step 6 is the load-bearing part. Documented in the e2e file as the "constitution-mandated transfer atomicity check" with a comment referencing FR-033 and SC-009.

### What can skip tests

- Visual styling of the "Archived" badge — covered by the rendering assertion (presence of the text "Archived"), not a screenshot test.
- The `<DateRangePicker>` keyboard navigation — covered structurally by `react-day-picker` upstream tests + Radix's Popover; not re-asserted here.
- Every individual error code being reachable — the unit suite asserts the boundary rejections at the schema level; the e2e covers the load-bearing paths but doesn't enumerate every error code.
- The "Load older" affordance behavior on a dataset large enough to trigger it — out of scope for the e2e (the constitution-mandated coverage is the create + transfer paths, not the list-pagination affordance).

### Constitution coverage summary

- **Principle IV money-paths unit suite**: PASS — new files cover the transfer-pair invariant, balance computation, sign-must-match-type, currency-must-match, cross-currency rejection, zero-amount rejection, currency-aware decimal-places, calendar-day normalization (FR-032).
- **Principle IV signup→login→logout E2E**: PASS — `auth.spec.ts` unchanged; still green.
- **Principle IV transfer E2E**: PASS — **lands here** (FR-033, SC-009). The constitution-mandated test for "create transaction, transfer between accounts" with atomicity assertion.

### Existing tests preservation (SC-016)

The current 134 unit tests + 30 e2e tests on `main` MUST continue to pass. The notable touchpoint is `tests/e2e/accounts.spec.ts`: the test creates an account with `startingBalance = 1250.00` and asserts the balance column displays `$1,250.00`. After this feature, the balance column shows the **computed** balance (`startingBalance + Σ(transactions)`). For a brand-new account with zero transactions, this equals `startingBalance`, so the assertion holds without modification. Documented in `research.md` R25.

## Risks & Trade-offs

1. **Balance computation N+1 trap.** Each accounts-list row needs a Prisma `SUM(amount)` for its account. Naive implementation runs N queries for N accounts. **Mitigation:** `sumAmountsForAccountsBatch` runs a single `groupBy({ by: ["accountId"] })` for all the user's accounts in one round-trip. `lib/accounts/queries.ts` calls this once per page load. Documented in `research.md` R7; the unit suite covers it.

2. **Transfer atomicity edge cases on edit.** What if the user is editing a transfer and the from-account has been archived in the meantime (e.g., they had two tabs open)? The boundary check rejects with `archived_account_blocked`. What if the to-account has been deleted (not possible — accounts are archive-only, FK is RESTRICT)? What if the `transferGroupId` query returns ≠ 2 rows (impossible state, but defensive)? The action body throws `internal_error` to roll back. **Decision: accept** — the boundary check + defensive count guard handles every reachable case; the impossible-state case is logged and rolled back.

3. **`@db.Date` deserialization in Prisma 7.** Prisma's `@db.Date` column is well-trodden in Prisma 6.x but has had occasional timezone-offset quirks in past versions (returns `Date` object with non-midnight time component depending on driver). **Decision: accept** the `@db.Date` form with a documented fallback: if Prisma 7 surfaces a quirk during implementation, drop `@db.Date` and rely on application-layer `normalizeToUtcDay` only (no schema column change). The risk surface is small; the implementer verifies with a quick experiment in the schema task.

4. **Soft-archive cascade on transfer legs as a footgun.** Getting the cascade wrong breaks the two-leg invariant — a future maintainer could naively write "archive this row alone" without checking `type === "TRANSFER"`. **Mitigation:** the archive/unarchive logic is centralized in `lib/transactions/queries.ts` (the `archiveSingleForUser` vs. `archiveTransferForUser` split is internal to the queries module; the action layer just calls the correct helper based on the pre-fetched `row.type`). The unit suite asserts cascade correctness; the money-reviewer grep audit verifies `prisma.$transaction` wraps every transfer-touching write.

5. **Accounts-list test churn.** The existing `tests/e2e/accounts.spec.ts` creates an account with `startingBalance = 1250.00` and asserts `$1,250.00` in the balance column. After this feature, the column renders the computed balance — but for a brand-new account with zero transactions, the value is identical (`startingBalance + 0 = startingBalance`). **Decision: accept** — no test modification needed. If a future test exercises the live-balance path with transactions present, it will be added as part of this feature's E2E (not the existing accounts e2e). Documented in `research.md` R25.

6. **Cross-module helper coupling.** `lib/accounts/queries.ts` now imports from `lib/transactions/queries.ts` — the first cross-module `queries.ts` import in the codebase. **Decision: accept** — the alternative (duplicate `prisma.transaction.*` calls in `lib/accounts/queries.ts`) is worse (splits the data-scoping convention across two files). One cross-module function call is fine and documented. The coupling is one-directional; no circular-dep risk. Future features 008 + 015 + 016 will follow the same pattern (their `queries.ts` will consume helpers from `lib/transactions/queries.ts`, not touch `prisma.transaction.*`). Documented in `research.md` R6.

7. **Form complexity from two distinct CTAs.** Maintaining `<TransactionForm>` and `<TransferForm>` as two structurally-different components is more code than one polymorphic form. **Decision: accept** — the spec locks FR-021 (two CTAs), and the structurally-different field sets (one account vs. two; category present vs. absent; type selector present vs. absent) make a polymorphic form a worse abstraction. Two clean components are easier to maintain.

## Constitution Compliance — Post-Design Re-Check

After completing Phase 0 (research) and Phase 1 (data model, contracts, quickstart), the design re-passes every applicable gate:

| Principle | Status | Why |
|---|---|---|
| **I — Money math** | PASS | Decimal column, `lib/money/` boundary extended (NOT bypassed), currency stored alongside amount, atomic transfers in `prisma.$transaction` (four call sites), atomic two-leg archive cascade, no rounding in business logic, balance computation centralized. **Most stringent application of Principle I to date.** Money-reviewer audit invariants codified in research.md R26. |
| **II — Type safety** | PASS | Strict TS; no `any`; Prisma is the data SoT; Zod schemas at every server-action boundary; `TransactionType` is a generated enum. |
| **III — Validate at boundaries** | PASS | Async Zod with Prisma-consulting `superRefine` at each action's input; helpers in `queries.ts` trust their typed inputs; auth at the action boundary, not in helpers. `listTransactions`'s typed-in-process input is validated at the page-level boundary (URL `searchParams` → Zod → typed object). |
| **IV — Test the money paths** | PASS | New unit suite covers transfer-pair invariant + balance computation + sign-must-match-type + currency-must-match-account + cross-currency-transfer rejection + zero-amount rejection + currency-aware decimal-places + calendar-day normalization. The constitution-mandated transfer E2E ships here (`tests/e2e/transactions.spec.ts`, FR-033, SC-009). |
| **V — Spec-driven** | PASS | spec → plan → tasks order observed; single feature in flight; 0 open clarifications (resolved 2026-05-17). |

**Conventions** (after Phase 1 design): all five rows of the convention table still PASS — most importantly, the **data-scoping convention** is enforced by `lib/transactions/queries.ts` always taking `userId` as the first positional arg supplied from `session.user.id`, never from request input. This is the third feature (after Accounts and Categories) to exercise the rule on a fresh domain entity. One documented exception to the "queries.ts files don't import each other" pattern: `lib/accounts/queries.ts` imports `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts` for live balance computation — this is a function call, not a Prisma table access; the data-scoping rule (only `lib/transactions/queries.ts` touches `prisma.transaction.*`) is upheld.

**No constitution violations identified. No Complexity Tracking entries required.**

## Phase 2 — Task Planning Approach

`/speckit-tasks` will generate `tasks.md` from this plan. Expected task bundles (provided here as a guide; the actual atomized task list is produced by `/speckit-tasks` and will run ~50–60 items):

1. **Schema + migration.** Update `db/schema.prisma` (add `Transaction`, `TransactionType`, three back-relations). Run `pnpm db:migrate -- --name add_transaction`. Commit the generated SQL. Verify a fresh DB applies cleanly.
2. **`lib/money/` extensions.** Add `sumAmounts` to `decimal.ts`; add `validateTransactionAmount` to `validate.ts`; re-export from `index.ts`. Extend `tests/unit/money-decimal.test.ts` and `tests/unit/money-validate.test.ts` with the new cases. Each test slice ships with its source file.
3. **`lib/transactions/dates.ts`.** Add `normalizeToUtcDay`, `startOfUtcDay`, `isISODateString`. Ship `tests/unit/transactions-dates.test.ts`.
4. **`lib/transactions/` server surface.** Land in this order: `errors.ts`, `serialize.ts`, `schemas.ts`, `queries.ts`, `actions.ts`, `index.ts`. Each ships with its unit-test slice (`transactions-schemas.test.ts`, `transactions-queries.test.ts`, `transactions-serialize.test.ts`). The implementer SHOULD NOT skip ahead to UI before this layer is green.
5. **Update `lib/accounts/` to consume `sumAmountsForAccountsBatch`.** Extend `lib/accounts/queries.ts`, `lib/accounts/serialize.ts` (`AccountDTO.balance?`), `lib/accounts/actions.ts` (`listAccounts({ includeBalance })`). The existing accounts unit tests stay green.
6. **`<AccountPicker>` primitive.** Land `components/accounts/account-picker.tsx`. No new test slice — the picker is structurally identical to `<CategoryPicker>` and its consumers' tests cover it.
7. **New shadcn primitive — `calendar.tsx`.** Land `components/ui/calendar.tsx` wrapping `react-day-picker`. Add `react-day-picker` to `package.json` if not present.
8. **Page-local UI components.** Land `date-range-picker.tsx`, `transaction-form.tsx`, `transaction-form-sheet.tsx`, `transfer-form.tsx`, `transfer-form-sheet.tsx`, `archive-confirm-dialog.tsx`, `transaction-filters.tsx`, `transactions-list.tsx`. Implement against the server actions from step 4 and the pickers from step 6.
9. **Page wiring.** Replace `app/(shell)/dashboard/transactions/page.tsx` (the coming-soon placeholder). Read `searchParams`, validate via `listTransactionsFiltersSchema`, fetch initial data in parallel, hydrate `<TransactionsList>`.
10. **Accounts-list balance refactor.** Update `app/(shell)/dashboard/accounts/page.tsx` to pass `{ includeBalance: true }`. Update `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` to render `account.balance ?? account.startingBalance`. Verify the existing `tests/e2e/accounts.spec.ts` still passes (the `$1,250.00` assertion holds because `balance === startingBalance` for zero transactions).
11. **E2E.** Land `tests/e2e/transactions.spec.ts` covering the constitution-mandated path per FR-033 / SC-009.
12. **Final audits.** `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm test:e2e`. Run the money-reviewer grep audits:
    - `rg "prisma\.transaction\." lib/ app/` returns only `lib/transactions/queries.ts`.
    - `rg "prisma\.\$transaction" lib/transactions/` returns at minimum four matches (createTransfer, updateTransfer, archive cascade, unarchive cascade).
    - `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/transactions/ lib/accounts/` returns only `new Money(...)` lifts at boundary points (string → Decimal) and `.negated()` / `.plus()` calls on `Money` instances that originated from `lib/money/`.
    - `rg "toFixed|Math\.round|Math\.floor|Math\.ceil" lib/transactions/ lib/money/` matches only `lib/money/format.ts`.

The implementer SHOULD execute these in order (later steps depend on earlier ones). The `lib/money/` extensions and `lib/transactions/dates.ts` task can in principle parallelize with the schema task, but the implementer convention is one task at a time; this is just a scheduling note.

The `/speckit-tasks` output will expand each bundle into atomic, individually-verifiable units with explicit "DONE" / "DONE_WITH_CONCERNS" criteria.

## Complexity Tracking

No constitution violations. No justification entries required.

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, all seven action contracts written, data model finalized, no open clarifications, no new runtime deps (react-day-picker comes in via the shadcn registry's calendar primitive)
File: /Users/rgederin/git/abacus/specs/007-transactions/plan.md
```
