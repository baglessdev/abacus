# Implementation Plan: Real Dashboard

**Branch**: `008-real-dashboard` | **Date**: 2026-05-25 | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0 (multi-user from day one; data-scoping convention binding from feature 004 onward; money math, `lib/money/` boundary, `<Money>` single rendering primitive binding from feature 007).

## Summary

This feature replaces the placeholder "Welcome to Abacus" panel at `/dashboard` with a four-widget functional landing screen: a per-currency **Net worth** widget, a current-calendar-month **Cash flow** widget (income / expense / net per currency), a **Recent 10 transactions** list, and a primary **Add transaction** CTA. It is a **strictly read-only** feature — no new entity, no new schema, no new mutation, no new HTTP route. Every value rendered on the dashboard is already in the database; the work is shaping it into widgets and rendering them through the established `<Money>` primitive.

It is the **first feature where multiple money paths intersect on a single screen**, and the first to use the post-feature-007 `lib/transactions/queries.ts` aggregation surface (`sumAmountsForAccountsBatch` indirectly via `listAccountsForUser`, plus a small new `sumIncomeExpenseByCurrencyForUser` helper for the cash-flow widget) outside of accounts-list balance rendering. The constitution Principle I rules ("no arithmetic on monetary values outside `lib/money/`", "currency stays with amount", "no implicit FX", "Decimal everywhere") hold across all three widgets simultaneously. The money-reviewer subagent will audit this PR for the same invariants it enforced on feature 007 (SC-011).

