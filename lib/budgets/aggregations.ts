/**
 * lib/budgets/aggregations.ts
 *
 * Pure data-shaping functions for the Budgets module. No Prisma. No I/O.
 * All monetary arithmetic flows through lib/money/ (constitution Principle I).
 *
 * Audit grep: `grep -rn 'from "@/lib/prisma"' lib/budgets/aggregations.ts` → ZERO matches.
 */

import { type Budget, type BudgetPeriod, type Category } from "@prisma/client"

import { Money } from "@/lib/money/decimal"
import { computeCurrentPeriodRange } from "@/lib/budgets/periods"

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** The key used to look up a budget's actuals in the actualsMap. */
type ActualsKey = string // `${period}::${categoryId}::${currency}`

/** In-memory aggregate shape — computed at request time from Budget + actuals. */
export type BudgetWithActuals = {
  budget: Budget
  category: Category
  /** Absolute sum of non-archived EXPENSE transactions for (categoryId, currency) in period; always >= 0. */
  actuals: Money
  /** budget.amount - actuals; negative when over-budget. */
  remaining: Money
  /**
   * actuals / amount as a float. Used ONLY for the progress-bar fill % CSS and
   * as a sort tie-breaker within the same status group. NOT used for status classification
   * (which uses Decimal-precision-correct comparedTo — R12).
   */
  progressRatio: number
  /** Decimal-precision-correct status classification. */
  status: "under" | "near" | "over"
  /** Inclusive start of the current period window (UTC midnight). */
  periodStart: Date
  /** Exclusive end of the current period window (UTC midnight of first-of-next-period). */
  periodEnd: Date
}

// ---------------------------------------------------------------------------
// computeStatus (T008)
// ---------------------------------------------------------------------------

/**
 * Classify a budget's actuals against its amount.
 *
 * CRITICAL: Uses Decimal-precision-correct comparedTo/times — NEVER float division (R12).
 *
 * Thresholds (spec Clarification Q1):
 *   - over:  actuals > amount             (> 100%)
 *   - near:  actuals >= 80% of amount AND actuals <= amount  (80%–100% inclusive)
 *   - under: actuals < 80% of amount      (< 80%)
 *
 * The 100% boundary is inclusive of "near" (actuals === amount → "near", per spec clarification).
 */
export function computeStatus(actuals: Money, amount: Money): "under" | "near" | "over" {
  // Defensive: zero amount is rejected at the Zod boundary (FR-005); treat as under.
  if (amount.isZero()) return "under"
  // over: actuals > amount
  if (actuals.comparedTo(amount) > 0) return "over"
  // near: actuals >= 0.80 * amount (and <= amount per the above guard)
  const nearThreshold = amount.times(new Money("0.80"))
  if (actuals.comparedTo(nearThreshold) >= 0) return "near"
  return "under"
}

// ---------------------------------------------------------------------------
// attachActualsToBudgets (T007)
// ---------------------------------------------------------------------------

/**
 * Attach computed actuals, remaining, progressRatio, and status to each budget row.
 *
 * @param budgets    - Array of Budget rows joined with Category (via Prisma include: { category: true }).
 * @param actualsMap - Keyed by `${period}::${categoryId}::${currency}`.
 *                     Missing keys default to Money(0) — the "no transactions yet" case.
 * @param periodWindows - MONTHLY and YEARLY period ranges, computed at request time.
 *
 * Preserves input order. Returns a new array (does not mutate inputs).
 */
export function attachActualsToBudgets(
  budgets: Array<Budget & { category: Category }>,
  actualsMap: Map<ActualsKey, Money>,
  periodWindows: {
    MONTHLY: { dateFrom: Date; dateTo: Date }
    YEARLY: { dateFrom: Date; dateTo: Date }
  },
): BudgetWithActuals[] {
  return budgets.map((row) => {
    const { category, ...budget } = row

    const key: ActualsKey = `${budget.period}::${budget.categoryId}::${budget.currency}`
    const actuals = actualsMap.get(key) ?? new Money(0)
    const amount = new Money(budget.amount)

    const remaining = amount.minus(actuals)

    // progressRatio is a float — used only for display/sort, NOT for status (R12).
    const amountFloat = parseFloat(amount.toString())
    const progressRatio = amountFloat === 0 ? 0 : parseFloat(actuals.toString()) / amountFloat

    const status = computeStatus(actuals, amount)

    const window = periodWindows[budget.period as BudgetPeriod]
    const periodStart = window.dateFrom
    const periodEnd = window.dateTo

    return {
      budget,
      category,
      actuals,
      remaining,
      progressRatio,
      status,
      periodStart,
      periodEnd,
    }
  })
}

// ---------------------------------------------------------------------------
// sortBudgetsByStatusAndProgress (T007)
// ---------------------------------------------------------------------------

/** Priority order for status: over (0) > near (1) > under (2). */
const STATUS_PRIORITY: Record<"under" | "near" | "over", number> = {
  over: 0,
  near: 1,
  under: 2,
}

/**
 * Sort budgets by status priority desc (over → near → under), then progressRatio desc,
 * then category.name asc as a final tie-breaker.
 *
 * Returns a NEW sorted array (does not mutate input).
 */
export function sortBudgetsByStatusAndProgress(budgets: BudgetWithActuals[]): BudgetWithActuals[] {
  return [...budgets].sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status]
    const priorityB = STATUS_PRIORITY[b.status]
    if (priorityA !== priorityB) return priorityA - priorityB

    // Higher progressRatio first within the same status group.
    if (a.progressRatio !== b.progressRatio) return b.progressRatio - a.progressRatio

    // Alphabetical category name as the final stable tie-breaker.
    return a.category.name.localeCompare(b.category.name)
  })
}

// ---------------------------------------------------------------------------
// Re-export computeCurrentPeriodRange for convenience (consumed by queries.ts)
// ---------------------------------------------------------------------------
export { computeCurrentPeriodRange }
