# Feature 008 — Data Model

**This feature introduces no new entities and no schema changes.** It is a strictly read-only consumer of the schema established by features 004 (Account), 006 (Category), and 007 (Transaction). No migration is generated, no Prisma model is added or modified, no index is added or modified, no FK semantics change.

After this feature ships, the schema is unchanged from `main` at the end of feature 007: four models (`User`, `Account`, `Category`, `Transaction`) plus two enums (`AccountType`, `CategoryKind`, `TransactionType`). The relevant indexes for this feature's three queries — `@@index([userId, date])` on `Transaction` (for cash-flow `groupBy` + recent-10 `findMany`), `@@index([userId, accountId, date])` on `Transaction` (used indirectly via `sumAmountsForAccountsBatch` inside `listAccountsForUser`) — were all added in feature 007's `add_transaction` migration.

---

## Read-only data shapes the dashboard consumes

The dashboard composes three independent data shapes from existing queries. Each shape is enumerated below in the form `Source → Fields the dashboard reads → Used by`.

### 1. `AccountDTO` (from `lib/accounts/serialize.ts`)

Returned by `listAccountsForUser(userId, { includeArchived: false })` (from `lib/accounts/queries.ts`) — the canonical source for net-worth aggregation. The DTO already carries the live `balance` field computed by feature 007 via `sumAmountsForAccountsBatch`.

```ts
type AccountDTO = {
  id: string
  userId: string
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT" | "CASH" | "INVESTMENT" | "OTHER"
  currency: string        // ISO 4217 alpha-3
  startingBalance: string // canonical decimal string ("1250.00", "-500.00", "0")
  balance: string         // LIVE: startingBalance + Σ(non-archived transaction amounts) — feature 007 FR-019a
  archivedAt: string | null  // ISO 8601 UTC, or null
  createdAt: string
  updatedAt: string
}
```

**Fields the dashboard reads:**
- `currency` — the grouping key for the net-worth reducer.
- `balance` — the per-account total to sum per currency.
- `archivedAt` — implicitly already filtered by the caller's `includeArchived: false` option (the query layer applies `archivedAt: null` to the `where:` clause). The dashboard does NOT re-filter at the application layer.

**Used by:** `<NetWorthWidget>` (page server component fetches once, passes to widget OR widget re-fetches via `cache()`); `<AddTransactionCta>` (reads only the COUNT, for the no-accounts disabled state).

**Not read by the dashboard:** `id`, `userId`, `name`, `type`, `startingBalance`, `createdAt`, `updatedAt`. The dashboard's net-worth widget shows per-currency totals, not per-account rows.

### 2. `Transaction` row (from `prisma.transaction.findMany`)

Returned by the existing `listTransactionsForUser(userId, { limit: 10 })` helper in `lib/transactions/queries.ts` (extended in this feature with the optional `limit?: number` parameter). The serializer `serializeTransaction(row)` in `lib/transactions/serialize.ts` converts the Prisma row to a `TransactionDTO` — same shape as used everywhere in feature 007.

