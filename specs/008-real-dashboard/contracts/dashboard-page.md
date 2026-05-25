# Page Contract — `app/(shell)/dashboard/page.tsx`

This contract documents the composition shape of the dashboard page server component AFTER this feature ships. The page replaces the current placeholder (which renders only `<WelcomePanel />`).

## Location

`app/(shell)/dashboard/page.tsx`. **Server component.** No `"use client"` directive. Renders on every request.

## Route

`GET /dashboard` — already gated by `middleware.ts` (feature 003). No new route, no new dynamic segment, no `searchParams` consumed.

## Imports

The page imports:

| From | Purpose |
|---|---|
| `@/lib/auth` | `auth()` for session retrieval |
| `@/lib/accounts` | `listAccounts` (server action returning envelope) — drives the no-accounts branch + the CTA's disabled state |
| `@/components/shell/empty-state` | `EmptyState` — the no-accounts page-level state |
| `@/components/illustrations/abacus-illustration` | `AbacusIllustration` — illustration for the no-accounts state |
| `./_components/net-worth-widget` | `<NetWorthWidget>` |
| `./_components/cash-flow-widget` | `<CashFlowWidget>` |
| `./_components/recent-transactions-widget` | `<RecentTransactionsWidget>` |
| `./_components/add-transaction-cta` | `<AddTransactionCta>` |
| `./_components/widget-error-boundary` | `<WidgetErrorBoundary>` |

The page does NOT import `@/lib/prisma` (the audit grep `rg "from \"@/lib/prisma\"" app/(shell)/dashboard/` returns zero matches).

## Signature

```ts
export default async function DashboardPage(): Promise<JSX.Element>
```

No props. No `searchParams` parameter. No `params` parameter.

## Behavior

1. **Auth gate (defense-in-depth on top of middleware).**
   ```ts
   const session = await auth()
   if (!session?.user?.id) {
     // Middleware should have redirected; if we reach here, render a safe fallback or throw.
     // The shell-level error.tsx catches a throw and renders the error UI.
     throw new Error("Dashboard reached without authenticated session")
   }
   const userId = session.user.id
   ```

2. **Account-count fetch** — drives the no-accounts branch AND the CTA disabled state.
   ```ts
   const accountsResult = await listAccounts({ includeArchived: false })
   const accounts = "error" in accountsResult ? [] : accountsResult.data.accounts
   const accountCount = accounts.length
   ```

   If `listAccounts` returns an error envelope, the page falls through to the no-accounts state (the safer interpretation — showing "Couldn't load" at the page level here would conflict with the per-widget-isolation design; treating an account-fetch error as zero-accounts is graceful and rare in practice).

3. **No-accounts branch (FR-003).**
   ```ts
   if (accountCount === 0) {
     return (
       <EmptyState
         illustration={<AbacusIllustration className="h-32 w-32 text-primary" />}
         title="Welcome to Abacus"
         description="Track your accounts, set budgets, and see where your money goes. Add your first account to get started."
         action={{ label: "Add your first account", href: "/dashboard/accounts" }}
       />
     )
   }
   ```

   The four-widget layout is NOT rendered (FR-003: INSTEAD OF, not in addition to). The existing `WelcomePanel` server component is a reasonable fit; the implementer may either consume it directly or inline the equivalent `<EmptyState>` configuration. Either is plan-acceptable.

