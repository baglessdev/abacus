/**
 * lib/dashboard/dates.ts
 *
 * Pure date utilities for the dashboard. No I/O, no Prisma. No browser locale.
 * All boundaries are UTC midnight (constitution Principle I, FR-016).
 */

/**
 * Compute the current calendar month range in UTC.
 *
 * Returns:
 *   dateFrom — UTC midnight of the 1st of the current calendar month (inclusive)
 *   dateTo   — UTC midnight of the 1st of the next calendar month (exclusive)
 *
 * Recomputed at every call (FR-016) — no memoization, no module-level constant.
 * Uses Date.UTC to avoid any local-timezone offset (constitution §Dates UTC).
 */
export function computeCurrentMonthRange(): { dateFrom: Date; dateTo: Date } {
  const now = new Date()
  const dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { dateFrom, dateTo }
}
