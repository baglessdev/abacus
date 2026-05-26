/**
 * lib/budgets/periods.ts
 *
 * Pure period-boundary helpers for the Budgets module. No I/O, no Prisma.
 * All boundaries are UTC midnight (constitution Principle I, FR-009).
 * Recomputed on every call — no module-level memoization (FR-014).
 */

import { type BudgetPeriod } from "@prisma/client"

/**
 * Compute the calendar-month range for a given date in UTC.
 *
 * Returns:
 *   dateFrom — UTC midnight of the 1st of the month containing `date` (inclusive)
 *   dateTo   — UTC midnight of the 1st of the NEXT month (exclusive)
 *
 * Examples:
 *   computeMonthRangeForDate(new Date("2026-05-15")) →
 *     { dateFrom: 2026-05-01T00:00:00Z, dateTo: 2026-06-01T00:00:00Z }
 *   computeMonthRangeForDate(new Date("2026-12-25")) →
 *     { dateFrom: 2026-12-01T00:00:00Z, dateTo: 2027-01-01T00:00:00Z }
 */
export function computeMonthRangeForDate(date: Date): { dateFrom: Date; dateTo: Date } {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() // 0-indexed
  const dateFrom = new Date(Date.UTC(year, month, 1))
  const dateTo = new Date(Date.UTC(year, month + 1, 1)) // Date.UTC normalizes Dec+1 → Jan of next year
  return { dateFrom, dateTo }
}

/**
 * Compute the calendar-year range for a given date in UTC.
 *
 * Returns:
 *   dateFrom — UTC midnight of January 1st of `date`'s year (inclusive)
 *   dateTo   — UTC midnight of January 1st of the NEXT year (exclusive)
 *
 * Examples:
 *   computeYearRangeForDate(new Date("2026-05-15")) →
 *     { dateFrom: 2026-01-01T00:00:00Z, dateTo: 2027-01-01T00:00:00Z }
 */
export function computeYearRangeForDate(date: Date): { dateFrom: Date; dateTo: Date } {
  const year = date.getUTCFullYear()
  const dateFrom = new Date(Date.UTC(year, 0, 1)) // Jan 1
  const dateTo = new Date(Date.UTC(year + 1, 0, 1)) // Jan 1 of next year
  return { dateFrom, dateTo }
}

/**
 * Compute the current-period range (MONTHLY or YEARLY) using the current system time.
 * Convenience wrapper around computeMonthRangeForDate / computeYearRangeForDate.
 *
 * Recomputed on every call (FR-014).
 */
export function computeCurrentPeriodRange(period: BudgetPeriod): { dateFrom: Date; dateTo: Date } {
  const now = new Date()
  return period === "MONTHLY" ? computeMonthRangeForDate(now) : computeYearRangeForDate(now)
}
