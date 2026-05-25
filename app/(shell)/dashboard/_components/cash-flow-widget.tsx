/**
 * app/(shell)/dashboard/_components/cash-flow-widget.tsx
 *
 * Async server component — This-month cash flow widget (US3).
 * Props: { userId: string }
 *
 * Implementation:
 * 1. computeCurrentMonthRange() → { dateFrom, dateTo } (FR-016 — recomputed at every render).
 * 2. sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo) → raw aggregate rows.
 * 3. buildCashFlowShape(rows) → PerCurrencyCashFlow[] (per-currency income / expense / net).
 * 4. Render inside <WidgetCard title="This month">:
 *    - If blocks.length === 0 → <EmptyCell message="No income or expense this month yet" /> (FR-014).
 *    - Otherwise: one block per currency showing Income / Expense / Net each via <Money>.
 *
 * Constitution Principle I:
 *   - NO inline formatAmount calls (FR-026). Every monetary value renders through <Money>.
 *   - NO arithmetic on monetary values (FR-027). buildCashFlowShape already did the math.
 *   - TRANSFER rows excluded at the query level (sumIncomeExpenseByCurrencyForUser WHERE clause).
 *   - FR-012: all three lines (Income / Expense / Net) render via <Money> even when zero.
 *
 * FR-031: server component — no "use client" directive.
 */

import { sumIncomeExpenseByCurrencyForUser } from "@/lib/transactions/queries"
import { buildCashFlowShape, computeCurrentMonthRange } from "@/lib/dashboard"
import { Money } from "@/components/money/money"
import { WidgetCard } from "./widget-card"
import { EmptyCell } from "./empty-cell"

interface CashFlowWidgetProps {
  /** The authenticated user's id — sourced from session.user.id in the page server component. */
  userId: string
}

export async function CashFlowWidget({ userId }: CashFlowWidgetProps) {
  // FR-016: current month range recomputed at every render.
  const { dateFrom, dateTo } = computeCurrentMonthRange()

  // Fetch per-(currency, type) aggregates for the current month.
  // TRANSFER rows excluded at the SQL WHERE level (FR-010, FR-015).
  const rows = await sumIncomeExpenseByCurrencyForUser(userId, dateFrom, dateTo)

  // Reshape into per-currency blocks { currency, income, expense, net }.
  // buildCashFlowShape handles net = income.plus(expense) — no arithmetic here (FR-027).
  const blocks = buildCashFlowShape(rows)

  return (
    <WidgetCard title="This month">
      {blocks.length === 0 ? (
        // FR-014: empty state when no INCOME / EXPENSE rows exist this month.
        <EmptyCell message="No income or expense this month yet" />
      ) : (
        <div className="flex flex-col gap-4">
          {blocks.map((block, index) => (
            <div key={block.currency}>
              {/* Separator between currency blocks for multi-currency users (FR-012). */}
              {index > 0 && <div className="mb-4 border-t" />}

              {/* Per-currency sub-block: Income / Expense / Net labelled lines. */}
              <div className="flex flex-col gap-1">
                {/* Income line — always rendered via <Money> even when zero (FR-012). */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Income</span>
                  <Money currency={block.currency} amount={block.income} align="right" />
                </div>

                {/* Expense line — always rendered via <Money> even when zero (FR-012). */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Expense</span>
                  <Money currency={block.currency} amount={block.expense} align="right" />
                </div>

                {/* Net line — always rendered via <Money> even when zero (FR-012). */}
                <div className="mt-1 flex items-center justify-between border-t pt-1">
                  <span className="text-sm font-medium">Net</span>
                  <Money currency={block.currency} amount={block.net} align="right" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}
