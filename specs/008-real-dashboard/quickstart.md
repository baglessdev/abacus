# Feature 008 — Real Dashboard — Quickstart

A 5-minute "verify this feature works" walkthrough for a developer who has features 001–007 already working. If you don't, run those quickstarts in order first (especially `specs/007-transactions/quickstart.md` — the dashboard depends on the transaction surface it lands), then return here.

This feature is **strictly read-only**: no new dependency to install, no new migration to apply, no new env var to set. Everything below should work after a `git pull` and a fresh `pnpm install` (the install is only needed if your `node_modules/` is stale; no new deps were added).

## 1. No new dependencies to install

This feature introduces **no new runtime dependencies**. Verify:

```bash
git diff main -- package.json
# Expected: zero changes (or no diff if you're on main).
```

If your `node_modules/` is stale for any reason:

```bash
pnpm install
```

## 2. No new environment variables

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` from features 001 and 003 are all that's needed. Verify:

```bash
cat .env.local
```

`pnpm dev` will fail fast with a Zod error if any required var is missing.

## 3. No new migration to apply

This feature **does not change the database schema**. Verify:

```bash
git diff main -- db/schema.prisma db/migrations/
# Expected: zero changes.
```

Your existing local Postgres state (from feature 007) is the correct state for this feature. No `pnpm db:migrate` is needed.

## 4. Seed test data (optional but recommended)

The dashboard is most fun to verify with real-looking data. Use the existing demo-user seeder:

```bash
pnpm seed:demo-user
```

This creates (or refreshes):

- A demo user (`demo@abacus.local`, password from the script — check `scripts/seed-demo-user.ts`).
- Several non-archived accounts in at least two currencies.
- A few dozen non-archived transactions spread across the past few weeks (a mix of INCOME, EXPENSE, and at least one TRANSFER pair).

If you'd rather seed by hand, sign up a fresh user via `/signup` and use the UI to create accounts + transactions (see `specs/007-transactions/quickstart.md` for the manual walkthrough).

## 5. Start the dev server

```bash
pnpm dev
```

Or, if you hit the known Turbopack dev-server panic from features 003 / 004:

```bash
pnpm exec next build && pnpm exec next start
```

## 6. Walk the feature end-to-end

### 6a. Log in

1. Visit `http://localhost:3000/login`.
2. Sign in as the demo user (or your hand-seeded user). After login, you should land on `/dashboard`.

### 6b. The four widgets are visible (FR-002)

Verify the dashboard renders:

1. **`+ Add transaction` CTA** at the top of the page. Styled as the page's primary action. Keyboard-focusable.
2. **Net worth widget** below the CTA (or in the first grid column). Shows one row per currency the user holds (e.g., "USD $4,250.00" + "EUR €1,180.00"). Each row uses tabular numerals (digits aligned on the decimal point). Each row's currency code is visible.
3. **This-month cash flow widget** in the second grid position. Shows one block per currency with three labelled lines: `Income`, `Expense`, `Net`. Each amount renders via `<Money>` with the block's currency.
4. **Recent transactions widget** in the third grid position. Shows up to 10 rows in date descending / createdAt descending order. Each row shows date, payee, category, account, signed amount (negative amounts in red, positive in default text color). A "See all" link at the bottom navigates to `/dashboard/transactions`.

### 6c. Net-worth byte-for-byte check (SC-005)

1. Read off each currency's total from the Net worth widget.
2. Navigate to `/dashboard/accounts`.
3. Group the per-account balances by currency and sum them mentally (or compute via the demo data you seeded).
4. Verify the per-currency sums on the accounts page match the dashboard's net-worth widget **byte-for-byte** — same currency codes, same totals down to the last decimal place.

### 6d. Cash-flow byte-for-byte check (SC-006)

