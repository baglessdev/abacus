# Implementation Plan: Budgets

**Branch**: `009-budgets` | **Date**: 2026-05-26 | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0 (multi-user from day one; data-scoping convention binding from feature 004 onward; money math + `lib/money/` boundary + `<Money>` single rendering primitive binding from feature 007; per-widget error-boundary + `prisma.transaction.*` confined to `lib/transactions/queries.ts` binding from feature 008).

## Summary

This feature lands the **fifth domain entity** in Abacus — `Budget` — and is the first feature to turn the app from a passive ledger ("here's what happened") into an active financial tool ("here's where you are vs. where you said you wanted to be"). It introduces the `Budget` Prisma model (with the `BudgetPeriod` enum: `MONTHLY` / `YEARLY`), the load-bearing **partial unique index** `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` (a uniqueness invariant beyond the per-user scope established by features 004 / 006 / 007), the new `lib/budgets/` module (mirroring `lib/categories/` and `lib/transactions/`), two new helpers added to `lib/transactions/queries.ts` (`getMostUsedExpenseCurrencyForUser` for the default-currency rule from Clarification Q2, and the batched per-budget-window aggregation helper for actuals), the real `/dashboard/budgets` CRUD UI (replacing the current placeholder), and a fourth dashboard widget (`<BudgetsWidget>`) wrapped in the existing `<WidgetErrorBoundary>` from feature 008.

The actuals computation **reuses feature 007's per-category-per-currency Prisma `groupBy` primitive** (the same primitive `sumIncomeExpenseByCurrencyForUser` is built on), batched into at most **two round-trips** — one for all MONTHLY-period windows, one for all YEARLY-period windows — regardless of how many budgets the user has. The arithmetic on actuals + remaining flows exclusively through `lib/money/` (`Money.plus(...)`, `Money.minus(...)`, `sumAmounts(...)`). The progress-ratio comparison (`actuals / amount >= 0.80` for "near"; `> 1.00` for "over") is done via **Decimal-precision-correct comparison** (`actuals.comparedTo(amount.times(0.80))`), never via float division — this is the most fragile spot and is documented end-to-end (R12).

The new `/dashboard/budgets` page is a server component composing a client `<BudgetsList>` (which owns the show-archived toggle + create/edit sheet state) and per-row server components rendering through `<Money>`. The 4 server actions (`createBudget`, `updateBudget`, `archiveBudget`, `unarchiveBudget`) follow the feature-006 / feature-007 envelope shape (`{ data } | { error: { code, message } }`) and live in `lib/budgets/actions.ts`. The new `<BudgetsWidget>` on `/dashboard` displays at most 5 budgets in priority order (over → near → under), wrapped in the existing `<WidgetErrorBoundary>` from feature 008 — the existing Net Worth, Cash Flow, and Recent Transactions widgets are unchanged (FR-036, SC-018).

