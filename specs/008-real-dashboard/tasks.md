---

description: "Task list for feature 007 — Real dashboard (roadmap number)"
---

# Tasks: Real Dashboard

**Input**: Design documents from `/specs/008-real-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Roadmap number**: feature 007 — Real dashboard. **Spec directory**: `specs/008-real-dashboard/` (sequential; spec slot 005 was consumed by the branded-UI polish chore in May 2026 and slot 007 by the transactions feature).

**Tests**: Per constitution Principle IV ("test the money paths"), this feature ships two new Vitest unit-test files (`dashboard-aggregations.test.ts`, `dashboard-dates.test.ts`) plus one new Playwright spec (`tests/e2e/dashboard.spec.ts`) covering US1+US2+US3+US4+US5 round-trip including the constitution-mandated "post-create dashboard reflects byte-for-byte" assertion (SC-012). All existing unit + e2e tests (features 001–007) MUST continue to pass (SC-013).

**Money-touch**: TRUE. The money-reviewer subagent runs on this PR. Per the plan's Constitution Check + Risk #2, the per-currency net-worth aggregation, the per-currency cash-flow rollup, and the `<Money>` single-rendering-primitive invariant are audit targets. The audit greps in T026 codify the invariants.

**Schema**: **No change.** This is a read-only feature. No Prisma migration. No `db push`. No new index proposed (feature 007 added the relevant `[userId, date]` index already).

**Dependencies**: **No new runtime deps.** No `react-error-boundary`. The per-widget `<WidgetErrorBoundary>` is a hand-rolled ~30-line `"use client"` class component.

**Organization**: Tasks grouped by user story. The MVP is **US1 + US5 together** (net worth widget + the no-accounts empty state — together they make the page useful for both new users and engaged users). US2 (recent activity) is the second P1 and the natural next slice. US3 (cash flow), US4 (quick-add CTA), and US5's e2e assertion follow as P2 work.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase (different files, no dependencies on incomplete tasks).
- **[Story]**: Maps task to user story (US1–US5). Setup / Foundational / Polish tasks have no story label.
- File paths are repo-relative under `/Users/rgederin/git/abacus/`.

## Path Conventions

Next.js 16 App Router layout (per [plan.md §Project Structure](./plan.md)). All paths repo-relative below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Sanity check the working tree before implementation. No new dependencies introduced.

- [x] T001 Confirm working tree is clean and on branch `008-real-dashboard`. Run `pnpm install --frozen-lockfile` to verify lockfile is consistent (no install drift expected — no new deps). Run `pnpm typecheck` + `pnpm lint` + `pnpm test` against the current baseline to capture a green "starting state" snapshot — every existing test from features 001–007 MUST pass before this feature begins, so any regression introduced later is unambiguously attributable to this feature's diff.

**Checkpoint**: Baseline green. No new code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `lib/transactions/queries.ts` extensions + new `lib/dashboard/*` module (dates, aggregations, barrel) + unit-test suite + shared widget primitives (card, empty-cell, error-boundary). Every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 is complete. The money-reviewer audit invariants and the per-widget error boundary primitive are seeded here.

### `lib/transactions/queries.ts` extensions (preserves feature-007 invariant)

- [x] T002 Extend `lib/transactions/queries.ts`: add `sumIncomeExpenseByCurrencyForUser(userId: string, dateFrom: Date, dateTo: Date)` per [contracts/lib-transactions-queries-extensions.md](./contracts/lib-transactions-queries-extensions.md). Implementation: `prisma.transaction.groupBy({ by: ["currency", "type"], where: { userId, type: { in: ["INCOME", "EXPENSE"] }, archivedAt: null, date: { gte: dateFrom, lt: dateTo } }, _sum: { amount: true } })`. Lift each `_sum.amount` (Prisma Decimal or null) to `Money` at the boundary — return shape `{ currency: string; type: "INCOME" | "EXPENSE"; sum: Money }[]`. **TRANSFER excluded at the SQL `where:` clause** (FR-010, FR-015). **`userId` is the first positional arg** ([research.md R8](./research.md)). **`prisma.transaction.*` MUST appear only in this file** ([research.md R9](./research.md), feature-007 invariant).
- [x] T003 Extend `listTransactionsForUser` in `lib/transactions/queries.ts` with an **optional `limit?: number` parameter** per [contracts/lib-transactions-queries-extensions.md](./contracts/lib-transactions-queries-extensions.md). When `limit` is set, apply `take: limit` to the `findMany`; when absent, behaviour is unchanged (backward-compatible — all existing call sites in feature-007 `actions.ts` / `page.tsx` keep working). The orderBy (`[{ date: "desc" }, { createdAt: "desc" }]`) is unchanged. Update the JSDoc to document the new parameter. (Depends on T002 only by file-collocation; same file edit so sequential.)

### `lib/dashboard/` — new module (no `prisma` import)

- [x] T004 [P] Create `lib/dashboard/dates.ts`: export `computeCurrentMonthRange(): { dateFrom: Date; dateTo: Date }` per [contracts/lib-dashboard-aggregations.md](./contracts/lib-dashboard-aggregations.md). Returns UTC midnight of the 1st of the current calendar month + UTC midnight of the 1st of the next calendar month (exclusive). Implementation: `const now = new Date(); const dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));`. **Recomputed at every call** (FR-016) — pure function, deterministic given system time. No browser locale, no timezone offset. (No dependencies; parallelizable with T005, T006, T009, T010, T011.)
- [x] T005 [P] Create `lib/dashboard/aggregations.ts`: export `computeNetWorthByCurrency(accounts: AccountDTO[]): PerCurrencyTotal[]` per [contracts/lib-dashboard-aggregations.md](./contracts/lib-dashboard-aggregations.md). Implementation: iterate `accounts`, lift `account.balance` to `new Money(...)`, sum per currency via `Money.plus(...)` from `lib/money/decimal.ts` into a `Map<string, Money>`. Convert to array of `{ currency: string; total: string }` (canonical decimal string via `.toString()`). Sort by descending absolute total then ISO 4217 alphabetical ascending (FR-007). Also export `buildCashFlowShape(rows: { currency: string; type: "INCOME" | "EXPENSE"; sum: Money }[]): PerCurrencyCashFlow[]` — group rows by currency, compute `net = income.plus(expense)` (EXPENSE is stored negative per feature-007 signed-amount convention, so `plus` is correct — no negation). Return `{ currency, income, expense, net }[]` with canonical decimal strings. Sort identically to net worth (descending absolute net then ISO 4217 ascending). Export `PerCurrencyTotal` and `PerCurrencyCashFlow` types. **MUST NOT import `prisma`** ([research.md R9](./research.md)). **All monetary arithmetic via `lib/money/`** (FR-027, constitution Principle I).
- [x] T006 [P] Create `lib/dashboard/index.ts`: server-only barrel re-exporting `computeNetWorthByCurrency`, `buildCashFlowShape`, `PerCurrencyTotal`, `PerCurrencyCashFlow`, `computeCurrentMonthRange`. Include `import "server-only"` at the top.

### Unit-test suite (Principle IV — MANDATORY)

- [x] T007 [P] Create `tests/unit/dashboard-aggregations.test.ts` per [plan.md §Testing Strategy](./plan.md). Cover `computeNetWorthByCurrency`: (a) empty `[]` → `[]`; (b) single account single currency → one row with correct total; (c) three accounts two currencies (USD $2,500 + USD $1,750 + EUR €1,180) → USD row first (largest absolute total), EUR row second; (d) negative balance in one currency (credit-card debt > cash) → row shows negative value, sort still works; (e) mixed signs within one currency summing positive → correct sum, no float drift; (f) tie-break: two currencies with equal absolute totals → ISO 4217 alphabetical ascending; (g) zero-balance currency → row renders with `total === "0"` (canonical zero), not filtered out. Cover `buildCashFlowShape`: (h) empty rows → `[]`; (i) single currency INCOME only → `{ currency, income: "5000.00", expense: "0", net: "5000.00" }`; (j) single currency EXPENSE only → `{ currency, income: "0", expense: "-1200.00", net: "-1200.00" }`; (k) single currency both → `{ income: "5000.00", expense: "-1200.00", net: "3800.00" }`; (l) multi-currency: USD + EUR each with both → two rows sorted by descending absolute net; (m) all-zero row → renders, not filtered. Use Vitest. Constitution Principle IV.
- [x] T008 [P] Create `tests/unit/dashboard-dates.test.ts`. Cover `computeCurrentMonthRange` with `vi.setSystemTime(...)` to pin the clock: (a) mid-month (2026-05-15 12:34 UTC) → `dateFrom = 2026-05-01T00:00:00.000Z`, `dateTo = 2026-06-01T00:00:00.000Z`; (b) first-of-month (2026-05-01 00:00:01 UTC) → same as (a); (c) last-of-month (2026-05-31 23:59:59 UTC) → same as (a); (d) December → January rollover (2026-12-15) → `dateFrom = 2026-12-01`, `dateTo = 2027-01-01`; (e) leap-year February (2028-02-15) → `dateFrom = 2028-02-01`, `dateTo = 2028-03-01`; (f) determinism — calling twice in a row with the same pinned clock returns equal `Date` instances (or at least equal `getTime()`). Constitution Principle IV.

### Shared widget primitives (used by US1/US2/US3 widgets)

- [x] T009 [P] Create `app/(shell)/dashboard/_components/widget-card.tsx`: server component visual shell. Props: `{ title: string; children: React.ReactNode; className?: string }`. Renders a `<Card>` (shadcn primitive already in repo) with `<CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{children}</CardContent>`. Pure presentational; no async, no state. Accessible label = the title (FR-032). Reused by all three data-driven widgets and by the error-boundary fallback UI. (No dependencies; parallelizable with T004–T011.)
- [x] T010 [P] Create `app/(shell)/dashboard/_components/empty-cell.tsx`: tiny server component inline "no data" cell rendered INSIDE a widget when its underlying data is empty but valid (e.g., "No income or expense this month yet" inside `<CashFlowWidget>`). Props: `{ message: string }`. Renders a single `<p>` with muted-foreground text styling. NOT to be confused with the page-level `<EmptyState>` from `components/shell/empty-state.tsx` (that one replaces the entire dashboard for the no-accounts case — US5). (No dependencies; parallelizable.)
- [x] T011 [P] Create `app/(shell)/dashboard/_components/widget-error-boundary.tsx`: `"use client"` class component implementing a per-widget React error boundary (FR-034, FR-035). ~30 lines. Implements `static getDerivedStateFromError(error)` → returns `{ hasError: true, message: error?.message ?? "Unknown error" }`. Implements `componentDidCatch(error, info)` → optional client log. Renders `this.props.children` when `!this.state.hasError`; renders the error fallback when `this.state.hasError`. Fallback UI: `<WidgetCard title={this.props.title}><EmptyCell message="Couldn't load — try again" /><Button onClick={() => { this.setState({ hasError: false }); router.refresh() }}>Try again</Button></WidgetCard>` — keyboard-focusable Retry button (FR-035) that resets local error state AND triggers `router.refresh()` to re-fetch the server-component subtree. Props: `{ title: string; children: React.ReactNode }`. **No `react-error-boundary` dep** — hand-rolled class component is sufficient. (No dependencies on T004–T010; parallelizable.)

**Checkpoint**: `pnpm typecheck` + `pnpm lint` + `pnpm test` pass. New unit suite (T007 + T008) green. `grep -rn "prisma\." lib/dashboard/` returns ZERO matches (the new dashboard module does NOT import prisma). `grep -rn "prisma\.transaction" lib/ app/` returns matches ONLY in `lib/transactions/queries.ts` (and `tests/unit/transactions-queries.test.ts` mock, acceptable — feature-007 invariant preserved). Foundation is ready; user-story work can begin.

---

## Phase 3: User Story 1 — See net worth at a glance (Priority: P1) 🎯 MVP-START

**Goal**: A user with at least one non-archived account opens `/dashboard` and sees a Net worth widget showing one row per currency they hold (largest absolute total first, ties broken by ISO 4217 ascending). Sum equals byte-for-byte the per-currency rollup the user would compute by summing `/dashboard/accounts`.

**Independent Test**: Sign up a fresh user → create three accounts (Chase Checking USD $2,500, Schwab Savings USD $1,750, Revolut EUR €1,180) → navigate to `/dashboard`. Assert a "Net worth" widget is visible with two rows: `USD $4,250.00` (first — larger absolute total) and `EUR €1,180.00` (second). Each row uses `<Money>` (tabular numerals, currency code visible). Archive the Old Bank USD $500 account → reload `/dashboard` → assert USD row remains $4,250.00 (archived excluded). Navigate to `/dashboard/accounts` → assert the same two currency rollups byte-for-byte.

### Implementation for User Story 1

- [x] T012 [US1] Create `app/(shell)/dashboard/_components/net-worth-widget.tsx`: async server component. Props: `{ userId: string }`. Implementation: `const result = await listAccounts({ includeArchived: false })`; if `"error" in result`, throw (the wrapping `<WidgetErrorBoundary>` catches it per FR-034); otherwise compute `const rows = computeNetWorthByCurrency(result.data.accounts)`. Render inside `<WidgetCard title="Net worth">`: if `rows.length === 0` — this branch is structurally unreachable for a user with ≥ 1 non-archived account (per FR-009 every account contributes its starting balance to its currency row), but render `<EmptyCell message="No balances yet" />` defensively. Otherwise map each row to `<div className="flex justify-between"><span>{row.currency}</span><Money currency={row.currency} amount={row.total} prominent align="right" /></div>`. Use `<Money>` from `components/money/money.tsx` (FR-005, FR-026). NO inline `formatAmount(...)` (FR-026). NO arithmetic outside what `computeNetWorthByCurrency` already did (FR-027). (Depends on T005, T006, T009.)
- [x] T013 [US1] Replace `app/(shell)/dashboard/page.tsx`: server component. New shape: (1) `const session = await auth()`; redirect to `/login` if null (defense-in-depth on middleware); (2) `const userId = session.user.id`; (3) `const accountsResult = await listAccounts({ includeArchived: false })`; on error throw (caught by shell-level `(shell)/error.tsx`); (4) **branch on account count**: if `accountsResult.data.accounts.length === 0`, render the no-accounts page-level EmptyState — reuse `<WelcomePanel />` from `components/shell/welcome-panel.tsx` (which already handles the no-accounts UX with the AbacusIllustration + "Add your first account" CTA pointing to `/dashboard/accounts`) — OR inline an equivalent `<EmptyState>` per [plan.md §No-accounts page-level empty state](./plan.md), implementer's choice. (5) Otherwise render the four-widget shell: a top-of-page `<AddTransactionCta />` placeholder (will be wired in T021 — for US1 phase, render a static `<a href="/dashboard/transactions">+ Add transaction</a>` styled as primary button or use a plain `<Button asChild><a>...</a></Button>` until T021 lands), followed by a `<div className="grid">` containing `<WidgetErrorBoundary title="Net worth"><NetWorthWidget userId={userId} /></WidgetErrorBoundary>`. Recent transactions + cash flow widget slots are NOT yet present (they land in US2 / US3 phases). Page-level loading is handled by the existing `(shell)/loading.tsx` (FR-033) — no new `loading.tsx`. (Depends on T011, T012.)
- [x] T014 [US1] Create `tests/e2e/dashboard.spec.ts` with the US1 e2e block: `test.beforeAll` truncates `Transaction` then `Category` then `Account` then `User` (or cascade via deleting User). `test.describe("Dashboard US1 — net worth at a glance")`. (a) Sign up fresh user A, create three accounts (Chase Checking USD $2,500, Schwab Savings USD $1,750, Revolut EUR €1,180). Navigate to `/dashboard`. Assert the Net worth widget renders with two visible rows. Assert the USD row reads `$4,250.00` and appears FIRST (largest absolute total). Assert the EUR row reads `€1,180.00` and appears SECOND. Each row's amount renders inside a `<Money>` (verify by inspecting the `tabular-nums` class). (b) Navigate to `/dashboard/accounts`. Sum the per-account balances by currency manually (or via a test helper). Assert `$4,250.00` (USD sum) and `€1,180.00` (EUR sum) match byte-for-byte against the dashboard's rendered values. (SC-005.) (c) Archive Old Bank: as part of setup OR via the accounts UI, archive one USD account. Reload `/dashboard`. Assert the USD row remains `$4,250.00` (archived row excluded — FR-009, `includeArchived: false`). (Depends on T013.)

**Checkpoint**: US1 fully functional. A user with accounts sees their per-currency net worth on `/dashboard` rendered through `<Money>` with no FX conversion. The byte-for-byte invariant against `/dashboard/accounts` holds. The no-accounts page-level empty state (US5 code path) is rendered too as a side effect of T013's branch, but its e2e assertion lands later in US5 phase.

---

## Phase 4: User Story 2 — See recent activity at a glance (Priority: P1)

**Goal**: A user with at least 15 non-archived transactions across ≥ 2 accounts and ≥ 1 transfer pair opens `/dashboard` and sees a "Recent transactions" widget showing exactly 10 rows in date desc / createdAt desc order — identical to the first 10 rows of `/dashboard/transactions`. Transfer legs count as 2 rows each. Archived excluded.

**Independent Test**: From a user with the seed-demo-user dataset (or hand-seeded 15+ non-archived transactions including 1 transfer pair), navigate to `/dashboard`. Assert the "Recent transactions" widget shows EXACTLY 10 rows. Assert the order matches the first 10 rows of the unfiltered `/dashboard/transactions` list (date desc, then createdAt desc). Assert transfer pair appears as 2 rows (not 1). Assert archived rows are absent. Click a row — assert navigation to `/dashboard/transactions` (top of list, no filter, no deep-link to the specific row). Click "See all" link — assert same destination.

### Implementation for User Story 2

- [x] T015 [US2] Create `app/(shell)/dashboard/_components/recent-transactions-widget.tsx`: async server component. Props: `{ userId: string }`. Implementation: `const transactions = await listTransactionsForUser(userId, { limit: 10 })` (uses the optional `limit` parameter added in T003). Render inside `<WidgetCard title="Recent transactions">`: if `transactions.length === 0` render `<EmptyCell message="No transactions yet — start by adding one" />` (FR-020); otherwise render a `<Table>` (shadcn) with rows. Each row is wrapped in a `<Link href="/dashboard/transactions" className="block">` (or `<a>`) — entire row clickable, keyboard-focusable (FR-021, FR-029, US2 acceptance scenario 6). Row cells: date (formatted), payee (with fallback `account.name → category.name → "Transfer"` for transfer legs matching the existing `/dashboard/transactions` list display), category name (or `—` for null), account name, amount via `<Money currency={tx.currency} amount={tx.amount} align="right" />` (FR-018). Transfer legs render as 2 separate rows (FR-018). Render a "See all" link at the bottom: `<Link href="/dashboard/transactions">See all transactions →</Link>` (FR-021). NO render cap to enforce in the widget itself — the `limit: 10` at the query is the hard cap (FR-017). Account / category lookups MAY require joining or pre-fetching account name / category name; the widget MAY also call `listAccounts(...)` + `listCategories(...)` and build lookup maps OR rely on `listTransactionsForUser` returning denormalized fields (the current `listTransactionsForUser` returns the raw `Transaction` row without joins — the implementer either adds the join via `include: { account: true, category: true }` to the existing `findMany` in `lib/transactions/queries.ts` IF it doesn't already join, OR fetches the lookup maps separately in the widget). Document the chosen approach inline. (Depends on T003, T009.)
- [x] T016 [US2] Modify `app/(shell)/dashboard/page.tsx`: add `<WidgetErrorBoundary title="Recent transactions"><RecentTransactionsWidget userId={userId} /></WidgetErrorBoundary>` to the grid started in T013 (alongside the existing `<NetWorthWidget>` boundary). Grid layout: 1-column on narrow viewports, 2-column on wider — implementer's call within Tailwind responsive utilities; consistent with the existing `(shell)` layout. (Depends on T013, T015. Same file as T013 so sequential within US2.)
- [x] T017 [US2] Add a US2 describe block to `tests/e2e/dashboard.spec.ts`. From a user with ≥ 15 non-archived transactions across ≥ 2 accounts including ≥ 1 transfer pair (seed via the existing `pnpm seed-demo-user` script if it produces this dataset, or seed inline via the existing test helpers), navigate to `/dashboard`. (a) Assert the "Recent transactions" widget shows EXACTLY 10 rows. (b) Navigate to `/dashboard/transactions` and capture the first 10 row identifiers (or amounts + payees + dates as a fingerprint); navigate back to `/dashboard`; assert the widget's 10 rows match byte-for-byte against the captured fingerprint (SC-007). (c) Verify a transfer pair appears as 2 rows: assert two rows with the same date / same notes / opposite-sign amounts both visible in the widget. (d) Verify archived exclusion: create or archive one transaction; reload; assert the archived row is absent from the widget. (e) Click any row; assert navigation to `/dashboard/transactions`. (f) Click the "See all" link; assert same destination. (g) Keyboard path: Tab to a row link; press Enter; assert navigation. (Depends on T016.)

**Checkpoint**: US1 + US2 cover the two P1 stories. The MVP is shippable — net worth + recent activity together deliver the "what is the state of my finances right now?" answer the dashboard exists to provide.

---

## Phase 5: User Story 3 — Track this-month cash flow (Priority: P2)

**Goal**: A user with INCOME / EXPENSE rows dated within the current UTC calendar month sees a "This month" widget showing three labelled lines per currency: income (positive sum), expense (negative sum or absolute with explicit minus), net (income − |expense|, signed). TRANSFER rows excluded. Empty state when no INCOME / EXPENSE rows this month.

**Independent Test**: From a user with: USD income $5,000 (Salary), USD expense -$1,200 (Groceries), EUR income €400 (Freelance), EUR expense -€80 (Coffee), and a $500 USD→USD transfer (Chase Checking → Schwab Savings) — all dated within the current calendar month — navigate to `/dashboard`. Assert the "This month" widget renders TWO currency blocks: USD ("Income $5,000.00 · Expense -$1,200.00 · Net $3,800.00") and EUR ("Income €400.00 · Expense -€80.00 · Net €320.00"). Assert the TRANSFER does NOT appear in either block. From a user with zero INCOME / EXPENSE this month (or only transfers), assert the widget shows "No income or expense this month yet" (FR-014).

### Implementation for User Story 3

- [x] T018 [US3] Create `app/(shell)/dashboard/_components/cash-flow-widget.tsx`: async server component. Props: `{ userId: string }`. Implementation: `const { dateFrom, dateTo } = computeCurrentMonthRange()`; `const rows = await sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)`; `const blocks = buildCashFlowShape(rows)`. Render inside `<WidgetCard title="This month">`: if `blocks.length === 0` render `<EmptyCell message="No income or expense this month yet" />` (FR-014); otherwise map each block to a per-currency sub-block with three labelled lines: "Income" + `<Money currency={block.currency} amount={block.income} align="right" />`; "Expense" + `<Money currency={block.currency} amount={block.expense} align="right" />`; "Net" + `<Money currency={block.currency} amount={block.net} align="right" />`. All three lines render via `<Money>` with the currency code visible (FR-012). NO inline `formatAmount`, NO arithmetic outside what `buildCashFlowShape` already did (FR-027). (Depends on T002, T004, T005, T006, T009.)
- [x] T019 [US3] Modify `app/(shell)/dashboard/page.tsx`: add `<WidgetErrorBoundary title="This month"><CashFlowWidget userId={userId} /></WidgetErrorBoundary>` to the grid. (Depends on T016, T018. Same file as T013/T016 so sequential within US3.)
- [x] T020 [US3] Add a US3 describe block to `tests/e2e/dashboard.spec.ts`. (a) Seed the documented USD/EUR transaction set + 1 TRANSFER above. Navigate to `/dashboard`. Assert the "This month" widget renders two currency blocks. Assert USD block: "Income" line shows `$5,000.00`, "Expense" line shows `-$1,200.00`, "Net" line shows `$3,800.00`. Assert EUR block: "Income" `€400.00`, "Expense" `-€80.00`, "Net" `€320.00`. Assert the TRANSFER does NOT appear (no `$500` line or block contribution). (b) Navigate to `/dashboard/transactions`; filter to the current month manually; sum by type per currency via the existing filter UI or a test helper; assert byte-for-byte match against the dashboard widget (SC-006). (c) Sign up a second user with zero transactions; navigate to `/dashboard` (after creating at least one account so the no-accounts state doesn't take over); assert the cash-flow widget shows "No income or expense this month yet" (FR-014). (d) For a user with only EXPENSE this month (no income), assert "Income $0.00 · Expense -$X.XX · Net -$X.XX" — the zero income line still renders (FR-012, US3 acceptance scenario 4). (Depends on T019.)

**Checkpoint**: US3 ships the per-currency-per-type aggregation. The TRANSFER-excluded invariant is verified end-to-end. The dashboard now answers "am I net positive or negative this month?" per currency.

---

## Phase 6: User Story 4 — Quick-add a transaction from the dashboard (Priority: P2)

**Goal**: The "Add transaction" CTA at the top of the dashboard is the visually dominant action. Activation (mouse or keyboard Enter) navigates to `/dashboard/transactions`. When the user has zero non-archived accounts, the CTA is disabled with helper text pointing to `/dashboard/accounts` (matching the pattern feature 007 uses on the transactions page per FR-024).

**Independent Test**: From a user with at least one non-archived account, navigate to `/dashboard`. Assert a primary "Add transaction" CTA is visible above the widget grid, styled as the dominant action. Activate it (click); assert navigation to `/dashboard/transactions`. Tab to the CTA from the page top; press Enter; assert same navigation (keyboard path, SC-014). With a user who has zero non-archived accounts (or whose every account is archived), navigate to `/dashboard`; assert the no-accounts page-level EmptyState renders INSTEAD of the four-widget layout (FR-003) — the CTA per FR-024 disabled-state path is structurally subsumed by the no-accounts empty state.

### Implementation for User Story 4

- [x] T021 [US4] Create `app/(shell)/dashboard/_components/add-transaction-cta.tsx`: server component. Props: `{ disabled?: boolean }` (the page server component computes `disabled = accountCount === 0`; for the current page-wiring shape, `disabled` is structurally always `false` because the no-accounts case takes a different render branch entirely per FR-003; the prop exists for future flexibility per [contracts/dashboard-page.md](./contracts/dashboard-page.md)). Renders `<Button asChild className="..."><Link href="/dashboard/transactions">+ Add transaction</Link></Button>` when not disabled — a primary-styled link. When `disabled === true`, renders a disabled button + helper text `<p className="text-muted-foreground">Add an account first — <Link href="/dashboard/accounts">go to accounts</Link></p>` — matches the feature-007 pattern. Keyboard-focusable, accessible label, focus ring follows project conventions (FR-022, FR-029). Has NO async dependency (FR-035 / FR-036). (Depends on T009 / T011 only by visual consistency; no actual dependency.)
- [x] T022 [US4] Modify `app/(shell)/dashboard/page.tsx`: replace the static `<a href="/dashboard/transactions">+ Add transaction</a>` placeholder (from T013) with `<AddTransactionCta />`. The CTA renders ABOVE the widget grid (FR-022), always-on for the has-accounts branch. The no-accounts branch (already in T013) continues to render the `<WelcomePanel />` / `<EmptyState>` page-level UI, NOT the CTA (FR-003 — INSTEAD OF, not in addition to). (Depends on T021. Same file as T013/T016/T019.)
- [x] T023 [US4] Add a US4 describe block to `tests/e2e/dashboard.spec.ts`. (a) From a user with ≥ 1 non-archived account, navigate to `/dashboard`. Assert the "Add transaction" CTA is visible above the widget grid, styled as the dominant action. (b) Click the CTA; assert navigation to `/dashboard/transactions` (SC-002 — one interaction). (c) Press browser back. Press Tab from the page top until focus lands on the CTA (or use Playwright's `keyboard.press("Tab")` loop). Press Enter; assert navigation to `/dashboard/transactions` (SC-014 — keyboard end-to-end). (d) For a user with zero non-archived accounts (or with every account archived), navigate to `/dashboard`; assert the no-accounts page-level EmptyState renders (`<WelcomePanel>` / `<EmptyState>` heading "Welcome to Abacus" or similar + "Add your first account" CTA pointing to `/dashboard/accounts`) — and the four-widget layout (and therefore the AddTransactionCta) is NOT rendered (FR-003). The disabled-CTA branch per FR-024 is structurally subsumed by FR-003. (Depends on T022.)

**Checkpoint**: US4 ships the quick-add path. A user can go from `/dashboard` to the transaction form in exactly one interaction (down from two before this feature).

---

## Phase 7: User Story 5 — First-time user with no accounts (Priority: P2)

**Goal**: A brand-new user (zero non-archived accounts) landing on `/dashboard` sees a single illustrated empty-state panel pointing to `/dashboard/accounts` — NOT a four-widget grid full of zeros. The code path is already in place from T013; this phase verifies the user-visible behaviour.

**Independent Test**: Sign up a fresh user with zero accounts. Navigate to `/dashboard`. Assert a single page-level empty-state panel is visible — heading "Welcome to Abacus, {name}" (or similar), description, illustrated, primary CTA labelled "Add your first account" linking to `/dashboard/accounts`. Assert NO monetary numbers are rendered anywhere on the page (the four widgets are absent, not rendered as zero-rows). Create an account; reload `/dashboard`; assert the four-widget layout now renders (Net worth populated with starting balance; cash flow empty-state; recent-transactions empty-state; AddTransactionCta active). Archive every account; reload; assert the no-accounts empty state returns (edge-case: all-archived == zero-non-archived per `includeArchived: false`).

### Implementation for User Story 5

- [x] T024 [US5] Add a US5 describe block to `tests/e2e/dashboard.spec.ts`. (a) Sign up a fresh user, navigate to `/dashboard` immediately (no accounts seeded). Assert the no-accounts empty state is visible — heading text, "Add your first account" CTA pointing to `/dashboard/accounts`. Assert NO `<Money>` element is rendered anywhere on the page (use `expect(page.locator('[class*="tabular-nums"]')).toHaveCount(0)` or similar — verifying no monetary value shows up). Assert the four-widget grid is NOT rendered (locator for any of the widget cards by accessible label returns nothing) (SC-008). (b) Create one account (Chase Checking USD $1,000) via the accounts UI. Navigate to `/dashboard`. Assert the four-widget layout now renders. Net worth widget shows `USD $1,000.00` (the starting balance). Cash-flow widget shows the empty state (no transactions yet, US3 path). Recent-transactions widget shows its empty state ("No transactions yet — start by adding one"). AddTransactionCta is enabled (SC-009, FR-002, US5 acceptance scenario 2). (c) Archive the account via the accounts UI. Reload `/dashboard`. Assert the no-accounts empty state returns — all-archived collapses to zero-non-archived per the existing `listAccounts({ includeArchived: false })` semantics (edge-case "All accounts archived" from spec; FR-003). (d) **Cross-user isolation (SC-010)**: from user A (seeded earlier in the spec with accounts + transactions across both currencies), open a fresh browser context and sign up user B. Navigate user B's context to `/dashboard`. Assert user B sees the no-accounts empty state. Assert NO `<Money>` element is rendered (no leakage of A's per-currency balances). Assert no string from any of A's account names (`"Chase Checking"`, `"Schwab Savings"`, `"Revolut"`) appears anywhere on the page. Sign back in as user A in the original context; reload `/dashboard`; assert A's data is intact (Net worth widget still shows the USD + EUR rows). (Depends on T022 — the page wiring is complete by then; T013's branch already implements the code path.)

**Checkpoint**: All five user stories now have e2e coverage. The first-time-user funnel is verified clean (no broken-looking zero-grid).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final audits, the SC-012 post-create byte-for-byte reflection e2e, and the money-reviewer subagent's audit greps.

- [x] T025 Add the **post-create reflection** describe block to `tests/e2e/dashboard.spec.ts` covering SC-012 directly. (a) Capture the pre-create dashboard state: Net worth USD row, Cash flow USD income / expense / net values, recent-transactions count and top row. (b) Click the AddTransactionCta; record one new INCOME transaction (Bonus, USD $1,000, today, EXPENSE category irrelevant — pick a valid INCOME category). Submit. Navigate back to `/dashboard`. (c) Assert the Net worth widget's USD row is exactly `+$1,000.00` higher than the captured pre-create value (byte-for-byte; no rounding drift). (d) Assert the Cash flow widget's USD income line is exactly `+$1,000.00` higher. (e) Assert the new transaction appears as the topmost row of the Recent transactions widget. (SC-012 explicit; constitution Principle IV E2E.)
- [x] T026 Run the **money-reviewer audit greps** documented in [plan.md §Constitution Compliance — Post-Design Re-Check](./plan.md) and [plan.md §Money & Currency Notes](./plan.md). Each MUST return the expected output:
  - `grep -rn "prisma\.transaction" lib/ app/ --include="*.ts" --include="*.tsx"` → returns matches ONLY in `lib/transactions/queries.ts` (and `tests/unit/transactions-queries.test.ts` mock from feature 007 — acceptable).
  - `grep -rn "from \"@/lib/prisma\"" lib/dashboard/` → returns ZERO matches.
  - `grep -rEn '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/dashboard/ 'app/(shell)/dashboard/_components/'` → returns only `new Money(...)` boundary lifts (Decimal-from-Postgres → Money) AND `.plus(...)` / `sumAmounts(...)` calls on `Money` instances. NO raw `Decimal.plus()`, NO arithmetic on plain numbers, NO `new Decimal(...)` outside `lib/money/`.
  - `grep -rn "formatAmount(" 'app/(shell)/dashboard/_components/'` → returns ZERO matches (every monetary display goes through `<Money>`, FR-026).
  - `grep -rEn '<Money ' 'app/(shell)/dashboard/_components/'` → returns one match per monetary display surface (Net worth row, Cash flow income / expense / net, Recent transaction amount). Count manually: 1 (net worth) + 3 (cash flow per currency block) + 1 (recent row amount) = at least 5 matches across the files.
  - `grep -rln '"use client"' 'app/(shell)/dashboard/_components/'` → returns EXACTLY ONE file: `widget-error-boundary.tsx`. **FR-031 verification**: every other widget under `_components/` (`net-worth-widget.tsx`, `cash-flow-widget.tsx`, `recent-transactions-widget.tsx`, `add-transaction-cta.tsx`, `widget-card.tsx`, `empty-cell.tsx`) is a server component, so the initial render of the dashboard works without JavaScript by construction. The only `"use client"` is the error-boundary wrapper, which falls back gracefully (the wrapped server-rendered child still appears in initial HTML even if hydration is disabled — only the Retry button stops working without JS, which is acceptable degradation). The page server component (`app/(shell)/dashboard/page.tsx`) is also a server component (no `"use client"` directive at its top).
  - `grep -rn "Welcome to Abacus" tests/e2e/` → if ANY existing e2e asserts against the WelcomePanel copy on `/dashboard`, update it; if zero matches, no test churn (per [plan.md §Existing tests preservation](./plan.md) — likely zero matches, but verify).
- [x] T027 Run **`pnpm typecheck`** + **`pnpm lint`** + **`pnpm format --check`** (or `pnpm format` if drift detected) against the full repo. ZERO errors expected (constitution Principle II — strict TS, no `any`). Address any new warnings introduced by this feature's diff.
- [x] T028 Run **`pnpm test`** (Vitest unit suite). Expected: all existing tests from features 001–007 still green (SC-013); the 2 new test files from T007 + T008 green; total unit-test count is the prior baseline + the new cases from `dashboard-aggregations.test.ts` and `dashboard-dates.test.ts`.
- [x] T029 Run **`pnpm test:e2e`** (Playwright). Expected: all existing e2e specs from features 002 / 003 / 004 / 006 / 007 still green; the new `tests/e2e/dashboard.spec.ts` covering US1 + US2 + US3 + US4 + US5 + SC-012 green. If any prior e2e fails due to the WelcomePanel having been replaced (T013), inspect — per [plan.md §Existing tests preservation](./plan.md), a `grep "Welcome to Abacus" tests/e2e/` at T026 surfaces the conflict; resolve in this task.
- [x] T030 Run **`pnpm seed-demo-user`** against a fresh local database and visually verify the dashboard renders correctly under realistic data: net worth shows the seeded accounts' per-currency totals; recent-transactions widget shows the most recent 10 of the seeded transactions; cash-flow widget shows the current-month aggregation; CTA navigates correctly. This is the [quickstart.md](./quickstart.md) walkthrough — execute it end-to-end and confirm each step. **SC-001 perceived-load check**: with the local dev server running and a primed cache (visit `/dashboard` once first to compile / warm), reload `/dashboard` and observe perceived load time via DevTools Network panel (or stopwatch). The Net worth widget MUST be visible within ~2 seconds end-to-end on the demo-seed dataset; if it consistently exceeds the budget, file a follow-up to revisit FR-033's whole-page-loading decision (per-widget Suspense streaming was deferred conditionally on this budget holding — see [plan.md §Risk #5](./plan.md)). A failed perceived-load check is NOT a release blocker for v1 but MUST be tracked.
- [x] T031 **money-reviewer subagent invocation** (post-T030, outside the tasks list per workflow convention — listed here as the explicit PR-time gate per SC-011 and constitution Principle I). Hand off the diff to the money-reviewer agent. **Verdict: PASS** (2026-05-26). All 8 invariants verified — I.1 (Decimal storage), I.2 (currency adjacent), I.3 (no implicit FX), I.4 (arithmetic via lib/money), I.5 (<Money> single primitive), I.6 (prisma.transaction confined), I.7 (data scoping), I.8 (TRANSFER excluded from cash flow). Findings: none. Safe to merge.

**Checkpoint**: All success criteria satisfied. PR-ready. The money-reviewer audit (SC-011) is the final gate before merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001)**: No dependencies — runs first to establish a green baseline.
- **Phase 2 (Foundational, T002–T011)**: Depends on Setup completion. **BLOCKS** all user stories.
- **Phase 3 (US1, T012–T014)**: Depends on Foundational completion. The MVP-start: ships the page replacement + Net worth widget + the no-accounts empty state code path (whose e2e lands in US5 phase).
- **Phase 4 (US2, T015–T017)**: Depends on US1 completion (same `page.tsx` edits sequence — T016 modifies the file T013 created).
- **Phase 5 (US3, T018–T020)**: Depends on US2 completion (T019 same-file modification of `page.tsx`).
- **Phase 6 (US4, T021–T023)**: Depends on US3 completion (T022 same-file modification of `page.tsx`).
- **Phase 7 (US5, T024)**: Depends on US4 completion (US5's e2e exercises the page after all 4 widgets are in place; the no-accounts branch was already added in T013 so no code changes here).
- **Phase 8 (Polish, T025–T031)**: Depends on all user stories complete.

### Within-Phase Dependencies

- **Phase 2 / Foundational**:
  - T002, T003 — same file (`lib/transactions/queries.ts`); sequential (T002 first, then T003).
  - T004, T005, T006 — different files in `lib/dashboard/`; T004 and T005 can run in parallel; T006 (barrel) depends on both.
  - T007, T008 — different test files; parallel with T004–T011.
  - T009, T010, T011 — different widget primitive files; parallel with each other and with T004–T008.
- **Phase 3 / US1**: T012 (NetWorthWidget) depends on T005 + T006 + T009. T013 (page) depends on T011 + T012. T014 (e2e) depends on T013.
- **Phase 4 / US2**: T015 (RecentTransactionsWidget) depends on T003 + T009. T016 (page) depends on T013 + T015. T017 (e2e) depends on T016.
- **Phase 5 / US3**: T018 (CashFlowWidget) depends on T002 + T004 + T005 + T006 + T009. T019 (page) depends on T016 + T018. T020 (e2e) depends on T019.
- **Phase 6 / US4**: T021 (CTA) depends on T009/T011 by visual consistency only. T022 (page) depends on T019 + T021. T023 (e2e) depends on T022.
- **Phase 7 / US5**: T024 depends on T022.
- **Phase 8 / Polish**: T025 depends on T022; T026 / T027 / T028 / T029 / T030 / T031 depend on all prior phases.

### Parallel Opportunities

- **Within Phase 2**: T004 ‖ T005 ‖ T007 ‖ T008 ‖ T009 ‖ T010 ‖ T011 (seven parallelizable tasks, all `[P]`). T006 sequencing only requires T004 + T005. T003 sequences after T002 (same file).
- **Across phases**: zero — user stories are deliberately sequenced because they all modify `app/(shell)/dashboard/page.tsx`.
- **Within US phases**: zero — each US has a widget → page-wire → e2e dependency chain.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Sequential: T001 → T002 → T003 (Setup, then queries.ts extensions)
# Then parallel: T004, T005, T007, T008, T009, T010, T011
Task: "T004 Create lib/dashboard/dates.ts"
Task: "T005 Create lib/dashboard/aggregations.ts"
Task: "T007 Create tests/unit/dashboard-aggregations.test.ts"
Task: "T008 Create tests/unit/dashboard-dates.test.ts"
Task: "T009 Create app/(shell)/dashboard/_components/widget-card.tsx"
Task: "T010 Create app/(shell)/dashboard/_components/empty-cell.tsx"
Task: "T011 Create app/(shell)/dashboard/_components/widget-error-boundary.tsx"
# Then sequential: T006 (barrel — depends on T004 + T005)
Task: "T006 Create lib/dashboard/index.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T011) — CRITICAL: blocks all user stories.
3. Complete Phase 3: US1 (T012–T014) — Net worth widget + page wiring + e2e.
4. **STOP and VALIDATE**: a user with accounts sees their net worth; a user without accounts sees the empty state (code path is in place; e2e formalised in US5 phase).
5. Deploy / demo. Half the spec's value (net worth, the headline metric) is now live.

### Incremental Delivery

1. Complete Setup + Foundational → foundation ready.
2. Add US1 → Net worth visible. Deploy / demo.
3. Add US2 → Recent activity visible. Deploy / demo. **End of P1 — full MVP.**
4. Add US3 → Cash flow visible. Deploy / demo.
5. Add US4 → Quick-add CTA fully wired (replaces the placeholder from T013). Deploy / demo.
6. Add US5 → No-accounts empty state e2e-verified. Deploy / demo.
7. Polish + audits + money-reviewer → merge.

### Constitution-mandated gates

- **Principle I (money math)**: T002, T005, T012, T018 are the money-path tasks. T007 unit-tests them. T026's audit greps codify the invariants.
- **Principle II (type safety)**: T027 (`pnpm typecheck`).
- **Principle III (validate at boundaries)**: structural — no request input on `/dashboard`; no Zod boundary needed.
- **Principle IV (test the money paths)**: T007, T008 (unit suite); T014, T017, T020, T025 (E2E covering SC-005, SC-006, SC-007, SC-012).
- **Principle V (spec-driven)**: spec → plan → tasks → implement order observed; single feature in flight (`008-real-dashboard`).
- **money-reviewer subagent (SC-011)**: T031, invoked at PR time outside the tasks list (post-T030).

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps a task to its user story; Setup / Foundational / Polish have no story label.
- **The money-reviewer subagent MUST run after T030 (PR-time)**. Money-touch=true on this PR. The audit invariants codified in T026 are the audit's scope.
- **`prisma.transaction.*` MUST continue to appear ONLY in `lib/transactions/queries.ts`** after this feature ships (the feature-007 invariant). T002's new helper preserves this; T026 verifies it.
- **`lib/dashboard/aggregations.ts` MUST NOT import `prisma`**. T005 enforces this in code; T026 verifies it by audit grep.
- **`<Money>` is the single monetary-display primitive** on the dashboard. NO inline `formatAmount(...)`, NO plain `<span>{amount}{currency}</span>`. T026 verifies.
- Page-level loading (FR-033) uses the existing `(shell)/loading.tsx` — no new `loading.tsx` is added in this feature.
- Per-widget error boundaries (FR-034) are hand-rolled `"use client"` class components — NO `react-error-boundary` dep added.
- Commit after each task or each tight logical group (e.g., one commit for T004+T005+T006 as "lib/dashboard/ module: dates + aggregations + barrel").
- Avoid: vague tasks, same-file `[P]` conflicts (T002+T003, T013+T016+T019+T022 are deliberately sequential), regressing the feature-007 `prisma.transaction.*` invariant, adding `react-error-boundary` or any other new npm dep.
