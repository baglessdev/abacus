# Feature Specification: Real Dashboard

**Feature Branch**: `008-real-dashboard`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "for the real dashboard — replace the placeholder Welcome to Abacus page at /dashboard with a functional landing screen: net-worth widget, this-month cash flow, recent 10 transactions, quick Add transaction CTA"

> **Numbering note**: This is the roadmap-numbered feature **007 — Real dashboard** (Tier 1). The spec directory is `008-real-dashboard` because the branded-UI polish chore consumed spec-dir slot `005-branded-ui-polish` in May 2026 and the transactions feature took spec-dir slot `007-transactions`. The roadmap entry and this spec describe the same feature; the directory number tracks order-of-spec-authored, not the roadmap slot.

## Why

`/dashboard` is the first authenticated screen every user lands on after sign-in, and today it shows a friendly-but-empty "Welcome to Abacus" panel with a single CTA to manage accounts. After features 004 (Accounts), 006 (Categories), and 007 (Transactions + Transfers) shipped, the app now has real money flowing through it — but the home screen still tells the user nothing about that money. This feature closes the Tier 1 MVP loop by turning the landing screen into the answer to "what is the state of my finances right now?" The four widgets — net worth, this-month cash flow, recent activity, and a quick-add jump — are the absolute minimum payload a personal-finance app's home screen ships with; every competitor in the roadmap research baseline (YNAB, Copilot, Monarch, Lunch Money, Actual Budget, Firefly III) has all four.