This is **money-touch=true**; the money-reviewer subagent will audit the PR at merge time (SC-008). The audit greps codified in §Money & Currency Notes (and re-asserted in §Constitution Compliance Post-Design Re-Check) are the same ones feature 008 established, extended for the new `lib/budgets/` module and the new widget.

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19, Node 20.x — unchanged from feature 008 |
| **Framework** | Next.js 16 (App Router), Auth.js v5 (NextAuth), Prisma 7 — unchanged |
| **Storage** | PostgreSQL 16 (docker-compose, local only) — unchanged |
| **ORM driver** | `@prisma/adapter-pg` — unchanged |
| **Auth** | Auth.js Credentials + JWT-only sessions; `await auth()` at the `/dashboard/budgets` server component and inside every server action; `userId` from `session.user.id`, never request input (FR-022) |
| **Money** | `Prisma.Decimal` aliased as `Money` from `lib/money/decimal.ts`. **No new helpers required.** The existing `Money.plus(...)` / `Money.minus(...)` / `sumAmounts(...)` / `cmp(...)` and the existing Decimal-native `.times(...)` / `.comparedTo(...)` (exposed on `Money` instances) cover every operation. Status-threshold comparison (`actuals.comparedTo(amount.times(0.80))`) avoids float drift (R12). |
| **Currency allow-list** | Existing bundled `lib/money/currencies.ts` — unchanged. No FX, no implicit conversion. |
| **Atomicity primitive** | N/A — budgets are not transferable; each mutation touches at most one row. No `prisma.$transaction` needed in this feature. The uniqueness invariant is enforced by the schema-level partial unique index plus an app-level pre-check; concurrent races collapse to one success + one `budget_exists` envelope (R7). |
| **UI primitives in use** | All shadcn primitives already in the repo: `card`, `button`, `sheet`, `input`, `label`, `select`, `switch`, `alert-dialog`, `badge`, `popover`, `command`. **No new shadcn primitive.** The new `<ProgressBar>` is a small server component (~20 lines) wrapping a `<div>` with `aria-valuenow` / `aria-valuemax` (FR-031); no `shadcn/ui` progress primitive is added. |
| **New runtime deps** | **None.** `package.json` is untouched. Verified via `git diff main -- package.json` (Constraint #6). |
| **Validation** | Zod schemas at every server-action input boundary (`createBudgetSchema`, `updateBudgetSchema`, `archiveBudgetSchema`, `unarchiveBudgetSchema`). The category-kind check (EXPENSE-only) lives in three layers: UI picker filter + Zod `superRefine` consulting the category row + queries-layer re-fetch + reject (R6). |
| **Testing** | Vitest (unit) — six new suites: period boundaries, aggregations (8+ cases per SC-009), default-currency helper, schemas, queries (mocked prisma), serialize. Playwright (E2E) — one new spec covering US1 + US2 + US3 + US4 + US5 + SC-010 (the create-budget → record-expense → see-actuals-update flow). |
| **Target platform** | Local dev only (no production deployment in scope). |
| **Performance Goals** | `/dashboard/budgets` renders ≤ 2s on typical Postgres with N+1-mitigated actuals (≤ 2 round-trips total regardless of budget count). Dashboard widget reuses the same query; no additional round-trip beyond the existing 4 from feature 008's plan.md R11. |
| **Constraints** | Per-widget error boundary inherited from feature 008's `<WidgetErrorBoundary>` (FR-027); UTC-calendar-aligned periods (FR-009 + clarification Q1); no FX (FR-019, constitution Principle I); page-level loading inherited from existing `(shell)/loading.tsx` (FR-032); EXPENSE-only categories budgetable (FR-003 + clarification Q6); soft delete via `archivedAt` only (FR-008). |
| **Scale / Scope** | Per-user ≤ ~50 active budgets in v1 (no pagination introduced; per Assumptions). The two-query batched actuals fan-out is well within the indexed-query envelope. |

## Constitution Check

*Evaluated against `.specify/memory/constitution.md` v0.2.0. Re-evaluated after Phase 1 design (see end of doc).*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | YES | PASS | `Budget.amount` is `Decimal @db.Decimal(20, 8)`. `Budget.currency` is stored alongside the amount on every row (FR-001, FR-004). **Actuals arithmetic** flows through `Money.plus(...)` and `sumAmounts(...)` from `lib/money/decimal.ts` exclusively. **Remaining** = `amount.minus(actuals)` via `Money.minus(...)`. **Status thresholds** use `actuals.comparedTo(amount.times(0.80))` and `actuals.comparedTo(amount)` — Decimal-precision-correct comparisons, never float division (R12). The actuals aggregation itself happens **Postgres-side** via Prisma `groupBy._sum.amount` (same primitive as feature 008's `sumIncomeExpenseByCurrencyForUser`); the application lifts each `_sum.amount` Decimal to `Money` at the boundary. No `<Money>` is ever rendered without its currency code (FR-019). No implicit FX (FR-019). The money-reviewer subagent gate (SC-008) is met by construction; audit greps codified in §Money & Currency Notes. |
| **II — Type safety end-to-end** | YES | PASS | Strict TS; no `any`. New types (`BudgetDTO`, `BudgetWithActuals`, `BudgetPeriodWindow`) typed in `lib/budgets/serialize.ts` and `lib/budgets/queries.ts`. The new `BudgetPeriod` Prisma enum is generated as a TS literal union and re-exported from `lib/budgets/schemas.ts` for use in Zod. Every helper takes `userId: string` as the first positional arg. |
| **III — Validate at boundaries, trust internally** | YES | PASS | Each of the 4 server actions runs `safeParseAsync` (the create/update schemas have async `superRefine` consulting the category-row for the EXPENSE-only check, mirroring feature 006's create/update pattern). Internal helpers in `lib/budgets/queries.ts` and `lib/budgets/aggregations.ts` trust their typed inputs (FR-014 from constitution). Auth checked at the page server component AND at every action; helpers never re-check auth. |
| **IV — Test the money paths** | YES | PASS | New unit suite (`tests/unit/budgets-aggregations.test.ts`) covers SC-009's 8+ cases: under / near / over thresholds, multi-currency separation, archived-transaction exclusion, period-boundary edge cases (month-rollover + year-rollover), zero-actuals, negative-progress (impossible by FR-005 but defensively tested), tie-broken sort. New `tests/unit/budgets-periods.test.ts` covers MONTHLY + YEARLY UTC-midnight bounds + first-of-next-period-exclusive + month/year rollover. New `tests/unit/budgets-defaults.test.ts` covers the most-used-by-COUNT helper. **Constitution-mandated E2E** (`tests/e2e/budgets.spec.ts`) asserts SC-010 + SC-011: full create → record → see-actuals-update flow + over-budget visual treatment. Existing feature-001..008 suites stay green (SC-015). |
| **V — Spec-driven development** | YES | PASS | Spec exists, status `READY_FOR_ARCH`, **0 open clarifications** (resolved in the 2026-05-26 session: calendar UTC periods, recurring rule, archived-category-stays, 80%-near / 100%-over thresholds, most-used-by-EXPENSE-count default-currency). Plan flows spec → plan → tasks. Single feature in flight (`009-budgets`); no parallel branches in `.specify/specs/`. |

**Conventions check.**

| Convention | Status | Note |
|---|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS | All new files land under these. New: `lib/budgets/`, `app/(shell)/dashboard/budgets/_components/`, one new dashboard widget file under `app/(shell)/dashboard/_components/`. |
| **Money helpers — all monetary operations go through `lib/money/`** | PASS | FR-023 binds this feature. `lib/budgets/aggregations.ts` consumes `Money` arithmetic via `.plus(...)` / `.minus(...)` / `sumAmounts(...)` / `.times(...)` / `.comparedTo(...)` — all on `Money` (Prisma.Decimal) instances. No raw `new Decimal(...)` or `new Money(...)` outside the boundary lifts from Prisma. **Audit grep**: `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/budgets/ 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` returns only `new Money(...)` boundary lifts and `.plus(...)` / `.minus(...)` / `.times(...)` / `.comparedTo(...)` calls on `Money` instances. |
| Migrations (no `db push`) | PASS | One generated migration: `db/migrations/<timestamp>_add_budget/migration.sql`. Creates `BudgetPeriod` enum, `Budget` table, three indexes (one of them the partial unique index — see R1 for the Prisma 7 syntax + raw-migration fallback). FR-001 from feature 007 (no `db push`) preserved. |
| Secrets (`.env.local` only) | PASS | No new env vars. |
| API response envelope `{ data } \| { error: { code, message } }` | PASS | All 4 server actions return this shape. New error codes: `budget_exists`, `category_wrong_kind`, plus the standard `unauthenticated`, `validation_failed`, `not_found`, `internal_error`. Documented in `lib/budgets/errors.ts` and `contracts/`. |
| Dates UTC | PASS | `createdAt`, `updatedAt`, `archivedAt` all `DateTime` (UTC). `startDate` and `endDate` are `@db.Date` (Postgres `DATE`), normalized to UTC midnight at the Zod boundary via the existing `normalizeToUtcDay` from `lib/transactions/dates.ts` (no duplication). Period-boundary computation in `lib/budgets/periods.ts` reuses `lib/dashboard/dates.ts`'s `computeCurrentMonthRange` + adds `computeCurrentYearRange`. |
| CSV exports | N/A | Not in this feature; feature 014 defers. |
| **Data scoping — every domain row owned by `userId`; queries filter by session** | PASS | **Fifth feature to exercise this rule.** `Budget.userId` FK with `ON DELETE CASCADE`. Every helper in `lib/budgets/queries.ts` takes `userId` as the first positional arg, supplied from `session.user.id`. Every Prisma `where:` clause includes `userId`. Cross-user attempts collapse to `not_found` (FR-022, SC-005). |
| **`prisma.transaction.*` confined to `lib/transactions/queries.ts`** (feature-007 invariant) | PASS | The TWO new helpers (`getMostUsedExpenseCurrencyForUser` and `sumExpenseByCategoryForBudgetsForUser`) live **inside** `lib/transactions/queries.ts` alongside `sumIncomeExpenseByCurrencyForUser`. `lib/budgets/queries.ts` calls these helpers (NOT `prisma.transaction.*` directly) for actuals + default-currency. **Audit grep** `rg "prisma\.transaction\." lib/ app/` still returns only `lib/transactions/queries.ts` after this feature ships. |
| **`lib/budgets/` does NOT import `prisma`** (mirrors feature 008's `lib/dashboard/aggregations.ts` rule) | PASS — for `aggregations.ts`, `periods.ts`, `defaults.ts`, `serialize.ts`, `schemas.ts`, `errors.ts`. `lib/budgets/queries.ts` DOES import `prisma` (it owns `prisma.budget.*`). **Audit grep** `rg 'from "@/lib/prisma"' lib/budgets/` returns ONLY `lib/budgets/queries.ts`. |
| **`<Money>` is the single monetary-display primitive** (feature-005 / 007 / 008 invariant) | PASS | Every monetary display surface on `/dashboard/budgets` AND on the new dashboard widget renders through `<Money>` from `components/money/money.tsx` — budgeted amount, actuals, remaining. NO new money-display component. **Audit greps** `rg "formatAmount\(" 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` returns zero; `rg '<Money[ /\n]' ...` returns at least 9 matches per the row composition (3 per visible row × 3+ rows minimum, plus widget). |
| **money-reviewer subagent gate (SC-008)** | PASS by construction | The audit greps codified in §Money & Currency Notes will be run by the money-reviewer at PR time. |

**No violations.** No justification required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-budgets/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log (R1..R14)
├── data-model.md        # Phase 1 — Budget model + BudgetPeriod enum + indexes + partial unique + DTOs
├── quickstart.md        # Phase 1 — 5-minute "verify this works" walkthrough
├── contracts/           # Phase 1 — server-action and function-surface contracts
│   ├── createBudget.md
│   ├── updateBudget.md
│   ├── archiveBudget.md
│   ├── unarchiveBudget.md
│   ├── listBudgets.md
│   ├── lib-budgets-aggregations.md
│   ├── lib-transactions-queries-extensions.md
│   └── dashboard-page.md
├── spec.md              # Approved, 0 open clarifications
└── tasks.md             # Phase 2 — produced by /speckit-tasks (NOT created here)
```

### Source code (after this feature)

```text
abacus/
├── app/
│   ├── (shell)/dashboard/
│   │   ├── page.tsx                                # MODIFIED — adds 4th widget slot for <BudgetsWidget>
│   │   ├── _components/
│   │   │   ├── add-transaction-cta.tsx             # unchanged
│   │   │   ├── cash-flow-widget.tsx                # unchanged
│   │   │   ├── empty-cell.tsx                      # unchanged
│   │   │   ├── net-worth-widget.tsx                # unchanged
│   │   │   ├── recent-transactions-widget.tsx     # unchanged
│   │   │   ├── widget-card.tsx                     # unchanged — reused by budgets-widget
│   │   │   ├── widget-error-boundary.tsx           # unchanged — reused for the BudgetsWidget wrapper
│   │   │   └── budgets-widget.tsx                  # NEW — server component; top-5 budgets sorted by status
│   │   └── budgets/
│   │       ├── page.tsx                            # REPLACED — server component, replaces the placeholder
│   │       └── _components/                        # NEW DIRECTORY
│   │           ├── budgets-list.tsx                # NEW — "use client"; show-archived toggle + sheet state
│   │           ├── budget-row.tsx                  # NEW — server component; single budget row + progress bar
│   │           ├── budget-form.tsx                 # NEW — "use client"; create + edit form (create allows category/currency/period; edit locks them)
│   │           ├── budget-form-sheet.tsx           # NEW — "use client"; shadcn <Sheet> wrapper around budget-form
│   │           ├── archive-confirm-dialog.tsx     # NEW — "use client"; shadcn <AlertDialog> wrapper around archive action
│   │           └── progress-bar.tsx                # NEW — server component; accessible <div role="progressbar"> with aria-valuenow/aria-valuemax (FR-031)
│   ├── (shell)/dashboard/transactions/             # unchanged
│   ├── (shell)/dashboard/accounts/                 # unchanged
│   ├── (shell)/dashboard/categories/               # unchanged
│   ├── (shell)/loading.tsx                         # unchanged — covers FR-032 page-level loading
│   ├── (shell)/error.tsx                           # unchanged
│   ├── (auth)/                                     # unchanged
│   ├── (marketing)/                                # unchanged
│   └── api/                                        # unchanged
├── components/
│   ├── categories/
│   │   └── category-picker.tsx                     # unchanged — already supports the `kind="EXPENSE"` filter prop (verified in code review)
│   ├── money/
│   │   └── money.tsx                               # unchanged — consumed by every budget render surface
│   ├── shell/
│   │   └── empty-state.tsx                         # unchanged — consumed by the no-budgets and no-EXPENSE-categories empty states
│   ├── illustrations/
│   │   └── budgets-illustration.tsx                # unchanged — already exists (currently consumed by the placeholder page)
│   └── ui/                                         # unchanged
├── lib/
│   ├── budgets/                                    # NEW DIRECTORY
│   │   ├── actions.ts                              # NEW — 4 server actions (create, update, archive, unarchive); standard envelope shape
│   │   ├── queries.ts                              # NEW — ONLY file in lib/budgets/ that imports prisma; owns prisma.budget.*; takes userId first
│   │   ├── schemas.ts                              # NEW — Zod schemas for the 4 actions; superRefine consults category-kind
│   │   ├── serialize.ts                            # NEW — Prisma Budget row → BudgetDTO; helper to convert BudgetWithActuals → wire shape
│   │   ├── errors.ts                               # NEW — error code constants + envelope helper (mirrors lib/transactions/errors.ts pattern)
│   │   ├── periods.ts                              # NEW — pure period-boundary helpers; computeCurrentPeriodRange(period); reuses computeCurrentMonthRange from lib/dashboard/dates.ts
│   │   ├── defaults.ts                             # NEW — computeDefaultCurrencyForBudget(userId); consumes getMostUsedExpenseCurrencyForUser from lib/transactions/queries.ts + falls back to listAccountsForUser; NO prisma import
│   │   ├── aggregations.ts                         # NEW — pure reducers: attachActualsToBudgets, sortBudgetsByStatusAndProgress, computeStatus; NO prisma import
│   │   └── index.ts                                # NEW — server-only barrel re-exporting the public surfaces
│   ├── transactions/
│   │   └── queries.ts                              # MODIFIED — ADDS two helpers: getMostUsedExpenseCurrencyForUser, sumExpenseByCategoryForBudgetsForUser. NO change to existing public surface. (Preserves the "prisma.transaction.* lives only here" invariant from feature 007.)
│   ├── categories/                                 # unchanged
│   ├── accounts/                                   # unchanged
│   ├── money/                                      # unchanged
│   ├── dashboard/                                  # unchanged (periods.ts in lib/budgets/ re-exports / shares with dashboard/dates.ts; no modification needed)
│   ├── auth/                                       # unchanged
│   ├── env.ts                                      # unchanged
│   └── prisma.ts                                   # unchanged
├── db/
│   ├── schema.prisma                               # MODIFIED — adds Budget model + BudgetPeriod enum + back-relations on User and Category
│   └── migrations/
│       ├── …                                       # unchanged (User, Account, Category, Transaction)
│       └── <timestamp>_add_budget/                 # NEW
│           └── migration.sql                       # NEW — generated by pnpm db:migrate; includes partial-unique-index raw SQL if Prisma 7's @@unique doesn't support WHERE
└── tests/
    ├── unit/
    │   ├── …                                       # all existing test files unchanged (SC-015)
    │   ├── budgets-periods.test.ts                 # NEW — MONTHLY + YEARLY boundary helpers; UTC midnight; month-rollover; year-rollover; leap year
    │   ├── budgets-aggregations.test.ts            # NEW — 8+ cases covering SC-009: attachActualsToBudgets, computeStatus, sortBudgetsByStatusAndProgress
    │   ├── budgets-defaults.test.ts                # NEW — most-used-by-COUNT helper; 90-day window; fallback to first non-archived account currency; null fall-through
    │   ├── budgets-schemas.test.ts                 # NEW — Zod boundary (positive amount, EXPENSE-only category, startDate ≤ endDate, uniqueness async refine)
    │   ├── budgets-queries.test.ts                 # NEW — prisma helper shape tests (mocked prisma); verifies userId-first, where clauses, uniqueness-check semantics
    │   └── budgets-serialize.test.ts               # NEW — Decimal → string + Date → ISO conversions + BudgetWithActuals shape
    └── e2e/
        ├── …                                       # all existing e2e specs unchanged (SC-015, SC-018)
        └── budgets.spec.ts                         # NEW — constitution-mandated; covers US1+US2+US3+US4+US5 + SC-010 + SC-011 + SC-018
```

**Structure Decision.** The established `lib/<feature>/` module pattern is duplicated for `lib/budgets/` — mirroring `lib/categories/` and `lib/transactions/` in layout and ownership convention. The new `lib/budgets/aggregations.ts` (and its siblings `periods.ts`, `defaults.ts`, `schemas.ts`, `errors.ts`, `serialize.ts`) all follow feature 008's `lib/dashboard/aggregations.ts` rule: **NO prisma import**. Only `lib/budgets/queries.ts` imports `prisma`. The two new helpers in `lib/transactions/queries.ts` preserve the feature-007 invariant that `prisma.transaction.*` lives in one file.

Page-local components live under `app/(shell)/dashboard/budgets/_components/` (the same `_components/` convention features 004 / 006 / 007 use for route-bound UI). The new `<BudgetsWidget>` lives under `app/(shell)/dashboard/_components/` alongside the existing 3 dashboard widgets — the dashboard-page composition adds it as the 4th element in the existing grid, wrapped in the existing `<WidgetErrorBoundary>`.

The new `<ProgressBar>` server component is intentionally **page-local** (`app/(shell)/dashboard/budgets/_components/progress-bar.tsx`) AND **shared** between the budgets page rows and the dashboard widget (the widget imports it from the budgets `_components/`). This is acceptable because no other route consumes the progress bar; if a third consumer ever appears (e.g., a future Reports page), the file moves to `components/`.

The reusable `<CategoryPicker>` is **NOT extended** — verified in code review that it already supports the `kind?: "INCOME" | "EXPENSE" | "any"` prop, so the budget form passes `kind="EXPENSE"` directly to filter the picker to EXPENSE categories only (R6). No extension to the picker is needed.

## Data Model Changes

The full reference lives in [`data-model.md`](./data-model.md). Summary here.

### Prisma schema diff

**Add:**

```prisma
model Budget {
  id         String       @id @default(cuid())
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId String
  category   Category     @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  period     BudgetPeriod
  amount     Decimal      @db.Decimal(20, 8)
  currency   String       @db.Char(3)
  startDate  DateTime     @db.Date
  endDate    DateTime?    @db.Date
  archivedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@index([userId, archivedAt])
  @@index([userId, categoryId])
  // The partial unique index `(userId, categoryId, currency, period) WHERE archivedAt IS NULL`
  // is added via a raw SQL statement in the migration if Prisma 7's `@@unique([...], where: ...)`
  // does not support the WHERE clause natively (see R1). The migration file is the source of truth.
}

enum BudgetPeriod {
  MONTHLY
  YEARLY
}
```

**Modify** (back-relations only — no SQL):

```prisma
model User {
  // … unchanged …
  budgets Budget[]  // NEW
}

model Category {
  // … unchanged …
  budgets Budget[]  // NEW
}
```

### Migration

```bash
pnpm db:migrate -- --name add_budget
```

Lands at `db/migrations/<timestamp>_add_budget/migration.sql`. Contains (in order):
1. `CREATE TYPE "BudgetPeriod" AS ENUM ('MONTHLY', 'YEARLY')`.
2. `CREATE TABLE "Budget" (...)`.
3. `CREATE INDEX "Budget_userId_archivedAt_idx" ON "Budget"("userId", "archivedAt")`.
4. `CREATE INDEX "Budget_userId_categoryId_idx" ON "Budget"("userId", "categoryId")`.
5. `CREATE UNIQUE INDEX "Budget_userId_categoryId_currency_period_active_unique" ON "Budget"("userId", "categoryId", "currency", "period") WHERE "archivedAt" IS NULL;` — the partial unique index (R1, R7).
6. FK constraints: `Budget.userId → User.id ON DELETE CASCADE`; `Budget.categoryId → Category.id ON DELETE RESTRICT`.

**No data hazard.** Existing `main` has zero budgets; the migration is purely additive. No back-fill required.

### Indexes & constraints

- `@@index([userId, archivedAt])` — supports the default list query: `WHERE userId = ? AND archivedAt IS NULL ORDER BY ...`. Also supports the dashboard widget's top-5 query.
- `@@index([userId, categoryId])` — supports the per-category lookup used by the create-time uniqueness pre-check and the "what's-budgeted-against-this-category?" query (future feature).
- **Partial unique index** `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` — enforces the uniqueness invariant from FR-002 and Clarification (the new uniqueness invariant beyond per-user scope). Raw SQL because Prisma 7's `@@unique([...], where: ...)` may not support filtered indexes natively (verified in R1).
- FK constraints: `Budget.userId → User.id ON DELETE CASCADE` (data-scoping convention); `Budget.categoryId → Category.id ON DELETE RESTRICT` (a category with budgets is not hard-deletable — archive is the destructive UX, consistent with feature 006 + 007).

### Decimal precision

`NUMERIC(20, 8)`. Same precision/scale as `Account.startingBalance` and `Transaction.amount`. The Zod boundary enforces a positive amount via the same currency-aware decimal-place rule (reusing `validateTransactionAmount`'s logic OR a thin wrapper since budgets are always positive — schema-level `> 0` check is sufficient since the sign-must-match-type rule does not apply).

## API Surface

Four server actions in `lib/budgets/actions.ts`. Full per-action contracts in [`contracts/`](./contracts/). Compressed table here.

| Action | Input | Success | Error codes | FRs |
|---|---|---|---|---|
| `createBudget` | `FormData` { categoryId, period, amount, currency, startDate, endDate? } | `{ data: { budget: BudgetDTO } }` | `unauthenticated`, `validation_failed`, `category_wrong_kind`, `budget_exists`, `internal_error` | FR-001..FR-007, FR-022 |
| `updateBudget` | `FormData` { id, amount, startDate, endDate? } | `{ data: { budget: BudgetDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-006, FR-007, FR-022, FR-018 (US3 ac.5 — only amount + startDate + endDate are editable; categoryId / currency / period are read-only on edit) |
| `archiveBudget` | `FormData` { id } | `{ data: { budget: BudgetDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-008, FR-018 |
| `unarchiveBudget` | `FormData` { id } | `{ data: { budget: BudgetDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `budget_exists` (unarchive collides with an existing active budget for the same tuple), `internal_error` | FR-008, FR-018 |

Additionally, a read action used by both the page and the dashboard widget:

| Action | Input | Success | Error codes |
|---|---|---|---|
| `listBudgets` | `{ includeArchived?: boolean }` (typed, no Zod boundary per Principle III) | `{ data: { budgets: BudgetWithActualsDTO[] } }` | `unauthenticated`, `internal_error` |

### Error envelope

```ts
type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "category_wrong_kind"; message: string; field: "categoryId" }
  | { code: "budget_exists"; message: string; field: "categoryId" }
  | { code: "internal_error"; message: string }
```

Catalog and rationale in `research.md` R6 + R7. The `budget_exists` code is raised both at the app-level pre-check AND on a Prisma unique-violation catch (race condition); both paths surface the same envelope (R7).

### Shared DTOs

```ts
type BudgetDTO = {
  id: string
  userId: string
  categoryId: string
  period: "MONTHLY" | "YEARLY"
  amount: string                  // canonical decimal string (always > 0)
  currency: string                // ISO 4217 alpha-3
  startDate: string               // ISO 8601 date-only ("2026-05-01")
  endDate: string | null          // ISO 8601 date-only or null
  archivedAt: string | null       // ISO 8601 UTC or null
  createdAt: string               // ISO 8601 UTC
  updatedAt: string               // ISO 8601 UTC
}

type BudgetWithActualsDTO = {
  budget: BudgetDTO
  category: CategoryDTO            // joined; UI uses category.name + category.archivedAt for the "(archived category)" label
  actuals: string                 // canonical decimal string (always >= 0, absolute value of EXPENSE sum)
  remaining: string               // canonical signed decimal string (negative when over budget)
  progressRatio: number            // actuals / amount; used by UI only for the progress bar fill % visual
  status: "under" | "near" | "over"
  periodStart: string             // ISO 8601 date-only
  periodEnd: string               // ISO 8601 date-only (exclusive)
}
```

`progressRatio` is a number (not Decimal) only because it is consumed by the rendering layer for the `width: ${ratio*100}%` CSS rule — it is NOT used for any monetary arithmetic or status comparison. Status is computed Decimal-precision-correctly via `actuals.comparedTo(amount.times(0.80))` etc. in `lib/budgets/aggregations.ts` and serialized into the DTO. The UI never recomputes status from `progressRatio` — it reads the `status` field directly.

## UI Surface

### Page

| URL | File | Renders |
|---|---|---|
| `/dashboard/budgets` | `app/(shell)/dashboard/budgets/page.tsx` | **Server component.** Replaces the existing placeholder. Reads `await auth()`; calls `listBudgets({ includeArchived: false })` AND `listCategories({ includeArchived: false, kind: "EXPENSE" })` (needed for the create-form picker and for the "no EXPENSE categories" empty-state variant from US5 ac.4). Branches: (a) zero EXPENSE categories → special empty state with CTA to `/dashboard/categories`; (b) zero budgets → empty state from US5 with "Create your first budget" CTA opening the sheet; (c) ≥ 1 budget → renders `<BudgetsList>` with the initial data. |

The placeholder at this URL (the current `EmptyState` + faux progress bar) is REPLACED entirely.

### Page-local components

All under `app/(shell)/dashboard/budgets/_components/`:

| Component | Server / Client | Purpose | Key primitives |
|---|---|---|---|
| `BudgetsList` | **Client** | Owns state for: the create/edit sheet (open/closed + selected budget), the show-archived toggle, the archive-confirm dialog. Renders the budgets as a vertical list of `<BudgetRow>` server components (passed in as `initialBudgets` prop OR re-fetched after toggling show-archived). Activating the "Add budget" CTA opens the sheet in create mode; clicking a row opens it in edit mode. | shadcn `<Switch>`, shadcn `<Button>`, `<BudgetFormSheet>`, `<ArchiveConfirmDialog>` |
| `BudgetRow` | Server | Renders a single budget row: category name + icon + (archived label if applicable), budgeted via `<Money>`, actuals via `<Money>`, remaining via `<Money>`, `<ProgressBar>` with the row's progressRatio + status + currency-aware width, and an "Archived" badge if applicable. The row itself is a `<button>` (or `<div role="button">`) that triggers the parent client component's "open sheet for this id". | `<Money>`, `<ProgressBar>`, shadcn `<Badge>` |
| `BudgetForm` | **Client** | Form fields: category picker (EXPENSE only, read-only on edit), amount input, currency picker (read-only on edit), period select (read-only on edit), startDate input, endDate input (optional). Bound via React 19 `useActionState` to `createBudget` or `updateBudget` action. Field errors rendered inline from the action's `fieldErrors`. | `<CategoryPicker kind="EXPENSE">`, shadcn `<Input>`, shadcn `<Select>` for period + currency, calendar date picker (already in repo from feature 007 — `react-day-picker`) |
| `BudgetFormSheet` | **Client** | shadcn `<Sheet>` wrapper around `<BudgetForm>`. Owns open/closed state via prop from parent (`<BudgetsList>`); on successful submit, closes itself. Same shape as feature 006's `CategoryFormSheet` and feature 007's `TransactionFormSheet`. | shadcn `<Sheet>`, `<BudgetForm>` |
| `ArchiveConfirmDialog` | **Client** | shadcn `<AlertDialog>` confirming archive. Triggered from the edit form's "Archive" button. On confirm, dispatches `archiveBudget(formData)`. Same shape as feature 006's archive dialog. | shadcn `<AlertDialog>`, shadcn `<Button>` |
| `ProgressBar` | Server | An accessible `<div role="progressbar" aria-valuenow={…} aria-valuemax={…} aria-valuetext={…}>` with a colored fill child (`width: ${Math.min(100, ratio*100)}%`). Fill color follows the status: `under` → neutral (e.g., `bg-primary`), `near` → warning (e.g., `bg-amber-500` AND an icon, per FR-025), `over` → negative (e.g., `bg-destructive`). Non-color secondary signal: each status renders an accompanying icon next to the bar (check / warning-triangle / x-circle). | `<div>`, lucide icons |

### Dashboard widget

| Component | Server / Client | Purpose | Key primitives |
|---|---|---|---|
| `BudgetsWidget` | Server | Async server component. Reads `userId` from prop. Calls `listBudgetsWithActualsForUser(userId, { limit: 5, sortByStatusAndProgress: true })` (the queries-layer helper). Renders top-5 budgets in priority order (over → near → under, ties broken by progressRatio desc, then by category.name asc). Each row: compact category name + `<Money>` actuals + `<Money>` budgeted + `<ProgressBar>` (compact). "See all" link → `/dashboard/budgets`. Empty state (FR-029): "Set up your first budget" CTA. Wrapped in the existing `<WidgetErrorBoundary title="Budgets">` (per FR-027). | `<WidgetCard>` (existing), `<Money>` (existing), `<ProgressBar>` (new — shared with the page) |

### Composition on `/dashboard`

The existing 3-widget grid from feature 008 becomes a 4-widget grid. Order: `<NetWorthWidget>`, `<CashFlowWidget>`, `<BudgetsWidget>` (NEW), `<RecentTransactionsWidget>` (full-width below). The existing `<AddTransactionCta>` and the page-level no-accounts EmptyState (US5 from feature 008) are unchanged. The existing 3 widgets render byte-for-byte identically (SC-018).

### Money display

Every monetary value renders through `<Money currency={...} amount={...} />`. The budget rows render three `<Money>` per row (budgeted, actuals, remaining); the widget renders two `<Money>` per row (actuals, budgeted) for the compact display. **No new money-display component.** **No `formatAmount(...)` calls** in the budget components.

### Sidebar navigation

`/dashboard/budgets` already exists as the sidebar's "Budgets" entry (from feature 002). No change.

### Charts

**None.** Recharts is feature 015. FR-034 explicitly defers.

## File-Level Layout

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/budgets/actions.ts` | 4 server actions: `createBudget`, `updateBudget`, `archiveBudget`, `unarchiveBudget`. Standard envelope shape. Calls `await auth()`, `safeParseAsync`, queries-layer helper, returns DTO. Calls `revalidatePath("/dashboard/budgets")` and `revalidatePath("/dashboard")` (the dashboard widget caches against it). |
| `lib/budgets/queries.ts` | ONLY file in `lib/budgets/` that imports `prisma`. Helpers: `listBudgetsForUser`, `getBudgetForUser`, `createBudgetForUser`, `updateBudgetForUser`, `setArchivedAtForUser`, `findExistingActiveBudgetForUser` (the app-level uniqueness pre-check). Plus the composite query `listBudgetsWithActualsForUser(userId, opts)` which fetches budgets, calls `sumExpenseByCategoryForBudgetsForUser` (in `lib/transactions/queries.ts`) to attach actuals, applies sort + optional limit. |
| `lib/budgets/schemas.ts` | Zod schemas: `createBudgetSchema`, `updateBudgetSchema`, `archiveBudgetSchema`, `unarchiveBudgetSchema`. Create + update have async `superRefine` consulting `getCategoryForUser` to enforce EXPENSE-only (R6). |
| `lib/budgets/serialize.ts` | `serializeBudget(row)` → `BudgetDTO`; `serializeBudgetWithActuals(budgetWithActuals, category)` → `BudgetWithActualsDTO`. |
| `lib/budgets/errors.ts` | Error code constants + `errorEnvelope` helper; custom errors: `BudgetExistsError`, `CategoryWrongKindError`. |
| `lib/budgets/periods.ts` | Pure period-boundary helpers. Exports: `computeCurrentPeriodRange(period: BudgetPeriod): { dateFrom: Date; dateTo: Date }`, `computeCurrentMonthRange()` (re-export from `lib/dashboard/dates.ts`), `computeCurrentYearRange()` (new). All UTC midnight; `dateTo` is the first of the NEXT period (exclusive). |
| `lib/budgets/defaults.ts` | `computeDefaultCurrencyForBudget(userId): Promise<string | null>`. Consumes `getMostUsedExpenseCurrencyForUser(userId, 90)` from `lib/transactions/queries.ts`; falls back to first non-archived account currency via `listAccountsForUser(userId, { includeArchived: false })`; falls through to `null`. **Does NOT import prisma.** |
| `lib/budgets/aggregations.ts` | Pure reducers: `attachActualsToBudgets(budgets, actualsMap)` → `BudgetWithActuals[]`; `computeStatus(actuals, amount): "under" \| "near" \| "over"` (uses `actuals.comparedTo(amount.times(0.80))` per R12); `sortBudgetsByStatusAndProgress(budgets)` (status priority desc → progressRatio desc → category.name asc). **Does NOT import prisma.** |
| `lib/budgets/index.ts` | Server-only barrel re-exporting the public surfaces. |
| `app/(shell)/dashboard/budgets/_components/budgets-list.tsx` | "use client". Owns toggle + sheet state. |
| `app/(shell)/dashboard/budgets/_components/budget-row.tsx` | Server component for each row. |
| `app/(shell)/dashboard/budgets/_components/budget-form.tsx` | "use client". The create/edit form. |
| `app/(shell)/dashboard/budgets/_components/budget-form-sheet.tsx` | "use client". Sheet wrapper. |
| `app/(shell)/dashboard/budgets/_components/archive-confirm-dialog.tsx` | "use client". AlertDialog wrapper. |
| `app/(shell)/dashboard/budgets/_components/progress-bar.tsx` | Server component. Accessible progress bar with `role="progressbar"`, `aria-valuenow`, `aria-valuemax`, `aria-valuetext`. Shared with the dashboard widget. |
| `app/(shell)/dashboard/_components/budgets-widget.tsx` | Server component. The 4th dashboard widget. Calls `listBudgetsWithActualsForUser(userId, { limit: 5, sortByStatusAndProgress: true })`. |
| `db/migrations/<timestamp>_add_budget/migration.sql` | The Prisma migration (R14). |
| `tests/unit/budgets-periods.test.ts` | Unit suite for period-boundary helpers. |
| `tests/unit/budgets-aggregations.test.ts` | Unit suite for actuals attach + status + sort (the SC-009 8+ cases land here). |
| `tests/unit/budgets-defaults.test.ts` | Unit suite for the default-currency helper. |
| `tests/unit/budgets-schemas.test.ts` | Zod boundary tests. |
| `tests/unit/budgets-queries.test.ts` | Prisma helper shape tests (mocked prisma). |
| `tests/unit/budgets-serialize.test.ts` | Serialize shape tests. |
| `tests/e2e/budgets.spec.ts` | Constitution-mandated E2E covering US1+US2+US3+US4+US5 + SC-010 + SC-011 + SC-018. |

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `db/schema.prisma` | Add `Budget` model + `BudgetPeriod` enum + back-relations on `User.budgets` and `Category.budgets`. |
| `lib/transactions/queries.ts` | **ADD only.** Two new helpers: `getMostUsedExpenseCurrencyForUser(userId, sinceDays): Promise<string \| null>` and `sumExpenseByCategoryForBudgetsForUser(userId, windows): Promise<Map<key, Money>>` (signature in R3). No existing public surface modified. |
| `app/(shell)/dashboard/page.tsx` | Add a 4th widget slot for `<BudgetsWidget userId={userId} />` wrapped in `<WidgetErrorBoundary title="Budgets">`. Layout adjustment: the grid stays 2-col on md+; budgets widget joins the top row OR a 2nd row depending on which composition reads best (implementer's call; either is plan-acceptable). The existing 3 widgets are unchanged. |
| `app/(shell)/dashboard/budgets/page.tsx` | REPLACE the placeholder with the functional CRUD page (server component). |

### Files NOT touched

`lib/auth/*`, `lib/accounts/*`, `lib/categories/*` (consumed read-only), `lib/money/*` (no new helper needed), `lib/dashboard/*` (the existing aggregations are NOT modified; the new dashboard widget is a sibling, not a modification), `components/categories/category-picker.tsx` (already supports `kind="EXPENSE"`), `components/money/*`, `components/shell/*`, `components/illustrations/*`, `components/ui/*`, `app/(shell)/dashboard/transactions/*`, `app/(shell)/dashboard/accounts/*`, `app/(shell)/dashboard/categories/*`, `app/(shell)/loading.tsx`, `app/(shell)/error.tsx`, `middleware.ts`, `app/api/*`, all tests for features 001–008. **No `package.json` change** — no new runtime dependencies (Constraint #6).

## Money & Currency Notes

This feature is **money-touch=true**. The money-reviewer subagent will run the following audit greps at PR time (codified here for SC-008):

```bash
# 1. prisma.transaction.* still confined to lib/transactions/queries.ts (feature 007 invariant).
rg "prisma\.transaction" lib/ app/ --include="*.ts" --include="*.tsx"
# Expected: matches only lib/transactions/queries.ts (+ the test mock in tests/unit/transactions-queries.test.ts).

# 2. lib/budgets/ does NOT import prisma — except queries.ts (the canonical owner).
rg 'from "@/lib/prisma"' lib/budgets/
# Expected: ONLY lib/budgets/queries.ts.

# 3. All monetary arithmetic flows through lib/money/. No raw Decimal arithmetic outside boundary lifts.
rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/budgets/ 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'
# Expected: ONLY `new Money(...)` boundary lifts AND .plus(...) / .minus(...) / .times(...) / .comparedTo(...) on Money instances.

# 4. No inline formatAmount(...) — every monetary surface renders through <Money>.
rg "formatAmount\(" 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'
# Expected: ZERO matches.

# 5. Every monetary surface uses <Money>. At least 9 matches (3 per row × ≥3 rows + widget).
rg '<Money[ /\n]' 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'
# Expected: AT LEAST 9 matches.

# 6. "use client" directive: only the interactive client components carry it. Start-of-line anchored
#    to avoid the JSDoc/comment false positives feature 008 surfaced.
rg '^"use client"' 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'
# Expected: budgets-list.tsx, budget-form.tsx, budget-form-sheet.tsx, archive-confirm-dialog.tsx.
# NOT: budgets-widget.tsx, budget-row.tsx, progress-bar.tsx (these are server components).
```

**Where Decimal is used.** `Budget.amount` is `Decimal @db.Decimal(20, 8)`. Stored as Postgres `NUMERIC` (constitution Principle I). All in-process arithmetic goes through `Money` (aliased from `Prisma.Decimal`) via `lib/money/decimal.ts`.

**Where currency is stored.** Every row carries `currency` (`CHAR(3)`); every DTO and every aggregate row carries `currency` adjacent to the amount. Every `<Money>` render carries `currency` (required prop). No monetary value is ever rendered without its currency code (FR-019, SC-003).

**FX handling.** N/A — no FX. The "no implicit FX" rule is structural: a USD-MONTHLY Groceries budget sums only USD-currency Groceries EXPENSE rows; an EUR-MONTHLY Groceries budget is a separate row with its own actuals. The reducer never combines two currencies (FR-019, SC-004). Cross-currency conversion is feature 020.

**Status-threshold comparison (R12).** This is the most fragile spot. The 80% / 100% boundaries (from Clarification Q1) use `Money.comparedTo(...)` semantics, not float division. Pseudocode:

```ts
// In lib/budgets/aggregations.ts:
function computeStatus(actuals: Money, amount: Money): "under" | "near" | "over" {
  if (amount.isZero()) return "under" // defensive — FR-005 rejects zero at the boundary
  const nearThreshold = amount.times(new Money("0.80"))    // 80% threshold as Decimal
  if (actuals.comparedTo(amount) > 0) return "over"        // actuals > amount → over
  if (actuals.comparedTo(nearThreshold) >= 0) return "near" // actuals >= 80% of amount → near
  return "under"
}
```

The boundary at `actuals == amount` (exactly 100%) is classified as `near`, not `over` (per the spec clarification's `0.80 ≤ ratio ≤ 1.00` for near and `> 1.00` for over). This is unit-tested in `tests/unit/budgets-aggregations.test.ts`.

## Auth & Validation Boundaries

### Auth required at

- `/dashboard/budgets` page — already gated by `middleware.ts` from feature 003 (matcher includes `/dashboard/:path*`). The page server component additionally calls `await auth()` for defense-in-depth AND to retrieve `session.user.id` for the queries.
- Every server action in `lib/budgets/actions.ts` calls `await auth()` at the top; returns `{ error: { code: "unauthenticated", … } }` on missing session.

### Auth NOT required at

- N/A — this feature adds no public surface.

### Zod validation at

- **Every server action** runs `safeParseAsync` (async because the create/update schemas consult Prisma via `superRefine` for the EXPENSE-only category-kind check). 4 actions × 1 boundary each = 4 Zod boundaries.
- The read action (`listBudgets`) takes a typed in-process options object (`{ includeArchived?: boolean }`) — per Principle III ("trust internally for in-process objects"), no Zod boundary.

### Trust-internally rule

`computeCurrentPeriodRange`, `attachActualsToBudgets`, `computeStatus`, `sortBudgetsByStatusAndProgress`, `serializeBudget` are pure in-process functions taking typed inputs. They do NOT re-validate. The queries-layer helpers (`listBudgetsForUser`, `findExistingActiveBudgetForUser`, etc.) similarly trust their typed `userId` argument (sourced from `session.user.id`).

### Cross-user isolation pattern

Same five-step rule from features 004 / 006 / 007 / 008:

1. `await auth()` at the page server component and at every server action.
2. `userId = session.user.id`.
3. Pass `userId` as the first positional arg to every `lib/budgets/queries.ts` helper.
4. Every Prisma `where:` clause for `budget` (and for the joined `category` lookups via `lib/categories/queries.ts`) includes `userId`.
5. **No code path** in this feature reads `userId` from request input.

A user constructing a request asserting another user's budget id sees `not_found` (FR-022, SC-005). Two-user E2E covers this (US1 ac.6).

## Testing Strategy

### Unit (Vitest) — required (Principle IV)

Six new test files under `tests/unit/`:

- **`tests/unit/budgets-periods.test.ts`** — covers MONTHLY + YEARLY boundary helpers; UTC midnight + first-of-next-period-exclusive + month/year rollover + leap year. Same shape as feature 008's `tests/unit/dashboard-dates.test.ts`.

- **`tests/unit/budgets-aggregations.test.ts`** — **SC-009 lands here.** At minimum 8 cases:
  1. `computeStatus` — actuals < 80% of amount → `under`.
  2. `computeStatus` — actuals == 80% of amount → `near`.
  3. `computeStatus` — actuals == 100% of amount → `near` (boundary is inclusive per spec clarification).
  4. `computeStatus` — actuals > 100% of amount → `over`.
  5. `computeStatus` — defensive zero-amount → `under`.
  6. `attachActualsToBudgets` — single-currency, single-budget, single-period.
  7. `attachActualsToBudgets` — multi-currency: USD budget sums only USD actuals; EUR budget sums only EUR actuals; no cross-currency contamination.
  8. `attachActualsToBudgets` — archived-transaction exclusion (the queries layer filters; the reducer trusts; this test asserts the reducer doesn't double-include).
  9. `attachActualsToBudgets` — period-boundary edge case: MONTHLY budget at month-rollover (transaction on the last day of month included; transaction on the 1st of next month excluded).
  10. `attachActualsToBudgets` — period-boundary edge case: YEARLY budget at year-rollover.
  11. `sortBudgetsByStatusAndProgress` — over → near → under priority; ties broken by progressRatio desc; secondary tie broken by category.name asc.

- **`tests/unit/budgets-defaults.test.ts`** — covers `computeDefaultCurrencyForBudget`:
  - User with ≥ 1 EXPENSE row in last 90 days → returns the COUNT-majority currency.
  - User with no EXPENSE in last 90 days but ≥ 1 non-archived account → returns the first account's currency (ordered by `createdAt asc`).
  - User with no EXPENSE and no accounts → returns `null`.
  - Tie between two currencies in COUNT → returns the alphabetically-first (deterministic).

- **`tests/unit/budgets-schemas.test.ts`** — Zod boundary:
  - `createBudgetSchema` — rejects negative amount, zero amount, missing categoryId, invalid currency.
  - `createBudgetSchema` — rejects when category is INCOME (async superRefine catches this — mocked via getCategoryForUser).
  - `createBudgetSchema` — rejects `endDate < startDate`.
  - `updateBudgetSchema` — only accepts `id`, `amount`, `startDate`, `endDate`; rejects attempts to change `categoryId` / `currency` / `period` (these fields are not in the schema).

- **`tests/unit/budgets-queries.test.ts`** — Prisma helper shape tests (mocked prisma):
  - Every helper takes `userId` first.
  - Every `where:` clause includes `userId`.
  - `listBudgetsForUser({ includeArchived: false })` filters `archivedAt: null`.
  - `findExistingActiveBudgetForUser` queries by the (userId, categoryId, currency, period, archivedAt: null) tuple.

- **`tests/unit/budgets-serialize.test.ts`** — Decimal → string + Date → ISO conversions + BudgetWithActualsDTO shape.

### E2E (Playwright) — required (Principle IV — covers SC-010, SC-011, SC-018)

One new spec: `tests/e2e/budgets.spec.ts`. Outline:

1. `test.beforeAll` truncates Budget / Transaction / Category / Account / User (or relies on FK cascade).
2. **No-budgets state (US5).** Sign up user A, seed an EXPENSE category. Visit `/dashboard/budgets`. Assert the no-budgets empty state with the "Create your first budget" CTA.
3. **No-EXPENSE-categories variant (US5 ac.4).** Archive all EXPENSE categories. Visit `/dashboard/budgets`. Assert the alternative empty state pointing to `/dashboard/categories`. Unarchive.
4. **US1 — Create budget.** Activate CTA. Fill form: category = Groceries, amount = 400, currency = USD, period = MONTHLY, startDate = 1st of current month. Submit. Assert the new row appears with budgeted $400, actuals $0, remaining $400, progress 0% under-budget.
5. **US2 — Actuals byte-for-byte (SC-010 setup).** Navigate to `/dashboard/transactions`. Record a $50 USD EXPENSE in Groceries dated today. Navigate back to `/dashboard/budgets`. **Assert actuals = $50.00, remaining = $350.00** (byte-for-byte per SC-010).
6. **US2 — Near-budget visual treatment.** Record $270 more EXPENSE in Groceries (total now $320 = 80%). Reload. Assert progress bar shows 80%, status "near", warning icon visible (non-color signal per FR-025).
7. **US2 — Over-budget visual treatment (SC-011).** Record $100 more (total now $420 = 105%). Reload. Assert progress bar capped at 100% fill, status "over", over-budget icon visible, remaining renders negative.
8. **US3 — Edit budget.** Click the row. Sheet opens in edit mode. Change amount to $500. Submit. Assert row reflects new $500; remaining = $80.
9. **US3 — Archive + unarchive.** Open edit sheet, click Archive, confirm. Row leaves the default view. Toggle "Show archived". Row reappears with badge. Click row, unarchive. Row returns to default view.
10. **US3 — Read-only fields on edit.** Re-open edit sheet. Assert category / currency / period inputs are disabled (read-only).
11. **US1 ac.5 — Uniqueness violation.** Try to create a second USD-MONTHLY Groceries budget. Assert error envelope `budget_exists`, friendly inline message.
12. **US1 ac.4 — INCOME-category rejection.** With the picker filtered to EXPENSE the UI prevents this; but submit a manually-crafted form data with an INCOME categoryId. Assert error envelope `category_wrong_kind`.
13. **US4 — Dashboard widget.** Navigate to `/dashboard`. Assert the Budgets widget is the 4th widget alongside Net Worth + Cash Flow + Recent Transactions. Assert it shows the Groceries budget (over) at the top, with the "See all" link to `/dashboard/budgets`.
14. **US4 — Dashboard widget empty state.** Archive the Groceries budget. Reload `/dashboard`. Assert the widget renders its empty state with the CTA to `/dashboard/budgets`.
15. **SC-018 — Existing widgets unchanged.** Assert Net Worth + Cash Flow + Recent Transactions render byte-for-byte the same values as before (re-use the assertions from feature 008's existing `tests/e2e/dashboard.spec.ts`).
16. **US1 ac.6 — Cross-user isolation (SC-005).** Sign up user B in a fresh browser context. Visit `/dashboard/budgets`. Assert the empty state — none of user A's budgets leak.

The byte-for-byte assertion in step 5 is the load-bearing one — it verifies the SC-010 actuals-vs-transactions consistency.

### Existing tests preservation (SC-015, SC-018)

The existing unit + e2e suites from features 001–008 MUST continue to pass with no test weakened, removed, or skipped. The dashboard E2E (`tests/e2e/dashboard.spec.ts`) in particular is the SC-018 guard — its byte-for-byte assertions on Net Worth + Cash Flow + Recent Transactions must still pass after the new BudgetsWidget is added.

### What can skip tests

- Visual styling of `<ProgressBar>` — covered structurally by the E2E status assertions.
- The `<BudgetFormSheet>` / `<ArchiveConfirmDialog>` shell components — they are thin shadcn wrappers; covered structurally by the form-submission E2E paths.
- The widget's empty-state rendering — covered by step 14 above.

### Constitution coverage summary

- **Principle IV money-paths unit suite**: PASS — `tests/unit/budgets-aggregations.test.ts` covers the 8+ cases per SC-009.
- **Principle IV signup→login→logout E2E**: PASS — `tests/e2e/auth.spec.ts` unchanged.
- **Principle IV transfer E2E**: PASS — `tests/e2e/transactions.spec.ts` unchanged.
- **Principle IV budgets E2E**: PASS — `tests/e2e/budgets.spec.ts` lands here (SC-010, SC-011, SC-018).

## Risks & Trade-offs

1. **Schema-level uniqueness with soft delete is Postgres-specific.** The partial unique index `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` is the load-bearing primitive that prevents two active budgets for the same tuple. Postgres supports partial unique indexes natively; SQLite/MySQL do not (this would be a problem if Abacus ever ported to MySQL, but it's not on the roadmap). Prisma 7's `@@unique([...], where: ...)` syntax may not support the WHERE clause natively — if it doesn't, the migration uses a raw `CREATE UNIQUE INDEX ... WHERE archivedAt IS NULL` (R1 documents both paths). **Decision: accept.** Postgres-only is consistent with the rest of the schema (`@db.Char(3)`, `@db.Date`, `@db.Decimal(20,8)` are all Postgres-shaped). **Mitigation:** the migration's raw-SQL form is the source of truth; the Prisma schema documents the constraint as a comment.

2. **N+1 risk on actuals computation across many budgets with varying period windows.** A user with 20 budgets — some MONTHLY, some YEARLY — must NOT trigger 20 separate `groupBy` round-trips. Strategy: batch into **at most 2 round-trips** (one for MONTHLY-window budgets, one for YEARLY-window budgets), each issuing one Prisma `groupBy` over the relevant `[dateFrom, dateTo)` range with `categoryId IN (...)` + `currency IN (...)` filters; the application-side reducer then maps each result back to the correct budget by `(categoryId, currency)` key. R3 documents the approach. **Decision: accept** the per-period-type query strategy. For v1 with ≤ 50 budgets, this is fast (indexed scans) and avoids the per-budget fan-out.

3. **Period-boundary recomputation cost on every request.** Each `BudgetWithActuals` has its own `(dateFrom, dateTo)` window. For MONTHLY: `[firstOfCurrentMonth, firstOfNextMonth)`. For YEARLY: `[firstOfCurrentYear, firstOfNextYear)`. Both are deterministic from the system clock; computed in nanoseconds. The strategy in (2) is to compute ONE MONTHLY range and ONE YEARLY range per render (not per budget), then query each range once. **Decision: accept.**

4. **Default-currency query overhead.** Computing "most-used by COUNT in last 90 days" is one additional `groupBy` per create-form render (the form is the only consumer). The query uses the existing `[userId, date]` index from feature 007; cheap. Documented in R4. **Decision: accept** — the alternative (per-user primary-currency setting from feature 017) is out of scope.

5. **Schema migration coupling to feature-007 transaction queries.** The two new helpers added to `lib/transactions/queries.ts` (`getMostUsedExpenseCurrencyForUser`, `sumExpenseByCategoryForBudgetsForUser`) are **add-only** — no existing public surface is modified. Feature 007's tests stay green. **Decision: accept** — the queries layer is the canonical owner of `prisma.transaction.*` and extending it is the constitutional choice. **Mitigation:** the contract `contracts/lib-transactions-queries-extensions.md` enumerates the signatures + edge cases so the implementer can land them without churn.

6. **EXPENSE-only enforcement at three layers (defense in depth).** UI category-picker filter (`<CategoryPicker kind="EXPENSE">`), Zod schema (`superRefine` consults `getCategoryForUser` and rejects non-EXPENSE), action handler (re-fetch in the queries layer; reject with `category_wrong_kind`). Same belt-and-suspenders feature 007 used for the sign-must-match-type rule. The cost is one extra Prisma read in the create/update path; the benefit is structural — a tampered payload that bypasses the UI is rejected at the boundary. **Decision: accept.** R6 documents.

## Constitution Compliance — Post-Design Re-Check

After completing Phase 0 (research) and Phase 1 (data model, contracts, quickstart), the design re-passes every applicable gate:

| Principle | Status | Why |
|---|---|---|
| **I — Money math** | PASS | `Budget.amount` is `Decimal @db.Decimal(20, 8)`. All in-process arithmetic via `Money.plus(...)` / `Money.minus(...)` / `Money.times(...)` / `Money.comparedTo(...)` / `sumAmounts(...)` from `lib/money/`. Actuals aggregation Postgres-side via `groupBy._sum.amount` (Decimal-native; same primitive as feature 008's cash-flow widget). Currency stored adjacent to every amount + every DTO. No implicit FX. `<Money>` is the single rendering primitive. Status thresholds use Decimal-precision-correct `comparedTo` semantics (R12). Audit greps codified in §Money & Currency Notes. Money-reviewer audit (SC-008) met by construction. |
| **II — Type safety** | PASS | Strict TS; no `any`. Public types (`BudgetDTO`, `BudgetWithActualsDTO`, `BudgetPeriod`, error envelope) exported from `lib/budgets/index.ts`. Session typed via `await auth()`. Every helper takes `userId: string` first. |
| **III — Validate at boundaries** | PASS | 4 server actions × 1 Zod boundary each = 4 boundaries. Read action takes typed in-process options object (no Zod, per Principle III). Helpers trust their typed inputs. Auth at action + page boundary only. |
| **IV — Test the money paths** | PASS | Unit suite covers `attachActualsToBudgets` + `computeStatus` + period boundaries + default-currency under 8+ cases per SC-009. Constitution-mandated E2E asserts SC-010 + SC-011. Existing feature-001..008 suites stay green (SC-015, SC-018). |
| **V — Spec-driven** | PASS | spec → plan → tasks order observed; single feature in flight; 0 open clarifications (resolved 2026-05-26). |

**Conventions** (after Phase 1 design): all rows of the convention table still PASS — most importantly:

- **Data scoping**: `userId` from `session.user.id`; first positional arg to every helper; no request-input userId path exists.
- **`prisma.transaction.*` confined to `lib/transactions/queries.ts`**: the two new helpers live in that file; `lib/budgets/queries.ts` calls them (NOT `prisma.transaction.*` directly).
- **`lib/budgets/aggregations.ts` (and siblings) does NOT import `prisma`**: same convention as `lib/dashboard/aggregations.ts` from feature 008.
- **`<Money>` single rendering primitive**: every monetary surface uses it.

**No constitution violations identified. No Complexity Tracking entries required.**

## Complexity Tracking

No constitution violations. No justification entries required.

## Phase 2 — Task-Bundle Preview

`/speckit-tasks` will generate `tasks.md` from this plan. Expected task bundles (provided as a guide; the actual atomized task list is produced by `/speckit-tasks`):

1. **Schema + migration.** Add `Budget` model + `BudgetPeriod` enum + back-relations to `db/schema.prisma`. Run `pnpm db:migrate -- --name add_budget`. Verify the partial unique index syntax (Prisma 7's `@@unique([...], where: ...)` vs. raw SQL — pick whichever Prisma 7 supports natively; fall back to raw migration SQL if needed). Run `pnpm db:generate`.

2. **`lib/transactions/queries.ts` extensions.** Add `getMostUsedExpenseCurrencyForUser(userId, sinceDays)` and `sumExpenseByCategoryForBudgetsForUser(userId, windows)`. Add unit-test extensions if needed. Confirm existing feature-007 tests stay green.

3. **`lib/budgets/` module — pure helpers.** Ship `periods.ts`, `aggregations.ts`, `defaults.ts`, `errors.ts`, `serialize.ts`, `schemas.ts`. Ship the corresponding unit tests (`tests/unit/budgets-periods.test.ts`, `tests/unit/budgets-aggregations.test.ts`, `tests/unit/budgets-defaults.test.ts`, `tests/unit/budgets-schemas.test.ts`, `tests/unit/budgets-serialize.test.ts`).

4. **`lib/budgets/queries.ts`.** Add the prisma-owning helpers. Ship `tests/unit/budgets-queries.test.ts` (mocked prisma).

5. **`lib/budgets/actions.ts`.** Add the 4 server actions. Add the `listBudgets` read action.

6. **`lib/budgets/index.ts`.** Barrel re-export.

7. **`<ProgressBar>` server component.** Ship `app/(shell)/dashboard/budgets/_components/progress-bar.tsx`.

8. **Page-local client components.** Ship `<BudgetForm>`, `<BudgetFormSheet>`, `<ArchiveConfirmDialog>`. Wire up the React 19 `useActionState` boundary.

9. **`<BudgetRow>` server component.** Renders each row with budgeted + actuals + remaining + progress bar.

10. **`<BudgetsList>` client component.** Owns toggle + sheet state.

11. **`/dashboard/budgets/page.tsx`** — REPLACE the placeholder. Branch on EXPENSE-category count + budget count.

12. **`<BudgetsWidget>` server component.** Ship `app/(shell)/dashboard/_components/budgets-widget.tsx`.

13. **`/dashboard/page.tsx` MODIFICATION.** Add the 4th widget slot. Verify existing 3 widgets unchanged.

14. **E2E.** Land `tests/e2e/budgets.spec.ts` covering US1–US5 + SC-010 + SC-011 + SC-018.

15. **Final audits.** `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm test:e2e`. Run the money-reviewer greps codified in §Money & Currency Notes. Update `quickstart.md` walkthrough state if anything changed during implementation.

The implementer SHOULD execute these in dependency order (later steps consume earlier outputs). `/speckit-tasks` output will expand each bundle into atomic, individually-verifiable units with explicit DONE / DONE_WITH_CONCERNS criteria.

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, one schema change (Budget + BudgetPeriod), one cross-module helper add to lib/transactions/queries.ts (preserves the feature-007 invariant), no new runtime dependencies, all contracts written, money-correctness invariants codified for the money-reviewer audit
File: /Users/rgederin/git/abacus/specs/009-budgets/plan.md
```
