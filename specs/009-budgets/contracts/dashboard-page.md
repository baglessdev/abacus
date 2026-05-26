# Page Contract — `app/(shell)/dashboard/page.tsx` DELTA

This contract describes the **delta** this feature applies to the dashboard page composition established in feature 008. The existing Net Worth + Cash Flow + Recent Transactions widgets are **unchanged**; this feature ADDS a 4th widget slot (Budgets) into the existing grid.

## Location

`app/(shell)/dashboard/page.tsx`. **Server component.** No `"use client"` directive. Renders on every request.

## Existing imports (unchanged from feature 008)

The page already imports:

- `@/lib/auth` → `auth()`
- `@/lib/accounts` → `listAccounts`
- `@/components/shell/welcome-panel` → `WelcomePanel` (no-accounts state)
- `./_components/add-transaction-cta` → `<AddTransactionCta>`
- `./_components/widget-error-boundary` → `<WidgetErrorBoundary>`
- `./_components/net-worth-widget` → `<NetWorthWidget>`
- `./_components/cash-flow-widget` → `<CashFlowWidget>`
- `./_components/recent-transactions-widget` → `<RecentTransactionsWidget>`

**NEW import added by this feature:**

```ts
import { BudgetsWidget } from "./_components/budgets-widget"
```

## Existing signature + behavior (unchanged from feature 008)

The page server component:

1. Reads `await auth()` and derives `userId`.
2. Calls `listAccounts({ includeArchived: false })`; on `accountCount === 0` → renders `<WelcomePanel />` (the no-accounts state from feature 008 US5).
3. Otherwise renders the multi-widget layout.

This feature does NOT change steps 1 + 2. Step 3 gets the 4th widget added.

## Composition DELTA

**Before** (feature 008):

```tsx
return (
  <div className="flex flex-col gap-6">
    <AddTransactionCta />
    <div className="grid gap-4 md:grid-cols-2">
      <WidgetErrorBoundary title="Net worth">
        <NetWorthWidget userId={userId} />
      </WidgetErrorBoundary>
      <WidgetErrorBoundary title="This month">
        <CashFlowWidget userId={userId} />
      </WidgetErrorBoundary>
      <div className="md:col-span-2">
        <WidgetErrorBoundary title="Recent transactions">
          <RecentTransactionsWidget userId={userId} />
        </WidgetErrorBoundary>
      </div>
    </div>
  </div>
)
```

**After** (feature 009 — adds the Budgets widget as the 3rd cell):

```tsx
return (
  <div className="flex flex-col gap-6">
    <AddTransactionCta />
    <div className="grid gap-4 md:grid-cols-2">
      <WidgetErrorBoundary title="Net worth">
        <NetWorthWidget userId={userId} />
      </WidgetErrorBoundary>
      <WidgetErrorBoundary title="This month">
        <CashFlowWidget userId={userId} />
      </WidgetErrorBoundary>
      {/* NEW — 4th widget */}
      <WidgetErrorBoundary title="Budgets">
        <BudgetsWidget userId={userId} />
      </WidgetErrorBoundary>
      <div className="md:col-span-2">
        <WidgetErrorBoundary title="Recent transactions">
          <RecentTransactionsWidget userId={userId} />
        </WidgetErrorBoundary>
      </div>
    </div>
  </div>
)
```

The grid now has 3 cells in the top row (1 col → wraps to 3 rows on narrow; 2 col → 2 + 1 + recent below; the exact layout is plan-acceptable as long as the existing 3 widgets render byte-for-byte the same content).

## New widget — `<BudgetsWidget>`

Located at `app/(shell)/dashboard/_components/budgets-widget.tsx`. **Server component.**

### Signature

```ts
async function BudgetsWidget(props: { userId: string }): Promise<JSX.Element>
```

### Behavior