The page is a **React Server Component** that fetches three independent shapes (accounts with computed balances, per-currency cash-flow aggregate, recent-10 transactions) in parallel, composes them per-widget, and wraps each data-driven widget in a per-widget **client-side ErrorBoundary** so a single widget's failure renders an inline "Couldn't load" state without blanking the other two (FR-034). Initial-load loading is page-level via the existing `(shell)/loading.tsx` (FR-033 explicitly forbids per-widget Suspense streaming in v1). The Add-transaction CTA has no asynchronous dependency and always renders (FR-036).

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19, Node 20.x — unchanged from feature 007 |
| **Framework** | Next.js 16 (App Router), Auth.js v5 (NextAuth), Prisma 7 — unchanged |
| **Storage** | PostgreSQL 16 (docker-compose, local only) — unchanged |
| **ORM driver** | `@prisma/adapter-pg` — unchanged |
| **Auth** | Auth.js Credentials + JWT-only sessions; `await auth()` at the dashboard server component; `userId` from `session.user.id`, never request input (no request input on this page) |
| **Money** | `Prisma.Decimal` aliased as `Money` from `lib/money/decimal.ts`. **No new helpers required.** The existing `Money.plus(...)` (Decimal `.plus()`) and the existing `sumAmounts(amounts: readonly Money[]): Money` from `lib/money/decimal.ts` (added in feature 007) cover the per-currency net-worth reducer. Cash-flow `_sum` arithmetic happens **Postgres-side** via Prisma `groupBy._sum.amount`; the result is lifted to `Money` immediately. No new arithmetic introduced outside `lib/money/`. |
| **Currency allow-list** | Existing bundled `lib/money/currencies.ts` (from feature 004) — unchanged. No FX, no implicit conversion. |
| **Atomicity primitive** | N/A — read-only feature; no mutations introduced. |
| **UI primitives in use** | All shadcn primitives already in the repo: `card` (widget shell), `button` (Add transaction CTA, retry buttons), `separator`. **No new shadcn primitive.** |
| **New runtime deps** | **None.** No `react-error-boundary` package added — a small hand-rolled React class component is sufficient (the only React error boundary in the app today is `app/(shell)/error.tsx` which uses the App Router's `error.tsx` convention; for per-widget boundaries we need a reusable client component, but a 30-line class component is cheaper than a dep). |
| **Validation** | No Zod boundary on this page — there is no request input. The page reads `session.user.id` from `await auth()` and calls the queries directly. (Per Principle III, internal in-process calls trust their typed inputs.) |
| **Testing** | Vitest (unit) — new suite covering `lib/dashboard/aggregations.ts` (per-currency net-worth reduce + sort order; per-currency cash-flow shape; current-UTC-month boundary computation; empty / zero / negative cases). Playwright (E2E) — one new spec asserting SC-005 + SC-006 + SC-012 (the byte-for-byte net-worth / cash-flow / recent-10 cross-page consistency assertion and the post-transaction-create dashboard-reflects-the-new-row check). |
| **Target platform** | Local dev only (no production deployment in scope). |
| **Performance Goals** | Dashboard renders ≤ 2 seconds on typical Postgres (SC-001). Per FR-033, all three widgets resolve **together** (page-level loading, not per-widget streaming). |
| **Constraints** | Per-widget error boundaries (FR-034); always-on Add-transaction CTA (FR-036); no per-widget Suspense streaming in v1 (FR-033); no FX (FR-006 / FR-015); UTC calendar-month boundaries recomputed at request time (FR-016); recent-10 sort and exclusion semantics mirror `/dashboard/transactions` (FR-017); cross-user reads collapse via data-scoping (FR-025, SC-010). |
| **Scale / Scope** | Per-user ≤ ~10k transactions for v1. The 30-day default range from feature 007 limits the hot-path list query; the dashboard's cash-flow aggregation is bounded by the current calendar month; the recent-10 fetch is `take: 10`. None of the three queries scans the full transaction table for a user. |

## Constitution Check

*Evaluated against `.specify/memory/constitution.md` v0.2.0. Re-evaluated after Phase 1 design (see end of doc).*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | YES | PASS | This feature performs **per-currency arithmetic on `Decimal` values** in two places: (a) the net-worth reducer that sums each currency's accounts via `Money.plus(...)` (or via the existing `sumAmounts` helper from `lib/money/decimal.ts`), and (b) the cash-flow `net = income - |expense|` derivation. **Both happen exclusively through `lib/money/` helpers.** The cash-flow per-type sums (`income`, `expense`) come straight from Postgres via Prisma `groupBy._sum.amount` (Postgres-side arithmetic on the Decimal column — never JavaScript); the application immediately lifts each result to `new Money(...)`. Currency is stored on every aggregate (`{ currency, total }` and `{ currency, income, expense, net }` shapes). **No implicit FX** anywhere (FR-006, FR-015): each currency is its own row. **No monetary value rendered without its currency code** (FR-026): every display surface goes through `<Money currency={...} amount={...} />`. **No new arithmetic outside `lib/money/`** (FR-027): the audit grep `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/dashboard/ app/(shell)/dashboard/_components/` returns only `new Money(...)` lifts at boundary points (Decimal-from-Postgres → Money) and `.plus(...)` calls on `Money` instances. The money-reviewer subagent gate (SC-011) is met by construction. |
| **II — Type safety end-to-end** | YES | PASS | Strict TS; no `any`. No new Prisma model. The new aggregate shapes (`PerCurrencyTotal`, `PerCurrencyCashFlow`) are typed in `lib/dashboard/aggregations.ts`. The session is read once at the page server component via the typed `await auth()`. Every helper takes `userId: string` as the first positional argument. |
| **III — Validate at boundaries, trust internally** | YES | PASS | The dashboard page has **no request input** — no `searchParams` consumed, no `FormData`, no URL params. The page reads `await auth()` and calls helpers directly with typed inputs. Per Principle III's "trust internally for in-process objects" rule, no Zod boundary is needed inside the page. Auth is checked at the page server component (defense-in-depth on top of `middleware.ts`); no helper re-validates. |
| **IV — Test the money paths** | YES | PASS | Unit suite covers the per-currency aggregation (net worth + cash flow) under empty / zero / negative / multi-currency cases; the UTC month-boundary helper under DST / leap-year / month-rollover cases. Constitution-mandated E2E asserts SC-012: a user signs up → creates an account → records an INCOME / EXPENSE / TRANSFER transaction → the dashboard's net-worth and cash-flow widgets reflect the new transaction **byte-for-byte** against the same values rendered on `/dashboard/accounts` and `/dashboard/transactions`. Existing feature-007 unit + e2e suites stay green (SC-013). |
| **V — Spec-driven development** | YES | PASS | Spec exists, approved, status `READY_FOR_ARCH`, 0 open clarifications (resolved in the 2026-05-25 session). Plan flows spec → plan → tasks. Single feature in flight (`008-real-dashboard`); no parallel branches in `.specify/specs/`. |

**Conventions check.**

| Convention | Status | Note |
|---|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS | All new files land under these. New: `lib/dashboard/`, `app/(shell)/dashboard/_components/`. |
| **Money helpers — all monetary operations go through `lib/money/`** | PASS | FR-027 binds this feature. The new `lib/dashboard/aggregations.ts` consumes `Money` arithmetic via `.plus(...)` / `sumAmounts(...)` from `lib/money/decimal.ts`. Cash-flow `_sum` arithmetic is Postgres-native (`groupBy._sum.amount`); the application immediately wraps each Decimal result in `new Money(...)` for the `net = income.plus(expense)` (or `income.minus(expense.negated())`) derivation, depending on stored-sign convention. **No raw Decimal `.plus()` / `.minus()` / `new Decimal(...)` outside `lib/money/` and outside consumer call sites that hold a `Money` instance** — verified by the audit grep documented in research.md R7 and research.md R11. |
| Migrations (no `db push`) | PASS | **No migration.** No schema change. |
| Secrets (`.env.local` only) | PASS | No new env vars. |
| API response envelope `{ data } \| { error: { code, message } }` | N/A | **No HTTP route handler, no server action with envelope shape**. The dashboard page is a Server Component that calls server-only helpers directly. The existing `listAccounts(...)` action (which already returns the envelope) is consumed; its envelope is unwrapped at the page level into a typed value or a thrown error that triggers the per-widget ErrorBoundary. |
| Dates UTC | PASS | The current-calendar-month boundary helper (`computeCurrentMonthRange()` in `lib/dashboard/dates.ts`) returns UTC midnight bounds. Boundary recomputed at request time (FR-016). |
| CSV exports | N/A | Not in this feature; feature 014 (CSV export) defers. |
| **Data scoping — every domain row owned by `userId`; queries filter by session** | PASS | The dashboard page reads `userId = session.user.id` once at the top of the server component and passes it as the first positional argument to every query helper: `listAccountsForUser(userId, ...)`, `sumIncomeExpenseByCurrencyForUser(userId, ...)`, `listTransactionsForUser(userId, { limit: 10 })`. **No code path in this feature passes a `userId` derived from request input** — there is no request input on this page. Cross-user attempts (URL manipulation, second-tab race) collapse via the existing data-scoping convention to the requesting user's own dashboard (SC-010). |
| **`prisma.transaction.*` confined to `lib/transactions/queries.ts`** (feature-007 invariant) | PASS | The new cash-flow helper (`sumIncomeExpenseByCurrencyForUser`) lives **inside** `lib/transactions/queries.ts` alongside the existing `sumAmountsForAccount(sBatch)`. The new `lib/dashboard/aggregations.ts` file does **not** import `prisma` and does **not** touch `prisma.transaction.*` — it only consumes function exports from `lib/accounts/queries.ts` (`listAccountsForUser`), `lib/transactions/queries.ts` (`sumIncomeExpenseByCurrencyForUser`, `listTransactionsForUser`), and `lib/money/decimal.ts` (`Money`, `sumAmounts`). Audit grep `rg "prisma\.transaction\." lib/ app/` still returns only `lib/transactions/queries.ts` after this feature ships. |
| **`<Money>` is the single monetary-display primitive** (feature-005 / feature-007 invariant) | PASS | Every monetary display surface on the dashboard (per-currency net-worth row, per-currency cash-flow lines — income / expense / net, recent-transaction-row amount) renders through `<Money>` from `components/money/money.tsx`. **No new money-display component.** No inline `formatAmount(...)` calls in `app/(shell)/dashboard/_components/`. Audit grep `rg "formatAmount\(" app/(shell)/dashboard/_components/` returns zero matches. |
| **money-reviewer subagent gate (SC-011)** | PASS by construction | The audit grep `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/dashboard/ app/(shell)/dashboard/_components/` will return only `new Money(...)` boundary lifts (Decimal-from-Postgres → Money) and `.plus(...)` / `sumAmounts(...)` calls on `Money` instances from `lib/money/`. The audit grep `rg "prisma\.transaction\." lib/ app/` still returns only `lib/transactions/queries.ts`. The dashboard adds no new monetary-arithmetic surface outside `lib/money/`. |

**No violations.** No justification required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/008-real-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log (R1..R12)
├── data-model.md        # Phase 1 — no new entities; read-only DTOs the dashboard consumes
├── quickstart.md        # Phase 1 — 5-minute "verify this works" walkthrough
├── contracts/           # Phase 1 — function-surface contracts (no HTTP)
│   ├── lib-dashboard-aggregations.md
│   ├── lib-transactions-queries-extensions.md
│   └── dashboard-page.md
├── spec.md              # Approved, 0 open clarifications
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

### Source code (after this feature)

```text
abacus/
├── app/
│   ├── (shell)/dashboard/
│   │   ├── page.tsx                              # MODIFIED — replaces the WelcomePanel placeholder
│   │   └── _components/
│   │       ├── net-worth-widget.tsx              # NEW — server component; per-currency net-worth rows
│   │       ├── cash-flow-widget.tsx              # NEW — server component; per-currency income/expense/net
│   │       ├── recent-transactions-widget.tsx    # NEW — server component; 10-row list + "See all"
│   │       ├── add-transaction-cta.tsx           # NEW — server component; primary CTA + no-accounts disabled state
│   │       ├── widget-error-boundary.tsx         # NEW — "use client" class component; per-widget error boundary
│   │       ├── widget-card.tsx                   # NEW — shared visual shell (Card primitive wrapper)
│   │       └── empty-cell.tsx                    # NEW — small inline empty-state for "No data" inside a widget
│   ├── (shell)/dashboard/transactions/           # unchanged (feature 007)
│   ├── (shell)/dashboard/accounts/               # unchanged (feature 007)
│   ├── (shell)/loading.tsx                       # unchanged — covers FR-033's page-level loading
│   ├── (shell)/error.tsx                         # unchanged — covers FR-037's shell-level catch-all
│   ├── (auth)/                                   # unchanged
│   ├── (marketing)/                              # unchanged
│   └── api/                                      # unchanged
├── components/
│   ├── money/
│   │   └── money.tsx                             # unchanged — consumed by all three widgets
│   ├── shell/
│   │   ├── empty-state.tsx                       # unchanged — consumed by the no-accounts dashboard empty state
│   │   └── welcome-panel.tsx                     # unchanged in this feature (still consumed by /dashboard when no accounts; SEE NOTE BELOW)
│   ├── illustrations/
│   │   └── abacus-illustration.tsx               # unchanged — consumed by the no-accounts empty state
│   └── ui/
│       └── card.tsx                              # unchanged — consumed by widget-card.tsx
├── lib/
│   ├── dashboard/                                # NEW DIRECTORY
│   │   ├── aggregations.ts                       # NEW — per-currency net-worth reducer + per-currency cash-flow shape adapter; ONLY consumes lib/accounts + lib/transactions function exports + lib/money (NEVER touches prisma.*)
│   │   ├── dates.ts                              # NEW — computeCurrentMonthRange() returning { dateFrom: Date, dateTo: Date } UTC midnight bounds (dateTo exclusive, first of next month)
│   │   └── index.ts                              # NEW — server-only barrel
│   ├── transactions/
│   │   ├── queries.ts                            # MODIFIED — adds sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo); extends listTransactionsForUser with optional limit?: number
│   │   ├── actions.ts                            # unchanged (no new server action — listTransactions still serves recent-10 indirectly; we use listTransactionsForUser directly)
│   │   ├── …                                     # serialize.ts, schemas.ts, errors.ts, dates.ts, index.ts unchanged
│   ├── accounts/                                 # unchanged (the existing listAccountsForUser with sumAmountsForAccountsBatch already returns live balances)
│   ├── money/                                    # unchanged (the existing Money, plus(), sumAmounts() cover all dashboard arithmetic)
│   ├── auth/                                     # unchanged
│   ├── env.ts                                    # unchanged
│   └── prisma.ts                                 # unchanged
├── db/
│   └── schema.prisma                             # UNCHANGED — no schema change in this feature
└── tests/
    ├── unit/
    │   ├── …                                     # all existing test files unchanged
    │   ├── dashboard-aggregations.test.ts        # NEW — per-currency net-worth reduce + sort order; per-currency cash-flow shape; empty/zero/negative/multi-currency cases
    │   └── dashboard-dates.test.ts               # NEW — computeCurrentMonthRange under UTC midnight; first-of-next-month exclusive; month rollover; leap year
    └── e2e/
        ├── …                                     # all existing e2e specs unchanged
        └── dashboard.spec.ts                     # NEW — constitution-mandated; covers SC-005, SC-006, SC-007, SC-008, SC-010, SC-012
```

**No new shadcn primitives.** `Card`, `Button`, `Separator` are already in the repo from features 004–007. No `react-error-boundary` dep — `widget-error-boundary.tsx` is a hand-rolled React 19 class component (the only class component in the codebase; ~30 lines).

**Note on `welcome-panel.tsx`.** Today's `/dashboard/page.tsx` renders `<WelcomePanel />` unconditionally. After this feature, the page renders the four widgets when the user has ≥ 1 non-archived account (FR-002) and falls back to the no-accounts empty state when not (FR-003). The `WelcomePanel` server component is still useful as the no-accounts empty state — the page composes it (or an equivalent EmptyState configured for the dashboard's first-time-user case per US5). The exact reuse vs. inline is an implementer choice; either is plan-acceptable. The component file stays where it is.

