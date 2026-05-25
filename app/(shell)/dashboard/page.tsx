/**
 * app/(shell)/dashboard/page.tsx
 *
 * Dashboard home — server component (no "use client").
 *
 * Shape:
 * 1. Auth gate (defense-in-depth on top of middleware.ts).
 * 2. Fetch non-archived accounts to determine account count.
 * 3a. Zero accounts → no-accounts EmptyState via <WelcomePanel />.
 * 3b. Has accounts → four-widget shell layout:
 *     - Add transaction CTA via <AddTransactionCta /> (wired in Phase 6 / T022).
 *     - Grid with <NetWorthWidget> + <CashFlowWidget> + <RecentTransactionsWidget> in <WidgetErrorBoundary>.
 *
 * Phase 3 (US1): Net worth widget.
 * Phase 4 (US2): + Recent transactions widget.
 * Phase 5 (US3): + This-month cash flow widget.
 * Phase 6 (US4): CTA placeholder replaced with <AddTransactionCta />.
 *
 * FR-002, FR-003, FR-022, FR-025, FR-033, FR-034, FR-036.
 */

import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { listAccounts } from "@/lib/accounts"
import { WelcomePanel } from "@/components/shell/welcome-panel"
import { AddTransactionCta } from "./_components/add-transaction-cta"
import { WidgetErrorBoundary } from "./_components/widget-error-boundary"
import { NetWorthWidget } from "./_components/net-worth-widget"
import { CashFlowWidget } from "./_components/cash-flow-widget"
import { RecentTransactionsWidget } from "./_components/recent-transactions-widget"

export default async function DashboardPage() {
  // 1. Auth gate — defense-in-depth on top of middleware.ts (FR-025).
  const session = await auth()
  if (!session?.user?.id) {
    // Middleware should have redirected; reaching here indicates a misconfiguration.
    redirect("/login")
  }
  const userId = session.user.id

  // 2. Fetch non-archived accounts to determine account count.
  //    On error: fall through to no-accounts branch (safer than erroring the whole page).
  const accountsResult = await listAccounts({ includeArchived: false })
  const accounts = "error" in accountsResult ? [] : accountsResult.data.accounts
  const accountCount = accounts.length

  // 3a. No-accounts empty state (FR-003 — INSTEAD OF the four-widget layout, not in addition to).
  if (accountCount === 0) {
    return <WelcomePanel />
  }

  // 3b. Four-widget shell layout for users with at least one non-archived account.
  //     Widget order per FR-002: CTA → Net worth → This-month cash flow → Recent transactions.
  //     All three data widgets + CTA are now wired (Phases 3–6).
  return (
    <div className="flex flex-col gap-6">
      {/* Add transaction CTA — always-on for users with ≥ 1 non-archived account.
          disabled prop is false (structurally: the no-accounts branch returns early above).
          FR-022, FR-036. */}
      <AddTransactionCta />

      {/* Widget grid: 1-col on narrow, 2-col on md+.
          Order per FR-002: Net worth → This-month cash flow → Recent transactions.
          On 2-col: Net worth + Cash flow in the top row; Recent transactions spans full width below. */}
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
}