4. **Four-widget layout (FR-002, FR-036).**
   ```tsx
   return (
     <div className="flex flex-col gap-6">
       <AddTransactionCta accountCount={accountCount} />
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         <WidgetErrorBoundary>
           <NetWorthWidget accounts={accounts} />
         </WidgetErrorBoundary>
         <WidgetErrorBoundary>
           <CashFlowWidget userId={userId} />
         </WidgetErrorBoundary>
         <WidgetErrorBoundary>
           <RecentTransactionsWidget userId={userId} />
         </WidgetErrorBoundary>
       </div>
     </div>
   )
   ```

   Notes:
   - `<AddTransactionCta>` receives `accountCount` so it can render the disabled-with-helper-text variant when `accountCount === 0` (this is the **active** dashboard with accounts; the no-accounts branch above never reaches here, but the prop preserves the type signature consistent with the disabled-state contract in FR-024 — useful for the rare case where the page's `accountCount > 0` but every account is archived between page-level fetch and CTA render). In practice this is always `>= 1`.
   - `<NetWorthWidget>` receives `accounts` as a prop to avoid a second `listAccounts` round-trip. The widget then calls `computeNetWorthByCurrency(accounts)` and renders.
   - `<CashFlowWidget>` receives `userId`; internally calls `computeCurrentMonthRange()` and `sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)`.
   - `<RecentTransactionsWidget>` receives `userId`; internally calls `listTransactionsForUser(userId, { limit: 10 })`.
   - Each `<WidgetErrorBoundary>` is a client component (FR-034); the wrapped server children are server-rendered and their JSX is hydrated through the boundary.

## Page-level loading

The existing `app/(shell)/loading.tsx` (unchanged) covers the page-level loading skeleton (FR-033). The dashboard does NOT define its own `loading.tsx`. While the three widget queries are in flight (and the page-level `listAccounts` is also in flight), the user sees the shell loading skeleton.

## Page-level error

The existing `app/(shell)/error.tsx` (unchanged) catches render-time exceptions thrown OUTSIDE a widget error boundary — e.g., a session/auth failure, a route-level error (FR-037). The dashboard does NOT define its own `error.tsx`.

## Widget-level error

Each widget is wrapped in `<WidgetErrorBoundary>` (FR-034). On a widget's query throw:
- The boundary catches the exception via `componentDidCatch` / `getDerivedStateFromError`.
- The boundary renders an inline error card: `<WidgetCard>` with the heading "Couldn't load", description text, and a "Try again" button (FR-035).
- The other two widgets continue to render normally; the always-on CTA continues to render (FR-036).

## Data dependencies summary

| Element | Async dependency | Failure mode |
|---|---|---|
| Page-level `listAccounts` fetch | Yes | Page-level — graceful fall-through to no-accounts state (a hard error here would be caught by `(shell)/error.tsx`) |
| `<AddTransactionCta>` | No (sync prop) | Cannot fail |
| `<NetWorthWidget>` | None directly (consumes `accounts` prop) | If the reduce throws (impossible for typed input), the boundary catches |
| `<CashFlowWidget>` | `sumIncomeExpenseByCurrencyForUser` Prisma `groupBy` | Throws → boundary catches → inline error UI |
| `<RecentTransactionsWidget>` | `listTransactionsForUser` Prisma `findMany` | Throws → boundary catches → inline error UI |

## Constitution compliance

- **Principle I (money math)**: PASS. The page itself does not perform monetary arithmetic; it composes the widgets that consume the `lib/dashboard/aggregations.ts` reducers. No `<Money>` is rendered at the page level (the no-accounts state has no monetary numbers, per SC-008).
- **Principle II (type safety)**: PASS. Strict TS; typed `accounts: AccountDTO[]`; typed `userId: string`.
- **Principle III (validate at boundaries)**: PASS. No request input; auth checked at the page boundary; helpers trust their typed inputs.
- **Principle IV (test the money paths)**: PASS via the E2E (`tests/e2e/dashboard.spec.ts`) that asserts the page composes correctly under SC-005, SC-006, SC-007, SC-008, SC-010, SC-012.

## Data-scoping enforcement

`userId` is read from `session.user.id` once at the top of the page. It is passed as the first positional argument to every widget that calls a query helper (`<CashFlowWidget>`, `<RecentTransactionsWidget>`). The `<NetWorthWidget>` receives pre-fetched `accounts` which were themselves fetched by `listAccounts(...)` (which internally reads `session.user.id`). **No userId is ever derived from request input — there is no request input on this page.** Cross-user attempts collapse to the requesting user's own dashboard (SC-010).

## Audit greps

```bash
# Page-level no-prisma check
rg "from \"@/lib/prisma\"" app/(shell)/dashboard/
# Expected: zero matches

# Single auth() call at the page top
rg "await auth\(\)" app/(shell)/dashboard/page.tsx
# Expected: one match

# No userId from request input
rg "params|searchParams|formData" app/(shell)/dashboard/page.tsx
# Expected: zero matches (the dashboard page does NOT consume any of these)

# Every monetary surface via <Money>
rg "<Money " app/(shell)/dashboard/_components/
# Expected: one match per monetary surface (net-worth row, cash-flow income/expense/net, recent-transaction amount)

# No inline formatAmount
rg "formatAmount\(" app/(shell)/dashboard/_components/
# Expected: zero matches
```

## Backward compatibility

- The sidebar nav's `/dashboard` entry is unchanged (FR-001).
- The `(shell)/loading.tsx` and `(shell)/error.tsx` files are unchanged (FR-033 / FR-037).
- The `WelcomePanel` component file is unchanged (the page just stops consuming it when `accountCount > 0`; the no-accounts state may or may not consume it depending on implementer choice).
- Features 004 / 006 / 007 routes (`/dashboard/accounts`, `/dashboard/categories`, `/dashboard/transactions`) are unchanged (FR-039).

## Applicable FRs

FR-001, FR-002, FR-003, FR-022, FR-023, FR-024, FR-025, FR-026, FR-029, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-039.

## Applicable SCs

SC-001, SC-002, SC-008, SC-009, SC-010, SC-014, SC-015.