1. Calls `listBudgetsWithActualsForUser(userId, { includeArchived: false, limit: 5, sortByStatusAndProgress: true })` from `lib/budgets/queries.ts`.
2. Renders inside `<WidgetCard title="Budgets">`:
   - If empty → `<EmptyCell message="Set up your first budget" />` + a CTA link to `/dashboard/budgets` ("Get started").
   - If non-empty → a compact list of up to 5 budgets in priority order (over → near → under). Each row: category name (short) + `<Money>` actuals + `<Money>` budgeted + `<ProgressBar>` (compact variant). Below the list: a "See all" `<Link>` to `/dashboard/budgets`.

### Failure mode

Throws on Prisma error → the wrapping `<WidgetErrorBoundary title="Budgets">` catches → renders an inline "Couldn't load — try again" card. Other widgets render normally. Same pattern as feature 008's 3 widgets.

## Page-level loading (unchanged)

Existing `app/(shell)/loading.tsx` covers the page-level loading skeleton (FR-032 from spec). No new loading.tsx introduced.

## Page-level error (unchanged)

Existing `app/(shell)/error.tsx` catches render-time exceptions outside any widget boundary. No new error.tsx introduced.

## Data dependencies summary

| Element | Async dependency | Failure mode |
|---|---|---|
| Page-level `listAccounts` | Yes (existing) | Graceful fall-through to no-accounts state |
| `<AddTransactionCta>` | No (existing) | Cannot fail |
| `<NetWorthWidget>` | Yes (existing) | Boundary catches |
| `<CashFlowWidget>` | Yes (existing) | Boundary catches |
| **`<BudgetsWidget>`** (NEW) | Yes — calls `listBudgetsWithActualsForUser` | Boundary catches |
| `<RecentTransactionsWidget>` | Yes (existing) | Boundary catches |

The dashboard's total Prisma round-trip count goes from 4 (feature 008's plan.md R11) to ≤ 7 with this feature: +1 for `prisma.budget.findMany`, +2 for the MONTHLY + YEARLY actuals groupBys (some users will have only one period type and only fire one). The widgets resolve in parallel within the page-level await.

## Constitution compliance

- **Principle I (money math)**: PASS. The new widget renders monetary values through `<Money>` only. No formatAmount. No raw Decimal arithmetic in the widget's JSX.
- **Principle II (type safety)**: PASS. Typed `userId: string`; typed `BudgetWithActualsDTO[]`.
- **Principle III (validate at boundaries)**: PASS. No request input on the widget; auth at the page level (defense-in-depth on top of middleware).
- **Principle IV (test the money paths)**: PASS. The widget is exercised by the new `tests/e2e/budgets.spec.ts`. The 3 existing widgets are re-asserted as byte-for-byte unchanged via the existing `tests/e2e/dashboard.spec.ts` (SC-018).

## Audit greps

```bash
# Existing greps (feature 008) still hold:
rg "from \"@/lib/prisma\"" app/(shell)/dashboard/
# Expected: zero matches.

# The new widget renders monetary surfaces via <Money>:
rg '<Money[ /\n]' app/(shell)/dashboard/_components/budgets-widget.tsx
# Expected: at least 2 matches (actuals + budgeted per row).

# No formatAmount in the new widget:
rg "formatAmount\(" app/(shell)/dashboard/_components/budgets-widget.tsx
# Expected: zero matches.
```

## Backward compatibility

- The sidebar nav's `/dashboard` entry is unchanged.
- The `(shell)/loading.tsx` and `(shell)/error.tsx` files are unchanged.
- The existing 3 widgets, `<AddTransactionCta>`, `<WelcomePanel>` are unchanged.
- Feature 008's E2E (`tests/e2e/dashboard.spec.ts`) continues to pass byte-for-byte for the Net Worth + Cash Flow + Recent Transactions assertions (SC-018).

## Applicable FRs

FR-027, FR-028, FR-029, FR-032, FR-036.

## Applicable SCs

SC-012, SC-015, SC-018.
