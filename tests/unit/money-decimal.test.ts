import { describe, expect, it } from "vitest"

import { Money, cmp, isNegative, isZero, minus, plus, sumAmounts } from "@/lib/money/decimal"

describe("Money (Prisma.Decimal wrapper) — constitution Principle IV / FR-022 / SC-010", () => {
  describe("round-trip from string with no precision loss", () => {
    it("preserves '1250.00' in value (Decimal.js normalizes trailing zeros)", () => {
      const m = new Money("1250.00")
      // Decimal.js strips trailing zeros on toString(); the value is preserved exactly.
      // Use .toFixed() or equality comparison rather than raw string comparison.
      expect(m.toFixed(2)).toBe("1250.00")
      expect(m.eq(new Money("1250.00"))).toBe(true)
    })

    it("preserves '-500'", () => {
      const m = new Money("-500")
      expect(m.toString()).toBe("-500")
    })

    it("preserves '0'", () => {
      const m = new Money("0")
      expect(m.toString()).toBe("0")
    })

    it("preserves '0.123456789' with full precision (no float drift)", () => {
      const m = new Money("0.123456789")
      expect(m.toString()).toBe("0.123456789")
    })

    it("preserves '-0.0000001' in value (Decimal.js may use scientific notation on toString)", () => {
      const m = new Money("-0.0000001")
      // Value equality: the Decimal holds the exact value regardless of toString form.
      expect(m.eq(new Money("-0.0000001"))).toBe(true)
      expect(m.abs().eq(new Money("0.0000001"))).toBe(true)
    })
  })

  describe("arithmetic identities", () => {
    it("a.plus('0').eq(a) — additive identity", () => {
      const a = new Money("123.45")
      expect(plus(a, new Money("0")).eq(a)).toBe(true)
    })

    it("a.plus(b).eq(b.plus(a)) — commutativity", () => {
      const a = new Money("100")
      const b = new Money("200.50")
      expect(plus(a, b).eq(plus(b, a))).toBe(true)
    })

    it("a.minus(a).isZero() — additive inverse", () => {
      const a = new Money("999.99")
      expect(minus(a, a).isZero()).toBe(true)
    })

    it("plus does not produce float drift for a well-known float trap", () => {
      // 0.1 + 0.2 === 0.3 in Decimal arithmetic (not 0.30000000000000004)
      const result = plus(new Money("0.1"), new Money("0.2"))
      expect(result.toString()).toBe("0.3")
    })
  })

  describe("cmp", () => {
    it("returns -1 when a < b", () => {
      expect(cmp(new Money("1"), new Money("2"))).toBe(-1)
    })

    it("returns 0 when a === b", () => {
      expect(cmp(new Money("5.00"), new Money("5"))).toBe(0)
    })

    it("returns 1 when a > b", () => {
      expect(cmp(new Money("10"), new Money("9.99"))).toBe(1)
    })
  })

  describe("isZero", () => {
    it("returns true for '0'", () => {
      expect(isZero(new Money("0"))).toBe(true)
    })

    it("returns true for '0.00'", () => {
      expect(isZero(new Money("0.00"))).toBe(true)
    })

    it("returns false for '0.01'", () => {
      expect(isZero(new Money("0.01"))).toBe(false)
    })

    it("returns false for '-0.01'", () => {
      expect(isZero(new Money("-0.01"))).toBe(false)
    })
  })

  describe("isNegative", () => {
    it("returns true for '-1'", () => {
      expect(isNegative(new Money("-1"))).toBe(true)
    })

    it("returns true for '-0.01'", () => {
      expect(isNegative(new Money("-0.01"))).toBe(true)
    })

    it("returns false for '0'", () => {
      expect(isNegative(new Money("0"))).toBe(false)
    })

    it("returns false for '1'", () => {
      expect(isNegative(new Money("1"))).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// sumAmounts — FR-028, constitution Principle IV
// ---------------------------------------------------------------------------

describe("sumAmounts — FR-028 / Principle IV", () => {
  it("empty array → new Money(0)", () => {
    const result = sumAmounts([])
    expect(result.isZero()).toBe(true)
    expect(result.toString()).toBe("0")
  })

  it("single amount → that amount unchanged", () => {
    const result = sumAmounts([new Money("123.45")])
    expect(result.eq(new Money("123.45"))).toBe(true)
  })

  it("three positive amounts → correct sum", () => {
    const result = sumAmounts([new Money("100"), new Money("200"), new Money("300")])
    expect(result.eq(new Money("600"))).toBe(true)
  })

  it("mixed signs → correct sum (balance formula)", () => {
    // Simulates: +1000 (income) + -87.43 (expense) + -500 (transfer source) + 500 (transfer dest)
    const result = sumAmounts([
      new Money("1000"),
      new Money("-87.43"),
      new Money("-500"),
      new Money("500"),
    ])
    expect(result.toString()).toBe("912.57")
  })

  it("all negative amounts → negative sum", () => {
    const result = sumAmounts([new Money("-50"), new Money("-30"), new Money("-20")])
    expect(result.eq(new Money("-100"))).toBe(true)
  })

  it("preserves Decimal precision — no float drift", () => {
    // 0.1 + 0.2 + 0.3 would drift to 0.6000000000000001 in float arithmetic
    const result = sumAmounts([new Money("0.1"), new Money("0.2"), new Money("0.3")])
    expect(result.toString()).toBe("0.6")
  })

  it("preserves full precision on many-decimal amounts", () => {
    // 8 decimal places per the NUMERIC(20, 8) storage.
    // Decimal.js may use scientific notation on toString() for very small values (e.g., "3e-8");
    // use value equality via .eq() rather than string comparison (same pattern as money-decimal.test.ts existing tests).
    const result = sumAmounts([new Money("0.00000001"), new Money("0.00000002")])
    expect(result.eq(new Money("0.00000003"))).toBe(true)
  })
})