1. Read off the per-currency `Income`, `Expense`, `Net` values from the Cash flow widget.
2. Navigate to `/dashboard/transactions`.
3. Filter to the current calendar month (set the date range picker's `from` to the 1st of the current month and `to` to today, or the last day of the current month).
4. Manually (or by browsing) verify the per-currency-per-type sums in the transactions list match the dashboard's values **byte-for-byte**.
5. Confirm that any TRANSFER rows in the transactions list are NOT counted in the cash-flow widget (transfers are excluded by spec).

### 6e. Recent-10 byte-for-byte check (SC-007)

1. Read off the 10 rows from the Recent transactions widget (or fewer if the user has fewer than 10 non-archived transactions).
2. Navigate to `/dashboard/transactions` (unfiltered).
3. Verify the first 10 rows of the unfiltered list match the dashboard's Recent widget **byte-for-byte** (same dates, same payees, same amounts, same order).
4. Click one of the rows in the Recent widget; verify navigation to `/dashboard/transactions` (top of the list, no filters applied — no deep-link to the specific row in v1).

### 6f. Add-transaction CTA (SC-002, SC-014)

1. From the dashboard, click `+ Add transaction`. Verify navigation to `/dashboard/transactions`.
2. Press the browser back button to return to the dashboard.
3. Press Tab repeatedly from the page top until the CTA is keyboard-focused. Press Enter. Verify the same navigation works without a mouse.

### 6g. No-accounts empty state (SC-008, US5)

1. Open a fresh browser context (incognito window).
2. Sign up a brand-new user. After auto-login, you land on `/dashboard`.
3. Verify the dashboard renders a **single empty-state panel** (illustration, "Welcome to Abacus" heading, description, "Add your first account" CTA pointing to `/dashboard/accounts`).
4. Verify **no monetary numbers** render anywhere on the page (no $0.00, no €0.00, no zero-state widget grid).
5. Click "Add your first account"; verify navigation to `/dashboard/accounts`.

### 6h. Cash-flow empty state (US3 #2)

1. With a user who has at least one account but no transactions in the current calendar month: navigate to `/dashboard`.
2. Verify the Cash flow widget shows "No income or expense this month yet" inline (single message, not a per-currency block of zeros).
3. The Net worth widget still renders (showing starting balances).
4. The Recent transactions widget shows "No transactions yet — start by adding one" if the user has zero non-archived transactions across all time, OR shows the available rows if the user has transactions from previous months.

### 6i. Per-widget error boundary smoke test (FR-034)

This is harder to verify manually (it requires triggering a Prisma error). The unit suite and the constitution-mandated E2E cover it. If you want to manually exercise:

1. Open `lib/transactions/queries.ts`. Temporarily throw inside `sumIncomeExpenseByCurrencyForUser` (e.g., `throw new Error("test")`).
2. Save; the dev server hot-reloads.
3. Reload `/dashboard`. Verify the Cash flow widget renders an inline "Couldn't load — Try again" card; the Net worth widget and Recent transactions widget continue to render normally; the Add-transaction CTA continues to render.
4. Click the "Try again" button; the page reloads.
5. **Undo your `throw`** before continuing.

### 6j. Post-transaction reflection (SC-012)

1. From the dashboard, click `+ Add transaction`. Record one new INCOME transaction (e.g., a $1,000 USD bonus on Chase Checking).
2. Navigate back to `/dashboard` (or click the sidebar's Dashboard entry).
3. Verify:
   - The Net worth widget's USD total is **exactly $1,000.00 higher** than before.
   - The Cash flow widget's USD `Income` line is **exactly $1,000.00 higher**; the `Net` line is also $1,000.00 higher.
   - The new transaction appears at the **top** of the Recent transactions widget.
4. Confirmation: cross-currency-byte-for-byte consistency holds across all three widgets.

### 6k. Cross-user isolation (SC-010)

1. With one user signed in (User A), confirm the dashboard shows A's data.
2. Open a fresh incognito window. Sign up as User B.
3. Visit `/dashboard` as User B. Verify the no-accounts empty state (or, if you also seeded B with data, B's own data).
4. **None of A's data appears anywhere on B's dashboard.** No accounts, no transactions, no monetary numbers.
5. Switch back to A's browser; verify A's data is intact and unchanged.

## 7. Run the unit + e2e suites

```bash
pnpm test            # existing unit tests stay green + new dashboard aggregation + date unit tests
pnpm test:e2e        # existing e2e tests stay green + new dashboard.spec.ts (constitution-mandated)
```

The new files:

- `tests/unit/dashboard-aggregations.test.ts` — covers `computeNetWorthByCurrency` + `buildCashFlowShape` under all the edge cases enumerated in `plan.md` and `research.md`.
- `tests/unit/dashboard-dates.test.ts` — covers `computeCurrentMonthRange` under DST, leap year, month rollover.
- `tests/e2e/dashboard.spec.ts` — the constitution-mandated E2E covering SC-005, SC-006, SC-007, SC-008, SC-010, SC-012.

## 8. Where things live

| Concern | Path |
|---|---|
| Dashboard page (server component) | `app/(shell)/dashboard/page.tsx` (REPLACES the previous WelcomePanel-only render) |
| Net-worth widget | `app/(shell)/dashboard/_components/net-worth-widget.tsx` |
| Cash-flow widget | `app/(shell)/dashboard/_components/cash-flow-widget.tsx` |
| Recent-transactions widget | `app/(shell)/dashboard/_components/recent-transactions-widget.tsx` |
| Add-transaction CTA | `app/(shell)/dashboard/_components/add-transaction-cta.tsx` |
| Per-widget error boundary (client) | `app/(shell)/dashboard/_components/widget-error-boundary.tsx` |
| Shared widget card shell | `app/(shell)/dashboard/_components/widget-card.tsx` |
| Inline empty cell | `app/(shell)/dashboard/_components/empty-cell.tsx` |
| Net-worth + cash-flow reducers (pure) | `lib/dashboard/aggregations.ts` |
| Current-month UTC range helper (pure) | `lib/dashboard/dates.ts` |
| Server-only barrel | `lib/dashboard/index.ts` |
| New cash-flow query helper | `lib/transactions/queries.ts` (extended — `sumIncomeExpenseByCurrencyForUser`) |
| Recent-10 query path | `lib/transactions/queries.ts` (extended — `listTransactionsForUser` with optional `limit`) |
| Page-level loading | `app/(shell)/loading.tsx` (UNCHANGED — already covered FR-033) |
| Shell-level error catch-all | `app/(shell)/error.tsx` (UNCHANGED — already covered FR-037) |
| Money rendering primitive | `components/money/money.tsx` (UNCHANGED — consumed by all three widgets) |
| Empty-state primitive | `components/shell/empty-state.tsx` (UNCHANGED — consumed by the no-accounts state) |
| Illustration | `components/illustrations/abacus-illustration.tsx` (UNCHANGED) |
| Unit tests | `tests/unit/dashboard-aggregations.test.ts`, `tests/unit/dashboard-dates.test.ts` |
| E2E | `tests/e2e/dashboard.spec.ts` |
| Schema | `db/schema.prisma` (UNCHANGED) |

## 9. Troubleshooting

- **The dashboard still shows the "Welcome to Abacus" panel with the single CTA** — the page server component change did not land, or your dev server is serving a stale bundle. Restart `pnpm dev`. If the issue persists, verify `app/(shell)/dashboard/page.tsx` no longer renders `<WelcomePanel />` for users with ≥ 1 account (it should render the four-widget layout instead).
- **Net worth total doesn't match the accounts-list rollup** — most likely an archived account is being included (or excluded) on one side but not the other. Verify `listAccountsForUser(userId, { includeArchived: false })` is called by both code paths (the dashboard's net-worth widget AND the accounts-list page).
- **Cash flow shows TRANSFER rows in income or expense** — the cash-flow `where:` clause is missing `type: { in: ["INCOME", "EXPENSE"] }`. Check `sumIncomeExpenseByCurrencyForUser` in `lib/transactions/queries.ts`.
- **Cash flow's month boundary is off by one day** — the helper's `dateTo` should be the 1st of the NEXT month at UTC midnight (exclusive), not the last day of the current month. Check `computeCurrentMonthRange` in `lib/dashboard/dates.ts`; the cash-flow query uses `lt: dateTo`, not `lte: dateTo`.
- **Recent transactions widget shows > 10 rows or < the available rows** — `listTransactionsForUser(userId, { limit: 10 })` may have a wrong limit parameter, or the helper's `take` integration is broken. Check the new `limit` extension in `lib/transactions/queries.ts`.
- **Per-widget error boundary doesn't catch — whole page redirects to the shell error page** — the boundary may not be a `"use client"` component, or it may be wrapping its children incorrectly. Verify `widget-error-boundary.tsx` starts with `"use client"` and that the widgets are children of `<WidgetErrorBoundary>` in the page JSX.
- **The dashboard renders an N+1 query trace in the Prisma log** — likely a widget is re-fetching `listAccounts` instead of consuming the page-level prop. Either remove the re-fetch and use the prop, OR confirm React's `cache()` is deduping the call within the request.
- **A monetary value renders without its currency code** — a `<Money>` is missing its `currency` prop (TypeScript should have blocked this), OR something other than `<Money>` is rendering an amount inline. Run `rg "<Money " app/(shell)/dashboard/_components/` and `rg "formatAmount\(" app/(shell)/dashboard/_components/` to audit.

## 10. Money-correctness verification

The full money-correctness checklist from `specs/007-transactions/quickstart.md` continues to apply on `/dashboard/transactions`. This feature does not modify the transactions surface; the invariants there are unchanged.

Additionally, on `/dashboard`:

| # | Check | Expected behavior |
|---|---|---|
| 1 | Every monetary value rendered on the dashboard shows its currency code adjacent. | Visual inspection: no number appears without its currency (the `<Money>` primitive guarantees this). |
| 2 | A user with USD and EUR accounts sees one row per currency in Net worth — never a collapsed single total. | Visual inspection: two rows for two currencies; no FX conversion. |
| 3 | A user with USD and EUR transactions this month sees one block per currency in Cash flow — never a collapsed single number. | Visual inspection. |
| 4 | The per-currency Net worth value equals byte-for-byte the per-currency rollup on `/dashboard/accounts`. | See step 6c above. |
| 5 | The per-currency Cash flow values (income, expense, net) equal byte-for-byte the per-currency rollups derived from `/dashboard/transactions` (current month, excluding TRANSFER). | See step 6d above. |
| 6 | The Recent transactions widget shows the first 10 rows of the unfiltered transactions list, in the same order. | See step 6e above. |
| 7 | A brand-new user (zero accounts) sees the no-accounts empty state — no zero-state widget grid. | See step 6g above. |
| 8 | A cross-user URL or hand-crafted request never leaks another user's data. | See step 6k above. |

If items 1–8 all behave correctly, the dashboard's money-correctness invariants are intact. The money-reviewer subagent will run the audit greps documented in `plan.md` §Constitution Check and `research.md` R7 / R9 as part of the PR review.