```ts
type TransactionDTO = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  date: string                                  // ISO 8601 date-only ("2026-05-25")
  amount: string                                // canonical signed decimal string ("-87.43", "3200.00")
  currency: string                              // ISO 4217 alpha-3
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  payee: string | null
  notes: string | null
  transferGroupId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

**Fields the dashboard reads in the recent-10 widget:**
- `id` — the React key for each row.
- `date` — rendered as the row's date column.
- `payee` — rendered as the row label (with the existing transactions-list fallback to "Transfer" for transfer legs).
- `categoryId` — joined client-side (or via a pre-fetched category list) to render the category name.
- `accountId` — joined client-side (or via a pre-fetched account list) to render the account name.
- `amount` — rendered via `<Money>` with the row's `currency`.
- `currency` — passed to `<Money>` for the amount column.
- `type` — informs the transfer-vs-single-leg rendering decision (transfer legs render with a "Transfer" badge or icon per feature 007's existing list behaviour).
- `transferGroupId` — used to identify transfer-pair rows for the per-row visual treatment (the dashboard renders 2 separate rows per transfer pair, consistent with the transactions-list per-spec clarification).
- `archivedAt` — implicitly already `null` because the caller's default `includeArchived: false` is applied at the query layer; the dashboard does NOT re-filter.

**Not read by the dashboard:** `notes` (notes are detail-page content; the recent-10 widget is a summary).

### 3. Per-currency-per-type aggregate (from the NEW `sumIncomeExpenseByCurrencyForUser`)

The NEW helper in `lib/transactions/queries.ts` returns:

```ts
type CashFlowAggregateRow = {
  currency: string                       // ISO 4217 alpha-3
  type: "INCOME" | "EXPENSE"             // never TRANSFER (filtered at the SQL `where:` level)
  _sum: { amount: Money }                // Money is Prisma.Decimal aliased from lib/money/decimal.ts
}
```

The shape mirrors Prisma's native `groupBy({ by: ["currency", "type"], _sum: { amount: true } })` result type, with the `_sum.amount` `Decimal | null` lifted to `Money` at the boundary (null → `new Money(0)`).

**Fields the dashboard reads:**
- `currency` — the per-currency grouping key.
- `type` — `"INCOME"` or `"EXPENSE"`, dispatching to the income or expense line in the per-currency cash-flow block.
- `_sum.amount` — the per-currency-per-type total, summed Postgres-side.

**Used by:** `<CashFlowWidget>` → consumed by `buildCashFlowShape(rows)` adapter in `lib/dashboard/aggregations.ts`, which reshapes the array into the widget's per-currency-block shape (below).

---

## NEW in-memory aggregate shapes (not persisted)

These shapes are produced by the new pure functions in `lib/dashboard/aggregations.ts` and consumed directly by the widget server components. They are NOT persisted to the database, NOT serialized over an HTTP boundary (no HTTP boundary exists for this feature), and NOT exported as DTOs from `lib/accounts/` or `lib/transactions/`.

### `PerCurrencyTotal` (net worth)

```ts
type PerCurrencyTotal = {
  currency: string   // ISO 4217 alpha-3, uppercase
  total: string      // canonical decimal string ("4250.00", "-500.00", "0")
}
```

Produced by `computeNetWorthByCurrency(accounts: AccountDTO[]): PerCurrencyTotal[]`.

**Sort order (FR-007):** descending absolute value of `total` (largest-magnitude currency first); ties broken by ISO 4217 alphabetical ascending.

**Consumed by:** `<NetWorthWidget>` — renders one row per element, each containing a `<Money currency={row.currency} amount={row.total} />`.

### `PerCurrencyCashFlow` (this-month cash flow)

```ts
type PerCurrencyCashFlow = {
  currency: string   // ISO 4217 alpha-3, uppercase
  income: string     // canonical signed decimal string (always >= 0; "5000.00", "0.00")
  expense: string    // canonical signed decimal string (always <= 0; "-1200.00", "0.00") — EXPENSE is stored negative per feature 007's sign convention
  net: string        // canonical signed decimal string; net = income + expense (since expense is negative, this is income - |expense|)
}
```

Produced by `buildCashFlowShape(rows: CashFlowAggregateRow[]): PerCurrencyCashFlow[]`.

**Sort order:** descending absolute value of `net` (largest-magnitude net first); ties broken by ISO 4217 alphabetical ascending. Same rule as net worth for consistency across the dashboard.

**Net computation:**
```ts
// Inside buildCashFlowShape — uses Money arithmetic (lib/money/decimal.ts).
const incomeMoney = incomeRow?._sum.amount ?? new Money(0)   // positive or zero
const expenseMoney = expenseRow?._sum.amount ?? new Money(0) // negative or zero
const netMoney = incomeMoney.plus(expenseMoney)              // since expenseMoney <= 0, this is income - |expense|
return { currency, income: incomeMoney.toString(), expense: expenseMoney.toString(), net: netMoney.toString() }
```

**Consumed by:** `<CashFlowWidget>` — renders one block per element, each containing three `<Money>` elements (income, expense, net) — all with the block's `currency`.

### `DashboardData` (composite, illustrative only)

The page server component composes three independently-fetched shapes — there is no single `DashboardData` shape, intentionally. Per FR-034, each widget owns its own fetch so the per-widget error boundary can isolate failures:

```ts
// Page server component (illustrative):
const accountsResult = await listAccounts({ includeArchived: false })   // → AccountDTO[] (page-level fetch for the no-accounts branch + CTA disabled state)

