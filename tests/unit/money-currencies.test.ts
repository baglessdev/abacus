import { describe, expect, it } from "vitest"

import { CURRENCIES, CURRENCY_CODES, getCurrency, isCurrencyCode } from "@/lib/money/currencies"

describe("CURRENCY_CODES — allow-list membership / FR-022 / SC-010", () => {
  it("contains USD", () => {
    expect(CURRENCY_CODES.has("USD")).toBe(true)
  })

  it("contains EUR", () => {
    expect(CURRENCY_CODES.has("EUR")).toBe(true)
  })

  it("contains JPY", () => {
    expect(CURRENCY_CODES.has("JPY")).toBe(true)
  })

  it("contains BHD", () => {
    expect(CURRENCY_CODES.has("BHD")).toBe(true)
  })

  it("contains GBP", () => {
    expect(CURRENCY_CODES.has("GBP")).toBe(true)
  })

  it("does NOT contain obsolete code DEM (German Mark)", () => {
    expect(CURRENCY_CODES.has("DEM")).toBe(false)
  })

  it("does NOT contain obsolete code FRF (French Franc)", () => {
    expect(CURRENCY_CODES.has("FRF")).toBe(false)
  })

  it("does NOT contain obsolete code XEU (European Currency Unit)", () => {
    expect(CURRENCY_CODES.has("XEU")).toBe(false)
  })

  it("does NOT contain empty string", () => {
    expect(CURRENCY_CODES.has("")).toBe(false)
  })

  it("is case-sensitive: lowercase 'usd' is NOT in the set", () => {
    expect(CURRENCY_CODES.has("usd")).toBe(false)
  })
})

describe("getCurrency — record lookup", () => {
  it("getCurrency('USD') returns the USD record with correct fields", () => {
    const usd = getCurrency("USD")
    expect(usd).toBeDefined()
    expect(usd?.code).toBe("USD")
    expect(usd?.decimals).toBe(2)
    expect(usd?.symbol).toBe("$")
  })

  it("getCurrency('JPY') returns decimals: 0", () => {
    const jpy = getCurrency("JPY")
    expect(jpy?.decimals).toBe(0)
  })

  it("getCurrency('BHD') returns decimals: 3", () => {
    const bhd = getCurrency("BHD")
    expect(bhd?.decimals).toBe(3)
  })

  it("getCurrency('usd') returns undefined — case-sensitive", () => {
    expect(getCurrency("usd")).toBeUndefined()
  })

  it("getCurrency('DEM') returns undefined — obsolete code excluded", () => {
    expect(getCurrency("DEM")).toBeUndefined()
  })

  it("getCurrency('XEU') returns undefined — obsolete code excluded", () => {
    expect(getCurrency("XEU")).toBeUndefined()
  })
})

describe("isCurrencyCode — type guard", () => {
  it("returns true for 'USD'", () => {
    expect(isCurrencyCode("USD")).toBe(true)
  })

  it("returns true for 'EUR'", () => {
    expect(isCurrencyCode("EUR")).toBe(true)
  })

  it("returns false for lowercase 'usd'", () => {
    expect(isCurrencyCode("usd")).toBe(false)
  })

  it("returns false for obsolete 'DEM'", () => {
    expect(isCurrencyCode("DEM")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isCurrencyCode("")).toBe(false)
  })

  it("returns false for a nonsense code", () => {
    expect(isCurrencyCode("ZZZ")).toBe(false)
  })
})

describe("CURRENCIES array shape", () => {
  it("has approximately the right count (between 150 and 200 entries)", () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(150)
    expect(CURRENCIES.length).toBeLessThanOrEqual(200)
  })

  it("every entry has a non-empty code, name, symbol, and valid decimals", () => {
    for (const c of CURRENCIES) {
      expect(c.code.length).toBe(3)
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.symbol.length).toBeGreaterThan(0)
      expect([0, 1, 2, 3, 4]).toContain(c.decimals)
    }
  })

  it("all codes are uppercase", () => {
    for (const c of CURRENCIES) {
      expect(c.code).toBe(c.code.toUpperCase())
    }
  })

  it("no duplicate codes", () => {
    const codes = CURRENCIES.map((c) => c.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })
})
