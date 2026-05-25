/**
 * tests/unit/dashboard-dates.test.ts
 *
 * Unit tests for computeCurrentMonthRange().
 * Constitution Principle IV: test the money paths (UTC boundary correctness affects
 * the cash-flow query's date range and therefore monetary aggregation accuracy).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { computeCurrentMonthRange } from "@/lib/dashboard/dates"

describe("computeCurrentMonthRange", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("(a) mid-month (2026-05-15 12:34 UTC) → dateFrom=2026-05-01T00:00:00Z, dateTo=2026-06-01T00:00:00Z", () => {
    vi.setSystemTime(new Date("2026-05-15T12:34:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentMonthRange()
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("(b) first-of-month (2026-05-01 00:00:01 UTC) → same as (a)", () => {
    vi.setSystemTime(new Date("2026-05-01T00:00:01.000Z"))
    const { dateFrom, dateTo } = computeCurrentMonthRange()
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("(c) last-of-month (2026-05-31 23:59:59 UTC) → same as (a)", () => {
    vi.setSystemTime(new Date("2026-05-31T23:59:59.000Z"))
    const { dateFrom, dateTo } = computeCurrentMonthRange()
    expect(dateFrom.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("(d) December → January rollover (2026-12-15) → dateFrom=2026-12-01, dateTo=2027-01-01", () => {
    vi.setSystemTime(new Date("2026-12-15T00:00:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentMonthRange()
    expect(dateFrom.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("(e) leap-year February (2028-02-15) → dateFrom=2028-02-01, dateTo=2028-03-01", () => {
    vi.setSystemTime(new Date("2028-02-15T00:00:00.000Z"))
    const { dateFrom, dateTo } = computeCurrentMonthRange()
    expect(dateFrom.toISOString()).toBe("2028-02-01T00:00:00.000Z")
    expect(dateTo.toISOString()).toBe("2028-03-01T00:00:00.000Z")
  })

  it("(f) determinism — calling twice with the same pinned clock returns equal getTime() values", () => {
    vi.setSystemTime(new Date("2026-05-15T12:34:00.000Z"))
    const first = computeCurrentMonthRange()
    const second = computeCurrentMonthRange()
    expect(first.dateFrom.getTime()).toBe(second.dateFrom.getTime())
    expect(first.dateTo.getTime()).toBe(second.dateTo.getTime())
  })
})
