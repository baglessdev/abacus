/**
 * tests/unit/budgets-schemas.test.ts
 *
 * Zod boundary tests for createBudgetSchema and updateBudgetSchema.
 * Constitution Principle IV.
 */

import { describe, it, expect } from "vitest"
import { createBudgetSchema, updateBudgetSchema } from "@/lib/budgets/schemas"

// ---------------------------------------------------------------------------
// createBudgetSchema
// ---------------------------------------------------------------------------

describe("createBudgetSchema", () => {
  const validBase = {
    categoryId: "clxxxxxxxxxxxxxxxxxxxxxxx",
    period: "MONTHLY",
    amount: "400",
    currency: "USD",
    startDate: "2026-05-17",
    endDate: "",
  }

  // (a) valid MONTHLY budget
  it("(a) valid MONTHLY budget → parse succeeds", async () => {
    const result = await createBudgetSchema.safeParseAsync(validBase)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.period).toBe("MONTHLY")
      expect(result.data.currency).toBe("USD")
      expect(result.data.endDate).toBeNull()
    }
  })

  // (b) valid YEARLY budget
  it("(b) valid YEARLY budget → parse succeeds", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      period: "YEARLY",
      startDate: "2026-03-15",
    })
    expect(result.success).toBe(true)
  })

  // (c) negative amount → fails
  it("(c) negative amount → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, amount: "-100" })
    expect(result.success).toBe(false)
  })

  // (d) zero amount → fails
  it("(d) zero amount → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, amount: "0" })
    expect(result.success).toBe(false)
  })

  // (e) too many decimal places → fails
  it("(e) too many decimals (>8) → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      amount: "100.123456789",
    })
    expect(result.success).toBe(false)
  })

  // (f) invalid currency code → fails
  it("(f) invalid currency code 'USA' → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, currency: "USA" })
    expect(result.success).toBe(false)
  })

  it("(f2) lowercase currency 'us' → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, currency: "us" })
    expect(result.success).toBe(false)
  })

  // (g) non-ISO startDate → fails
  it("(g) non-ISO startDate → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      startDate: "May 17, 2026",
    })
    expect(result.success).toBe(false)
  })

  // (h) MONTHLY startDate normalization: 2026-05-17 → 2026-05-01 UTC midnight
  it("(h) MONTHLY startDate normalization: 2026-05-17 → 2026-05-01T00:00:00Z", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      startDate: "2026-05-17",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startDate.toISOString()).toBe("2026-05-01T00:00:00.000Z")
    }
  })

  // (i) YEARLY startDate normalization: 2026-05-17 → 2026-01-01 UTC midnight
  it("(i) YEARLY startDate normalization: 2026-05-17 → 2026-01-01T00:00:00Z", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      period: "YEARLY",
      startDate: "2026-05-17",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startDate.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    }
  })

  // (j) endDate < startDate → fails
  it("(j) endDate < startDate → validation_failed", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      startDate: "2026-05-01",
      endDate: "2026-04-01",
    })
    expect(result.success).toBe(false)
  })

  // (k) endDate omitted (empty string) → null
  it("(k) endDate omitted → null (open-ended budget)", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, endDate: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.endDate).toBeNull()
    }
  })

  // endDate ≥ startDate → succeeds
  it("valid endDate ≥ startDate → succeeds", async () => {
    const result = await createBudgetSchema.safeParseAsync({
      ...validBase,
      startDate: "2026-05-01",
      endDate: "2026-12-31",
    })
    expect(result.success).toBe(true)
  })

  // currency is normalized to uppercase
  it("currency input 'usd' is normalized to 'USD'", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, currency: "usd" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currency).toBe("USD")
    }
  })

  // amount with exactly 8 decimal places → succeeds
  it("amount with exactly 8 decimal places → succeeds", async () => {
    const result = await createBudgetSchema.safeParseAsync({ ...validBase, amount: "0.00000001" })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// updateBudgetSchema
// ---------------------------------------------------------------------------

describe("updateBudgetSchema", () => {
  const validBase = {
    id: "clyyyyyyyyyyyyyyyyyyyyyyy",
    amount: "500",
    startDate: "2026-05-01",
    endDate: "",
  }

  // (l) only id + amount → succeeds
  it("(l) id + amount + startDate → succeeds", async () => {
    const result = await updateBudgetSchema.safeParseAsync(validBase)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe("clyyyyyyyyyyyyyyyyyyyyyyy")
      expect(result.data.amount).toBe("500")
    }
  })

  // (m) categoryId field — updateBudgetSchema does NOT include it; extra fields are stripped
  it("(m) categoryId in input is stripped (not in updateBudgetSchema)", async () => {
    const result = await updateBudgetSchema.safeParseAsync({
      ...validBase,
      categoryId: "some-cat-id",
    })
    // Safe parse should succeed; categoryId not present in output
    expect(result.success).toBe(true)
    if (result.success) {
      // TypeScript type assertion: categoryId should not be a key
      expect(Object.keys(result.data)).not.toContain("categoryId")
    }
  })

  // (n) currency and period stripped
  it("(n) currency and period in input are stripped", async () => {
    const result = await updateBudgetSchema.safeParseAsync({
      ...validBase,
      currency: "EUR",
      period: "YEARLY",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain("currency")
      expect(Object.keys(result.data)).not.toContain("period")
    }
  })

  it("negative amount → fails", async () => {
    const result = await updateBudgetSchema.safeParseAsync({ ...validBase, amount: "-50" })
    expect(result.success).toBe(false)
  })

  it("missing id → fails", async () => {
    const noId = {
      amount: validBase.amount,
      startDate: validBase.startDate,
      endDate: validBase.endDate,
    }
    const result = await updateBudgetSchema.safeParseAsync(noId)
    expect(result.success).toBe(false)
  })
})