### Structure Decision

The established `lib/<feature>/` module pattern is duplicated for `lib/dashboard/`. The dashboard module is **a pure consumer of other modules' query helpers** — it does NOT own any Prisma surface and does NOT take request input. Putting it under `lib/dashboard/` (rather than inlining the aggregation into the page component) keeps the page component thin, makes the aggregation unit-testable in isolation, and creates a natural home for future dashboard polish (e.g., a feature-015 chart aggregation that needs the same per-currency reducer).

Page-local components live under `app/(shell)/dashboard/_components/` — the same `_components/` convention features 004 and 007 use for route-bound UI. The reusable parts (`<Money>`, `<EmptyState>`, `<AbacusIllustration>`, `<Card>`, `<Button>`) all live outside `_components/` in their canonical homes; nothing in `app/(shell)/dashboard/_components/` is consumed by another route, so the route-bound location is correct.

The only **client component** added by this feature is `widget-error-boundary.tsx` — React error boundaries must be client-side (the React error-boundary API is class-component-based and runs on the client). The three widgets themselves remain server components; the boundary wraps each widget's server component as a client-side parent that catches render-time exceptions from its children. See research.md R5 + R12 for the pattern detail.

## Data Model Changes

**None.** This feature introduces no new entities, no new columns, no new indexes, no new migrations. It is a strictly read-only consumer of the schema established by features 004 (Account), 006 (Category), and 007 (Transaction). The relevant indexes for this feature's three queries (`[userId, date]` for cash-flow + recent-10; the per-account `[userId, accountId, date]` index for the balance computation inherited via `listAccountsForUser`) were all added in feature 007's `add_transaction` migration.

The full read-only data shapes the dashboard consumes are enumerated in [`data-model.md`](./data-model.md).

## API Surface

**No new HTTP route handlers. No new server actions.** This feature is a Server-Component-rendered page consuming server-only function exports.

The new function-level surfaces (documented in [`contracts/`](./contracts/)):

| Surface | Location | Purpose |
|---|---|---|
| `sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)` | `lib/transactions/queries.ts` | Single Prisma `groupBy` on `(currency, type)` returning `{ currency, type, _sum: { amount } }[]` for INCOME and EXPENSE rows in the date range. TRANSFER excluded at the `where:` level. Returns Money values lifted from the Decimal sums. |
| `listTransactionsForUser(userId, filters)` extension | `lib/transactions/queries.ts` | The existing helper gains an optional `limit?: number` parameter. When set, applied via Prisma `take`. Existing call sites (transactions page) omit it; the dashboard's recent-10 widget passes `{ limit: 10 }`. |
| `computeNetWorthByCurrency(accounts)` | `lib/dashboard/aggregations.ts` | Pure in-memory reducer. Takes `AccountDTO[]` (from `listAccountsForUser`), groups by `currency`, sums each currency's `balance` via `Money.plus(...)` / `sumAmounts(...)`. Returns `{ currency, total: string }[]` sorted by descending absolute total, ties broken by ISO 4217 ascending (FR-007). |
| `buildCashFlowShape(rows)` | `lib/dashboard/aggregations.ts` | Pure in-memory adapter. Takes the Prisma `groupBy` rows from `sumIncomeExpenseByCurrencyForUser` and reshapes them into `{ currency, income: string, expense: string, net: string }[]`. `net = income + expense` (expense is stored negative; addition is correct). Sorted by descending absolute `net`, ties broken by ISO 4217 ascending. |
| `computeCurrentMonthRange()` | `lib/dashboard/dates.ts` | Pure function. Returns `{ dateFrom: Date, dateTo: Date }` — UTC midnight of the 1st of the current calendar month (inclusive) and UTC midnight of the 1st of the next calendar month (exclusive). Recomputed at every call (FR-016). |

