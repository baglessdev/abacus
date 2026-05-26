---

description: "Task list for feature 008 — Budgets (roadmap number)"
---

# Tasks: Budgets

**Input**: Design documents from `/specs/009-budgets/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Roadmap number**: feature 008 — Budgets. **Spec directory**: `specs/009-budgets/` (sequential; spec slot 005 was consumed by the branded-UI polish chore in May 2026 and slot 007 by the transactions feature).

**Tests**: Per constitution Principle IV ("test the money paths"), this feature ships six new Vitest unit-test files (`budgets-periods.test.ts`, `budgets-aggregations.test.ts`, `budgets-defaults.test.ts`, `budgets-schemas.test.ts`, `budgets-serialize.test.ts`, `budgets-queries.test.ts`) plus one new Playwright spec (`tests/e2e/budgets.spec.ts`) covering US1+US2+US3+US4+US5 round-trip including the constitution-mandated create→record-expense→see-actuals-update assertion (SC-010) and over-budget visual treatment assertion (SC-011). All existing unit + e2e tests (features 001–008) MUST continue to pass (SC-015 + SC-018).

**Money-touch**: TRUE. The money-reviewer subagent runs on this PR. Per the plan's Constitution Check + Risk #2 + Risk #6, the actuals batched aggregation, the 80%/100% status thresholds (Decimal-precision-correct via `comparedTo`), the EXPENSE-only enforcement at three layers, and the `<Money>` single-rendering-primitive invariant are audit targets. The audit greps in T034 codify the invariants.

**Schema**: **Changes.** New `Budget` model + `BudgetPeriod` enum + 3 indexes (including a Postgres partial unique index on `(userId, categoryId, currency, period) WHERE archivedAt IS NULL`). New back-relations on `User` and `Category`. Migration generated and edited (per R1 / R14: Prisma 7's `@@unique` does not natively support `WHERE` filters; the migration's raw SQL is hand-edited to add the partial unique index).

**Dependencies**: **No new runtime deps.** `package.json` and `pnpm-lock.yaml` MUST be unchanged after this feature ships.

**Organization**: Tasks grouped by user story. The MVP is **US1 + US2 together** (create-budget + see-actuals-at-a-glance — together they make the page functional for the first time). US3 (edit / archive) is the third P1 and brings full CRUD. US4 (dashboard widget) and US5 (no-budgets empty state) are P2 follow-ups.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase (different files, no dependencies on incomplete tasks).
- **[Story]**: Maps task to user story (US1–US5). Setup / Foundational / Polish tasks have no story label.
- File paths are repo-relative under `/Users/rgederin/git/abacus/`.

## Path Conventions

Next.js 16 App Router layout (per [plan.md §Project Structure](./plan.md)). All paths repo-relative below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Sanity check the working tree before implementation. No new dependencies introduced.

- [x] T001 Confirm working tree is clean and on branch `009-budgets`. Run `pnpm install --frozen-lockfile` (no install drift expected). Run `pnpm typecheck` + `pnpm lint` + `pnpm test` against the current baseline to capture a green "starting state" — every existing test from features 001–008 MUST pass before this feature begins, so any regression introduced later is unambiguously attributable to this feature's diff. Record the unit-test count (expected ~238 from feature 008 baseline + the recent feature-008 additions).

**Checkpoint**: Baseline green. No new code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + migration + `lib/transactions/queries.ts` extensions + new `lib/budgets/` module (periods, aggregations, defaults, schemas, errors, serialize, queries, actions, index) + unit-test suite + shared `<ProgressBar>` primitive. Every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 is complete. The money-reviewer audit invariants and the partial-unique-index enforcement are seeded here.

### Database

- [x] T002 Update `db/schema.prisma` per [data-model.md](./data-model.md): add `model Budget` (id, userId, categoryId, period, amount `@db.Decimal(20, 8)`, currency `@db.Char(3)`, startDate `@db.Date`, endDate `@db.Date?`, archivedAt, createdAt, updatedAt) + `enum BudgetPeriod { MONTHLY YEARLY }` + back-relations `User.budgets Budget[]`, `Category.budgets Budget[]`. Include 2 non-unique indexes (`@@index([userId, archivedAt])`, `@@index([userId, categoryId])`). FK rules: `Budget.userId → User.id ON DELETE CASCADE`; `Budget.categoryId → Category.id ON DELETE Restrict`. Document the partial-unique-index requirement as a Prisma schema comment (it lands via raw SQL in T003).
- [x] T003 Generate the migration: `pnpm exec prisma migrate dev --name add_budget --schema=db/schema.prisma`. **THEN HAND-EDIT** the generated `db/migrations/<timestamp>_add_budget/migration.sql` to APPEND a raw `CREATE UNIQUE INDEX "Budget_userId_categoryId_currency_period_active_unique" ON "Budget"("userId", "categoryId", "currency", "period") WHERE "archivedAt" IS NULL;` line (per R1 / R14 — Prisma 7's `@@unique` does not natively emit partial-unique syntax). Re-apply via `pnpm exec prisma migrate dev` (the modified SQL re-runs cleanly because the index doesn't yet exist). Run `pnpm db:generate` to refresh the Prisma client. Verify the migration SQL contains: `CREATE TYPE "BudgetPeriod"`, `CREATE TABLE "Budget"` with the 3 FK constraints, the 2 non-unique indexes, AND the raw partial unique index. Verify `pnpm exec prisma migrate status --schema=db/schema.prisma` reports "Database schema is up to date."

### `lib/transactions/queries.ts` extensions (preserves feature-007 invariant)

- [x] T004 Extend `lib/transactions/queries.ts`: add `getMostUsedExpenseCurrencyForUser(userId: string, sinceDays: number = 90): Promise<string | null>` per [contracts/lib-transactions-queries-extensions.md](./contracts/lib-transactions-queries-extensions.md). Implementation: `prisma.transaction.groupBy({ by: ["currency"], where: { userId, type: "EXPENSE", archivedAt: null, date: { gte: <ninetyDaysAgo> } }, _count: { _all: true }, orderBy: { _count: { _all: "desc" } }, take: 1 })`. Returns `result[0]?.currency ?? null`. **`userId` is the first positional arg**. **`prisma.transaction.*` MUST appear only in this file** ([research.md R9 from feature 008](./research.md), feature-007 invariant).
- [x] T005 Extend `lib/transactions/queries.ts`: add `sumExpenseByCategoryForBudgetsForUser(userId: string, windows: { categoryIds: string[]; currencies: string[]; dateFrom: Date; dateTo: Date }[]): Promise<Map<string, Money>>` per [contracts/lib-transactions-queries-extensions.md](./contracts/lib-transactions-queries-extensions.md). Per [research.md R3](./research.md), the implementation issues ONE `prisma.transaction.groupBy` per window (typically 2 — one for the MONTHLY-window, one for the YEARLY-window). Each groupBy: `{ by: ["categoryId", "currency"], where: { userId, type: "EXPENSE", archivedAt: null, categoryId: { in: window.categoryIds }, currency: { in: window.currencies }, date: { gte: window.dateFrom, lt: window.dateTo } }, _sum: { amount: true } }`. Returns a `Map<string, Money>` keyed by `${categoryId}|${currency}|${windowKey}` (the windowKey is a stable label like `"monthly-2026-05"` or `"yearly-2026"` derived from the window's `dateFrom`). Each `_sum.amount` (Decimal, possibly null) is lifted to `Money` at the boundary (`new Money(r._sum.amount ?? 0).abs()` — EXPENSE is stored negative; actuals display as positive). (Depends on T002 / T003 for the schema; same file as T004 so sequential within the queries-extensions group.)

### `lib/budgets/` — pure helpers (no `prisma` import)

- [x] T006 [P] Create `lib/budgets/periods.ts`: export `computeMonthRangeForDate(date: Date): { dateFrom: Date; dateTo: Date }` (UTC midnight of the 1st of `date`'s month to UTC midnight of the 1st of the next month, exclusive) AND `computeYearRangeForDate(date: Date): { dateFrom: Date; dateTo: Date }` (UTC midnight of Jan 1 of `date`'s year to UTC midnight of Jan 1 of the next year, exclusive) AND `computeCurrentPeriodRange(period: "MONTHLY" | "YEARLY"): { dateFrom: Date; dateTo: Date }` (convenience using `new Date()`). Pure functions; deterministic given input / system time. NO `prisma` import. (No dependencies; parallelizable with T007–T012.)
- [x] T007 [P] Create `lib/budgets/aggregations.ts`: export `attachActualsToBudgets(budgets: BudgetWithCategory[], sumMap: Map<string, Money>, currentTime: Date): BudgetWithActuals[]` (per [contracts/lib-budgets-aggregations.md](./contracts/lib-budgets-aggregations.md)). For each budget: compute period window via `lib/budgets/periods.ts`; look up `actuals` from `sumMap` keyed by `${budget.categoryId}|${budget.currency}|${windowKey}` (default to `new Money(0)` if missing); compute `remaining = new Money(budget.amount).minus(actuals)` via `Money.minus`; compute `progressRatio = actuals.div(budget.amount).toNumber()` (used only for display sort — DO NOT use for status threshold comparison); compute `status = computeStatus(actuals, budget.amount)` (the precision-correct version — see T008). Export `sortBudgetsByStatusAndProgress(budgets: BudgetWithActuals[]): BudgetWithActuals[]` (sort by status priority desc: over → near → under, then progressRatio desc within group, ties broken by `category.name asc`). NO `prisma` import. ALL arithmetic via `lib/money/` helpers (Money.plus, Money.minus, Money.times, sumAmounts). (No dependencies; parallelizable.)
- [x] T008 [P] Add `computeStatus(actuals: Money, budgetAmount: Money): "under" | "near" | "over"` to `lib/budgets/aggregations.ts`. **Decimal-precision-correct implementation per [research.md R12](./research.md)**: `const overThreshold = new Money(budgetAmount); const nearThreshold = new Money(budgetAmount).times(new Money("0.80")); if (actuals.comparedTo(overThreshold) > 0) return "over"; if (actuals.comparedTo(nearThreshold) >= 0) return "near"; return "under";`. **NEVER use `actuals / budgetAmount` as a float for the threshold comparison** — float division loses precision on Decimal values. The 80%/100% boundaries are LOCKED by Clarification Q1 in the spec. (Same file as T007; sequential within aggregations.ts.)
- [x] T009 [P] Create `lib/budgets/defaults.ts`: export `computeDefaultCurrencyForBudget(userId: string): Promise<string | null>` per Clarification Q2. Implementation: (1) call `getMostUsedExpenseCurrencyForUser(userId, 90)` from `lib/transactions/queries.ts`; if non-null, return it. (2) Fall back: call `listAccountsForUser(userId, { includeArchived: false })`; if any account exists, return `accounts[0].currency` (ordered by `createdAt asc` by the existing query helper). (3) Fall through to null. NO `prisma` import — consume function exports only. (No dependencies; parallelizable.)
- [x] T010 [P] Create `lib/budgets/errors.ts`: error code constants per [contracts/createBudget.md](./contracts/createBudget.md) and the spec's FR-002 / FR-003 — `unauthenticated`, `validation_failed`, `not_found`, `budget_exists` (uniqueness collision), `category_wrong_kind` (INCOME category attempted), `internal_error`. Export `BudgetErrorCode` type + `errorEnvelope(code, opts?)` helper. Export custom Error subclasses `BudgetExistsError` (raised by the queries layer or by Postgres on unique-index violation; caught by actions.ts) and `CategoryWrongKindError` (raised when a Budget references a non-EXPENSE category). (No dependencies; parallelizable.)
- [x] T011 [P] Create `lib/budgets/serialize.ts`: `serializeBudget(row: Budget): BudgetDTO`. Convert `Decimal` → canonical string (`.toString()` — per feature 004's pattern), `Date` → ISO string. DTO shape: `{ id, userId, categoryId, period, amount, currency, startDate, endDate, archivedAt, createdAt, updatedAt }` — all dates as ISO strings, amount as canonical decimal string. Also export `serializeBudgetWithActuals(b: BudgetWithActuals): BudgetWithActualsDTO` adding `actuals`, `remaining`, `progressRatio`, `periodStart`, `periodEnd`, `status` fields (with Money values as strings). (No dependencies; parallelizable.)
- [x] T012 Create `lib/budgets/schemas.ts`: Zod schemas for the 4 server actions (`createBudgetSchema`, `updateBudgetSchema`, `archiveBudgetSchema`, `unarchiveBudgetSchema`). The `createBudgetSchema` MUST: validate `categoryId` is non-empty CUID; validate `period` is `MONTHLY | YEARLY`; validate `amount` is a positive decimal string (`> 0`, no float, max 8 decimal places — reuse `validateMonetaryAmount` from `lib/money/`); validate `currency` is a valid ISO 4217 code (uppercase, length 3); validate `startDate` is an ISO date string (transformed to Date and normalized to the 1st of the month for MONTHLY / Jan 1 for YEARLY at the boundary); validate `endDate` (optional) is ISO date string ≥ startDate. The `updateBudgetSchema` accepts ONLY `id`, `amount`, `startDate`, `endDate` (FR-005 from spec US3 ac.5 — categoryId, currency, period are read-only on edit). The EXPENSE-only check is enforced in `actions.ts` at T015 (not in the Zod schema — requires a Prisma read). (Depends on T010 only for error types; sequential.)

### Unit-test suite (Principle IV — MANDATORY)

- [x] T013 [P] Create `tests/unit/budgets-periods.test.ts`: cover `computeMonthRangeForDate` (mid-month 2026-05-15 → dateFrom 2026-05-01, dateTo 2026-06-01; first-of-month; last-of-month; December → January rollover; leap-year February 2028-02-15 → dateFrom 2028-02-01, dateTo 2028-03-01); cover `computeYearRangeForDate` (mid-year → Jan 1 → Jan 1 of next year; year-end rollover); cover `computeCurrentPeriodRange("MONTHLY")` and `("YEARLY")` with `vi.setSystemTime(...)` to pin the clock. Use Vitest. Constitution Principle IV.
- [x] T014 [P] Create `tests/unit/budgets-aggregations.test.ts`: SC-009 mandates 8+ cases covering the actuals computation. Cover `attachActualsToBudgets` AND `computeStatus`: (a) empty budgets → empty result; (b) single MONTHLY budget under-budget ($150 actuals vs $400 = 37.5%) → status "under"; (c) single MONTHLY budget near-budget at 80% boundary ($320 vs $400) → status "near"; (d) single MONTHLY budget near-budget at 90% ($360 vs $400) → status "near"; (e) single MONTHLY budget near-budget at 100% exactly ($400 vs $400) → status "near" (the boundary is inclusive); (f) single MONTHLY budget over-budget at 100.01% ($400.01 vs $400) → status "over"; (g) single MONTHLY budget over-budget at 112.5% ($450 vs $400) → status "over"; (h) multi-currency: USD-$400-MONTHLY-Groceries with $150 actuals + EUR-€100-MONTHLY-Groceries with €80 actuals → two rows; each currency block isolated, no FX (FR-019); (i) archived-transaction exclusion: a sumMap that excludes archived rows yields the correct under-budget result (the SUM is feature-007's responsibility; assert the reducer trusts its input); (j) zero actuals → status "under", remaining = full amount; (k) sort by status: 3 budgets [over, near, under] in arbitrary input order render in priority order; (l) tie-break by progressRatio desc within status; (m) tie-break by category.name asc within identical progressRatio. Use Vitest with mocked `Money` instances. **Critical Decimal-precision test**: `computeStatus(new Money("32.00"), new Money("40.00"))` MUST return "near" (32/40 = 0.80 exactly — boundary case; float would be precision-fragile). Constitution Principle IV.
- [x] T015 [P] Create `tests/unit/budgets-defaults.test.ts`: cover `computeDefaultCurrencyForBudget` per Clarification Q2. Mock `getMostUsedExpenseCurrencyForUser` and `listAccountsForUser`. Cases: (a) user has recent EXPENSE transactions → returns the COUNT-winning currency; (b) user has no recent EXPENSE but ≥ 1 non-archived account → returns first account's currency; (c) user has no transactions and no accounts → returns null; (d) tie-break: two currencies with equal counts → the `take: 1` makes Prisma return one (test asserts the chosen one is deterministic given the orderBy). Constitution Principle IV.
- [x] T016 [P] Create `tests/unit/budgets-schemas.test.ts`: cover the Zod boundary rules per [contracts/createBudget.md](./contracts/createBudget.md) + [contracts/updateBudget.md](./contracts/updateBudget.md). Cases for `createBudgetSchema`: (a) valid MONTHLY budget → succeeds; (b) valid YEARLY budget → succeeds; (c) negative amount → fails with `validation_failed`; (d) zero amount → fails (FR-005 from spec); (e) too-many-decimals amount (e.g., `"100.123456789"`) → fails; (f) invalid currency (`"USA"` or `"us"`) → fails; (g) non-ISO date string for startDate → fails; (h) startDate normalization: input `"2026-05-17"` for MONTHLY → normalized Date = `2026-05-01 UTC midnight`; (i) startDate normalization: input `"2026-05-17"` for YEARLY → normalized Date = `2026-01-01 UTC midnight`; (j) endDate < startDate → fails; (k) endDate omitted → succeeds with `endDate: null`. Cases for `updateBudgetSchema`: (l) only id + amount → succeeds; (m) attempt to include `categoryId` field → field is ignored or fails (depending on schema strictness — assert the consistent behavior); (n) same for `currency`, `period`. Constitution Principle IV.
- [x] T017 [P] Create `tests/unit/budgets-serialize.test.ts`: cover `serializeBudget` (Decimal → canonical string, Date → ISO string, null `endDate` handled) AND `serializeBudgetWithActuals` (additional fields render correctly). Smaller suite; ~4-6 cases.

### `lib/budgets/queries.ts` + `actions.ts` + barrel

- [x] T018 Create `lib/budgets/queries.ts`: Prisma helpers per [contracts/listBudgets.md](./contracts/listBudgets.md). Export: `listBudgetsForUser(userId, opts: { includeArchived?: boolean })` — returns `Budget[]` joined with `Category` (via `include: { category: true }` per R8 to surface the archived-category state in the rendering); `getBudgetForUser(userId, budgetId)` — returns single with category, or null; `createBudgetForUser(userId, input)` — pre-checks uniqueness via `prisma.budget.findFirst({ where: { userId, categoryId, currency, period, archivedAt: null } })`; throws `BudgetExistsError` on hit; otherwise `prisma.budget.create`. Catches Postgres unique-index violation (code `P2002`) and re-throws as `BudgetExistsError` (the schema-level guard for races per R7); `updateBudgetForUser(userId, budgetId, patch)` — only mutates fields in patch (amount, startDate, endDate); `setArchivedAtForUser(userId, budgetId, value: Date | null)` — uses `updateMany` for the cross-user-collapses-to-not-found pattern. **First positional arg of every helper is `userId`**. Every Prisma `where:` clause includes `userId`. **This file is the canonical owner of `prisma.budget.*`** going forward. (Depends on T002, T003, T010, T011.)
- [x] T019 Create `lib/budgets/actions.ts`: 4 `"use server"` server actions per `contracts/` (`createBudget`, `updateBudget`, `archiveBudget`, `unarchiveBudget`) + the `listBudgets` read action. Per-action flow: (1) `await auth()` → on missing session return `unauthenticated`; (2) Zod `safeParse(formData)` → on failure return `validation_failed` with `fieldErrors`; (3) for `createBudget`: re-fetch the category via `getCategoryForUser(userId, input.categoryId)` and reject with `category_wrong_kind` if `category.kind !== "EXPENSE"` (R6 — the 3rd layer of EXPENSE-only enforcement); (4) call the relevant queries helper with `session.user.id`; (5) catch `BudgetExistsError` → return `{ error: { code: "budget_exists", message: "...", details: { categoryId, currency, period } } }`; catch `CategoryWrongKindError` → `category_wrong_kind`; (6) on read returning `null` → `not_found`; (7) `archiveBudget` sets `archivedAt = new Date()` server-side, never accepts client timestamp; (8) on success return `{ data: { budget: serializeBudget(row) } }` or `{ data: { budgets: rows.map(serializeBudgetWithActuals) } }`; (9) call `revalidatePath("/dashboard/budgets")` AND `revalidatePath("/dashboard")` after every successful mutation (the dashboard widget shows current budgets). For `listBudgets`: also fetch the appropriate sum-maps via `sumExpenseByCategoryForBudgetsForUser(userId, ...)` (build the windows array from the budgets' period types per R3), feed through `attachActualsToBudgets` + `sortBudgetsByStatusAndProgress`, serialize. (Depends on T004, T005, T012, T018.)
- [x] T020 Create `lib/budgets/index.ts`: server-only barrel re-exporting the 5 actions, `BudgetDTO`, `BudgetWithActualsDTO`, `BudgetPeriod`, error-code union. Include `import "server-only"` at the top. (Depends on T010, T011, T019.)
- [x] T021 Create `tests/unit/budgets-queries.test.ts`: lock the uniqueness pre-check + cross-user-collapses-to-not-found semantics per [contracts/createBudget.md](./contracts/createBudget.md) and the spec's edge cases. **Strategy**: vitest-mock `@/lib/prisma` and assert call shapes. Test cases: (a) `createBudgetForUser` pre-checks uniqueness via `findFirst({ where: { userId, categoryId, currency, period, archivedAt: null } })`; if non-null, throws `BudgetExistsError`; (b) `createBudgetForUser` proceeds to `create` when pre-check returns null; (c) `createBudgetForUser` catches Prisma `P2002` (unique violation) and re-throws as `BudgetExistsError` (race-condition guard); (d) `getBudgetForUser(userId, id)` calls `findFirst({ where: { id, userId }, include: { category: true } })`; cross-user attempt yields null; (e) `setArchivedAtForUser` uses `updateMany({ where: { id, userId }, data: { archivedAt: value } })` (returns null on count=0, indicating cross-user attempt); (f) `listBudgetsForUser` with `includeArchived: false` filters `archivedAt: null`. Constitution Principle IV.

### Shared widget primitive

- [x] T022 Create `app/(shell)/dashboard/budgets/_components/progress-bar.tsx`: accessible server component. Props: `{ value: number; max?: number; status: "under" | "near" | "over"; className?: string }` (default `max=1.0`). Renders a `<div role="progressbar" aria-valuenow={Math.min(value, max) * 100} aria-valuemax={100} aria-valuemin={0} aria-label="Budget progress">` containing a colored fill bar. Tailwind: status `"under"` → `bg-foreground/30` (neutral); `"near"` → `bg-amber-500` (warning); `"over"` → `bg-money-negative` (negative — same token as `<Money>` uses for negative amounts). Status-secondary signal (FR-025 non-color rule + FR-030 keyboard rule): render a small inline icon adjacent to the bar — under: no icon, near: ⚠ (AlertTriangle from lucide), over: ⛔ (Ban). The visual fill caps at 100% (`Math.min(value, max)`) but the `aria-valuenow` reflects the true percentage if you choose to surface > 100% in screen readers (implementer's call; document the choice inline). Reused by both `/dashboard/budgets` rows AND the dashboard `<BudgetsWidget>` rows. (No dependencies; parallelizable with T006–T021.)

**Checkpoint**: `pnpm typecheck` + `pnpm lint` + `pnpm test` pass. New unit suite (T013–T017 + T021 = 6 new test files, ~40+ new cases) green. `grep -rn "prisma\\." lib/budgets/` returns matches ONLY in `lib/budgets/queries.ts` (the canonical owner). `grep -rn "prisma\\.transaction\\." lib/ app/` returns matches ONLY in `lib/transactions/queries.ts` (and test mocks). `pnpm exec prisma migrate status --schema=db/schema.prisma` reports "up to date" and the partial unique index `Budget_userId_categoryId_currency_period_active_unique` exists in the DB. Foundation is ready.

---

## Phase 3: User Story 1 — Set a monthly spending target for a category (Priority: P1) 🎯 MVP-START

**Goal**: A user with at least one EXPENSE category opens `/dashboard/budgets`, activates "Add budget", picks Groceries / $400 / USD / MONTHLY, submits, and immediately sees the new budget row with budgeted amount + actuals + remaining + progress bar.

**Independent Test**: From a user with EXPENSE categories seeded and some EXPENSE transactions this month, navigate to `/dashboard/budgets`. Activate "Add budget". Fill the form. Submit. Assert the sheet closes and the new row appears with current actuals computed correctly (byte-for-byte against `/dashboard/transactions` filtered to Groceries + this month + EXPENSE + USD).

### Implementation for User Story 1

- [x] T023 [US1] Create `app/(shell)/dashboard/budgets/_components/budget-form.tsx`: client component, props `{ mode: "create" | "edit"; budget?: BudgetWithActualsDTO; expenseCategories: CategoryDTO[]; defaultCurrency: string | null; currencies: string[]; onSuccess: () => void }`. For US1, implement the `"create"` branch fully; stub `"edit"` with `// TODO US3` comment. Fields (create): category picker filtered to EXPENSE (use existing `<CategoryPicker kind="EXPENSE">` from feature 006, verified in research.md R6); amount (`<Input type="text" inputMode="decimal">`); currency (`<Select>` populated from `currencies` prop; default to `defaultCurrency` prop); period (`<Select>` with MONTHLY / YEARLY; default MONTHLY); startDate (`<Input type="date">`; default to the 1st of the current UTC month — compute via `lib/budgets/periods.ts`); endDate (`<Input type="date">` optional). Wire to `createBudget` server action via `useActionState`. Display Zod field errors per field. Display action-level errors (`budget_exists`, `category_wrong_kind`) as a banner above the form. **On success → call `onSuccess()`**.
- [x] T024 [US1] Create `app/(shell)/dashboard/budgets/_components/budget-form-sheet.tsx`: client component wrapping shadcn `<Sheet>`. Props: `{ open, onOpenChange, mode, budget?, expenseCategories, defaultCurrency, currencies, onSuccess }`. Renders `<BudgetForm>` inside `<SheetContent>` with title per mode ("Add budget" / "Edit budget"). Pattern mirrors `<CategoryFormSheet>` from feature 006 / `<TransactionFormSheet>` from feature 007.
- [x] T025 [US1] Create `app/(shell)/dashboard/budgets/_components/budget-row.tsx`: server component. Props: `{ budget: BudgetWithActualsDTO; onEdit: (b) => void; onArchive: (b) => void; isArchivedCategory: boolean }`. Renders one budget as a card row: category name (with " (archived category)" suffix when `isArchivedCategory`); period label ("Monthly" / "Yearly"); budgeted amount via `<Money currency={budget.currency} amount={budget.amount} prominent />`; actuals via `<Money currency={budget.currency} amount={budget.actuals} />`; remaining via `<Money currency={budget.currency} amount={budget.remaining} />` (negative-color when over-budget — `<Money>` handles sign); progress bar via `<ProgressBar value={Number(budget.progressRatio)} status={budget.status} />`. Click to edit (delegates to onEdit prop); trailing button for archive (delegates to onArchive prop). NO inline `formatAmount` (FR-024). NO arithmetic in the row — everything pre-computed by `lib/budgets/aggregations.ts` (FR-023).
- [x] T026 [US1] Create `app/(shell)/dashboard/budgets/_components/budgets-list.tsx`: client component, props `{ initialBudgets: BudgetWithActualsDTO[]; expenseCategories: CategoryDTO[]; defaultCurrency: string | null; currencies: string[]; categoriesById: Record<string, CategoryDTO> }`. State: `budgets`, `sheetOpen`, `sheetMode: "create" | "edit"`, `editingBudget`, `showArchived: false`, `archiveTarget` (US3 will use). Render: header strip with `<h1>Budgets</h1>` + "+ Add budget" button (US1) + "Show archived" toggle (US3). The list renders an array of `<BudgetRow>` (or empty-state per US5 below). On `<BudgetRow>` edit click → set sheetMode="edit" + editingBudget + open sheet (US3 wires the edit form). For US1, the create flow: clicking "+ Add budget" opens the sheet in "create" mode. On `<BudgetForm>` success → close sheet + refresh the list (call `router.refresh()` or refetch via `listBudgets`).
- [x] T027 [US1] Replace `app/(shell)/dashboard/budgets/page.tsx`: server component. Imports `auth`, `listBudgets`, `listCategoriesForUser` (or via the categories action), `listAccountsForUser` (for currencies fallback), `computeDefaultCurrencyForBudget`. Flow: (1) `await auth()`; redirect on null; (2) `userId = session.user.id`; (3) call in parallel via `Promise.all`: `listBudgets({ includeArchived: false })`, `listCategoriesForUser(userId, { includeArchived: false })` (filter to EXPENSE in the page), `listAccountsForUser(userId, { includeArchived: false })`, `computeDefaultCurrencyForBudget(userId)`; (4) on errors throw (caught by shell-level error.tsx); (5) build derived data: `expenseCategories = categories.filter(c => c.kind === "EXPENSE")`, `currencies = Array.from(new Set(accounts.map(a => a.currency))).sort()`, `categoriesById = Object.fromEntries(categories.map(c => [c.id, c]))`; (6) **branch on counts** per US1 + US5: if `expenseCategories.length === 0` → render the special no-EXPENSE-categories empty state (US5 ac.4); else if `budgets.length === 0` → render the no-budgets empty state with "Create your first budget" CTA (US5 main); else render `<BudgetsList>` with the props. Page-level loading inherited from `(shell)/loading.tsx`.
- [x] T028 [US1] Create `tests/e2e/budgets.spec.ts` with the US1 e2e block: `test.beforeAll` truncates `Budget` then `Transaction` then `Category` then `Account` then `User` (or cascade via deleting User). `test.describe("Budgets US1 — create a monthly spending target")`. (a) Sign up fresh user A. Seed (via direct Prisma per Phase 4/5/7 of feature 008): one USD account (Chase Checking, $5,000), use the default-seeded EXPENSE categories (Groceries should be there from feature 006's seed), and seed 2 EXPENSE transactions in Groceries for the current calendar month (e.g., $30 + $50 = $80 total). Navigate to `/dashboard/budgets`. (b) Assert the no-budgets empty state is visible with "Create your first budget" CTA (US5 partial — full e2e in T040). (c) Click the CTA → assert the sheet opens. (d) Fill the form: category = Groceries; amount = `400`; currency = USD (should be defaulted via Q2 logic); period = MONTHLY; startDate = first of current month (defaulted); endDate = empty. (e) Submit. Assert the sheet closes. (f) Assert the new row appears in the list: category "Groceries", budgeted `$400.00`, actuals `$80.00` (= sum of the 2 seeded transactions), remaining `$320.00`, progress bar at 20%, status "under". (g) Assert byte-for-byte against `/dashboard/transactions` filtered to Groceries + this month + USD + EXPENSE (SC-002 setup). (h) Attempt to create a SECOND USD-MONTHLY-Groceries budget → assert the form rejects with `budget_exists` error (FR-002 enforcement at app + schema layer per SC-006). (i) Attempt to create a budget against an INCOME category (e.g., Salary) → assert the rejection with `category_wrong_kind` (FR-003). (j) **Keyboard-only path (SC-016)**: from a fresh user with the same seeded EXPENSE categories but no existing budgets, navigate to `/dashboard/budgets`. Without using the mouse: press Tab repeatedly until focus lands on the "Create your first budget" CTA (or "Add budget" — whichever is rendered); press Enter to open the sheet; press Tab through the form fields to fill them (category picker via keyboard selection, amount via typing, currency / period via keyboard select, startDate via typed date string); press Enter (or Tab to the submit button + Enter) to submit; assert the sheet closes and the new row appears. The test MUST NOT use `page.click(...)` or `locator.click()` at any step after the initial navigation — only `page.keyboard.press(...)` / `page.keyboard.type(...)` / `page.locator(...).press(...)`.

**Checkpoint**: US1 fully functional. The create flow works end-to-end; budget appears with computed actuals; uniqueness enforced; EXPENSE-only enforced.

---

## Phase 4: User Story 2 — See actuals vs. budget at a glance (Priority: P1)

**Goal**: A user with budgets configured opens `/dashboard/budgets` mid-period and sees for each budget the budgeted amount, actuals so far, remaining, and a progress bar with sign-aware status (under / near / over).

**Independent Test**: From a user with at least one MONTHLY budget AND at least one EXPENSE transaction in that category this calendar month, navigate to `/dashboard/budgets`. Assert each row's actuals + remaining + progress visualizes correctly. The actuals MUST equal the sum of non-archived EXPENSE transactions in that category + currency + this month (byte-for-byte).

### Implementation for User Story 2

- [x] T029 [US2] Add US2 describe block to `tests/e2e/budgets.spec.ts`. Continuing from the US1 setup (user A has Chase Checking + Groceries-USD-MONTHLY-$400 budget + $80 actuals): (a) seed a SECOND budget — Restaurants USD MONTHLY $200 — via direct Prisma. Seed Restaurants EXPENSE transactions totaling $180 (90% of $200 → "near" status). Reload `/dashboard/budgets`. (b) Assert two rows render. The Restaurants row at 90% MUST display the "near" visual treatment: amber progress fill + warning icon + label. The non-color identifier (icon) MUST be present (FR-025, FR-030). The Groceries row at 20% MUST display "under" treatment. (c) Seed a THIRD budget — Health USD YEARLY $1,200. Seed Health EXPENSE for the current year totaling $1,300 (108% → "over" status). Reload. (d) Assert the Health row shows: actuals `$1,300.00` (or however `<Money>` formats it), remaining `-$100.00` (negative, sign-styled), progress bar at 100% fill (visually capped per T022), "over" identifier (icon + label). (e) **Multi-currency assertion (FR-019, SC-013)**: seed one EUR EXPENSE in Groceries for the current month (€50). Confirm the USD Groceries budget's actuals are UNCHANGED ($80, NOT $130) — no FX mixing. Now create a EUR-MONTHLY-Groceries budget €200. Reload. Assert the EUR Groceries row shows actuals `€50.00`, remaining `€150.00`, 25% progress. The USD Groceries row remains at $80. Two distinct rows, no cross-currency aggregation. (f) **Byte-for-byte assertion (SC-002)**: navigate to `/dashboard/transactions`, filter to Groceries + current month + EXPENSE + USD, sum the rendered amounts manually (test helper). Navigate back to `/dashboard/budgets`. Assert the USD Groceries actuals equal the captured sum byte-for-byte. (g) **Reload-after-new-expense assertion**: record one more $20 USD Groceries EXPENSE (via Prisma). Reload `/dashboard/budgets`. Assert the USD Groceries actuals are now `$100.00` (was $80, +$20 new). Remaining is `$300.00`. Progress bar at 25%.

**Checkpoint**: US1 + US2 cover the two-thirds P1 set (create + read). The user sees actuals computed against real transactions byte-for-byte; multi-currency separation enforced; visual status treatment works.

---

## Phase 5: User Story 3 — Edit or archive a budget (Priority: P1)

**Goal**: A user can change the amount / startDate / endDate of an existing budget OR archive/unarchive it. The list updates immediately. categoryId / currency / period are read-only on edit.

**Independent Test**: With a user who has at least one budget, click an existing budget row. Edit sheet opens pre-populated. Change the amount from $400 to $500, save. Row updates; remaining recomputed. Reopen, archive. Row disappears. Toggle "Show archived". Row reappears with badge. Reopen, unarchive. Row returns.

### Implementation for User Story 3

- [x] T030 [US3] Extend `app/(shell)/dashboard/budgets/_components/budget-form.tsx`: implement the `"edit"` branch. Pre-populate from the `budget` prop. **READ-ONLY fields** (per FR-005-from-US3-ac.5): category, currency, period — render these as disabled `<Input>` or as labeled static text (NOT a form input). Include an inline notice: "Category, currency, and period cannot be changed. To switch to a different category / currency / period, archive this budget and create a new one." **EDITABLE fields**: amount, startDate, endDate. Bind to `updateBudget` server action via `useActionState`. Reuses the same `<BudgetFormSheet>` from T024.
- [x] T031 [US3] Create `app/(shell)/dashboard/budgets/_components/archive-confirm-dialog.tsx`: client component, props `{ budget: BudgetWithActualsDTO; categoryName: string; open; onOpenChange; onArchived: () => void }`. Renders shadcn `<AlertDialog>`. Copy: "Archive this budget? You can unarchive it later. Your transactions in {category} are unchanged." On Archive: call `archiveBudget` server action via `useTransition`. On success: `onArchived()` then close. Pattern mirrors `<ArchiveConfirmDialog>` from feature 007.
- [x] T032 [US3] Update `app/(shell)/dashboard/budgets/_components/budgets-list.tsx`: wire row edit click → opens `<BudgetFormSheet>` in "edit" mode with the clicked budget; wire row archive button → opens `<ArchiveConfirmDialog>`. Mount the dialog at the bottom of the component. After archive success → close dialog + refresh list (`router.refresh()`). Add the "Show archived" toggle (default off). When toggled on: refetch via `listBudgets({ includeArchived: true })`; render archived rows with a `<Badge variant="secondary">Archived</Badge>` and an "Unarchive" button instead of "Archive". The unarchive button calls `unarchiveBudget` server action.
- [x] T033 [US3] Add US3 e2e block to `tests/e2e/budgets.spec.ts`. (a) From the user with budgets from US1/US2, click the Groceries USD-MONTHLY $400 row → assert edit sheet opens; assert category/currency/period are NOT editable (disabled or rendered as static text); assert the read-only notice text is visible. (b) Change amount from `400` to `500`, save. Assert the row updates: budgeted `$500.00`, remaining recomputed (= $500 - $100 actuals from US2 = `$400.00`), progress bar at 20% (= 100/500). (c) Click the Groceries row → click Archive in the trailing button → confirm in dialog. Assert the row disappears from the default list. Assert the related Groceries transactions are UNCHANGED (navigate to `/dashboard/transactions`, count the Groceries rows for this month). (d) Toggle "Show archived" ON. Assert the archived Groceries budget reappears with the `Archived` badge + "Unarchive" trailing button. (e) Click Unarchive → assert the row returns to the default list (after toggling "Show archived" OFF, it's visible in the default view). (f) **Concurrent uniqueness race (SC-006)**: simulate two near-simultaneous creates for the same `(userId, categoryId, currency, period)` tuple via two parallel form submissions OR direct action calls. Assert one succeeds + one fails with `budget_exists`. (May be brittle in Playwright; if so, document as a unit-test-equivalent assertion via T021's queries test.) (g) **Archived-category label (SC-017, Clarification Q3)**: ensure the user still has an active USD-MONTHLY Restaurants budget from US2. Archive the Restaurants Category itself (via direct Prisma `prisma.category.update({ where: { id: restaurantsId }, data: { archivedAt: new Date() } })` — NOT via the budget archive flow). Reload `/dashboard/budgets`. Assert the Restaurants budget row STILL renders in the default (non-archived) list view (the budget itself is not archived per Q3 — only the category is). Assert the row's category-name cell shows the "(archived category)" suffix text (matching the `<BudgetRow>` rendering rule from T025). Assert the actuals computation still works: the Restaurants actuals value is unchanged from the pre-archive state (transactions whose `categoryId` references the now-archived Restaurants are still summed per FR-010). Unarchive the Restaurants category afterward to restore the clean state for downstream tests.

**Checkpoint**: All three P1 stories complete. Full CRUD on `/dashboard/budgets`. The page is shippable as an MVP slice.

---

## Phase 6: User Story 4 — See budgets at a glance on the dashboard (Priority: P2)

**Goal**: A new "Budgets" widget appears on `/dashboard` alongside the existing 3 widgets from feature 008. Shows up to 5 active budgets sorted by status priority (over → near → under) with progress bars. Empty state when no budgets exist.

**Independent Test**: From a user with ≥ 2 budgets in mixed states (one under, one near or over), navigate to `/dashboard`. Assert the new Budgets widget renders alongside Net Worth / Cash Flow / Recent Transactions. Assert sort order matches priority (over → near → under). "See all" link routes to `/dashboard/budgets`. Empty-state path: archive all budgets, reload, assert empty state with CTA.

### Implementation for User Story 4

- [x] T034 [US4] Create `app/(shell)/dashboard/_components/budgets-widget.tsx`: async server component. Props: `{ userId: string }`. Implementation: call `listBudgets({ includeArchived: false })` (returns `BudgetWithActualsDTO[]`); slice to first 5 after the priority sort (which already happens inside `lib/budgets/actions.ts` per T019). Render inside `<WidgetCard title="Budgets">`: if `budgets.length === 0` → `<EmptyCell message="No budgets yet" />` PLUS a `<Link href="/dashboard/budgets">Set up your first budget →</Link>` (FR-029 — empty state has CTA, NOT a page-takeover); else render up to 5 budget rows in a compact layout (category name + tiny progress bar + small "$X / $Y" labels via `<Money>`). At the bottom, a "See all" link → `/dashboard/budgets` (when there are > 5 budgets). Server component — no `"use client"`.
- [x] T035 [US4] Modify `app/(shell)/dashboard/page.tsx`: add `<WidgetErrorBoundary title="Budgets"><BudgetsWidget userId={userId} /></WidgetErrorBoundary>` to the existing grid as a 4th sibling alongside Net Worth, This-month cash flow, Recent transactions. Order per FR-002 of feature 008 + FR-027 of this feature: CTA → Net worth → This-month cash flow → Recent transactions → Budgets (the new one). The existing 3 widgets MUST remain unchanged. (Depends on T034. Same file as feature-008's T013/T016/T019/T022 modifications.)
- [x] T036 [US4] Add US4 describe block to `tests/e2e/budgets.spec.ts`. (a) From a user with budgets in mixed states (an over-budget Health YEARLY, a near-budget Restaurants MONTHLY 90%, an under-budget Groceries MONTHLY 25% — seed appropriately), navigate to `/dashboard`. Assert the Budgets widget renders alongside the other 3. (b) Assert the rendered rows are in priority order: Health (over) first, Restaurants (near) second, Groceries (under) third. (c) Click anywhere on the Budgets widget (or the "See all" link) → assert navigation to `/dashboard/budgets`. (d) **Empty-state assertion**: archive all budgets via direct Prisma. Reload `/dashboard`. Assert the Budgets widget shows "No budgets yet" + "Set up your first budget →" CTA. The OTHER 3 widgets MUST still render (FR-029 — widget empty state is NOT a page takeover; SC-018). (e) **SC-018 explicit**: re-run the feature-008 byte-for-byte assertions on Net Worth + Cash Flow + Recent Transactions widgets to confirm they render IDENTICALLY to before this feature was added. (Use the same helper-pattern feature 008 used.)

**Checkpoint**: The dashboard now answers "am I on track?" at a glance without leaving the home screen. Existing feature-008 widgets unchanged.

---

## Phase 7: User Story 5 — First-time user / no-budgets state (Priority: P2)

**Goal**: A user with zero budgets sees a clear empty-state on `/dashboard/budgets` with helpful copy + CTA. The special "no EXPENSE categories" variant is also handled.

**Independent Test**: Sign up a fresh user. Navigate to `/dashboard/budgets`. Assert the empty state renders with heading + CTA "Create your first budget". Special path: archive all EXPENSE categories first; the empty state changes to "You need at least one EXPENSE category to create a budget" + CTA to `/dashboard/categories` (CTA to budgets is disabled).

### Implementation for User Story 5

- [x] T037 [US5] Add US5 describe block to `tests/e2e/budgets.spec.ts`. (a) Sign up fresh user B (or a fresh context). Navigate to `/dashboard/budgets`. Assert the no-budgets empty state is visible — heading "Set spending targets for your expense categories" or similar; primary CTA "Create your first budget"; no monetary numbers anywhere; no progress bars. (b) Click the CTA → assert the create sheet opens (US1 sheet from T024). (c) Close the sheet without submitting. (d) **Special variant — no EXPENSE categories**: archive every EXPENSE category via direct Prisma (the feature-006 default seed has 7 EXPENSE categories + 2 child EXPENSE categories; archive all 9). Reload `/dashboard/budgets`. Assert the SPECIAL empty state surfaces: "You need at least one EXPENSE category to create a budget. Go to Categories to add one." with a CTA to `/dashboard/categories`. The "Create your first budget" CTA MUST be disabled or absent (US5 ac.4, FR-021). (e) **Cross-user isolation (SC-005)**: open a fresh browser context, sign up user C, navigate to `/dashboard/budgets`. Assert empty state. Assert NO budget data leaks from user A or user B. Assert no `<Money>` element rendered (would catch leaked budget amounts).

**Checkpoint**: All 5 user stories now have e2e coverage. The first-time funnel is verified clean (no broken-looking blank pages).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: SC-010 byte-for-byte create→record→reflect assertion, money-reviewer audit greps, type/lint/format gates, full Playwright suite, and the manual quickstart walkthrough.

- [x] T038 Add the **constitution-mandated create→record→see-actuals-update describe block** to `tests/e2e/budgets.spec.ts` covering SC-010 explicitly. This is the constitution Principle IV E2E gate for this feature. (a) Sign up fresh user D. Create one account + create a $400 USD MONTHLY Groceries budget via the UI (US1 flow). Assert actuals = `$0.00`, remaining = `$400.00`. (b) Navigate to `/dashboard/transactions`. Record one Groceries USD EXPENSE for $50 via the UI. (c) Navigate back to `/dashboard/budgets`. Assert the Groceries budget row now shows actuals = `$50.00` byte-for-byte, remaining = `$350.00`, progress at 12.5%, status "under". (d) Record another Groceries EXPENSE for $300 via the UI. Reload `/dashboard/budgets`. Assert actuals = `$350.00`, remaining = `$50.00`, progress at 87.5%, status "near". (e) Record one more Groceries EXPENSE for $80 (pushing total to $430, over the $400 budget). Reload. Assert actuals = `$430.00`, remaining = `-$30.00` (negative), progress visual capped at 100%, status "over" with the over-budget identifier (icon + color + label per FR-025 / SC-011).
- [x] T039 Run the **money-reviewer audit greps** documented in [plan.md §Money & Currency Notes](./plan.md). Each MUST return the expected output:
  - `grep -rn "prisma\\.transaction" lib/ app/ --include="*.ts" --include="*.tsx"` → matches ONLY in `lib/transactions/queries.ts` (and `tests/unit/transactions-queries.test.ts` mock from feature 007 — acceptable).
  - `grep -rn "from \"@/lib/prisma\"" lib/budgets/` → returns ONLY `lib/budgets/queries.ts` (the canonical owner of `prisma.budget.*`). NO matches in `lib/budgets/aggregations.ts`, `periods.ts`, `defaults.ts`, `serialize.ts`, `schemas.ts`, `errors.ts`, `index.ts`.
  - `grep -rEn '\\.plus\\(|\\.minus\\(|\\.times\\(|\\.div\\(|new Decimal\\(|new Money\\(' lib/budgets/ 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` → only `new Money(...)` boundary lifts AND `.plus/.minus/.times/.comparedTo` on Money instances in `lib/budgets/aggregations.ts`. NO raw `Decimal.plus()`, NO `new Decimal(...)`, NO `.div(...)` on amounts used for threshold comparison (the status check MUST use `.comparedTo` per R12, NOT `.div`).
  - `grep -rn "formatAmount(" 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` → ZERO matches (every monetary display via `<Money>`, FR-024).
  - `grep -rEn '<Money[ /\\n]' 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` → at least 9 matches (budgeted + actuals + remaining per row × 3 rows minimum on the page; plus widget rows). Use the multiline-tolerant pattern from feature-008 T026's refinement.
  - `grep -rn '^"use client"' 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` (start-of-line anchored) → ONLY `budgets-list.tsx`, `budget-form.tsx`, `budget-form-sheet.tsx`, `archive-confirm-dialog.tsx`. `budgets-widget.tsx`, `budget-row.tsx`, `progress-bar.tsx` are server components. **FR-032 verification**: this grep also verifies the no-JS-initial-render invariant by construction — the page's server-component shell (`page.tsx`) and all data widgets render to HTML without JavaScript; only the interactive form / sheet / dialog / list-state require hydration (and gracefully fail open for keyboard-disabled flows — the underlying server-rendered budget rows + actuals are still readable). The page server component (`app/(shell)/dashboard/budgets/page.tsx`) MUST also be a server component (no top-of-file `"use client"` directive); confirm via `grep -rn '^"use client"' 'app/(shell)/dashboard/budgets/page.tsx'` → ZERO matches.
  - `grep -rEn "(prisma|@/lib/prisma)" lib/budgets/aggregations.ts lib/budgets/periods.ts lib/budgets/defaults.ts lib/budgets/serialize.ts lib/budgets/schemas.ts lib/budgets/errors.ts` → ZERO matches (the pure-helper invariant).
  - `grep -rn "tabular-nums" components/money/money.tsx` → ≥ 1 match. **FR-026 verification**: the `<Money>` component is the sole monetary-display primitive on `/dashboard/budgets` and the dashboard widget (verified by the `formatAmount` + `<Money>` greps above); since `<Money>` itself unconditionally applies `tabular-nums`, every monetary value rendered on this feature inherits the tabular-numeral alignment by construction. No per-widget audit grep needed — this single check on the shared primitive covers the entire feature surface.
- [x] T040 Run **`pnpm typecheck`** + **`pnpm lint`** + **`pnpm format --check`** (or `pnpm format` if drift detected). ZERO new errors expected. The pre-existing `scripts/seed-demo-user.ts` 2 lint errors are still allowed (carried over from chore PR #14; not introduced by this feature). Address any new warnings introduced by this feature's diff.
- [x] T041 Run **`pnpm test`** (Vitest unit suite). Expected: all existing tests from features 001–008 still green (SC-015); the 6 new test files from T013–T017 + T021 green; total unit-test count is the prior baseline + the new cases (~40+ new cases expected).
- [x] T042 Run **`pnpm test:e2e`** (full Playwright suite). Expected: all existing e2e specs from features 002 / 003 / 004 / 006 / 007 / 008 still green (SC-015 + SC-018 explicit); the new `tests/e2e/budgets.spec.ts` covering US1+US2+US3+US4+US5 + SC-010 + SC-011 green. Use production build if Turbopack panics (feature 008 pattern). If the pre-existing flakiness from feature 008's "EUR picker" returns, address by switching the affected setup to direct Prisma (same workaround feature 008 used).
- [x] T043 **Quickstart walkthrough**: per [quickstart.md](./quickstart.md), execute end-to-end. Run `pnpm seed-demo-user` (or its budgets-extension if T043 extends it — implementer's call) against a fresh local database. Start the dev server (`pnpm dev` or `pnpm build && pnpm start`). Manually navigate to `/dashboard/budgets`; create a budget; record an expense; reload; verify actuals updated. Navigate to `/dashboard`; verify the Budgets widget renders. **SC-001 perceived-load check**: with the server warmed, reload `/dashboard/budgets` and observe perceived load time. MUST be visible within ~2 seconds end-to-end on the demo-seed dataset; if it consistently exceeds, file a follow-up to revisit the actuals-batching strategy (R3). Failed perceived-load is NOT a release blocker for v1.
- [x] T044 **money-reviewer subagent invocation** (post-T043, outside the tasks list per workflow convention — listed here as the explicit PR-time gate per SC-008 and constitution Principle I). Hand off the diff to the money-reviewer agent. **Verdict: PASS** (2026-05-26). All 12 invariants verified — I.1 (Decimal storage), I.2 (currency adjacent), I.3 (no implicit FX), I.4 (arithmetic via lib/money), I.5 (<Money> single primitive), I.6 (prisma.transaction confined to lib/transactions/queries.ts), I.7 (prisma.budget confined to lib/budgets/queries.ts), I.8 (data scoping), I.9 (uniqueness invariant — 3-layer enforcement), I.10 (EXPENSE-only at 3 layers), I.11 (TRANSFER excluded from actuals), I.12 (Decimal-precision-correct threshold via Money.comparedTo — no float division). Findings: none. Safe to merge.

**Checkpoint**: All success criteria satisfied. PR-ready. The money-reviewer audit (SC-008) is the final gate before merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001)**: No dependencies — runs first to establish a green baseline.
- **Phase 2 (Foundational, T002–T022)**: Depends on Setup completion. **BLOCKS** all user stories.
- **Phase 3 (US1, T023–T028)**: Depends on Foundational completion. The MVP-start: ships the create flow + page wiring + no-budgets + no-EXPENSE-categories empty-state code paths.
- **Phase 4 (US2, T029)**: Depends on US1 completion (extends the e2e spec; no new code needed since actuals computation already lands in Phase 2 + the renderer in T025).
- **Phase 5 (US3, T030–T033)**: Depends on US1 completion (extends `<BudgetForm>` with edit mode; same file as T023).
- **Phase 6 (US4, T034–T036)**: Depends on US3 completion (the widget reuses the `listBudgets` action and the dashboard widget grid pattern from feature 008).
- **Phase 7 (US5, T037)**: Depends on US4 completion (e2e exercises empty states that are already in place from T027/T034; this phase is just the test).
- **Phase 8 (Polish, T038–T044)**: Depends on all user stories complete.

### Within-Phase Dependencies

- **Phase 2 / Foundational**:
  - T002 → T003 (sequential; schema then migration).
  - T004 → T005 (sequential; same file `lib/transactions/queries.ts`).
  - T006, T007, T009, T010, T011, T013, T014, T015, T016, T017, T022 — parallelizable [P] after T002/T003 (different files, no inter-dependencies). T008 sequential after T007 (same file).
  - T012 depends on T010 (error types); sequential within schemas.ts setup.
  - T018 depends on T002, T003, T010, T011 (schema + errors + serialize).
  - T019 depends on T004, T005, T012, T018 (actions consume queries + schemas + transactions extensions).
  - T020 depends on T010, T011, T019 (barrel).
  - T021 depends on T018 (queries tests).
- **Phase 3 / US1**: T023 → T024 → T026 → T027 → T028 (form before sheet before list before page before e2e). T025 [P] parallelizable with T026 (different files).
- **Phase 4 / US2**: T029 single task; depends on T028's spec file existing.
- **Phase 5 / US3**: T030 [US3] modifies the form (same file as T023); T031 [P] new file; T032 modifies list (same file as T026); T033 e2e additions.
- **Phase 6 / US4**: T034 new widget file; T035 modifies page.tsx (same file as feature 008's modifications + the modification mode for US1 wasn't needed since T027 created the budgets page, not the dashboard page); T036 e2e.
- **Phase 7 / US5**: T037 single test task.
- **Phase 8 / Polish**: T038 e2e additions; T039–T044 sequential audits and verifications.

### Parallel Opportunities

- **Within Phase 2**: After T002/T003 sequence, the cluster T006 ‖ T007 ‖ T009 ‖ T010 ‖ T011 ‖ T013 ‖ T014 ‖ T015 ‖ T016 ‖ T017 ‖ T022 — eleven parallelizable [P] tasks. T008 sequences after T007 (same file). T004 → T005 sequential (same file). T018 → T019 → T020 sequential.
- **Across phases**: zero — user stories deliberately sequenced because they all touch the same files (`page.tsx` in budgets, `budget-form.tsx`, `budgets-list.tsx`, the e2e spec).
- **Within US phases**: limited — each US has a tight dependency chain.

---

## Parallel Example: Phase 2 (after schema)

```bash
# Sequential: T001 (setup) → T002 (schema) → T003 (migration) → T004 → T005 (queries.ts extensions, same file)
# Then parallel: T006, T007, T009, T010, T011, T013, T014, T015, T016, T017, T022
Task: "T006 Create lib/budgets/periods.ts"
Task: "T007 Create lib/budgets/aggregations.ts (attachActualsToBudgets + sortBudgetsByStatusAndProgress)"
Task: "T009 Create lib/budgets/defaults.ts"
Task: "T010 Create lib/budgets/errors.ts"
Task: "T011 Create lib/budgets/serialize.ts"
Task: "T013 Create tests/unit/budgets-periods.test.ts"
Task: "T014 Create tests/unit/budgets-aggregations.test.ts (8+ cases per SC-009)"
Task: "T015 Create tests/unit/budgets-defaults.test.ts"
Task: "T016 Create tests/unit/budgets-schemas.test.ts"
Task: "T017 Create tests/unit/budgets-serialize.test.ts"
Task: "T022 Create app/(shell)/dashboard/budgets/_components/progress-bar.tsx"
# Then sequential: T008 (computeStatus added to aggregations.ts — same file as T007)
Task: "T008 Add computeStatus to aggregations.ts"
# Then sequential: T012 → T018 → T019 → T020 → T021
Task: "T012 Create lib/budgets/schemas.ts"
Task: "T018 Create lib/budgets/queries.ts"
Task: "T019 Create lib/budgets/actions.ts"
Task: "T020 Create lib/budgets/index.ts (barrel)"
Task: "T021 Create tests/unit/budgets-queries.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T022) — CRITICAL: blocks all user stories.
3. Complete Phase 3: US1 (T023–T028) — Create-budget flow + page wiring + e2e.
4. **STOP and VALIDATE**: a user can create a budget and see it appear with computed actuals. The page is functional.
5. Deploy / demo. Half the spec's value (set spending targets) is live.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → users can create budgets. Deploy.
3. Add US2 → users see actuals + status visualisation. Deploy. **End of P1 reads.**
4. Add US3 → full CRUD (edit + archive). Deploy. **End of P1 — full MVP.**
5. Add US4 → dashboard widget integration. Deploy.
6. Add US5 → no-budgets empty-state e2e verified. Deploy.
7. Polish + audits + money-reviewer → merge.

### Constitution-mandated gates

- **Principle I (money math)**: T004, T005, T007, T008, T018, T019, T025, T034 are the money-path tasks. T014 unit-tests them (8+ cases per SC-009). T039's audit greps codify the invariants.
- **Principle II (type safety)**: T040 (`pnpm typecheck`).
- **Principle III (validate at boundaries)**: T012, T019 are the Zod boundaries. Internal helpers trust typed inputs.
- **Principle IV (test the money paths)**: T013–T017, T021 (unit suite); T028, T029, T033, T036, T037, T038 (E2E including SC-010 byte-for-byte create→record→reflect + SC-011 over-budget visual).
- **Principle V (spec-driven)**: spec → clarify → plan → tasks → implement order observed; single feature in flight (`009-budgets`).
- **money-reviewer subagent (SC-008)**: T044, invoked at PR time outside the tasks list (post-T043).

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps a task to its user story; Setup / Foundational / Polish have no story label.
- **The money-reviewer subagent MUST run after T043 (PR-time)**. Money-touch=true on this PR. The audit invariants codified in T039 are the audit's scope.
- **`prisma.transaction.*` MUST continue to appear ONLY in `lib/transactions/queries.ts`** after this feature ships (feature-007 invariant; T004 and T005 are add-only extensions to that file).
- **`prisma.budget.*` MUST appear ONLY in `lib/budgets/queries.ts`** (new invariant — the canonical owner of the new entity, mirroring how `lib/transactions/queries.ts` owns `prisma.transaction.*`).
- **`lib/budgets/aggregations.ts`, `periods.ts`, `defaults.ts`, `serialize.ts`, `schemas.ts`, `errors.ts` MUST NOT import `prisma`** (consume function exports only). T039 verifies via audit grep.
- **Status threshold comparison MUST be Decimal-precision-correct** via `actuals.comparedTo(budgetAmount.times("0.80"))`, NOT via `actuals / budgetAmount` float division. R12 codifies; T008 implements; T014 unit-tests the 80%-boundary edge case.
- **`<Money>` is the single monetary-display primitive** on `/dashboard/budgets` and the dashboard `<BudgetsWidget>`. NO inline `formatAmount(...)`, NO plain `<span>{amount}{currency}</span>`. T039 verifies.
- **Partial unique index is applied via raw SQL** in the generated migration (Prisma 7 limitation per R1 / R14). T003 hand-edits the migration after `migrate dev` generates the scaffold.
- **EXPENSE-only enforcement at 3 layers** (R6): UI picker filter (T023, T026), Zod schema (T012), action handler (T019).
- Page-level loading (FR-031) uses the existing `(shell)/loading.tsx` — no new `loading.tsx` introduced.
- Per-widget error boundary for the new BudgetsWidget uses the existing `<WidgetErrorBoundary>` from feature 008 — no new boundary component.
- Commit after each task or tight logical group (e.g., one commit for T006+T007+T008+T013+T014 as "lib/budgets/ pure helpers: periods + aggregations + unit tests").
- Avoid: vague tasks, same-file `[P]` conflicts (T004+T005, T023+T030, T026+T032 are deliberately sequential), regressing the feature-007 `prisma.transaction.*` invariant, regressing the feature-008 dashboard widgets (SC-018), float division on monetary values for status comparison.
