/**
 * app/(shell)/dashboard/_components/budgets-widget.tsx
 *
 * Async server component — Budgets widget (US4).
 * Props: { userId: string }
 *
 * Renders up to 5 active budgets in priority order (over → near → under) with
 * category name, progress bar, and compact <Money> labels.
 *
 * Constitution Principle I: NO inline formatAmount, NO arithmetic — all monetary
 * values come pre-computed from listBudgets (which runs attachActualsToBudgets +
 * sortBudgetsByStatusAndProgress internally per T019).
 *
 * FR-027: server component — no "use client".
 * FR-028: at most 5 budgets, sorted by priority; "See all" link.
 * FR-029: empty state with CTA — NOT a page takeover.
 * FR-024: <Money> is the only monetary rendering primitive.
 */

import Link from "next/link"

import { listBudgets } from "@/lib/budgets"
import { Money } from "@/components/money/money"
import { ProgressBar } from "@/app/(shell)/dashboard/budgets/_components/progress-bar"
import { WidgetCard } from "./widget-card"
import { EmptyCell } from "./empty-cell"

interface BudgetsWidgetProps {
  /** The authenticated user's id — sourced from session.user.id in the page server component. */
  userId: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function BudgetsWidget({ userId }: BudgetsWidgetProps) {
  // userId is part of the component contract (page.tsx passes it for API consistency
  // and type-safety). listBudgets reads userId from the session internally.
  const result = await listBudgets({ includeArchived: false })

  // If the server action returned an error envelope, throw so the wrapping
  // <WidgetErrorBoundary> can catch and render the "Couldn't load" fallback (FR-027).
  if ("error" in result) {
    throw new Error(result.error.message ?? "Failed to load budgets")
  }

  // Slice to the top 5 — listBudgets already returns sorted by status priority per T019.
  const budgets = result.data.budgets.slice(0, 5)

  return (
    <WidgetCard title="Budgets">
      {budgets.length === 0 ? (
        // FR-029: empty state has CTA, NOT a page-takeover.
        <div className="flex flex-col gap-3">
          <EmptyCell message="No budgets yet" />
          <Link
            href="/dashboard/budgets"
            className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Set up your first budget →
          </Link>
        </div>
      ) : (
        // FR-028: render up to 5 budget rows in priority order.
        <div className="flex flex-col gap-2">
          {budgets.map((b) => (
            <div key={b.budget.id} className="flex flex-col gap-1">
              {/* Category name — truncate at one line */}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium leading-none">{b.category.name}</span>
                {/* Compact "$actuals / $budgeted" labels via <Money> (FR-024) */}
                <span className="flex shrink-0 items-baseline gap-1 text-xs text-muted-foreground">
                  <Money currency={b.budget.currency} amount={b.actuals} />
                  <span>/</span>
                  <Money currency={b.budget.currency} amount={b.budget.amount} />
                </span>
              </div>

              {/* Progress bar — compact variant (reused from /dashboard/budgets rows) */}
              <ProgressBar value={b.progressRatio} status={b.status} className="h-1.5" />
            </div>
          ))}

          {/* "See all" link — always shown when there are budgets (FR-028) */}
          <div className="mt-1 flex justify-end">
            <Link
              href="/dashboard/budgets"
              className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              See all →
            </Link>
          </div>
        </div>
      )}
    </WidgetCard>
  )
}