No envelope shape — these are server-only function exports consumed directly by the page server component. The page handles thrown errors by letting the per-widget client-side ErrorBoundary catch them (research.md R5).

## UI Surface

### Page

| URL | File | Renders |
|---|---|---|
| `/dashboard` | `app/(shell)/dashboard/page.tsx` | **Server component.** Reads `await auth()`; reads `userId = session.user.id`. Calls `listAccounts({ includeArchived: false })` (existing action) to determine account count + per-account live balances. If `accountCount === 0`, renders the no-accounts EmptyState (US5, FR-003). Otherwise renders four children in this layout: `<AddTransactionCta>` (always-on per FR-036), then a 3-widget grid wrapping each of `<NetWorthWidget>`, `<CashFlowWidget>`, `<RecentTransactionsWidget>` inside a `<WidgetErrorBoundary>`. |

The placeholder at this URL (currently `<WelcomePanel />`) is REPLACED for users with ≥ 1 non-archived account; for users with zero accounts, the equivalent EmptyState is shown.

### Page-local components

All under `app/(shell)/dashboard/_components/`:

| Component | Server / Client | Purpose | Key primitives |
|---|---|---|---|
| `NetWorthWidget` | Server | Async server component. Calls `listAccountsForUser(userId, { includeArchived: false })` (via the `listAccounts` action, which returns the envelope; unwraps to thrown or to `AccountDTO[]`), then `computeNetWorthByCurrency(accounts)`. Renders one `<Money>` per currency row. Empty state: "All your accounts have zero balance." Zero state: per-currency rows of `$0.00`. | `<WidgetCard>`, `<Money>` |
| `CashFlowWidget` | Server | Async server component. Calls `computeCurrentMonthRange()` then `sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)`, then `buildCashFlowShape(rows)`. Renders one block per currency with three labelled lines (`Income`, `Expense`, `Net`), each via `<Money>`. Empty state: "No income or expense this month yet." | `<WidgetCard>`, `<Money>` |
| `RecentTransactionsWidget` | Server | Async server component. Calls `listTransactionsForUser(userId, { limit: 10 })`. Renders 10 rows (or fewer if the user has < 10 non-archived transactions); each row is a keyboard-focusable `<Link href="/dashboard/transactions">` displaying date, payee, category name, account name, signed amount via `<Money>`. Below the list, a "See all" `<Link>`. Empty state: "No transactions yet — start by adding one." | `<WidgetCard>`, `<Money>`, Next.js `<Link>` |
| `AddTransactionCta` | Server | Reads the account count (already fetched at the page level; passed in as a prop OR re-fetched via `listAccountsForUser` — implementer's choice; the page-level fetch is the canonical source). Renders a primary `<Button asChild>` wrapping a `<Link href="/dashboard/transactions">`. When `accountCount === 0`, the CTA is rendered disabled with helper text linking to `/dashboard/accounts` (FR-024 / FR-036). | `<Button>`, Next.js `<Link>` |
| `WidgetErrorBoundary` | **Client** | Class component with `componentDidCatch` / `getDerivedStateFromError`. On caught error: renders a small inline error card with `<WidgetCard>` shell containing the message "Couldn't load — Try again" and a Retry button that calls `this.reset()` (resets local error state) plus `router.refresh()` (triggers a re-fetch of the server component subtree). Keyboard-focusable (FR-035). | React class component, `<Button>`, `useRouter` for `refresh` (via a small functional wrapper if needed; alternatively the Retry button is a `<a href={pathname}>` that triggers a full reload — the simpler path) |
| `WidgetCard` | Server | Pure visual shell — a `<Card>` with a `<CardHeader>` (containing the widget title) and a `<CardContent>` slot. Used by all three widgets and the error-boundary error state for visual consistency. | shadcn `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>` |
| `EmptyCell` | Server | Tiny inline "no data" cell used INSIDE a widget when the widget's underlying data is empty but valid (e.g., "No income or expense this month yet" inside the cash-flow card). Different from the **page-level** no-accounts EmptyState which replaces the whole dashboard. | `<p>` with muted text |

### Empty / zero / error state matrix per widget

This is the high-leakage area; the spec calls out three distinct cases per widget (research.md R6). Concrete behaviour:

| Widget | Empty (no data) | Zero (data sums to zero) | Error (query threw) |
|---|---|---|---|
| **Net worth** | Not reachable for an account-having user (every account contributes its starting balance; the widget always has ≥ 1 currency row when ≥ 1 account exists per FR-009). The whole-dashboard no-accounts EmptyState (US5) covers the no-account case. | Per-currency rows of `$0.00` (FR-009 — render zero rows, do not show empty state). | `<WidgetCard>` with "Couldn't load — Try again" (FR-034 / FR-035). |
| **Cash flow** | "No income or expense this month yet" (FR-014) — single inline message inside the `<WidgetCard>`. | Per-currency block with `Income $0.00 · Expense $0.00 · Net $0.00` — only reachable if rows exist but all sum to zero (rare); the empty case (zero rows) takes precedence. | `<WidgetCard>` with "Couldn't load — Try again" (FR-034 / FR-035). |
| **Recent transactions** | "No transactions yet — start by adding one" (FR-020) — single inline message inside the `<WidgetCard>`. | N/A — the widget renders rows, not sums. | `<WidgetCard>` with "Couldn't load — Try again" (FR-034 / FR-035). |
| **Add transaction CTA** | N/A — has no async dependency (FR-036). | N/A. | N/A — has no async dependency; cannot enter an error state. Renders disabled with "Add an account first" helper text when `accountCount === 0`. |

### No-accounts page-level empty state (US5, FR-003)

When `accountCount === 0`, the dashboard renders a **single** `<EmptyState>` (the existing primitive) with the `<AbacusIllustration>` and the heading "Welcome to Abacus" / description / CTA to `/dashboard/accounts`. The four-widget grid is NOT rendered (FR-003 says INSTEAD OF, not in addition to). The existing `WelcomePanel` component is a reasonable fit; the implementer may either consume it directly or inline an equivalent `<EmptyState>` configuration. Either is plan-acceptable.

### Money display

Every monetary value renders through `<Money currency={...} amount={...} />` from `components/money/money.tsx` — the per-currency net-worth rows, the per-currency cash-flow income / expense / net lines, the recent-transaction row amounts. The `<Money>` primitive's `tabular-nums` class (FR-028) and sign-aware color (negative → `text-money-negative`; positive → `text-foreground`; zero → `text-muted-foreground`) handle the vertical-stacking alignment and the sign-aware visual treatment (FR-030) automatically. **No new money-display component.**

### Sidebar navigation

`/dashboard` already exists as the sidebar's home entry (feature 002). No change.

### Charts

**None.** Recharts is feature 015. FR-038 explicitly defers.

## File-Level Layout

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/dashboard/aggregations.ts` | `computeNetWorthByCurrency(accounts: AccountDTO[]): PerCurrencyTotal[]` — per-currency net-worth reducer using `Money.plus(...)` / `sumAmounts(...)` from `lib/money/decimal.ts`. `buildCashFlowShape(rows: { currency, type, _sum: { amount: Decimal | null } }[]): PerCurrencyCashFlow[]` — adapter from Prisma `groupBy` shape to the widget shape, computing `net` via `Money` arithmetic. Both functions are pure; both have unit tests. **No prisma import, no DB access.** |
| `lib/dashboard/dates.ts` | `computeCurrentMonthRange(): { dateFrom: Date; dateTo: Date }` — UTC midnight of the 1st of the current calendar month + UTC midnight of the 1st of the next calendar month (exclusive). Recomputed at every call (FR-016). Pure function; unit-tested. |
| `lib/dashboard/index.ts` | Server-only barrel re-exporting `computeNetWorthByCurrency`, `buildCashFlowShape`, `computeCurrentMonthRange`, and the public types (`PerCurrencyTotal`, `PerCurrencyCashFlow`). |
| `app/(shell)/dashboard/_components/net-worth-widget.tsx` | Async server component for the Net worth widget. |
| `app/(shell)/dashboard/_components/cash-flow-widget.tsx` | Async server component for the This-month cash flow widget. |
| `app/(shell)/dashboard/_components/recent-transactions-widget.tsx` | Async server component for the Recent 10 transactions widget. |
| `app/(shell)/dashboard/_components/add-transaction-cta.tsx` | Server component for the primary CTA. |
| `app/(shell)/dashboard/_components/widget-error-boundary.tsx` | `"use client"` class component implementing a per-widget React error boundary (FR-034). Renders inline "Couldn't load — Try again" on caught error. |
| `app/(shell)/dashboard/_components/widget-card.tsx` | Shared `<Card>` visual shell with title slot. |
| `app/(shell)/dashboard/_components/empty-cell.tsx` | Tiny inline "no data" cell used inside widget empty states. |
| `tests/unit/dashboard-aggregations.test.ts` | Unit tests for `computeNetWorthByCurrency` (single currency / multi-currency / negative balance / zero balance / sort order — descending absolute total, ties broken by ISO 4217 ascending; archived-account exclusion is the caller's responsibility — the reducer trusts its input). Unit tests for `buildCashFlowShape` (only income / only expense / both / negative net / multi-currency / sort order). |
| `tests/unit/dashboard-dates.test.ts` | Unit tests for `computeCurrentMonthRange` (UTC midnight boundaries; first-of-next-month exclusive; month rollover from Dec to Jan; leap-year February). |
| `tests/e2e/dashboard.spec.ts` | Constitution-mandated E2E. Asserts SC-005 (net worth byte-for-byte vs. accounts page), SC-006 (cash flow byte-for-byte vs. transactions page), SC-007 (recent 10 byte-for-byte vs. transactions list first 10), SC-008 (zero-accounts user sees the empty state, not the widget grid), SC-010 (cross-user isolation), SC-012 (post-create dashboard reflects the new transaction). |

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `lib/transactions/queries.ts` | Add `sumIncomeExpenseByCurrencyForUser(userId: string, dateFrom: Date, dateTo: Date): Promise<{ currency: string; type: "INCOME" \| "EXPENSE"; _sum: { amount: Money } }[]>` using Prisma `groupBy({ by: ["currency", "type"], where: { userId, type: { in: ["INCOME", "EXPENSE"] }, archivedAt: null, date: { gte: dateFrom, lt: dateTo } }, _sum: { amount: true } })`. Lift each `_sum.amount` Decimal to `Money` for the return type. Extend `listTransactionsForUser` with optional `limit?: number` parameter; when set, apply `take: limit` to the `findMany`. **Both changes preserve the "prisma.transaction.* lives only here" invariant.** |
| `app/(shell)/dashboard/page.tsx` | REPLACE the current `<WelcomePanel />`-only placeholder. New shape: `await auth()`, read `userId`, call `listAccounts({ includeArchived: false })`, branch on account count: zero-accounts → render the no-accounts EmptyState; ≥ 1 account → render the always-on `<AddTransactionCta>` then a grid wrapping each of `<NetWorthWidget>`, `<CashFlowWidget>`, `<RecentTransactionsWidget>` inside `<WidgetErrorBoundary>`. |

### Files NOT touched

`db/schema.prisma`, `lib/auth/*`, `lib/accounts/*` (the existing `listAccountsForUser` already returns live balances per feature 007), `lib/money/*` (no new helper needed — `Money.plus` and `sumAmounts` cover everything), `lib/categories/*`, `lib/transactions/actions.ts` / `schemas.ts` / `serialize.ts` / `errors.ts` / `dates.ts` / `index.ts` (only `queries.ts` is touched), `app/(shell)/dashboard/transactions/*`, `app/(shell)/dashboard/accounts/*`, `app/(shell)/dashboard/categories/*`, `app/(shell)/loading.tsx`, `app/(shell)/error.tsx`, `middleware.ts`, `app/api/*`, `next.config.*`, all `components/ui/*`, `components/money/*`, `components/shell/*`, `components/illustrations/*`. **No `package.json` change** — no new runtime dependencies.

## Money & Currency Notes

This is a read-only feature, but it is **the first feature where multiple monetary aggregation surfaces intersect on one screen**. Constitution Principle I commitments:

- **Net worth aggregation.** Per-currency sum of `AccountDTO.balance` (already a canonical Decimal string from feature 007's `listAccountsForUser`). The reducer lifts each `balance` string to `new Money(balance)`, then sums per currency via either `acc.plus(money)` in a `Map<currency, Money>` reduce OR by collecting per-currency arrays and calling `sumAmounts(array)` from `lib/money/decimal.ts`. **Both paths consume `lib/money/` helpers exclusively** — no raw Decimal arithmetic, no `.plus()` on something other than a `Money` instance.
- **Cash-flow aggregation.** Per-currency, per-type sums computed by **Postgres** via Prisma `groupBy._sum.amount` (Postgres-side arithmetic on the Decimal column — exactly the same primitive `sumAmountsForAccountsBatch` uses; documented as constitution-compliant in feature 007 research.md R7). The application immediately lifts each `_sum.amount` Decimal to `new Money(...)`. The `net = income - |expense|` derivation happens via `Money` operations — since EXPENSE is stored negative per feature 007's signed-amount convention, `net = income.plus(expense)` is correct (no negation needed). The cash-flow widget renders `expense` either with its stored negative sign or as an absolute value with an explicit leading minus (both rendered via `<Money>`, which preserves the sign of the input).
- **TRANSFER exclusion.** The cash-flow `groupBy` `where:` clause filters `type: { in: ["INCOME", "EXPENSE"] }`. TRANSFER rows are excluded at the SQL level. The application does NOT receive transfer rows and does not need to filter them out post-fetch (FR-010 / FR-015 are honored at the query boundary, not in the application layer).
- **Currency adjacent to every amount.** Every aggregate shape carries its `currency` ISO 4217 code alongside the amount: `PerCurrencyTotal = { currency, total }`, `PerCurrencyCashFlow = { currency, income, expense, net }`. The `<Money currency={row.currency} amount={row.total} />` render path makes it impossible to display a monetary value without its currency code (FR-026, SC-003).
- **No FX, no implicit conversion.** A multi-currency user sees one row per currency in both the net-worth widget and the cash-flow widget. No reducer ever combines two different currencies (FR-006, FR-015, SC-004).
- **`<Money>` is the single rendering primitive.** Every monetary display surface on the dashboard uses `<Money>` from `components/money/money.tsx`. **No new component, no inline `formatAmount(...)` calls, no plain `<span>{amount}{currency}</span>` anywhere.** Audit grep `rg "formatAmount\(" app/(shell)/dashboard/_components/` returns zero matches; `rg "<Money " app/(shell)/dashboard/_components/` returns one match per monetary surface (net-worth row, cash-flow income/expense/net, recent-transaction amount).
- **The `lib/dashboard/aggregations.ts` file does NOT import `prisma`.** The audit grep `rg "from \"@/lib/prisma\"" lib/dashboard/` returns zero matches. The file is a pure consumer of typed function exports from `lib/accounts/`, `lib/transactions/`, and `lib/money/`. This preserves the data-scoping convention and the "prisma.transaction.* lives only in lib/transactions/queries.ts" invariant feature 007 established.

## Auth & Validation Boundaries

### Auth required at

- `/dashboard` page — already gated by `middleware.ts` from feature 003 (matcher includes `/dashboard/:path*`). The page's server component additionally calls `await auth()` for defense-in-depth AND to retrieve `session.user.id` for the data-scoping query helpers.

### Auth NOT required at

- N/A — this feature adds no public surface.

### Zod validation at

- **None.** The dashboard page has no request input. No `searchParams` consumed; no `FormData`; no route parameter. Per constitution Principle III's "trust internally for in-process objects" rule, the page reads the typed `session.user.id` and passes it to typed helper signatures; the helpers' typed inputs are trusted.

### Trust-internally rule

`computeNetWorthByCurrency`, `buildCashFlowShape`, `computeCurrentMonthRange` are pure in-process functions taking typed inputs (`AccountDTO[]`, the Prisma `groupBy` result type, no input respectively). They do NOT re-validate. The existing `listAccountsForUser`, `sumIncomeExpenseByCurrencyForUser`, `listTransactionsForUser` helpers similarly trust their typed `userId` argument (sourced from `session.user.id`).

### Cross-user isolation pattern

Same five-step rule from features 004 / 006 / 007:

1. `await auth()` at the dashboard server component.
2. `userId = session.user.id`.
3. Pass `userId` as the first positional arg to every `lib/transactions/queries.ts` and `lib/accounts/queries.ts` helper.
4. Every Prisma `where:` clause for the `account` and `transaction` tables includes `userId` — already enforced inside those modules.
5. **No code path** in this feature reads `userId` from request input (there is no request input on this page).

A user who somehow constructs a URL or request asserting another user's data sees their OWN dashboard. SC-010 met by construction. The dashboard's three queries all collapse to the requesting user's own data.

## Testing Strategy

### Unit (Vitest) — required (Principle IV)

New test files under `tests/unit/`:

- **`tests/unit/dashboard-aggregations.test.ts`** (new) — covers `computeNetWorthByCurrency` and `buildCashFlowShape`:
  - **`computeNetWorthByCurrency` cases:**
    - Empty `accounts: []` → returns `[]`.
    - Single account, single currency → returns `[{ currency: "USD", total: "1250.00" }]`.
    - Three accounts, two currencies (e.g., USD $2,500 + USD $1,750 + EUR €1,180) → returns `[{ currency: "USD", total: "4250.00" }, { currency: "EUR", total: "1180.00" }]` (USD first because absolute total $4,250 > €1,180 magnitude — note: per-currency magnitudes are compared by their string value, not by currency-converted value; FR-007's "descending absolute total" rule compares within a currency's own ordering, with the **largest-absolute-total currency listed first**).
    - Negative balance in one currency (credit-card debt outweighs cash in USD) → row shows the negative value; sort still works.
    - Zero balance in one currency, non-zero in another → both rows render; zero-balance row has `total = "0"` or canonical zero string.
    - Mixed signs within one currency (one positive, one negative, sum positive) → reducer sums correctly without rounding drift.
    - Tie-break: two currencies with equal absolute totals → ISO 4217 alphabetical ascending.
    - Archived-account exclusion is NOT the reducer's responsibility — the caller (`listAccountsForUser` with `includeArchived: false`) filters at the query layer. Test asserts the reducer trusts its input.
  - **`buildCashFlowShape` cases:**
    - Empty rows → returns `[]`.
    - Single currency with INCOME only → `{ currency: "USD", income: "5000.00", expense: "0.00", net: "5000.00" }`.
    - Single currency with EXPENSE only → `{ currency: "USD", income: "0.00", expense: "-1200.00", net: "-1200.00" }`.
    - Single currency with both → `{ currency: "USD", income: "5000.00", expense: "-1200.00", net: "3800.00" }`.
    - Multi-currency: USD with both + EUR with both → two rows, sorted by descending absolute net.
    - All-zero edge case → row renders with all zeros; not filtered out.
- **`tests/unit/dashboard-dates.test.ts`** (new) — covers `computeCurrentMonthRange`:
  - Mid-month call → `dateFrom` is the 1st of current month at UTC midnight; `dateTo` is the 1st of next month at UTC midnight (exclusive).
  - First-of-month call → same (the 1st of the current month is `dateFrom`; the 1st of next month is `dateTo`).
  - Last-of-month call → same (the 1st of the next month is correctly computed via UTC `new Date(Date.UTC(year, month + 1, 1))`).
  - December → January rollover → `dateTo` is January 1 of next year at UTC midnight.
  - Leap-year February (e.g., 2028-02-15 mocked "now") → `dateFrom` is 2028-02-01; `dateTo` is 2028-03-01.
  - The function is deterministic given the system time (vitest's `vi.setSystemTime` lets us pin the clock for each case).

### E2E (Playwright) — required (Principle IV — covers SC-005, SC-006, SC-007, SC-008, SC-010, SC-012)

One new spec: `tests/e2e/dashboard.spec.ts`. Outline:

1. `test.beforeAll` truncates `Transaction` then `Category` then `Account` then `User` (or relies on FK cascade).
2. **No-accounts state (SC-008).** Sign up user A. Visit `/dashboard`. Assert the no-accounts EmptyState is visible (heading "Welcome to Abacus", CTA to `/dashboard/accounts`). Assert no `<Money>` element renders anywhere on the screen (no monetary numbers). Assert the four-widget grid is NOT rendered.
3. **Seed accounts.** Create two USD accounts (Chase Checking $2,500, Schwab Savings $1,750) and one EUR account (Revolut €1,180). Navigate back to `/dashboard`. Assert four-widget layout renders (AddTransactionCta + 3 widgets).
4. **Net worth byte-for-byte (SC-005).** Assert the Net worth widget shows two rows: `USD $4,250.00` and `EUR €1,180.00` (in that order — largest absolute first). Navigate to `/dashboard/accounts`. Sum the per-account balances by currency. Assert the two sums match `$4,250.00` and `€1,180.00` byte-for-byte against the dashboard's rendered values.
5. **Cash-flow empty state.** Assert the Cash flow widget shows "No income or expense this month yet" (no transactions yet).
6. **Record transactions (SC-006 / SC-012 setup).** Open `/dashboard/transactions`. Create one INCOME (Salary, USD $5,000), one EXPENSE (Groceries, USD -$1,200), one INCOME (Freelance, EUR €400), one EXPENSE (Coffee, EUR -€80), and one TRANSFER (USD $500 from Chase Checking to Schwab Savings, same currency).
7. **Cash-flow byte-for-byte (SC-006).** Navigate back to `/dashboard`. Assert the Cash flow widget shows two blocks: USD ("Income $5,000.00 · Expense -$1,200.00 · Net $3,800.00") and EUR ("Income €400.00 · Expense -€80.00 · Net €320.00"). Assert the TRANSFER does NOT appear in either block. Navigate to `/dashboard/transactions`, filter to the current month, sum the per-type per-currency values manually (or compute via test helper); assert byte-for-byte match against the dashboard widget.
8. **Recent transactions byte-for-byte (SC-007).** Assert the Recent transactions widget shows the 6 rows (4 transactions + 2 transfer legs) in date desc / createdAt desc order. Navigate to `/dashboard/transactions`; assert the first 6 rows of the unfiltered list match the dashboard's recent list byte-for-byte. Click a row; assert navigation to `/dashboard/transactions` (top of list, no filter).
9. **Add-transaction CTA (SC-002).** Click the AddTransactionCta. Assert navigation to `/dashboard/transactions`. Press browser-back. Tab from the page top to the CTA, press Enter; assert same navigation (keyboard path, SC-014).
10. **Post-create reflection (SC-012).** From the dashboard, click AddTransactionCta → record one more INCOME (Bonus, USD $1,000). Navigate back to `/dashboard`. Assert the Net worth widget's USD row is `+$1,000.00` higher than before; the Cash flow widget's USD income line is `+$1,000.00` higher; the new row appears at the top of the Recent transactions widget.
11. **Cross-user isolation (SC-010).** Sign up user B in a fresh browser context. Visit `/dashboard`. Assert the no-accounts EmptyState — none of user A's data leaks. Sign back in as A; assert A's data is intact.
12. **Per-widget error boundary smoke test (FR-034) — optional, may be deferred.** Hard to simulate a Prisma error in E2E without mocking; consider covering this in a unit-level test on `<WidgetErrorBoundary>` instead.

The byte-for-byte assertions in steps 4, 7, and 8 are the load-bearing parts — they verify the "dashboard reflects the canonical truth" invariant (FR-008, SC-005, SC-006, SC-007).

### What can skip tests

- **`<WidgetCard>` visual styling** — covered by snapshot of one of the widget tests; not separately asserted.
- **`<EmptyCell>` rendering** — covered structurally by the empty-state assertions in the E2E.
- **Per-widget error boundary in E2E** — simulating a Prisma exception in Playwright is brittle; the boundary is covered by a small unit test on the class component (`tests/unit/widget-error-boundary.test.tsx`) if the implementer chooses to add it, but the constitution does not require it (the boundary is not a money path).
- **The `<AbacusIllustration>` rendering** — already covered by feature 002 / 003 / 007 tests; not re-asserted.

### Existing tests preservation (SC-013)

The existing unit + e2e suites from features 001–007 MUST continue to pass with no test weakened, removed, or skipped. The notable touchpoints:

- `tests/e2e/auth.spec.ts` — unchanged.
- `tests/e2e/accounts.spec.ts` — unchanged.
- `tests/e2e/categories.spec.ts` — unchanged.
- `tests/e2e/transactions.spec.ts` — unchanged (this feature does not modify `/dashboard/transactions` or its underlying queries in scope-affecting ways, per FR-039).
- `tests/unit/*` — unchanged.

The only behavioural change visible to those tests is: any e2e that signs up a user and visits `/dashboard` will now see either the four-widget layout (if the test seeded an account first) or the no-accounts EmptyState (if not). Today they see the WelcomePanel. The existing tests should not be asserting against the WelcomePanel's specific copy on `/dashboard` (they either navigate immediately to another route or assert the sidebar is present); if any do, they are updated in this feature's scope. (A quick grep `rg "Welcome to Abacus" tests/e2e/` will surface any such assertions; if zero matches, no test churn.)

### Constitution coverage summary

- **Principle IV money-paths unit suite**: PASS — `tests/unit/dashboard-aggregations.test.ts` covers the per-currency net-worth reducer + cash-flow shape adapter under empty / zero / negative / multi-currency / sort-order cases.
- **Principle IV signup→login→logout E2E**: PASS — `tests/e2e/auth.spec.ts` unchanged; still green.
- **Principle IV transfer E2E**: PASS — `tests/e2e/transactions.spec.ts` unchanged; still green.
- **Principle IV dashboard E2E**: PASS — `tests/e2e/dashboard.spec.ts` lands here (SC-005, SC-006, SC-007, SC-008, SC-010, SC-012).

## Risks & Trade-offs

1. **Per-widget error boundary as a client component.** React error boundaries must be client-side (the API is class-component-based). Wrapping a server component in a client error boundary is a well-supported Next.js pattern (the App Router's own `error.tsx` does this internally), but it means each of the three widgets must be **imported into a client component as children**. The boundary itself is ~30 lines; the import-chain is the only new pattern to learn. **Mitigation:** documented in research.md R5 + R12; the pattern is well-established (Next.js App Router docs describe it explicitly). **Decision: accept.** No new dep; the cost is one small class component.

2. **`computeNetWorthByCurrency` consumes `AccountDTO[]` where `balance` is a string.** The reducer must `new Money(balance)` to lift each string to a Decimal for arithmetic. The audit grep `rg 'new Money\(' lib/dashboard/` will return one match (the boundary lift). This is the same boundary pattern feature 007 established in `lib/accounts/queries.ts` (`new Money(a.startingBalance)`). **Decision: accept** — this is the canonical pattern; the money-reviewer audit allows `new Money(...)` lifts at boundary points (research.md R26 from feature 007).

3. **Cash-flow query uses Prisma `groupBy` on `(currency, type)`.** This is a new aggregation surface inside `lib/transactions/queries.ts`. Prisma supports `groupBy` with multiple grouping columns; the result type is well-typed. The index used is `[userId, date]` (the date-range filter is the selective predicate; the per-row currency + type filters are evaluated in-row). **Risk:** if a user has thousands of INCOME/EXPENSE rows in the current month, the groupBy still scans the date-range slice — fast at personal-finance scale, slow if a user has tens of thousands of rows in a month. **Mitigation:** not a v1 concern (scale ≤ ~10k transactions/user/year); a covering index on `(userId, date, type, currency)` could be added later if measurements show it. **Decision: accept** — no schema change; the existing `[userId, date]` index is sufficient.

4. **`listTransactionsForUser` gains a `limit` parameter.** Existing call sites in feature 007's `actions.ts` / `page.tsx` pass `filters` without `limit`. The new parameter is optional; when absent, no `take` is applied (current behaviour preserved). **Risk:** if a future caller forgets that the parameter exists and passes a filter shape without `limit` thinking the result will be capped, they get the full list. **Mitigation:** the parameter is documented in the JSDoc and contract; the dashboard explicitly passes `{ limit: 10 }`. **Decision: accept** — extending the existing helper is lower-coupling than adding a new `listRecentTransactionsForUser` that would be 95% duplication.

5. **Page-level loading vs. per-widget streaming (FR-033 lock).** Per the spec clarification, v1 uses the existing `(shell)/loading.tsx` for the entire page; per-widget Suspense streaming is explicitly deferred. **Risk:** if one of the three queries is slow (e.g., a user with 10k+ transactions where the cash-flow groupBy is the slow path), the whole page waits. **Mitigation:** measure first; the spec's SC-001 (2-second budget) covers the slow-query concern. If SC-001 begins to fail in production, the deferral can be revisited (and the architecture supports it — wrapping each widget in `<Suspense>` is a small change). **Decision: accept** for v1.

6. **The no-accounts state replaces the four-widget layout entirely (FR-003).** Some product calls would keep an "Add transaction" CTA visible even in the no-accounts state (with the disabled "Add an account first" helper). The spec is explicit: the four-widget layout (including the CTA) is replaced INSTEAD OF supplemented. The no-accounts EmptyState's own CTA points to `/dashboard/accounts` (the right destination — the user MUST add an account before any other action makes sense). **Decision: accept** — the spec is the authority; the UX is consistent with features 004 / 007's no-prerequisite empty states.

## Constitution Compliance — Post-Design Re-Check

After completing Phase 0 (research) and Phase 1 (data model, contracts, quickstart), the design re-passes every applicable gate:

| Principle | Status | Why |
|---|---|---|
| **I — Money math** | PASS | Per-currency net-worth aggregation uses `Money.plus(...)` from `lib/money/decimal.ts` exclusively. Per-currency cash-flow `_sum` comes from Postgres `groupBy._sum.amount` (Decimal-native); lifted to `Money` at the boundary; `net` derivation uses `Money` operations. No raw `.plus()` / `.minus()` / `new Decimal(...)` outside `lib/money/`-consuming call sites. Currency stored adjacent to every aggregate. No implicit FX. `<Money>` is the single rendering primitive. Audit greps `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/dashboard/ app/(shell)/dashboard/_components/` and `rg "formatAmount\(" app/(shell)/dashboard/_components/` codify the invariants. Money-reviewer audit (SC-011) met by construction. |
| **II — Type safety** | PASS | Strict TS; no `any`. Public types (`PerCurrencyTotal`, `PerCurrencyCashFlow`) exported from `lib/dashboard/index.ts`. Session typed via `await auth()`. All helpers take typed `userId: string`. |
| **III — Validate at boundaries** | PASS | No request input on the dashboard page → no Zod boundary needed. Auth at the page server component, not in helpers. Helpers trust their typed inputs (Principle III "trust internally for in-process objects"). |
| **IV — Test the money paths** | PASS | Unit suite covers per-currency aggregations + UTC month-boundary helper. Constitution-mandated E2E asserts SC-012 (post-create dashboard reflects the new row byte-for-byte). Existing feature-007 suites stay green (SC-013). |
| **V — Spec-driven** | PASS | spec → plan → tasks order observed; single feature in flight; 0 open clarifications (resolved 2026-05-25). |

**Conventions** (after Phase 1 design): all rows of the convention table still PASS — most importantly:
- **Data scoping**: `userId` is read from `session.user.id` once at the page server component and passed as the first positional arg to every query helper; no request-input userId path exists.
- **`prisma.transaction.*` confined to `lib/transactions/queries.ts`**: the new `sumIncomeExpenseByCurrencyForUser` helper lives in that file; `lib/dashboard/aggregations.ts` does NOT import `prisma`. Audit grep `rg "prisma\.transaction\." lib/ app/` still returns only `lib/transactions/queries.ts`.
- **`<Money>` single rendering primitive**: every monetary surface on the dashboard renders through `<Money>`. Audit grep `rg "formatAmount\(" app/(shell)/dashboard/` returns zero matches.

**No constitution violations identified. No Complexity Tracking entries required.**

## Phase 2 — Task Planning Approach

`/speckit-tasks` will generate `tasks.md` from this plan. Expected task bundles (provided here as a guide; the actual atomized task list is produced by `/speckit-tasks`):

1. **`lib/transactions/queries.ts` extensions.** Add `sumIncomeExpenseByCurrencyForUser`; extend `listTransactionsForUser` with optional `limit`. Run `pnpm typecheck`, `pnpm test`; existing feature-007 tests stay green.
2. **`lib/dashboard/dates.ts`.** Add `computeCurrentMonthRange()`. Ship `tests/unit/dashboard-dates.test.ts`.
3. **`lib/dashboard/aggregations.ts`.** Add `computeNetWorthByCurrency` and `buildCashFlowShape`. Ship `tests/unit/dashboard-aggregations.test.ts`. Define `PerCurrencyTotal` and `PerCurrencyCashFlow` types.
4. **`lib/dashboard/index.ts`.** Barrel re-export.
5. **`app/(shell)/dashboard/_components/widget-card.tsx`.** Shared visual shell.
6. **`app/(shell)/dashboard/_components/empty-cell.tsx`.** Tiny inline empty cell.
7. **`app/(shell)/dashboard/_components/widget-error-boundary.tsx`.** `"use client"` class component implementing per-widget React error boundary.
8. **`app/(shell)/dashboard/_components/net-worth-widget.tsx`.** Async server component.
9. **`app/(shell)/dashboard/_components/cash-flow-widget.tsx`.** Async server component.
10. **`app/(shell)/dashboard/_components/recent-transactions-widget.tsx`.** Async server component.
11. **`app/(shell)/dashboard/_components/add-transaction-cta.tsx`.** Server component for the CTA.
12. **Page wiring.** Replace `app/(shell)/dashboard/page.tsx`. Branch on account count; compose the four children inside their error boundaries.
13. **E2E.** Land `tests/e2e/dashboard.spec.ts` covering SC-005, SC-006, SC-007, SC-008, SC-010, SC-012.
14. **Final audits.** `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm test:e2e`. Run the money-reviewer grep audits:
    - `rg "prisma\.transaction\." lib/ app/` returns only `lib/transactions/queries.ts`.
    - `rg "from \"@/lib/prisma\"" lib/dashboard/` returns zero matches.
    - `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/dashboard/ app/(shell)/dashboard/_components/` returns only `new Money(...)` boundary lifts and `.plus(...)` / `sumAmounts(...)` calls on `Money` instances.
    - `rg "formatAmount\(" app/(shell)/dashboard/_components/` returns zero matches.
    - `rg "<Money " app/(shell)/dashboard/_components/` returns one match per monetary surface.

The implementer SHOULD execute these in dependency order (later steps consume earlier outputs). Task 1 (queries extension) and Tasks 2–4 (dashboard module) can in principle parallelize, but the implementer convention is one task at a time.

The `/speckit-tasks` output will expand each bundle into atomic, individually-verifiable units with explicit "DONE" / "DONE_WITH_CONCERNS" criteria.

## Complexity Tracking

No constitution violations. No justification entries required.

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, no schema change, no new dependencies, all three function-surface contracts written, money-correctness invariants codified for the money-reviewer audit
File: /Users/rgederin/git/abacus/specs/008-real-dashboard/plan.md
```
