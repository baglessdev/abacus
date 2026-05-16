import { describe, expect, it } from "vitest"

import { Money } from "@/lib/money/decimal"
import { formatAmount } from "@/lib/money/format"

describe("formatAmount — FR-022 / SC-010 / FR-011 (plan.md §Currency display)", () => {
  describe("USD formatting", () => {
    it("formatAmount('1250.00', 'USD') → '$1,250.00'", () => {
      expect(formatAmount("1250.00", "USD")).toBe("$1,250.00")
    })

    it("formatAmount('-500', 'USD') → '-$500.00'", () => {
      expect(formatAmount("-500", "USD")).toBe("-$500.00")
    })

    it("formatAmount('0', 'USD') → '$0.00'", () => {
      expect(formatAmount("0", "USD")).toBe("$0.00")
    })

    it("formats large values with thousands separator", () => {
      expect(formatAmount("1000000.00", "USD")).toBe("$1,000,000.00")
    })

    it("sign is placed correctly (before symbol for USD)", () => {
      const result = formatAmount("-1250.00", "USD")
      // Negative USD amounts: sign precedes the dollar sign
      expect(result).toBe("-$1,250.00")
    })
  })

  describe("EUR formatting", () => {
    it("formatAmount('800', 'EUR') — pads to 2 decimals", () => {
      // Intl.NumberFormat en-US with EUR uses '€' prefix
      const result = formatAmount("800", "EUR")
      expect(result).toContain("800.00")
    })
  })

  describe("JPY formatting (0 decimals)", () => {
    it("formatAmount('0', 'JPY') → '¥0'", () => {
      expect(formatAmount("0", "JPY")).toBe("¥0")
    })

    it("formatAmount('1000', 'JPY') includes thousands separator and no decimal", () => {
      const result = formatAmount("1000", "JPY")
      expect(result).toContain("1,000")
      expect(result).not.toContain(".")
    })
  })

  describe("BHD formatting (3 decimals)", () => {
    it("formatAmount('1.234', 'BHD') outputs 3 decimal places", () => {
      const result = formatAmount("1.234", "BHD")
      expect(result).toMatch(/1\.234/)
    })

    it("formatAmount('0', 'BHD') pads to 3 decimals", () => {
      const result = formatAmount("0", "BHD")
      expect(result).toMatch(/0\.000/)
    })
  })

  describe("Money instance input", () => {
    it("accepts a Money instance and formats correctly", () => {
      const m = new Money("1250.00")
      expect(formatAmount(m, "USD")).toBe("$1,250.00")
    })

    it("accepts a negative Money instance", () => {
      const m = new Money("-500")
      expect(formatAmount(m, "USD")).toBe("-$500.00")
    })
  })

  describe("never rounds", () => {
    it("does not change the decimal representation passed in (USD 2-decimal input stays 2 decimals)", () => {
      // The formatter pads but must not truncate or round stored values
      expect(formatAmount("1.50", "USD")).toBe("$1.50")
    })
  })
})