This is also the first feature where multiple money paths intersect on a single screen. Net worth reads account balances (which already roll up transaction sums via feature 007's `lib/transactions/queries`). Cash flow reads INCOME and EXPENSE transactions in a date range. Recent activity reads the transaction list. The constitution's "no implicit FX, currency stays with amount, no arithmetic outside `lib/money/`" rules must hold across all of them simultaneously — and on a surface where the user is rapidly scanning four numbers, any rounding drift or per-widget currency inconsistency would be immediately visible. The money-reviewer subagent will audit this PR for the same invariants it enforced on feature 007.

This feature is read-only. It introduces no new domain entity, no new mutation surface, no new schema. Everything it shows is already in the database; the work is shaping it into widgets and rendering them through the established `<Money>` primitive.

## Clarifications

### Session 2026-05-25

- Q: Multi-currency rollup — when a user has accounts in 2+ currencies, does net worth (and cash flow) collapse to a single primary currency, or split into one row per currency? → A: **One row per currency, stacked.** No implicit FX (constitution Principle I). A user holding USD and EUR accounts sees a net-worth widget that lists "USD $4,250.00 · EUR €1,180.00" on separate rows; the widget never sums them into a single number. The same rule applies to the this-month cash flow widget (per-currency income / expense / net). A primary-currency profile setting is feature 017 and is explicitly out of scope here; introducing it would block this feature on settings work and would re-open the FX-snapshot decision that belongs to roadmap feature 020 (multi-currency FX). The single-currency-user case (the common case) renders as a single row, indistinguishable in layout from a multi-currency render with one currency present.
- Q: Cash flow definition — does the this-month cash flow widget include TRANSFER legs, or only INCOME and EXPENSE? → A: **INCOME and EXPENSE only.** Transfers are internal money movements (source leg negative, destination leg positive, atomic pair, sums to zero per currency by construction — feature 007's signed-amount convention). Including them in cash flow would either double-count (sum of all signed amounts is zero by definition) or be cosmetically misleading (showing $0 of net cash flow on a month where the user transferred $5,000 between accounts but had no real income or expense). Excluding TRANSFER mirrors how every roadmap-baseline competitor reports cash flow and is what feature 008 (Budgets) and feature 015 (Charts) will also do. The widget MUST show, per currency: total income (sum of INCOME amounts, positive), total expense (sum of EXPENSE amounts as their stored negative sign, then displayed as a negative or absolute value with explicit minus), and net (income − |expense|) — three labelled lines per currency, not a single number.
- Q: "Recent 10 transactions" — does a transfer pair count as 1 row (the user-intent atom) or 2 rows (the two ledger legs as stored)? → A: **2 rows.** Each persisted Transaction row is one list row, matching the existing `/dashboard/transactions` list behaviour from feature 007. A transfer between Chase Checking and Schwab Savings consumes 2 of the 10 recent slots. Rationale: consistency with the transactions list is high-value (the user has already learned to read that list and clicking a recent row will take them to that same list to edit); collapsing legs into a single logical row would introduce a new rendering rule that exists nowhere else in the app and would have to be re-decided for the Reports page (feature 016) anyway. The 10-row cap is a hard limit, not a hint; if 10 = 5 transfer pairs, the user sees 5 transfers. A "See all" link routes to `/dashboard/transactions` for the full list.
- Q: Recent-transactions row click behaviour — clickable row, non-interactive, or deep-link to the row's edit sheet? → A: **Whole row clickable; navigates to `/dashboard/transactions` (top of list).** Each row in the Recent transactions widget is a keyboard-focusable link that navigates to the unfiltered transactions list. No deep-link to the specific row (no `?edit=<id>` query parameter, no scroll-into-view). Rationale: consistency with the rest of the app (rows are interactive throughout the existing transactions / accounts / categories lists), zero new affordance to invent, easy to satisfy keyboard-accessibility (one Tab stop per row), and the "See all" link in FR-021 remains the explicit "no-target-row-in-mind" entry point. Per-row deep linking is the polish item already deferred in Out of Scope.
- Q: When one of the dashboard's three independent server-side queries fails (e.g., transient DB error on the transactions aggregation), does the whole page fall through to the shell-level error UI, or do widgets fail independently? → A: **Per-widget error boundary.** Each of the three data-driven widgets (Net worth, This-month cash flow, Recent transactions) MUST render an inline "Couldn't load — Try again" error state on its own data-fetch failure WITHOUT affecting the rendering of the other widgets. The Add-transaction CTA has no async dependency and MUST always render (subject to the no-accounts disabled-state rule of FR-024). The shell-level `(shell)/error.tsx` remains the catch-all for non-data errors (route boundary, render-time exceptions outside a widget). Rationale: net worth, cash flow, and recent activity each read from a different query path and each is independently meaningful — a transient failure on one should not blank out the other two, which is what happens with the existing whole-page error boundary. This mirrors every roadmap-baseline competitor's dashboard resilience pattern and adds no new infrastructure (Server-Component-level error boundaries already supported).
- Q: Loading state during initial server-side data fetch — whole-page loading skeleton, per-widget streaming, or no loading state at all? → A: **Whole-page loading via the existing `(shell)/loading.tsx`.** The dashboard MUST NOT introduce per-widget Suspense streaming or per-widget skeleton placeholders in v1. The three queries are small and indexed (feature 007 already added the necessary covering indexes); they complete together well within the SC-001 2-second budget, so the perceived-performance gain from streaming is marginal while the cognitive overhead of three skeletons revealing one-by-one is real. Consistency with features 004 / 006 / 007 (whose list pages all use the same whole-page loading pattern) is high-value. Streaming MAY be revisited if SC-001 begins to fail in production; it is explicitly NOT a v1 requirement. The decision is independent of the per-widget ERROR boundary decision (Q above): a widget can error independently after the page has loaded, but the initial load is page-level.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See net worth at a glance (Priority: P1)

As an authenticated user who has been recording transactions for a few weeks, when I open the app to `/dashboard`, the first thing I want to know is "how much money do I have right now, across all my accounts, in each currency I hold." I want this without clicking anything, without picking a date range, and without seeing any monetary number without its currency code attached.

**Why this priority**: Net worth is the single most-asked question a personal-finance home screen answers. It is the headline metric in YNAB, Copilot, Monarch, Lunch Money, and Actual Budget. Without it on the landing screen, the user must navigate to `/dashboard/accounts` and mentally sum a list — which defeats the purpose of having a dashboard. P1 because the entire feature's "is this useful?" verdict hinges on this widget being present, correct, and immediately legible.

**Independent Test**: From an authenticated user who has at least one non-archived account with a non-zero balance, navigate to `/dashboard`. A "Net worth" widget is visible above the fold, labelled, with one row per currency the user holds. Each row shows a single monetary value rendered via the standard money component (currency code shown, tabular numerals, sign-aware colour). The sum equals — byte-for-byte — what the user would compute by reading `/dashboard/accounts` and summing the per-account balances grouped by currency.

**Acceptance Scenarios**:

1. **Given** an authenticated user with three non-archived accounts (Chase Checking USD $2,500.00, Schwab Savings USD $1,750.00, Revolut EUR €1,180.00), **When** they navigate to `/dashboard`, **Then** the Net worth widget renders two rows: "USD $4,250.00" and "EUR €1,180.00", in a stable order (largest absolute value first, ties broken by ISO 4217 code ascending), each with its currency code visible and the amount rendered through the shared money component.
2. **Given** the same user has one archived account (Old Bank USD $500.00), **When** the dashboard renders, **Then** the USD row remains $4,250.00 — the archived account is excluded.
3. **Given** an authenticated user whose accounts net to a negative balance in one currency (credit-card debt outweighs cash in USD), **When** the dashboard renders, **Then** the USD row shows the negative value with the sign-aware colour treatment defined by the money component (negative state), distinguishable without relying on colour alone (the leading minus sign and the parenthesisation rule of the money component).
4. **Given** the user reloads the page after recording a new $50 expense, **When** the dashboard re-renders, **Then** the Net worth widget's affected currency row is lower by exactly $50.00 (no rounding drift, byte-for-byte against the same computation against `/dashboard/accounts`).
5. **Given** a SECOND authenticated user with their own accounts, **When** both users have the dashboard open, **Then** each user sees only their own net worth — there is no cross-user leakage of any monetary number, account name, or currency.

---

### User Story 2 — See recent activity at a glance (Priority: P1)

As an authenticated user, when I open `/dashboard` I want to see the 10 most recent things that have happened in my finances — what I spent, what I earned, what I transferred — without leaving the home screen. I want to recognise each row at a glance (date, account, category, amount with currency) and I want a one-click way to get to the full transactions list if I need more.

**Why this priority**: Recent activity is the second-most-asked question on a personal-finance home screen ("what just happened to my money?"). It is also the most efficient "did I record this yet?" check — the user remembers paying the coffee shop this morning and looks at the recent list to confirm. Without this, the user has to navigate to `/dashboard/transactions` to scan the same list, which negates the value of having a dashboard. P1 because alongside net worth it forms the minimum-viable answer to "how am I doing?"

**Independent Test**: From an authenticated user with at least 15 non-archived transactions across at least 2 accounts and at least 1 transfer pair, navigate to `/dashboard`. A "Recent transactions" widget is visible, showing exactly 10 rows in the same sort order as `/dashboard/transactions` (date descending, then `createdAt` descending). Each row shows the same minimum information shown in the transactions list: date, payee (or account/category fallback for transfers), category, account, signed amount with currency, rendered through the shared money component. A "See all" link below the list navigates to `/dashboard/transactions`. Archived transactions are excluded.

**Acceptance Scenarios**:

1. **Given** an authenticated user with 25 non-archived transactions, **When** they open `/dashboard`, **Then** the Recent transactions widget shows exactly 10 rows, sorted by date descending then `createdAt` descending — identical to the first 10 rows of the unfiltered `/dashboard/transactions` list.
2. **Given** a user has recorded 3 transactions today (10:00, 11:00, 14:00) and 8 transactions yesterday, **When** the dashboard renders, **Then** all 3 of today's rows appear first (most recent `createdAt` first within the same date), followed by 7 of yesterday's rows (the most recent 7).
3. **Given** a user has 5 archived transactions, **When** the dashboard renders, **Then** none of the archived rows appear in the Recent transactions widget; the 10 shown are all non-archived.
4. **Given** a user has executed 5 transfer pairs (10 transfer-leg rows) in the past week and no other transactions, **When** the dashboard renders, **Then** the Recent transactions widget shows 10 rows — both legs of all 5 transfers — each row labelled with its account and the appropriate signed amount (source negative, destination positive).
5. **Given** a user has 7 total non-archived transactions (fewer than 10), **When** the dashboard renders, **Then** the Recent transactions widget shows all 7 rows; no padding rows or "empty slot" placeholders appear.
6. **Given** a user has clicked (or pressed Enter on a keyboard-focused) row in the Recent transactions widget, **When** the activation is registered, **Then** they are navigated to `/dashboard/transactions` (top of the unfiltered list — no deep-link to the specific row in v1).
7. **Given** a user activates the "See all" link, **When** the navigation completes, **Then** they are on `/dashboard/transactions` with no filters applied.

---

### User Story 3 — Track this-month cash flow (Priority: P2)

As an authenticated user, mid-month, I want to know whether I am net-positive or net-negative this month — that is, the sum of my income so far this calendar month minus the sum of my expenses so far this calendar month, per currency I hold. I want this without picking a date range; "this month" should mean the calendar month I am currently in.

**Why this priority**: Cash flow is the third-most-common landing-screen widget across the roadmap-baseline competitors. It is the question "am I living within my means this month?" expressed as a single per-currency number. It is one priority tier below net worth and recent activity because (a) it is meaningful only after the user has been recording transactions for a few weeks, and (b) without this widget the dashboard is still useful — net worth and recent activity alone deliver real value on day one. P2 because it raises the dashboard from "useful" to "compelling" but is not the keystone.

**Independent Test**: From an authenticated user with at least one INCOME and one EXPENSE transaction dated within the current calendar month, navigate to `/dashboard`. A "This month" cash flow widget is visible, showing — for each currency the user has had income or expense activity in this month — three labelled lines: income (positive sum), expense (negative sum or absolute value with explicit minus), and net (income minus absolute-value of expense, signed). TRANSFER rows do not appear in any of the three lines. The sum equals what the user would compute by filtering `/dashboard/transactions` to the current month and summing per type per currency.

**Acceptance Scenarios**:

1. **Given** an authenticated user this month has recorded: USD income $5,000 (salary), USD expense -$1,200 (groceries + utilities), EUR income €400 (freelance), EUR expense -€80 (coffee), and a USD→USD transfer of $500 between checking and savings, **When** they open `/dashboard`, **Then** the Cash flow widget renders two currency blocks: USD ("Income $5,000.00 · Expense -$1,200.00 · Net $3,800.00") and EUR ("Income €400.00 · Expense -€80.00 · Net €320.00"). The transfer does not appear in either block.
2. **Given** the user has no INCOME or EXPENSE rows this month (only transfers, or no transactions at all), **When** the dashboard renders, **Then** the Cash flow widget shows an empty state ("No income or expense this month yet") and the Recent transactions widget renders independently.
3. **Given** the calendar rolls over to a new month at midnight UTC, **When** the user reloads the dashboard on the first day of the new month, **Then** the Cash flow widget shows only that day's INCOME / EXPENSE rows (or the empty state if none).
4. **Given** the user has only EXPENSE this month (no income yet), **When** the dashboard renders, **Then** the per-currency block shows "Income $0.00 · Expense -$1,200.00 · Net -$1,200.00" (the zero income line is rendered, not omitted; the net is negative).
5. **Given** the user has archived all of this month's transactions, **When** the dashboard renders, **Then** the Cash flow widget shows the empty state — archived rows are excluded.
6. **Given** the user crosses a calendar-month boundary during a session (cache or stale render), **When** the dashboard re-fetches on next interaction, **Then** the "this month" window is recomputed from the current calendar date, not from the page-load date.

---

### User Story 4 — Quick-add a transaction from the dashboard (Priority: P2)

As an authenticated user who just spent money in the real world and pulled up the app to record it, I want a single primary action on the dashboard that takes me directly to the transaction-entry surface — not to a list, not to a menu, but to the form. The CTA should be the visually dominant action on the screen.

**Why this priority**: The dashboard is the most likely entry point for a "just got home from the store and need to log it" flow. Forcing the user to first navigate to a sidebar item, then click an Add button on a list view is two extra interactions for the most common write path in the app. P2 because the dashboard is still functional and informative without this CTA (the user can still reach the same form through the sidebar), but with it the home screen becomes the natural start of the add-a-transaction flow.

**Independent Test**: From an authenticated user with at least one non-archived account, navigate to `/dashboard`. A primary "Add transaction" CTA is visible at the top of the screen, keyboard-focusable, with text that clearly identifies it as a quick-add action. Activating it (click or keyboard Enter) navigates the user to `/dashboard/transactions`. If the user has zero non-archived accounts the CTA is disabled with explanatory text pointing them to `/dashboard/accounts`.

**Acceptance Scenarios**:

1. **Given** an authenticated user with at least one non-archived account, **When** they open `/dashboard`, **Then** an "Add transaction" CTA is visible above the widgets, styled as the page's primary action, keyboard-focusable.
2. **Given** the CTA is visible, **When** the user activates it (mouse click or keyboard Enter while focused), **Then** the browser navigates to `/dashboard/transactions`.
3. **Given** the user has zero non-archived accounts (e.g., a brand-new account or every account is archived), **When** the dashboard renders, **Then** the "Add transaction" CTA is disabled (visually distinct, not keyboard-focusable as an actionable button, or focusable but inert) with helper text such as "Add an account first" linking to `/dashboard/accounts` — matching the pattern feature 007 already uses on the transactions page (FR-029 of feature 007's spec).
4. **Given** the user activates the CTA via keyboard (Tab to focus, Enter to fire), **When** the navigation completes, **Then** they are on `/dashboard/transactions` and focus is on a sensible target on that page (its existing focus behaviour from feature 002 / 007 is preserved; this feature does not modify that page).

---

### User Story 5 — First-time user with no accounts (Priority: P2)

As a brand-new user who has just signed up and has not yet created any accounts, when I land on `/dashboard` I should see a clear, friendly empty-state screen that tells me what is missing and points me to the next action — not a screen full of zeroes that looks broken.

**Why this priority**: Every signup leads here. The first impression of "is this app working?" is decided on this screen. If we render Net worth as "$0.00", Cash flow as "Income $0.00 · Expense $0.00 · Net $0.00", and Recent transactions as an empty box, the user does not know if Abacus is broken, if they did something wrong, or if they are supposed to do something next. P2 because it is a quality-of-onboarding issue rather than a correctness issue; the feature is still technically correct without it, but the new-user funnel is materially worse.

**Independent Test**: From a newly-signed-up user (zero accounts, zero transactions), navigate to `/dashboard`. A single illustrated empty state is shown — not the four widgets in their zero state — with a heading ("Welcome to Abacus" or similar), explanatory copy, and a primary CTA pointing to `/dashboard/accounts`. No monetary numbers are shown anywhere on the screen.

**Acceptance Scenarios**:

1. **Given** an authenticated user with zero non-archived accounts, **When** they navigate to `/dashboard`, **Then** the four-widget layout is replaced by a single empty-state panel with a "Add your first account" CTA linking to `/dashboard/accounts` — visually consistent with the empty states feature 007 uses on the transactions page.
2. **Given** an authenticated user has at least one non-archived account but zero transactions, **When** they navigate to `/dashboard`, **Then** the Net worth widget renders (showing the starting-balance-derived value), the Cash flow widget shows its empty state ("No income or expense this month yet"), the Recent transactions widget shows its empty state ("No transactions yet — start by adding one"), and the Add transaction CTA is enabled.
3. **Given** a user has accounts in 2 currencies but no transactions, **When** the dashboard renders, **Then** the Net worth widget shows both currencies' starting balances grouped per currency; the cash flow and recent widgets show their empty states.
4. **Given** a user has accounts and transactions but every account is archived, **When** the dashboard renders, **Then** the screen shows the no-accounts empty state (the "first-time user" screen) — there are no active accounts to roll up.

---

### Edge Cases

- **All accounts archived**: same render as zero-accounts (the no-accounts empty state from US5).
- **All transactions archived**: net worth renders from starting balances only; cash flow shows empty state; recent transactions shows empty state.
- **Single archived row inside the recent 10**: excluded; the 11th non-archived row takes its slot.
- **More than 10 currencies in net worth**: render all of them (no truncation) — a user holding 10+ currencies is unusual but real; truncation would silently hide money. The layout MUST gracefully stack additional rows.
- **A single transaction with a categoryId pointing to an archived category**: the row still renders in Recent transactions; the category label uses the category's last-known name (the existing transactions-list behaviour from feature 007 is reused, not redefined here).
- **A transaction in a currency that no account currently holds**: by construction this cannot occur — feature 007's boundary rejects mismatched currency at write time. If it ever appeared (data corruption), the row MUST still render in Recent transactions with its stored currency code; the cash flow widget MUST count it under that currency.
- **Calendar month with a single day so far (the 1st)**: cash flow widget shows only that day's INCOME / EXPENSE (likely the empty state); is functionally indistinguishable from "no transactions this month".
- **Timezone-edge timestamps**: a transaction dated 2026-05-31 (UTC calendar day) is part of May's cash flow regardless of the user's local timezone; "this month" is defined by UTC calendar month boundaries (consistent with feature 007's UTC-calendar-day storage). Per-user timezone rendering is a feature 017 (Settings) concern, not this feature's.
- **Cross-user attempt**: a user who somehow constructs a URL or request asserting another user's data sees their OWN dashboard. No 403, no leakage; all queries are user-scoped at the data layer (FR-025).
- **Concurrent edit during render**: if a transaction is added between the page's initial data fetch and a re-render, the dashboard MUST reflect the new state on next render or navigation. No real-time push is required (out of scope).
- **One widget query fails**: per FR-034, only that widget renders its inline error state with a retry affordance; the other widgets render their data normally and the Add-transaction CTA remains active.
- **All three widget queries fail simultaneously**: each widget independently renders its own inline error state; the page header and CTA still render; the user is NOT bounced to the shell-level error page.

## Requirements *(mandatory)*

### Functional Requirements

**Page composition & routing**

- **FR-001**: The route `/dashboard` MUST replace the existing "Welcome to Abacus" placeholder panel with a functional dashboard. The sidebar navigation MUST remain unchanged (the existing "Dashboard" sidebar item still routes here).
- **FR-002**: The dashboard MUST render four widgets when the user has at least one non-archived account: a "Net worth" widget, a "This month" cash flow widget, a "Recent transactions" widget, and an "Add transaction" CTA — in that order of visual prominence.
- **FR-003**: When the user has zero non-archived accounts, the dashboard MUST render the no-accounts empty state (US5) INSTEAD OF the four widgets — not in addition to them, not below them, not as an overlay.

**Net worth widget**

- **FR-004**: The Net worth widget MUST aggregate every non-archived account's current balance grouped by ISO 4217 currency, rendering one row per currency.
- **FR-005**: Each net-worth row MUST display the per-currency total via the shared money component (currency code shown alongside the value; tabular numerals; sign-aware colour treatment).
- **FR-006**: The widget MUST NOT perform any FX conversion, MUST NOT collapse multiple currencies into one number, and MUST NOT show any monetary value without its currency code.
- **FR-007**: Per-currency rows MUST render in stable order: descending absolute total within currency, ties broken by ISO 4217 alphabetical ascending.
- **FR-008**: The widget's per-currency values MUST equal — byte-for-byte — the corresponding rollup the user would obtain by reading `/dashboard/accounts` and summing by currency.
- **FR-009**: When the user has accounts but every account has zero balance (no starting balance, no transactions), the widget MUST render one zero row per currency held (it MUST NOT show an empty state — the accounts exist).

**This-month cash flow widget**

- **FR-010**: The Cash flow widget MUST aggregate INCOME and EXPENSE transactions (TRANSFER rows excluded) dated within the current calendar month (UTC-defined boundaries), grouped by ISO 4217 currency.
- **FR-011**: Each currency block MUST display three labelled lines: total income (positive sum of INCOME amounts), total expense (sum of EXPENSE amounts, displayed with their stored negative sign or with an explicit leading minus), and net (income minus absolute-value of expense, signed).
- **FR-012**: All three values MUST render through the shared money component with the currency code visible; the empty/zero state for any of the three MUST render as a zero value with the currency code, not as an empty string.
- **FR-013**: Archived transactions MUST be excluded.
- **FR-014**: When the user has zero INCOME / EXPENSE transactions in the current calendar month across all currencies, the widget MUST render a single empty state ("No income or expense this month yet") instead of a per-currency block.
- **FR-015**: The widget MUST NOT perform any FX conversion and MUST NOT include TRANSFER amounts in any of income, expense, or net.
- **FR-016**: The "current calendar month" boundary MUST be recomputed at request time, not cached across requests, so a render that crosses midnight UTC into a new month uses the new month's window on the next fetch.

**Recent transactions widget**

- **FR-017**: The widget MUST list the 10 most recent non-archived transactions for the user, sorted by `date` descending then by `createdAt` descending — the same sort and same exclusion semantics as the unfiltered `/dashboard/transactions` list.
- **FR-018**: Each row MUST show: date, payee (with the existing transaction-list fallback for transfers), category name, account name, signed amount with currency via the shared money component. Transfer pairs MUST appear as 2 rows (one per leg), each row labelled with its own account and signed amount.
- **FR-019**: When the user has fewer than 10 non-archived transactions, the widget MUST show all of them; it MUST NOT show empty placeholder rows.
- **FR-020**: When the user has zero non-archived transactions (but at least one non-archived account), the widget MUST render an empty state ("No transactions yet — start by adding one") that does not block rendering of the other widgets.
- **FR-021**: The widget MUST include a "See all" link that navigates to `/dashboard/transactions` with no filters applied. Each individual row MUST itself be a keyboard-focusable link that navigates to the same destination (`/dashboard/transactions`, top of list, no filters). The row link MUST NOT deep-link to the specific transaction via query parameter, anchor, or scroll-into-view — per-row deep linking is a future polish item (Out of Scope).

**Quick-add CTA**

- **FR-022**: A primary "Add transaction" call-to-action MUST be visible at the top of the dashboard, keyboard-focusable, visually styled as the dominant action on the screen.
- **FR-023**: Activating the CTA (mouse click or keyboard Enter) MUST navigate the user to `/dashboard/transactions`. The CTA MUST NOT open an inline form on the dashboard, MUST NOT inject the transaction-form sheet into the dashboard route, and MUST NOT introduce any deep-link query string this feature would have to define.
- **FR-024**: When the user has zero non-archived accounts, the CTA MUST be disabled with helper text pointing the user to `/dashboard/accounts` — matching the pattern feature 007 already uses on the transactions page.

**Data-scoping & money correctness**

- **FR-025**: Every value displayed on the dashboard MUST be scoped to the current session's user. Cross-user attempts (whether by URL manipulation or any other vector) MUST resolve to the requesting user's own dashboard, never another user's data.
- **FR-026**: No monetary value displayed anywhere on the dashboard MUST be rendered without its currency code. The shared money component is the single rendering primitive; no per-widget money-display code is permitted.
- **FR-027**: No arithmetic on monetary values MUST occur outside the established money-helper module (constitution Principle I). Widget aggregation MUST reuse the existing per-account balance computation and the existing transaction-aggregation helpers; no widget MUST do its own `+`/`-` on `Decimal` strings or `Number` values.
- **FR-028**: All monetary values MUST render with tabular numerals (so vertically-stacked rows align on the decimal point).

**Accessibility & general quality**

- **FR-029**: The dashboard MUST be fully keyboard-operable: the Add-transaction CTA, the See-all link, and any Recent-transactions row links MUST be reachable via Tab and activatable via Enter; the focus order MUST be top-to-bottom, left-to-right; visible focus indicators MUST follow the project's existing focus-ring conventions.
- **FR-030**: Sign and category identity MUST NOT rely on colour alone (e.g., a negative amount MUST be identifiable from the leading minus sign or the money component's existing sign treatment, not solely from a red text colour).
- **FR-031**: The dashboard MUST work without JavaScript for its initial render of the widgets (server-rendered values are acceptable; later interactivity such as link navigation is the browser's responsibility, not this feature's).
- **FR-032**: Each widget MUST have an accessible label (a heading or labelled region) so a screen reader user can announce its purpose.

**Loading & resilience**

- **FR-033**: Initial dashboard load MUST use the existing shell-level loading skeleton (`(shell)/loading.tsx`). The dashboard MUST NOT introduce per-widget Suspense streaming, per-widget skeleton placeholders, or any other partial-render pattern for the initial server-side data fetch in v1. All three data-driven widgets become visible together when the page is ready.
- **FR-034**: Each of the three data-driven widgets (Net worth, This-month cash flow, Recent transactions) MUST be wrapped in its own error boundary. A data-fetch failure inside one widget MUST render an inline error state ("Couldn't load — Try again") scoped to that widget alone; the other two widgets MUST continue to render normally. The loading-vs-error decisions are independent: a widget can error after the page has loaded, but the initial load remains page-level (FR-033).
- **FR-035**: The inline widget error state MUST include a user-actionable retry affordance (e.g., a Try-again button or link) and MUST be keyboard-focusable, consistent with FR-029.
- **FR-036**: The Add-transaction CTA MUST always render regardless of any widget's error state, subject only to the no-accounts disabled-state rule of FR-024 (the CTA itself has no asynchronous data dependency).
- **FR-037**: The shell-level error boundary (`(shell)/error.tsx`) MUST remain the catch-all for render-time exceptions thrown OUTSIDE a widget error boundary (e.g., a session/auth failure, a route-level error). This feature MUST NOT modify shell-level error handling.

**Scope guardrails**

- **FR-038**: The following items MUST NOT be introduced in this feature: charts/graphs (feature 015), budget widgets or progress bars (feature 008), a date-range picker, drill-down reports (feature 016), real-time push updates, FX conversion (feature 020), settings for primary currency (feature 017), CSV export of dashboard contents (feature 014), per-widget streaming / Suspense skeletons (FR-033 explicitly defers this).
- **FR-039**: The transactions page (`/dashboard/transactions`), accounts page (`/dashboard/accounts`), categories page (`/dashboard/categories`), and their underlying queries / mutations MUST NOT be modified in scope-affecting ways. Read-only consumption of their existing query helpers IS allowed.

### Key Entities

This feature introduces no new entities and no new database schema. It is a read-only consumer of:

- **Account** (feature 004): per-currency, per-user; reads non-archived accounts and their computed balances.
- **Transaction** (feature 007): per-user; reads non-archived rows for the recent-10 list and for current-calendar-month INCOME / EXPENSE aggregation.
- **Category** (feature 006): per-user; reads category name and identity for the Recent transactions row labels.
- **User** (feature 003): the session subject; all queries are scoped by `userId` from the session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has at least one non-archived account can read their net worth (per currency) within 2 seconds of landing on `/dashboard` on a typical network — the value is visible above the fold without scrolling on a standard laptop viewport (≥1280×720).
- **SC-002**: A user can reach the transaction-entry form from `/dashboard` in exactly one interaction (one click or one keyboard Enter), down from two interactions today (navigate to transactions sidebar item, then click Add).
- **SC-003**: 100% of monetary values rendered on the dashboard are shown alongside their ISO 4217 currency code (constitution-mandated; verified by inspection of every monetary surface on the page).
- **SC-004**: 0% of dashboard renders perform implicit FX conversion across currencies (verified by spec assertion: multi-currency users see one row per currency, never a single collapsed total).
- **SC-005**: For any user, the per-currency Net worth value displayed on `/dashboard` equals — byte-for-byte — the corresponding rollup on `/dashboard/accounts` summed by currency. (Verifiable by a single end-to-end assertion.)
- **SC-006**: For any user, the per-currency This-month cash flow value displayed on `/dashboard` equals — byte-for-byte — the result of filtering `/dashboard/transactions` to the current calendar month (UTC), excluding TRANSFER, grouped by currency, separately summing INCOME and EXPENSE.
- **SC-007**: For any user, the Recent transactions widget shows exactly the first 10 rows of the unfiltered `/dashboard/transactions` list under the same sort, with archived rows excluded. (If the user has fewer than 10, it shows exactly N rows.)
- **SC-008**: A brand-new user (zero accounts) lands on `/dashboard` and is shown a single empty-state panel with a "Add your first account" CTA — no monetary numbers, no zero-state widget grid, no broken-looking screen.
- **SC-009**: A user with accounts but zero transactions sees Net worth (starting balances), the Cash flow empty state, the Recent transactions empty state, and an enabled Add-transaction CTA — all four widgets render gracefully.
- **SC-010**: Cross-user data leakage attempts (URL manipulation, second-tab race, hand-crafted requests) resolve to the requesting user's own dashboard 100% of the time. Zero pixels of another user's data are ever rendered.
- **SC-011**: The constitution Principle I (money math) audit on this PR finds zero new arithmetic on monetary values outside the established money-helper module. (Verified by the money-reviewer subagent at PR time.)
- **SC-012**: The constitution Principle IV E2E suite (a user signs up, creates an account, records a transaction) continues to pass; additionally, an E2E asserts that net worth and cash flow on the dashboard update to reflect that new transaction byte-for-byte.
- **SC-013**: The existing test suites (unit, integration, E2E) from features 001–007 continue to pass with no test weakened, removed, or skipped.
- **SC-014**: The dashboard is fully keyboard-operable: a keyboard-only user can Tab from the page top to the Add-transaction CTA, activate it with Enter, and arrive on the transactions page — no mouse interaction required at any step.
- **SC-015**: The placeholder "Welcome to Abacus" panel is no longer rendered on `/dashboard` for a user who has at least one non-archived account. The sidebar nav is unchanged.

## Assumptions

- Per-user primary-currency setting does not yet exist (it is feature 017, Settings). Multi-currency users see per-currency rows, not a single rolled-up number; this feature does not introduce a primary-currency concept.
- "This month" is defined by the current UTC calendar month, consistent with feature 007's UTC-calendar-day storage for transaction dates. Per-user timezone rendering is feature 017's concern and is out of scope here.
- The shared money component established by feature 004 (and extended through features 006 and 007) is the single rendering primitive for monetary values on the dashboard; no new money-display component is introduced.
- The transaction-list sort order (date desc, createdAt desc) established by feature 007 is the same sort used by the Recent transactions widget; if feature 009 (Search & filter) later changes the default sort, the dashboard's Recent widget is expected to follow.
- Recent-row clicks land on `/dashboard/transactions` (top of list, unfiltered) as the v1 navigation target; deep-linking to the specific row is a future polish item and is out of scope.
- The dashboard's data is fetched server-side at page request time (consistent with the existing `/dashboard` server-component pattern from feature 002 and the welcome panel). No client-side cache, no streaming, no incremental hydration is introduced.
- No real-time updates: a transaction added in another tab is visible after a manual reload or the next navigation event, not via a push channel.
- N+1 query mitigations established by feature 007 (`sumAmountsForAccountsBatch` for per-account rollup) are reused; this feature does not regress the dashboard to per-account round-trips.
- The empty-state illustration and copy reuse the existing `EmptyState` + `AbacusIllustration` primitives from features 002 / 003 / 007; no new illustration asset is introduced.

## Out of Scope (Explicit)

The following items are explicitly NOT introduced by this feature and are deferred to the named roadmap features:

- **Charts and visualisations** — feature 015 (Charts). No pie chart, no stacked area, no net-worth-over-time line, no budget-vs-actual bar.
- **Budget widget / progress bars** — feature 008 (Budgets).
- **Date-range picker on the dashboard** — out of scope; the cash flow widget is hard-coded to the current calendar month. Feature 016 (Reports) introduces a date-range picker on its own page.
- **Drill-down reports** — feature 016 (Reports).
- **CSV export of dashboard contents** — feature 014 (CSV export).
- **Primary-currency profile setting** — feature 017 (Settings).
- **Multi-currency FX conversion** — feature 020 (multi-currency FX).
- **Real-time updates / push** — not planned; manual reload or navigation refreshes the dashboard.
- **Drag-to-reorder, hide/show widgets, customisable layout** — not planned for v1.
- **Inline transaction add on the dashboard** — the Quick-add CTA navigates to `/dashboard/transactions`; no sheet is opened on the dashboard route itself.
- **Recent-row deep-link to a specific transaction** — clicking a row navigates to the transactions list (top); per-row deep linking is a future polish item.
