/**
 * lib/budgets/serialize.ts
 *
 * Converts Prisma Budget rows (and BudgetWithActuals aggregates) to DTOs suitable for
 * transport over the React server-component boundary.
 *
 * Convention: Decimal → canonical decimal string via .toString(); Date → ISO 8601 string.
 * Mirrors the serialize pattern from lib/accounts/serialize.ts and lib/transactions/serialize.ts.
 *
 * Audit grep: `grep -rn 'from "@/lib/prisma"' lib/budgets/serialize.ts` → ZERO matches.
 */

import { type Budget } from "@prisma/client"

import { type CategoryDTO, serializeCategory } from "@/lib/categories/serialize"
import { type BudgetWithActuals } from "@/lib/budgets/aggregations"

// ---------------------------------------------------------------------------
// BudgetDTO
// ---------------------------------------------------------------------------

export type BudgetDTO = {
  id: string
  userId: string
  categoryId: string
  period: "MONTHLY" | "YEARLY"
  /** Canonical decimal string; always > 0. E.g., "400.00000000". */
  amount: string
  /** ISO 4217 alpha-3, uppercase. */
  currency: string
  /** ISO 8601 date-only string, e.g. "2026-05-01". */
  startDate: string
  /** ISO 8601 date-only string or null (open-ended). */
  endDate: string | null
  /** ISO 8601 UTC or null (null = active). */
  archivedAt: string | null
  /** ISO 8601 UTC. */
  createdAt: string
  /** ISO 8601 UTC. */
  updatedAt: string
}

/**
 * Convert a Prisma Budget row to a BudgetDTO.
 * Decimal → .toString(); Date → ISO string.
 */
export function serializeBudget(row: Budget): BudgetDTO {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    period: row.period,
    amount: row.amount.toString(),
    currency: row.currency,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// BudgetWithActualsDTO
// ---------------------------------------------------------------------------

export type BudgetWithActualsDTO = {
  budget: BudgetDTO
  category: CategoryDTO
  /** Canonical decimal string; always >= 0. Absolute value of EXPENSE sum. */
  actuals: string
  /** Canonical signed decimal string; negative when over-budget. */
  remaining: string
  /**
   * Float in [0, ∞). Used ONLY for the progress-bar fill % CSS and sort tie-breaker.
   * NOT used for status comparison (which is Decimal-precision-correct — R12).
   */
  progressRatio: number
  status: "under" | "near" | "over"
  /** ISO 8601 date-only string — inclusive start of the current period. */
  periodStart: string
  /** ISO 8601 date-only string — exclusive end of the current period. */
  periodEnd: string
}

/**
 * Convert a BudgetWithActuals aggregate to a BudgetWithActualsDTO.
 * Money values → canonical decimal strings; Dates → ISO strings.
 */
export function serializeBudgetWithActuals(b: BudgetWithActuals): BudgetWithActualsDTO {
  return {
    budget: serializeBudget(b.budget),
    category: serializeCategory(b.category),
    actuals: b.actuals.toString(),
    remaining: b.remaining.toString(),
    progressRatio: b.progressRatio,
    status: b.status,
    periodStart: b.periodStart.toISOString().slice(0, 10),
    periodEnd: b.periodEnd.toISOString().slice(0, 10),
  }
}
