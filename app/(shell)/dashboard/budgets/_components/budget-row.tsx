"use client"

/**
 * app/(shell)/dashboard/budgets/_components/budget-row.tsx
 *
 * Renders a single budget row with actuals, remaining, and a progress bar.
 * Client component because it accepts and delegates click-handlers from the
 * parent <BudgetsList> client component (onEdit, onArchive).
 *
 * Invariants:
 *   - NO arithmetic on monetary values (all pre-computed by lib/budgets/aggregations.ts).
 *   - NO formatAmount calls — every monetary value renders through <Money>.
 *   - FR-023 (Money-only rendering), FR-024 (no formatAmount).
 */

import { type BudgetWithActualsDTO } from "@/lib/budgets/serialize"
import { Money } from "@/components/money/money"
import { ProgressBar } from "./progress-bar"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetRowProps = {
  budget: BudgetWithActualsDTO
  isArchivedCategory: boolean
  onEdit: (budget: BudgetWithActualsDTO) => void
  onArchive: (budget: BudgetWithActualsDTO) => void
}

// ---------------------------------------------------------------------------
// BudgetRow
// ---------------------------------------------------------------------------

export function BudgetRow({ budget, isArchivedCategory, onEdit, onArchive }: BudgetRowProps) {
  const { budget: b, category, actuals, remaining, progressRatio, status } = budget

  const periodLabel = b.period === "MONTHLY" ? "Monthly" : "Yearly"
  const categoryLabel = isArchivedCategory ? `${category.name} (archived category)` : category.name

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      {/* Header: category name + period + archive button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onEdit(budget)}
            className="text-left text-sm font-medium hover:underline focus:underline focus:outline-none"
            aria-label={`Edit budget for ${categoryLabel}`}
          >
            {categoryLabel}
          </button>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>

        {/* Archive button (trailing) */}
        <button
          type="button"
          onClick={() => onArchive(budget)}
          className="shrink-0 rounded text-xs text-muted-foreground underline hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={`Archive budget for ${categoryLabel}`}
        >
          Archive
        </button>
      </div>

      {/* Monetary values: Budgeted / Actuals / Remaining */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Budgeted</span>
          <Money currency={b.currency} amount={b.amount} prominent />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Spent</span>
          <Money currency={b.currency} amount={actuals} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Remaining</span>
          {/* <Money> handles sign-aware color — negative when over budget */}
          <Money currency={b.currency} amount={remaining} />
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar value={Number(progressRatio)} status={status} />
    </div>
  )
}
