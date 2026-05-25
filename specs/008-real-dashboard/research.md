# Feature 008 — Phase 0 Research

Non-obvious decisions taken during planning. Each entry: **Decision / Rationale / Alternatives considered**. Inputs locked by the spec's Clarifications section (per-currency rows not collapsed; TRANSFER excluded from cash-flow; transfer-pair counts as 2 rows in recent-10; row clicks navigate to top-of-list; per-widget error boundary; page-level loading) are NOT re-litigated here; the entries below cover only the choices the spec deliberately left to the plan.

This is the **first feature where multiple money paths intersect on a single screen** AND the **first feature to consume the post-007 aggregation surface for something other than per-account balance display**. The constitution Principle I invariants ("Decimal everywhere", "currency stays with amount", "no implicit FX", "no arithmetic outside `lib/money/`") and the data-scoping convention ("`prisma.transaction.*` lives only in `lib/transactions/queries.ts`") both apply at full sharpness here; the entries below codify how each is upheld in a read-only-feature context.

This is also the **first feature that does not introduce any new schema, no new mutation, no new HTTP route, and no new runtime dependency.** The plan is small precisely because the prerequisite features did the heavy lifting.

---

## R1. Per-currency net-worth aggregation — pure reducer using `Money.plus(...)` from `lib/money/decimal.ts`

**Decision.**

`computeNetWorthByCurrency(accounts: AccountDTO[]): PerCurrencyTotal[]` is a pure in-memory reducer in a NEW helper file `lib/dashboard/aggregations.ts`. It:

