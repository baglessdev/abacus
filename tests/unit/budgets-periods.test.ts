/**
 * tests/unit/budgets-periods.test.ts
 *
 * Unit tests for period-boundary helpers in lib/budgets/periods.ts.
 * Constitution Principle IV: test the money paths (UTC period boundaries directly affect
 * the actuals aggregation date range, which feeds monetary computations).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  computeMonthRangeForDate,
  computeYearRangeForDate,
  computeCurrentPeriodRange,
} from "@/lib/budgets/periods"

// ---------------------------------------------------------------------------
// computeMonthRangeForDate
// ---------------------------------------------------------------------------

describe("computeMonthRangeForDate", () => {
  it("(a) mid-month (2026-05-15) → dateFrom=2026-05-01, dateTo=2026-06-01", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2026-05-15T12:34:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("(b) first-of-month (2026-05-01T00:00:00Z) → same range", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2026-05-01T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("(c) last-of-month (2026-05-31T23:59:59Z) → same range", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2026-05-31T23:59:59.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("(d) December → January rollover (2026-12-25) → dateFrom=2026-12-01, dateTo=2027-01-01", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2026-12-25T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("(e) leap-year February (2028-02-15) → dateFrom=2028-02-01, dateTo=2028-03-01", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2028-02-15T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2028-02-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2028-03-01T00:00:00.000Z")
  })

  it("(f) January (2026-01-10) → dateFrom=2026-01-01, dateTo=2026-02-01", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2026-01-10T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-02-01T00:00:00.000Z")
  })

  it("(g) dateFrom is always at UTC midnight (time is zeroed)", () => {
    const { dateFrom, dateTo } = computeMonthRangeForDate(new Date("2026-08-20T15:30:00.000Z"))
    expect(dateFrom.getUTCHours()).toBe(0)
    expect(dateFrom.getUTCMinutes()).toBe(0)
    expect(dateFrom.getUTCSeconds()).toBe(0)
    expect(dateFrom.getUTCMilliseconds()).toBe(0)
    expect(dateTo.getUTCHours()).toBe(0)
    expect(dateTo.getUTCMinutes()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeYearRangeForDate
// ---------------------------------------------------------------------------

describe("computeYearRangeForDate", () => {
  it("(a) mid-year (2026-05-15) → dateFrom=2026-01-01, dateTo=2027-01-01", () => {
    const { dateFrom, dateTo } = computeYearRangeForDate(new Date("2026-05-15T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("(b) first-of-year (2026-01-01T00:00:00Z) → same range", () => {
    const { dateFrom, dateTo } = computeYearRangeForDate(new Date("2026-01-01T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("(c) last-of-year (2026-12-31T23:59:59Z) → dateFrom=2026-01-01, dateTo=2027-01-01", () => {
    const { dateFrom, dateTo } = computeYearRangeForDate(new Date("2026-12-31T23:59:59.000Z"))
    expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("(d) year-end rollover: 2028 → dateTo is 2029-01-01", () => {
    const { dateFrom, dateTo } = computeYearRangeForDate(new Date("2028-06-15T00:00:00.000Z"))
    expect(dateFrom.toISOString()).toBe("2028-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2029-01-01T00:00:00.000Z")
  })

  it("(e) dateFrom is always UTC midnight Jan 1", () => {
    const { dateFrom } = computeYearRangeForDate(new Date("2026-09-30T18:00:00.000Z"))
    expect(dateFrom.getUTCMonth()).toBe(0) // January
    expect(dateFrom.getUTCDate()).toBe(1)
    expect(dateFrom.getUTCHours()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeCurrentPeriodRange
// ---------------------------------------------------------------------------

describe("computeCurrentPeriodRange", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("MONTHLY — matches computeMonthRangeForDate(now)", () => {
    vi.setSystemTime(new Date("2026-05-17T10:00:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentPeriodRange("MONTHLY")
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("YEARLY — matches computeYearRangeForDate(now)", () => {
    vi.setSystemTime(new Date("2026-05-17T10:00:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentPeriodRange("YEARLY")
    expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("MONTHLY in December → rolls over to January of next year", () => {
    vi.setSystemTime(new Date("2026-12-20T00:00:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentPeriodRange("MONTHLY")
    expect(dateFrom.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("YEARLY in December 2026 → 2026-01-01 to 2027-01-01", () => {
    vi.setSystemTime(new Date("2026-12-31T23:59:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentPeriodRange("YEARLY")
    expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })
})
