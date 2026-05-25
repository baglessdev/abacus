/**
 * app/(shell)/dashboard/_components/net-worth-widget.tsx
 *
 * Async server component — Net worth widget (US1).
 * Props: { userId: string }
 *
 * Fetches non-archived accounts via listAccounts, computes per-currency totals
 * via computeNetWorthByCurrency, and renders them through <Money>.
 *
 * Constitution Principle I: NO inline formatAmount, NO arithmetic — all monetary
 * work is delegated to computeNetWorthByCurrency (lib/dashboard/aggregations.ts)
 * and rendered through <Money> (components/money/money.tsx).
 *
 * FR-026: <Money> is the only rendering primitive.
 * FR-027: no arithmetic outside lib/money/.
 * FR-031 + R5: server component — no "use client".
 */

import { listAccounts } from "@/lib/accounts"
import { computeNetWorthByCurrency } from "@/lib/dashboard"
import { Money } from "@/components/money/money"
import { WidgetCard } from "./widget-card"
import { EmptyCell } from "./empty-cell"

interface NetWorthWidgetProps {
  /** The authenticated user's id — sourced from session.user.id in the page server component. */
  userId: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function NetWorthWidget({ userId }: NetWorthWidgetProps) {
  // userId is part of the component contract (page.tsx passes it for API consistency
  // and type-safety). listAccounts reads userId from the session internally.
  // Fetch non-archived accounts. The listAccounts action reads userId from session internally.
  const result = await listAccounts({ includeArchived: false })

  // If the server action returned an error envelope, throw so the wrapping
  // <WidgetErrorBoundary> can catch and render the "Couldn't load" fallback (FR-034).
  if ("error" in result) {
    throw new Error(result.error.message ?? "Failed to load accounts")
  }

  const rows = computeNetWorthByCurrency(result.data.accounts)

  return (
    <WidgetCard title="Net worth">
      {rows.length === 0 ? (
        // Structurally unreachable for a user with >= 1 non-archived account (FR-009),
        // but rendered defensively for zero-balance edge cases.
        <EmptyCell message="No balances yet" />
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row.currency} className="flex items-baseline justify-between py-2">
              <span className="text-sm font-medium text-muted-foreground">{row.currency}</span>
              <Money currency={row.currency} amount={row.total} prominent align="right" />
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}