1. Iterates the input `AccountDTO[]` (each row carries `currency: string` and `balance: string` — both produced by feature 007's `listAccountsForUser` with `includeArchived: false`).
2. Groups by `currency`, lifting each `balance` string to a `Money` via `new Money(account.balance)` (boundary lift — the canonical pattern from feature 007's `lib/accounts/queries.ts`).
3. Sums each currency's `Money` values via `Money.plus(...)` (Decimal's native `.plus()` method, exposed as `Money.plus` through the `lib/money/decimal.ts` re-export). Equivalent in-memory shape: `Map<string, Money>` keyed by currency, reduced over the input.
4. Materializes the result as `{ currency: string; total: string }[]`, calling `.toString()` on each `Money` at the final serialization step.
5. **Sorts:** descending absolute total within currency (largest-magnitude currency listed first), ties broken by ISO 4217 alphabetical ascending. Per FR-007.

The reducer does NOT filter archived accounts — the caller (the page server component calling `listAccounts({ includeArchived: false })`) does that at the query layer. The reducer trusts its typed input.

**Rationale.**

- Constitution Principle I, FR-027: "no arithmetic on monetary values outside `lib/money/`". `Money.plus(...)` is the `lib/money/`-blessed addition primitive (defined in `lib/money/decimal.ts`); calling it from `lib/dashboard/aggregations.ts` is constitutionally fine because the helper IS the `lib/money/` boundary at the function level.
- The `Map<string, Money>` reduce is straightforward, deterministic, and trivial to unit-test (empty / single / multi-currency / negative / zero-balance / mixed-sign cases).
- The sort rule (descending absolute total, then ISO 4217 ascending) gives a deterministic visual ordering for multi-currency users that surfaces the largest-magnitude currency first — the user's "primary" currency in practice.
- The reducer is **pure**: no Prisma dependency, no clock dependency, no environment dependency. Unit-testable without mocks.

**Alternatives considered.**

- *Inline the reduce inside `<NetWorthWidget>` (skip the `lib/dashboard/` module).* Rejected — the reducer is the load-bearing logic for FR-005 / FR-007 / FR-008; it deserves a unit-test surface. Inlining in a server component leaves it unreachable from Vitest.
- *Use `sumAmounts(amounts: readonly Money[]): Money` from `lib/money/decimal.ts` (added in feature 007) instead of the `Map`+`.plus()` reduce.* Considered. The shapes are equivalent: collect per-currency arrays first, then call `sumAmounts(arr)` per currency. The implementer may choose either; both consume `lib/money/` exclusively. `sumAmounts(...)` reads slightly cleaner for the multi-element case; the `Map`+`.plus()` form is fewer allocations for the single-element-per-currency common case. Plan-acceptable: either is fine.
- *Push the aggregation into a Prisma `groupBy({ by: ["currency"], _sum: { startingBalance: true } })` query.* Rejected — `Account.startingBalance` ≠ `account.balance` (the latter is `startingBalance + Σ(transactions)`). Postgres-side aggregation would have to JOIN `Account` with a per-account `SUM(transaction.amount)` first, which is more SQL than the JS reduce on top of the already-computed `AccountDTO[]` from `listAccountsForUser`. The JS reduce is the simpler correct choice.

---

## R2. Cash-flow per-currency-per-type aggregation — new helper in `lib/transactions/queries.ts` using Prisma `groupBy`

**Decision.**

Add a NEW helper in `lib/transactions/queries.ts`:

```ts
export async function sumIncomeExpenseByCurrencyForUser(
  userId: string,
  dateFrom: Date,
  dateTo: Date,   // exclusive — first of next month at UTC midnight
): Promise<Array<{ currency: string; type: "INCOME" | "EXPENSE"; _sum: { amount: Money } }>> {
  const rows = await prisma.transaction.groupBy({
    by: ["currency", "type"],
    where: {
      userId,
      type: { in: ["INCOME", "EXPENSE"] },   // TRANSFER excluded at the `where:` level (FR-010 / FR-015)
      archivedAt: null,                        // FR-013
      date: { gte: dateFrom, lt: dateTo },     // [dateFrom, dateTo) — first-of-next-month exclusive
    },
    _sum: { amount: true },
  })
  // Lift each Decimal _sum.amount to Money at the boundary.
  return rows.map((r) => ({
    currency: r.currency,
    type: r.type as "INCOME" | "EXPENSE",
    _sum: { amount: r._sum.amount != null ? new Money(r._sum.amount) : new Money(0) },
  }))
}
```

Consumed by `lib/dashboard/aggregations.ts`'s `buildCashFlowShape(rows)` adapter, which reshapes the array into `{ currency, income, expense, net }[]`.

**Rationale.**

- **The "prisma.transaction.* lives only in `lib/transactions/queries.ts`" invariant** (feature 007 R6) is **inviolable** — the cash-flow `groupBy` MUST live in this file. Adding it as a new exported helper keeps the convention intact.
- **Postgres-side aggregation** is the same primitive `sumAmountsForAccountsBatch` uses (feature 007 R7). Postgres handles the arithmetic on the Decimal column natively (no rounding, no float, no JavaScript Decimal math). The application immediately lifts each `_sum.amount` Decimal to `Money` at the boundary — the same pattern as feature 007's balance computation.
- **TRANSFER exclusion at the SQL `where:` level** (not at application post-fetch) is mandatory per FR-010 / FR-015 AND is more efficient (no rows shipped to the application that the application would throw away).
- **`archivedAt: null`** at the `where:` level honors FR-013.
- **`date: { gte: dateFrom, lt: dateTo }`** uses `lt` (exclusive) for the upper bound, which is the correct shape for the current-calendar-month range (research.md R3 below — `dateTo` is the 1st of the next month at UTC midnight). This avoids the off-by-one that an inclusive `lte` on the last day of the month would create.
- The shape `{ currency, type, _sum: { amount } }` mirrors Prisma's native `groupBy` shape (minus the lifting from Decimal to Money), keeping the function readable.

**Index used.** `@@index([userId, date])` (from feature 007). Postgres satisfies the `userId` equality and the `date` range with one index scan; the per-row `type` and `currency` filters are evaluated in-row from the heap. At personal-finance scale, even a user with thousands of monthly transactions runs in milliseconds. A covering index on `(userId, date, type, currency)` could shave further if measurements ever require it; not needed for v1.

**Alternatives considered.**

- *Reuse `listTransactionsForUser` + iterate in JS to bucket per-currency-per-type.* Rejected — would (a) violate the "Postgres does the aggregation" preference from feature 007 R7 (the JS bucket would be doing arithmetic outside `lib/money/`, which the constitution forbids — unless we re-route through `Money.plus(...)` per row, which is fine but slower than letting Postgres SUM the Decimal column natively); (b) ship every row's bytes to the application when only N rows of aggregated state are needed; (c) be slower at any non-trivial transaction count. The Postgres `groupBy` is the boring correct choice.
- *Add the helper to `lib/dashboard/aggregations.ts` instead of `lib/transactions/queries.ts`.* Rejected — this would require importing `prisma` into `lib/dashboard/aggregations.ts`, which would break the "prisma.transaction.* lives only in lib/transactions/queries.ts" invariant. The helper canonically belongs in the queries module.
- *Add a `where: { type: { not: "TRANSFER" } }` filter.* Equivalent to `type: { in: ["INCOME", "EXPENSE"] }` but slightly less obvious; the positive enumeration is more readable.

---

## R3. Current-calendar-month boundary computation — pure function in `lib/dashboard/dates.ts`, UTC midnight, recomputed at request time

**Decision.**

Add a NEW helper file `lib/dashboard/dates.ts` with:

```ts
export function computeCurrentMonthRange(): { dateFrom: Date; dateTo: Date } {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()       // 0-indexed
  const dateFrom = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  const dateTo   = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0))  // first of NEXT month (exclusive)
  return { dateFrom, dateTo }
}
```

`dateFrom` is **inclusive**, `dateTo` is **exclusive**. Used together with the cash-flow `where: { date: { gte: dateFrom, lt: dateTo } }` (`gte` + `lt`).

The function is called **once per dashboard request**, inside `<CashFlowWidget>` server component before the query — NOT cached, NOT memoized at module scope (FR-016: "boundary MUST be recomputed at request time, not cached across requests, so a render that crosses midnight UTC into a new month uses the new month's window on the next fetch").

**Rationale.**

- **UTC-only**: consistent with feature 007's `@db.Date` calendar-day storage (the `date` column carries calendar-day-only values normalized to UTC midnight). The dashboard's "this month" boundary MUST use the same axis as the stored data; mixing the browser's locale with the storage axis would silently shift the month boundary by hours for users far from UTC.
- **First-of-next-month exclusive** avoids the off-by-one that an inclusive `lte` on the last day of the current month would create AND robustly handles month-length variance (no "30 vs. 31 vs. 28 vs. 29" branching). `new Date(Date.UTC(year, month + 1, 1))` correctly rolls Dec → Jan via JavaScript's Date normalization.
- **Recomputed per call** (not module-scoped) honors FR-016. A long-running server process must re-evaluate the boundary on every dashboard render; a cached value computed at module-load time would be wrong after midnight UTC on the 1st of a new month.
- **Pure**: deterministic given the system clock. Unit-testable via `vi.setSystemTime(...)` for DST, leap-year, December rollover, mid-month, first-of-month, last-of-month cases.

**Alternatives considered.**

- *Use `date-fns`'s `startOfMonth` / `addMonths` / `endOfMonth`.* Rejected — would introduce a new dep for one function that's 3 lines of native `Date.UTC`. The constitution favors no-new-deps unless absolutely required.
- *Store the month range in module scope and recompute lazily.* Rejected — violates FR-016 (the spec is explicit about per-request recomputation).
- *Use the user's profile timezone instead of UTC.* Rejected — per-user timezone is feature 017 (Settings). v1 is UTC-only; this is consistent with feature 007's storage axis. Documented in the spec's Assumptions section.

**Co-location decision.** `lib/dashboard/dates.ts` (vs. `lib/transactions/dates.ts` or `lib/money/dates.ts`). Dates are not money (so not `lib/money/`); the cash-flow boundary is a dashboard concern, not a transaction concern (the `normalizeToUtcDay` helper in `lib/transactions/dates.ts` is for transaction date input normalization, a different concern). Dashboard-owned, dashboard-scoped.

---

## R4. Recent-10 fetch — extend `listTransactionsForUser` with optional `limit?: number`

**Decision.**

Extend the existing `listTransactionsForUser` helper in `lib/transactions/queries.ts` with an optional `limit?: number` field on the filters object:

```ts
export type ListTransactionsFilters = {
  dateFrom?: Date
  dateTo?: Date
  accountId?: string
  categoryId?: string
  type?: "INCOME" | "EXPENSE" | "TRANSFER"
  includeArchived?: boolean
  limit?: number                          // NEW
}

export async function listTransactionsForUser(
  userId: string,
  filters: ListTransactionsFilters = {},
) {
  // ... existing where: clause build ...

  return prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    ...(filters.limit ? { take: filters.limit } : {}),       // NEW
  })
}
```

The dashboard's `<RecentTransactionsWidget>` calls `listTransactionsForUser(userId, { limit: 10 })` — no other filter parameters, so the default behaviour (no date range filter, no account filter, no category filter, exclude archived, no type filter) returns the 10 most recent non-archived transactions across the entire history.

**Rationale.**

- **Lower coupling than a new function.** A separate `listRecentTransactionsForUser(userId, limit)` would be 95% duplication of the existing helper's `where:` and `orderBy:` shape. Extending with one optional parameter is the smaller change.
- **Existing call sites are unaffected.** `lib/transactions/actions.ts`'s `listTransactions` doesn't pass `limit`; the absence of the parameter triggers the existing no-`take` branch. The transactions page continues to render the full (or date-range-filtered) list as before. **No regression** in feature 007's hot path.
- **Preserves the "prisma.transaction.* lives only here" invariant.** The dashboard's recent-10 fetch goes through the canonical-owner helper; no new `prisma.transaction.*` call site outside `lib/transactions/queries.ts`.
- **Sort order already correct.** Feature 007 locked `date desc, createdAt desc` as the canonical sort (FR-020); the dashboard's recent-10 widget renders in the same order as the unfiltered transactions list (SC-007).

**Note on excluding archived rows.** The existing helper's default behaviour is `where.archivedAt = null` when `includeArchived` is not `true`. The dashboard's recent-10 call passes neither `includeArchived: true` nor a date filter, so the helper defaults to "non-archived rows, no date filter, sorted, limited to 10." Exactly the FR-017 / FR-019 shape.

**Alternatives considered.**

- *New helper `listRecentTransactionsForUser(userId, limit)`.* Rejected — duplicate `where:` shape, duplicate `orderBy:`, no benefit. Extending is cleaner.
- *Pass a `null` date range to the existing helper and slice in JS.* Rejected — ships unbounded result set bytes from the database for no reason; doesn't scale.
- *Cursor pagination.* Out of scope — the dashboard is fixed at 10 rows; no infinite-scroll surface.

---

## R5. Server-side composition pattern — three async server components, each wrapped in a client-side error boundary

**Decision.**

The dashboard page (`app/(shell)/dashboard/page.tsx`) is a React Server Component. It composes:

1. `<AddTransactionCta accountCount={N}>` — server component, no async dependency. Always rendered (FR-036).
2. A grid of three `<WidgetErrorBoundary><...Widget /></WidgetErrorBoundary>` pairs:
   - `<NetWorthWidget>` — async server component. Awaits `listAccounts(...)` + reduces.
   - `<CashFlowWidget>` — async server component. Awaits `sumIncomeExpenseByCurrencyForUser(...)` + adapts.
   - `<RecentTransactionsWidget>` — async server component. Awaits `listTransactionsForUser(..., { limit: 10 })`.

`<WidgetErrorBoundary>` is a **`"use client"` class component** with `getDerivedStateFromError` + `componentDidCatch`. It renders its children normally; on a caught error, it renders an inline "Couldn't load — Try again" card. The Retry button calls a small `reset` handler that clears local error state AND triggers `router.refresh()` to re-fetch the server component subtree.

Per FR-033, the three widgets resolve **together** — no per-widget `<Suspense>` streaming. The page-level loading is covered by the existing `app/(shell)/loading.tsx` (no change). When all three async server components have awaited their queries, the page is sent; before that, the user sees the page-level loading skeleton.

**Layout.**

```text
<DashboardPage>                              # server component
  <AddTransactionCta accountCount={N} />     # server component, always rendered
  <DashboardGrid>                            # server component (a simple <div className="grid ...">)
    <WidgetErrorBoundary>                    # "use client" class
      <NetWorthWidget />                     # server component, awaits inside
    </WidgetErrorBoundary>
    <WidgetErrorBoundary>
      <CashFlowWidget />
    </WidgetErrorBoundary>
    <WidgetErrorBoundary>
      <RecentTransactionsWidget />
    </WidgetErrorBoundary>
  </DashboardGrid>
</DashboardPage>
```

**Rationale.**

- **Server components for the data-fetching widgets** keep the data on the server, avoid shipping query results to the client, and align with the Next.js App Router pattern features 004 / 006 / 007 established.
- **Client error boundary** is mandatory: React error boundaries are class-component-based and run on the client (Next.js App Router's own `error.tsx` follows the same pattern). The boundary wraps the server-rendered children; the boundary's own JSX (the error UI) is what's hydrated.
- **All three widgets resolve together** is the FR-033 lock — no `<Suspense>` per widget. Next.js renders the page once all server components have completed; the user sees the page-level loading skeleton until then.
- **The page server component itself does the account-count fetch** (via `listAccounts`) — this is needed both to branch on the no-accounts case AND to pass `accountCount` to the `<AddTransactionCta>`. Doing it once at the page level avoids three sequential `listAccounts` calls. The same fetched data can also seed `<NetWorthWidget>` via a prop, OR `<NetWorthWidget>` can re-fetch (idempotent, cheap; Prisma's query cache may even dedupe within a request). **Plan-acceptable: either pattern.** The implementer should prefer passing the prop to avoid the second round-trip.

**Failure mode behaviour.**

If `<NetWorthWidget>`'s `listAccounts` call throws → the page-level fetch already succeeded (it ran first), so the page-level no-accounts branch decision has already been made. The widget's own re-fetch (if it does one) throws inside the server component; the `<WidgetErrorBoundary>` catches it; the other widgets render normally.

If `<CashFlowWidget>`'s `sumIncomeExpenseByCurrencyForUser` throws → the boundary catches; other widgets and the CTA render normally.

If `<RecentTransactionsWidget>`'s `listTransactionsForUser` throws → boundary catches; other widgets and CTA render normally.

If `await auth()` at the page server component fails or returns null → the page-level fetch throws (or the page is redirected by middleware); the shell-level `app/(shell)/error.tsx` handles it (FR-037). This is the catch-all for non-widget errors.

**Alternatives considered.**

- *Per-widget `<Suspense>` streaming with per-widget skeletons.* Rejected per FR-033.
- *One whole-page try/catch in the page server component.* Rejected — would conflate the three widgets' failure modes; a single transient DB error on one query would blank the whole dashboard. FR-034 requires independent per-widget error isolation.
- *Use the App Router's `error.tsx` boundary at the page level.* That boundary catches errors thrown in the page itself, not in sibling subtrees; it can't isolate one widget's failure from the others. The per-widget client boundary is the canonical pattern.

---

## R6. Empty state vs. zero state vs. error state — enumerated per widget

**Decision.**

This is a high-leakage area in dashboard implementations. The plan codifies three distinct cases per widget:

| Widget | Empty (no underlying data) | Zero (data exists but sums to zero) | Error (query threw) |
|---|---|---|---|
| **Net worth** | Not reachable for an account-having user. Every account contributes its `balance` (which is at minimum `startingBalance + 0 = startingBalance`). FR-009 makes this explicit: when the user has accounts, the widget MUST render one zero row per currency held — never an empty state. The whole-dashboard no-accounts EmptyState (US5) covers the zero-account case. | Per-currency rows of `$0.00` (or the appropriate canonical zero for the currency). The `<Money>` primitive renders zero in `text-muted-foreground` (its sign-aware zero treatment). | `<WidgetCard>` containing the inline "Couldn't load — Try again" message + retry button. Renders inside the `<WidgetErrorBoundary>`. |
| **Cash flow** | "No income or expense this month yet" — single inline message inside the `<WidgetCard>` (FR-014). This is the case when the `sumIncomeExpenseByCurrencyForUser(...)` query returns zero rows (no INCOME and no EXPENSE in the date range). | Per-currency block with `Income $0.00 · Expense $0.00 · Net $0.00`. Only reachable if rows exist but all sum to zero (rare in practice; would require, e.g., a single $0 transaction — but feature 007's boundary rejects $0 transactions, so this is effectively unreachable). The empty case (zero rows) takes precedence. | Same as net worth: `<WidgetCard>` containing inline "Couldn't load — Try again". |
| **Recent transactions** | "No transactions yet — start by adding one" — single inline message inside the `<WidgetCard>` (FR-020). Reachable when `listTransactionsForUser(..., { limit: 10 })` returns zero rows. | N/A — the widget renders rows, not sums. No zero state for this widget. | Same as net worth / cash flow. |
| **Add transaction CTA** | N/A — has no async dependency (FR-036). | N/A. | N/A — cannot enter an error state. The CTA is rendered disabled with "Add an account first" helper text when `accountCount === 0` (FR-024); this is the only "non-default" rendering and is computed from the page-level fetch's result, not from an async dependency the widget itself owns. |

**Rationale.**

- **Empty vs. zero distinction matters for cash flow.** A user with a current-month transaction whose magnitude is the empty-after-filter case (e.g., the month started yesterday and the user has no INCOME / EXPENSE rows yet) sees the empty-state message — not a per-currency block full of zeros that would feel "broken." The empty-state message tells the user **why** there's no data.
- **The widget-level empty state never blocks rendering of other widgets** (FR-020 callout). The error-boundary isolation in R5 handles the error case; the empty / zero cases just render the appropriate widget content.
- **The whole-dashboard no-accounts EmptyState replaces the four-widget layout entirely** (FR-003) — not per-widget. This is the US5 "first-time user" screen. It is a different concern from the per-widget empty states (which apply only when the user has at least one account but the widget's specific data is empty).

**Per-currency zero render for net worth (FR-009 detail).** When a user has accounts but every account's balance is exactly zero (no starting balance, no transactions; or the rare case where transactions sum to exactly the negative of starting balance), the widget shows one zero row per currency the user holds — for example, "USD $0.00" and "EUR €0.00". The widget MUST NOT show an empty state because the accounts themselves exist (zero of something is still something; an empty state would mislead the user into thinking they have no accounts).

---

## R7. Money rendering — every monetary surface uses `<Money>` from `components/money/money.tsx`

**Decision.**

Every monetary value displayed on the dashboard renders through `<Money currency={...} amount={...} />` from `components/money/money.tsx`:

- **Net-worth widget**: one `<Money>` per currency row, rendering the `total` string with the `currency` attribute. `prominent` styling per the FR-005 "headline metric" emphasis.
- **Cash-flow widget**: three `<Money>` instances per currency block — `income`, `expense`, `net`. Each carries the same `currency` attribute (the block's currency); each renders the per-line amount string.
- **Recent-transactions widget**: one `<Money>` per row in the amount column, rendering the row's `amount` with its `currency` attribute. Sign-aware color (negative → `text-money-negative`, positive → `text-foreground`, zero → `text-muted-foreground`) handles the EXPENSE-row visual treatment automatically; the rendered string includes the sign character so color is not the sole carrier of meaning (FR-030).

**No new money-display component.** No `<NetWorthRow>` wrapper, no `<CashFlowLine>` wrapper, no `<TransactionAmountCell>` wrapper that internally calls `<Money>` (these would be acceptable for layout purposes but would tempt future maintainers to embed money-display logic inside the wrapper — a slippery slope toward FR-026 violations). The widgets call `<Money>` directly in their JSX.

**Audit greps codify the invariant:**

```bash
rg "formatAmount\(" app/(shell)/dashboard/_components/      # MUST return zero matches (no inline formatting)
rg "<Money " app/(shell)/dashboard/_components/             # MUST return one match per monetary surface
rg "<span [^>]*\$\{|<span [^>]*\${" app/(shell)/dashboard/_components/   # No inline `${amount}${currency}` rendering
```

**Rationale.**

- FR-026 / FR-028 / SC-003 lock the rule: every monetary value rendered with its currency code, every monetary value via `<Money>`, every monetary value with tabular numerals. `<Money>` was built in feature 005 and battle-tested in features 004 / 007 to satisfy all three rules in one primitive.
- Re-using `<Money>` preserves visual consistency across Abacus (same font, same tabular alignment, same sign-aware color, same currency-code placement).
- The `<Money>` API accepts `string | Money` for the `amount` prop — the dashboard passes strings (canonical decimal strings from the aggregate shapes), which is the well-trodden path.

**Alternative considered.** A new `<DashboardMoney>` primitive that pre-configures `prominent={true}` for the net-worth row. Rejected — `prominent` is already a prop on `<Money>`; the dashboard passes it directly. No need for a wrapper.

---

## R8. Data-scoping enforcement — `userId` from `session.user.id`, never from request input

**Decision.**

The dashboard page server component:

1. Calls `await auth()` at the top of the page render function.
2. Reads `userId = session.user.id` (with a defensive null check; on missing session, the middleware should have redirected, but defense-in-depth lets the page return early).
3. Passes `userId` as the first positional argument to every helper call:
   - `listAccounts(...)` — the existing action that internally calls `listAccountsForUser(session.user.id, ...)` — userId is read inside the action via its own `await auth()`, NOT passed by the page (the action takes no userId argument).
   - `sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)` — direct call from `<CashFlowWidget>`.
   - `listTransactionsForUser(userId, { limit: 10 })` — direct call from `<RecentTransactionsWidget>`.

**There is NO request input on this page.** No `searchParams` consumed, no `FormData`, no route parameter. The dashboard is route `/dashboard` with no dynamic segment and no query-string contract. Therefore there is no possible `userId` vector from request input.

The cross-user collapse rule established by features 004 / 006 / 007 holds by construction: every query helper takes `userId: string` as its first positional argument and applies it to its Prisma `where:` clause. A user signed in as A cannot ever see B's data — no helper accepts a `userId` from anywhere other than the session.

**Rationale.**

- Constitution Convention "Data scoping" (v0.2.0) is binding.
- Spec FR-025 / SC-010 lock the behaviour: cross-user attempts resolve to the requesting user's own dashboard, 100% of the time.
- The pattern is the third repetition of the rule (after features 004, 006, 007); no new infrastructure is needed.

**Audit grep.**

```bash
rg "session\.user\.id|getServerSession|auth\(\)" app/(shell)/dashboard/page.tsx
# Should show: one auth() call near the top; the userId is the result.

rg "userId.*formData|userId.*searchParams|userId.*params" app/(shell)/dashboard/
# Should return zero matches.
```

**Alternatives considered.** None — the convention is non-negotiable.

---

## R9. Cross-module exception audit — `prisma.transaction.*` still confined to `lib/transactions/queries.ts`

**Decision.**

Feature 007 locked the invariant: `prisma.transaction.*` MUST appear ONLY in `lib/transactions/queries.ts`. This feature preserves the invariant.

- The NEW cash-flow helper (`sumIncomeExpenseByCurrencyForUser`) lives **inside** `lib/transactions/queries.ts` — it's a sibling of `sumAmountsForAccount(sBatch)`. ✓
- The NEW `lib/dashboard/aggregations.ts` file does NOT import `prisma`. It consumes function exports from:
  - `lib/accounts/queries.ts` → `AccountDTO[]` (via the serializer; for unit tests, the type is sufficient).
  - `lib/transactions/queries.ts` → `sumIncomeExpenseByCurrencyForUser` (for the cash-flow shape adapter input type) and `listTransactionsForUser` (for the recent-10 widget input type).
  - `lib/money/decimal.ts` → `Money`, `Money.plus`, `sumAmounts`.
  - Standard library only otherwise.
- The page server component (`app/(shell)/dashboard/page.tsx`) does NOT import `prisma`. It consumes:
  - `lib/auth` → `auth()`.
  - `lib/accounts` → `listAccounts` (server action with envelope).
  - `lib/transactions/queries.ts` → `sumIncomeExpenseByCurrencyForUser`, `listTransactionsForUser` (direct queries, not the action — because the action shape with envelope adds friction; the page is a server component, not a form caller).
  - `lib/dashboard` → `computeNetWorthByCurrency`, `buildCashFlowShape`, `computeCurrentMonthRange`.
  - `app/(shell)/dashboard/_components/*` — the four widgets + boundary.

Wait — re-examining: the page can call `listTransactionsForUser` and `sumIncomeExpenseByCurrencyForUser` directly because the server component is **server-side code** and these are not request-input-driven (they take typed inputs). This is consistent with how the accounts page calls `listAccountsForUser` indirectly via the `listAccounts` server action; the page-component-to-queries-helper path is established. Per Principle III, no Zod is needed (no request input).

**Audit greps after the feature ships:**

```bash
rg "prisma\.transaction\." lib/ app/                # MUST return ONLY lib/transactions/queries.ts
rg "from \"@/lib/prisma\"" lib/dashboard/           # MUST return zero matches
rg "from \"@prisma/client\"" lib/dashboard/         # MUST return zero matches (or, allowable: Prisma type imports only — no prisma client)
```

**Rationale.** Feature 007 R6 codified the rule; preserving it across feature 008 is a constitutional baseline, not a discussion item. The rule is what keeps the data-scoping convention enforceable by grep audit.

**Alternatives considered.** None — the rule is inviolable.

---

## R10. Test surface — unit + E2E coverage for constitution Principle IV

**Decision.**

**Unit (Vitest):**

- `tests/unit/dashboard-aggregations.test.ts` — covers `computeNetWorthByCurrency` (empty / single / multi-currency / negative / zero / sort order / tie-break) and `buildCashFlowShape` (empty / only-income / only-expense / both / multi-currency / sort order). Pure-function tests; no mocks.
- `tests/unit/dashboard-dates.test.ts` — covers `computeCurrentMonthRange` under mid-month / first-of-month / last-of-month / December-rollover / leap-year February. Uses `vi.setSystemTime(...)` to pin the clock.

**E2E (Playwright):**

- `tests/e2e/dashboard.spec.ts` — covers:
  - **SC-008**: No-accounts user lands on `/dashboard` and sees the EmptyState (no monetary numbers).
  - **SC-005**: Net worth byte-for-byte vs. `/dashboard/accounts` rollup.
  - **SC-006**: Cash flow byte-for-byte vs. `/dashboard/transactions` filtered to current month, summed per type per currency.
  - **SC-007**: Recent 10 byte-for-byte vs. first 10 rows of the unfiltered `/dashboard/transactions` list.
  - **SC-010**: Cross-user isolation — a second user sees their own dashboard with zero leakage.
  - **SC-012**: Post-create reflection — record a transaction from the dashboard, return to the dashboard, assert the new transaction is reflected in Net worth + Cash flow + Recent list.

**Existing tests preservation (SC-013):** all existing unit + e2e tests from features 001–007 stay green; no test weakened, removed, or skipped.

**What can skip tests** (documented in plan.md):
- Per-widget error boundary in E2E — simulating a Prisma exception in Playwright is brittle; the boundary's behaviour is structurally simple (catch → render error UI) and can be covered by a small unit test on the class component if the implementer chooses. The constitution does not require it (the boundary is not a money path).
- Visual styling of `<WidgetCard>` — covered by snapshot via the widget unit tests.

**Rationale.** Constitution Principle IV requires "test the money paths" — `computeNetWorthByCurrency` and `buildCashFlowShape` ARE the money paths for this feature. The E2E asserts the spec's load-bearing success criteria (SC-005, SC-006, SC-007, SC-008, SC-010, SC-012) end-to-end against a real Postgres.

---

## R11. Performance / N+1 audit — three queries, four Prisma round-trips

**Decision.**

The dashboard page server component issues these database round-trips:

| # | Query | Index used | Notes |
|---|---|---|---|
| 1 | `listAccountsForUser(userId, { includeArchived: false })` → internally calls `prisma.account.findMany(...)` | `Account` PK + the partial-row `archivedAt: null` predicate (no index needed; small per-user table) | One round-trip for the account list. |
| 2 | `sumAmountsForAccountsBatch(userId, accountIds)` — fired inside `listAccountsForUser` for the live-balance computation (feature 007 R7) | `@@index([userId, accountId, date])` (the per-account composite from feature 007) | One round-trip; one `groupBy` for all the user's accounts. |
| 3 | `sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)` — fired inside `<CashFlowWidget>` | `@@index([userId, date])` (from feature 007) | One round-trip; one `groupBy({ by: ["currency", "type"] })`. |
| 4 | `listTransactionsForUser(userId, { limit: 10 })` — fired inside `<RecentTransactionsWidget>` | `@@index([userId, date])` (from feature 007; the `take: 10` limits the rows returned, not scanned, but the descending sort + limit means Postgres can scan in index order and stop after 10) | One round-trip; `findMany` with `take: 10`. |

**Total: 4 Prisma round-trips per dashboard render.** Queries 3 and 4 can in principle run in parallel via `Promise.all`, but each is awaited inside its own server component — and the three server components are siblings under the page-level grid, so the React Server Components renderer schedules them in parallel. The page-level fetch (query 1, which includes 2) runs first because its result drives the branch on account count; queries 3 and 4 then fire from their respective widget server components. In practice this looks like:

```text
Time → 
[Q1 + Q2: listAccountsForUser]----|
                                  | branch on accountCount
                                  |---->  page render begins
                                          [Q3: cashFlow]----------|
                                          [Q4: recent10]----------|
                                                                  ↓ widgets resolve, page sent
```

At personal-finance scale (≤ ~10k transactions/user), every query returns in single-digit milliseconds locally. The 2-second SC-001 budget is met with headroom.

**N+1 check.** None.
- `listAccountsForUser` already uses the batched `sumAmountsForAccountsBatch` (feature 007 R7) to avoid the N+1 trap on per-account balance computation.
- `sumIncomeExpenseByCurrencyForUser` is a single `groupBy` — not per-currency or per-type queries.
- `listTransactionsForUser` is a single `findMany` with `take: 10`.

No widget loops over an array issuing per-row queries.

**Rationale.** Constitution does not numerically bind a query-count budget, but the implicit performance contract is "fast enough that the user doesn't notice." Four round-trips for a multi-widget dashboard is well within that contract.

**Alternatives considered.**

- *Combine queries 3 and 4 into one round-trip via Prisma's `prisma.$transaction([q3, q4])` array form.* Rejected — the two queries' result shapes differ; combining them would require destructuring on the page side, complicating the widget composition. The marginal latency win is negligible.
- *Cache query results in React's `cache()` to dedupe within a request.* Considered. If `<NetWorthWidget>` also re-fetches `listAccounts` (instead of receiving the data as a prop), `cache()` would dedupe the call. The implementer can use `cache()` if helpful; not architecturally required. **Plan-acceptable: either pattern.**

---

## R12. Loading & error boundary placement

**Decision.**

**Loading (FR-033).** The existing `app/(shell)/loading.tsx` covers page-level loading for the dashboard. No new loading file is added. No per-widget `<Suspense>` boundary is introduced in v1. When the dashboard's three widget queries are in flight, the user sees the existing shell loading skeleton until all three resolve and the page is sent.

**Error (FR-034 / FR-035 / FR-037).**

- **Per-widget client-side error boundary** — a new file `app/(shell)/dashboard/_components/widget-error-boundary.tsx`. `"use client"` directive. Implements React's class-component error boundary (`getDerivedStateFromError` + `componentDidCatch`). On a caught error, renders an inline `<WidgetCard>` containing the heading "Couldn't load", a description "We couldn't load this widget. Try again or refresh the page.", and a primary `<Button>` labelled "Try again" that calls `this.setState({ hasError: false })` + invokes `router.refresh()` (via a small hook-using functional inner component, OR a `<Link href={pathname}>` element styled as a button — either is fine; the simpler is a `<button onClick={() => { reset(); router.refresh() }}>`).

  The boundary is keyboard-focusable via the Retry button (FR-035 / FR-029).

  **Why a hand-rolled class component, not `react-error-boundary`:** `react-error-boundary` is a small library, but adding any npm dep to this read-only feature is overkill — the class component is ~30 lines and is the only class component in the codebase. Verified `package.json` does not currently include `react-error-boundary` (`grep "react-error-boundary" /Users/rgederin/git/abacus/package.json` returns nothing).

- **Shell-level error boundary (`app/(shell)/error.tsx`)** — unchanged. Remains the catch-all for render-time exceptions thrown outside a widget boundary (e.g., a session/auth failure, a route-level error). FR-037 explicitly says this feature MUST NOT modify shell-level error handling.

- **Always-on Add-transaction CTA** — has no async dependency, cannot enter an error state. Per FR-036, it renders regardless of any widget's error state.

**Implementation sketch for `widget-error-boundary.tsx`:**

```tsx
"use client"

import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { WidgetCard } from "./widget-card"

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // Log for server-side observability; in production this would feed a monitoring sink.
    console.error("Widget error:", error)
  }

  private handleRetry = () => {
    this.setState({ hasError: false })
    // Trigger a re-fetch of the server component subtree by hard-refreshing the route.
    if (typeof window !== "undefined") {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <WidgetCard title="Couldn't load">
          <p className="text-sm text-muted-foreground">
            We couldn't load this widget. Try again or refresh the page.
          </p>
          <Button onClick={this.handleRetry}>Try again</Button>
        </WidgetCard>
      )
    }
    return this.props.children
  }
}
```

(The Retry handler uses `window.location.reload()` for simplicity; the implementer may swap in `router.refresh()` from `next/navigation` for a smoother UX. Both satisfy FR-035.)

**Rationale.**

- React error boundaries MUST be class components (the hooks API does not provide one) AND MUST be client-side (the component instance lives in the browser to receive `componentDidCatch`). The wrapping pattern (server-component children inside a client-component boundary) is well-supported by Next.js App Router (the App Router's own `error.tsx` follows exactly this shape).
- The widget itself stays a server component — only the boundary is client. This preserves the server-side data fetching and keeps the client bundle small.
- No new dep keeps the feature's footprint minimal.

**Alternatives considered.**

- *Add `react-error-boundary` as a dep.* Rejected — overkill for a 30-line class component; no existing usage in the codebase to motivate the dep.
- *Use the App Router's `error.tsx` boundary at the page level.* Rejected — that boundary catches only errors thrown in the page itself; can't isolate one sibling subtree from another. FR-034 requires per-widget isolation.
- *Use `<Suspense>` with `errorElement` (React 19 pattern).* Considered. React 19's `<Suspense>` does not natively provide error-element semantics (that's a `react-router-dom` pattern, not core React). The class-component boundary is the canonical React-core pattern.

---
