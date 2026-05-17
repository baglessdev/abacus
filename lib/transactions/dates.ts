/**
 * lib/transactions/dates.ts
 *
 * Date helpers for the Transactions module.
 * Dates are NOT money — this file lives in lib/transactions/, NOT in lib/money/.
 * Per data-model.md §Date handling and research.md R8.
 *
 * The `date` column on `Transaction` is `@db.Date` (Postgres DATE, calendar-day-only).
 * All writes go through `normalizeToUtcDay` so the stored value is always the UTC midnight
 * instant of the user-visible calendar day. Reads come back as a `Date` object whose time
 * component is 00:00:00 UTC (enforced by the storage layer). The UI edge prints only the
 * calendar-day component, so sub-day drift is invisible even in the unlikely event that
 * Prisma 7's adapter deserializes the DATE column with a local-timezone offset.
 */

/**
 * Returns a `Date` representing UTC midnight (00:00:00.000 UTC) of the calendar day
 * described by `input`.
 *
 * - If `input` is a string in `YYYY-MM-DD` format, the year/month/day are read directly.
 * - If `input` is a `Date` object, the UTC date components are extracted (getUTCFullYear,
 *   getUTCMonth, getUTCDate) so that a `Date` object already in UTC midnight form is
 *   preserved exactly, and a `Date` with a non-zero time component is normalized to midnight
 *   of the SAME UTC calendar day.
 *
 * FR-004: Every transaction's `date` is normalized to UTC midnight at the Zod boundary.
 */
export function normalizeToUtcDay(input: string | Date): Date {
  if (typeof input === "string") {
    // Parse YYYY-MM-DD strictly.
    const parts = input.split("-").map(Number)
    const year = parts[0] ?? 0
    const month = parts[1] ?? 1
    const day = parts[2] ?? 1
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }

  // Date object: extract UTC calendar components, not local-timezone components.
  const year = input.getUTCFullYear()
  const month = input.getUTCMonth()
  const day = input.getUTCDate()
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
}

/**
 * Returns `true` if `input` matches the ISO calendar-date format `YYYY-MM-DD`.
 * Does NOT validate that the date is a real calendar day (e.g., 2026-13-01 would pass
 * this regex — rely on `normalizeToUtcDay` + JavaScript `Date` semantics for overflow).
 *
 * Used by Zod schemas as a `.refine()` predicate for the `date` field.
 */
export function isISODateString(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input)
}
