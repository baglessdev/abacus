/**
 * lib/dashboard/aggregations.ts
 *
 * Pure data-shaping functions for the dashboard widgets. NO Prisma access, NO I/O.
 * Consumes typed function-export shapes from lib/accounts and lib/transactions + lib/money.
 *
 * Constitution Principle I: all arithmetic goes through lib/money/ (Money.plus, sumAmounts).
 * Audit grep: `grep -rn "prisma\." lib/dashboard/` → ZERO matches.
 */

import { Money } from "@/lib/money/decimal"
import { type AccountDTO } from "@/lib/accounts/serialize"
import { type CashFlowAggregateRow } from "@/lib/transactions/queries"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-currency net-worth row returned by computeNetWorthByCurrency. */
export type PerCurrencyTotal = {
  /** ISO 4217 alpha-3 currency code, exactly as carried on the input AccountDTO. */
  currency: string
  /** Canonical decimal string from Money.toString(); preserves the sign. */
  total: string
}

/** Per-currency cash-flow block returned by buildCashFlowShape. */
export type PerCurrencyCashFlow = {
  /** ISO 4217 alpha-3 currency code. */
  currency: string
  /** Canonical decimal string; always >= 0 (stored sign preserved). */
  income: string
  /** Canonical decimal string; always <= 0 (stored sign preserved). */
  expense: string
  /** Canonical signed decimal string; net = income + expense. */
  net: string
}

// ---------------------------------------------------------------------------
// computeNetWorthByCurrency
// ---------------------------------------------------------------------------

/**
 * Reduce a list of accounts into a per-currency net-worth summary.
 *
 * - Groups accounts by currency.
 * - Sums each currency's `account.balance` via Money.plus() (lib/money/decimal.ts).
 * - Materializes each sum as a canonical decimal string via .toString().
 * - Sorts by descending absolute total; ties broken by ISO 4217 alphabetical ascending (FR-007).
 *
 * Pure function — no I/O, no clock dependency.
 * The caller is responsible for filtering archived accounts
 * (pass accounts from listAccounts({ includeArchived: false })).
 */
export function computeNetWorthByCurrency(accounts: AccountDTO[]): PerCurrencyTotal[] {
  // Accumulate per-currency Money sums.
  const sumMap = new Map<string, Money>()

  for (const account of accounts) {
    const amount = new Money(account.balance)
    const existing = sumMap.get(account.currency)
    sumMap.set(account.currency, existing !== undefined ? existing.plus(amount) : amount)
  }

  // Materialize and sort.
  const result: PerCurrencyTotal[] = []
  for (const [currency, total] of sumMap) {
    result.push({ currency, total: total.toString() })
  }

  return sortByCurrencyTotals(result, (r) => new Money(r.total))
}

// ---------------------------------------------------------------------------
// buildCashFlowShape
// ---------------------------------------------------------------------------

/**
 * Reshape the Prisma groupBy rows from sumIncomeExpenseByCurrencyForUser into
 * a per-currency cash-flow summary.
 *
 * - Groups rows by currency (each (currency, type) pair appears at most once per Prisma groupBy).
 * - For each currency: picks the INCOME row's _sum.amount (defaults to Money(0) if absent)
 *   and the EXPENSE row's _sum.amount (defaults to Money(0) if absent).
 * - Computes net = income.plus(expense).
 *   EXPENSE is stored negative per feature-007 signed-amount convention, so `.plus()` is correct.
 * - Materializes each block as canonical decimal strings via .toString().
 * - Sorts by descending absolute net; ties broken by ISO 4217 alphabetical ascending.
 *
 * TRANSFER rows MUST NOT appear in the input — the caller's SQL WHERE clause filters them.
 * Pure function — no I/O, no clock dependency.
 */
export function buildCashFlowShape(rows: CashFlowAggregateRow[]): PerCurrencyCashFlow[] {
  // Build a per-currency map of { income: Money, expense: Money }.
  const currencyMap = new Map<string, { income: Money; expense: Money }>()

  for (const row of rows) {
    let entry = currencyMap.get(row.currency)
    if (entry === undefined) {
      entry = { income: new Money(0), expense: new Money(0) }
      currencyMap.set(row.currency, entry)
    }

    if (row.type === "INCOME") {
      entry.income = row._sum.amount
    } else {
      // EXPENSE
      entry.expense = row._sum.amount
    }
  }

  // Materialize and sort.
  const result: PerCurrencyCashFlow[] = []
  for (const [currency, { income, expense }] of currencyMap) {
    const net = income.plus(expense)
    result.push({
      currency,
      income: income.toString(),
      expense: expense.toString(),
      net: net.toString(),
    })
  }

  return sortByCurrencyTotals(result, (r) => new Money(r.net))
}

// ---------------------------------------------------------------------------
// Shared sort helper
// ---------------------------------------------------------------------------

/**
 * Sort an array of per-currency rows by:
 *   1. Descending absolute value of the "key" amount extracted by getKey().
 *   2. ISO 4217 alphabetical ascending as a tie-breaker.
 *
 * Mutates and returns the input array (avoids an extra allocation; pure from the caller's POV).
 */
function sortByCurrencyTotals<T extends { currency: string }>(
  rows: T[],
  getKey: (row: T) => Money,
): T[] {
  return rows.sort((a, b) => {
    const aAbs = getKey(a).abs()
    const bAbs = getKey(b).abs()
    const cmp = bAbs.comparedTo(aAbs) // descending
    if (cmp !== 0) return cmp
    // Tie-break: ISO 4217 ascending
    return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0
  })
}
