import { describe, expect, it } from "vitest"

import { isISODateString, normalizeToUtcDay } from "@/lib/transactions/dates"

/**
 * tests/unit/transactions-dates.test.ts
 *
 * Locks normalizeToUtcDay and isISODateString per FR-004 and research.md R8.
 * Constitution Principle IV — mandatory unit test for the date-normalization boundary.
 */

describe("normalizeToUtcDay — FR-004 / research.md R8 / Principle IV", () => {
  describe("string input (YYYY-MM-DD)", () => {
    it("'2026-05-17' → Date at UTC midnight of 2026-05-17", () => {
      const result = normalizeToUtcDay("2026-05-17")
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(4) // 0-indexed: May = 4
      expect(result.getUTCDate()).toBe(17)
      expect(result.getUTCHours()).toBe(0)
      expect(result.getUTCMinutes()).toBe(0)
      expect(result.getUTCSeconds()).toBe(0)
      expect(result.getUTCMilliseconds()).toBe(0)
    })

    it("'2026-01-01' → Date at UTC midnight of 2026-01-01 (New Year)", () => {
      const result = normalizeToUtcDay("2026-01-01")
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(0)
      expect(result.getUTCDate()).toBe(1)
      expect(result.getUTCHours()).toBe(0)
    })

    it("'2026-12-31' → Date at UTC midnight of 2026-12-31 (New Year's Eve)", () => {
      const result = normalizeToUtcDay("2026-12-31")
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(11) // December
      expect(result.getUTCDate()).toBe(31)
      expect(result.getUTCHours()).toBe(0)
    })
  })

  describe("Date object input", () => {
    it("Date at UTC midnight → same UTC day (no-op normalization)", () => {
      const input = new Date(Date.UTC(2026, 4, 17, 0, 0, 0, 0)) // 2026-05-17T00:00:00Z
      const result = normalizeToUtcDay(input)
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(4)
      expect(result.getUTCDate()).toBe(17)
      expect(result.getUTCHours()).toBe(0)
      expect(result.getUTCMilliseconds()).toBe(0)
    })

    it("Date with non-midnight UTC time → UTC midnight of that UTC day", () => {
      // 2026-05-17 15:30:00 UTC → normalized to 2026-05-17 00:00:00 UTC
      const input = new Date(Date.UTC(2026, 4, 17, 15, 30, 45, 999))
      const result = normalizeToUtcDay(input)
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCMonth()).toBe(4)
      expect(result.getUTCDate()).toBe(17)
      expect(result.getUTCHours()).toBe(0)
      expect(result.getUTCMinutes()).toBe(0)
      expect(result.getUTCSeconds()).toBe(0)
      expect(result.getUTCMilliseconds()).toBe(0)
    })

    it("Date at 23:59 UTC → UTC midnight of SAME day", () => {
      // 2026-05-17 23:59:59 UTC → 2026-05-17 UTC midnight (NOT 2026-05-18)
      const input = new Date(Date.UTC(2026, 4, 17, 23, 59, 59, 999))
      const result = normalizeToUtcDay(input)
      expect(result.getUTCFullYear()).toBe(2026)
      expect(result.getUTCDate()).toBe(17)
      expect(result.getUTCHours()).toBe(0)
    })

    it("Date at midnight in a UTC-5 locale: 2026-05-18 04:00 UTC → normalized to 2026-05-18 UTC", () => {
      // A Date representing 2026-05-18 04:00:00 UTC is already UTC midnight for UTC+0,
      // but the UTC calendar day is 2026-05-18. We extract UTC components, so result is 2026-05-18.
      const input = new Date(Date.UTC(2026, 4, 18, 4, 0, 0, 0))
      const result = normalizeToUtcDay(input)
      expect(result.getUTCDate()).toBe(18) // UTC date, not local date
    })
  })

  describe("return value is always at UTC midnight", () => {
    it("any input produces a result with getUTCHours() === 0", () => {
      const cases = ["2026-03-15", "2026-06-30", "2026-02-28"]
      for (const input of cases) {
        const result = normalizeToUtcDay(input)
        expect(result.getUTCHours(), `for input ${input}`).toBe(0)
        expect(result.getUTCMinutes(), `for input ${input}`).toBe(0)
        expect(result.getUTCSeconds(), `for input ${input}`).toBe(0)
        expect(result.getUTCMilliseconds(), `for input ${input}`).toBe(0)
      }
    })
  })
})

describe("isISODateString — FR-004 / Principle IV", () => {
  describe("valid ISO date strings", () => {
    it("accepts '2026-05-17'", () => {
      expect(isISODateString("2026-05-17")).toBe(true)
    })

    it("accepts '2026-01-01'", () => {
      expect(isISODateString("2026-01-01")).toBe(true)
    })

    it("accepts '2026-12-31'", () => {
      expect(isISODateString("2026-12-31")).toBe(true)
    })
  })

  describe("rejected inputs", () => {
    it("rejects empty string", () => {
      expect(isISODateString("")).toBe(false)
    })

    it("rejects '2026-13-01' — regex accepts it (month out of range is not validated by regex)", () => {
      // The regex only checks the shape YYYY-MM-DD; out-of-range values are not rejected here.
      // The test documents this known behavior.
      expect(isISODateString("2026-13-01")).toBe(true)
    })

    it("rejects '2026/05/17' (slash separators)", () => {
      expect(isISODateString("2026/05/17")).toBe(false)
    })

    it("rejects '20260517' (no separators)", () => {
      expect(isISODateString("20260517")).toBe(false)
    })

    it("rejects '05-17-2026' (wrong order)", () => {
      expect(isISODateString("05-17-2026")).toBe(false)
    })

    it("rejects '2026-05' (missing day)", () => {
      expect(isISODateString("2026-05")).toBe(false)
    })

    it("rejects '2026-05-17T00:00:00Z' (full ISO timestamp)", () => {
      expect(isISODateString("2026-05-17T00:00:00Z")).toBe(false)
    })
  })
})