// Each widget owns its own fetch (server component):
//   <NetWorthWidget>          internally fetches OR receives accounts via prop, then reduces via computeNetWorthByCurrency
//   <CashFlowWidget>          internally computes computeCurrentMonthRange() + sumIncomeExpenseByCurrencyForUser + buildCashFlowShape
//   <RecentTransactionsWidget> internally fetches listTransactionsForUser(userId, { limit: 10 })
```

Splitting the fetches by widget — rather than fetching everything at the page level and passing to widgets — is what enables FR-034's per-widget error isolation: a failure inside `<CashFlowWidget>`'s `sumIncomeExpenseByCurrencyForUser` call throws inside the widget server component; the `<WidgetErrorBoundary>` wrapping that widget catches it; the other two widgets render normally.

The page-level `listAccounts` fetch is the **only** widget-shared fetch — it's needed both to branch on the no-accounts case (FR-003) and to pass `accountCount` to `<AddTransactionCta>` (FR-024). The implementer may pass the resulting `AccountDTO[]` to `<NetWorthWidget>` as a prop to avoid a second `listAccounts` round-trip; either pattern is plan-acceptable (see research.md R11).

---

## Data-scoping enforcement

Every read MUST scope by `userId` from `session.user.id`. **No cross-user vector exists in this feature.** Specifically:

1. The dashboard page server component calls `await auth()` and reads `userId = session.user.id`.
2. The page-level `listAccounts(...)` call reads `userId` inside its own action body (it does not take `userId` as a parameter; the action internally calls `await auth()` and uses `session.user.id`).
3. `<NetWorthWidget>` consumes the page-level `AccountDTO[]` (or re-calls `listAccounts(...)` — same `await auth()` path internally).
4. `<CashFlowWidget>` calls `sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)` with `userId` from the page-level session.
5. `<RecentTransactionsWidget>` calls `listTransactionsForUser(userId, { limit: 10 })` with `userId` from the page-level session.

**No `userId` is ever derived from request input.** The dashboard page has no request input — no `searchParams`, no `FormData`, no route parameter. The only userId vector is the session.

A cross-user attempt (URL manipulation, second-tab race, hand-crafted request asserting another user's data) resolves to the requesting user's own dashboard 100% of the time (SC-010). The "no cross-user vector exists" assertion is verifiable by inspection: there is no parameter on the page server component that could carry a userId from outside the session.

This is the **fourth feature** to exercise the data-scoping convention (after Accounts, Categories, Transactions); the boilerplate is unchanged and re-used verbatim.

---

## Currency invariant

**No FX. No implicit conversion. Every aggregate ships with its ISO 4217 code attached. No monetary number rendered without its currency code.**

Specifically:

- **`PerCurrencyTotal`** carries `currency` adjacent to `total`. The reducer NEVER combines two different currencies into one total. A user holding USD and EUR accounts sees two rows: `{ currency: "USD", total: "..." }` and `{ currency: "EUR", total: "..." }`.
- **`PerCurrencyCashFlow`** carries `currency` adjacent to `income`, `expense`, `net`. The adapter NEVER combines two different currencies; each currency gets its own block with three lines.
- **Recent-transaction rows** carry `currency` adjacent to `amount` on every persisted row (denormalized from the parent account at write time per feature 007). The widget renders each row's amount via `<Money currency={row.currency} amount={row.amount} />`.
- **`<Money>`** is the single rendering primitive. Its `currency` prop is REQUIRED (TypeScript blocks any consumer that forgets it). Every `<Money>` element on the dashboard carries the currency code into the rendered output (per `formatAmount` in `lib/money/format.ts`).
- **Audit grep** `rg "<Money " app/(shell)/dashboard/_components/` returns one match per monetary surface, each with `currency=...` attribute.

The constitution Principle I rule "currency stored alongside every monetary value" is upheld both at the database level (the `currency` column on `Transaction` and `Account`) AND at the in-memory level (every aggregate shape attaches the currency).

---

## Future-feature data-model touchpoints

This feature does NOT pre-position the schema for future features. The relevant items are noted for awareness:

- **Feature 008 (Budgets)** will aggregate `Transaction.amount` over `(userId, categoryId, date BETWEEN ...)`. The `@@index([userId, categoryId])` index from feature 007 supports this. Budgets are not consumed by THIS feature (the dashboard's budget widget is feature 008's responsibility).
- **Feature 015 (Charts)** will run `SUM(amount) GROUP BY date_trunc('month', date), categoryId` for spending-over-time visualizations. The `@@index([userId, date])` index from feature 007 supports the date-trunc-friendly scan; no schema change needed.
- **Feature 017 (Settings — primary currency)** will introduce a per-user primary currency profile setting. When that lands, the net-worth widget MAY OPTIONALLY collapse multi-currency rows into a single primary-currency total via FX conversion (feature 020) — but that is a future composition, not pre-planned in this feature.
- **Feature 020 (Multi-currency FX)** will introduce FX-rate handling. THIS feature explicitly forbids implicit FX (FR-006, FR-015, SC-004); the per-currency rows survive into the post-020 world (FX would augment them with a "+ primary currency total" line, not replace them).

None of the above require schema changes in feature 008.
