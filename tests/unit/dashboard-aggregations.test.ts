/**
 * tests/unit/dashboard-aggregations.test.ts
 *
 * Unit tests for computeNetWorthByCurrency and buildCashFlowShape.
 * Constitution Principle IV: test the money paths.
 */

import { describe, it, expect } from "vitest"
import { Money } from "@/lib/money/decimal"
import { computeNetWorthByCurrency, buildCashFlowShape } from "@/lib/dashboard/aggregations"
import { type AccountDTO } from "@/lib/accounts/serialize"
import { type CashFlowAggregateRow } from "@/lib/transactions/queries"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAccount(
  overrides: Partial<AccountDTO> & { currency: string; balance: string },
): AccountDTO {
  return {
    id: "acc-" + Math.random().toString(36).slice(2),
    userId: "user-1",
    name: "Test Account",
    type: "CHECKING",
    startingBalance: overrides.balance,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeRow(
  currency: string,
  type: "INCOME" | "EXPENSE",
  amount: string,
): CashFlowAggregateRow {
  return {
    currency,
    type,
    _sum: { amount: new Money(amount) },
  }
}

// ---------------------------------------------------------------------------
// computeNetWorthByCurrency
// ---------------------------------------------------------------------------

describe("computeNetWorthByCurrency", () => {
  it("(a) empty input returns empty array", () => {
    expect(computeNetWorthByCurrency([])).toEqual([])
  })

  it("(b) single account, single currency returns one row with correct total", () => {
    const accounts = [makeAccount({ currency: "USD", balance: "1250.00" })]
    const result = computeNetWorthByCurrency(accounts)
    expect(result).toHaveLength(1)
    expect(result[0]!.currency).toBe("USD")
    // Money.toString() strips trailing zeros: "1250.00" → "1250"
    expect(new Money(result[0]!.total).equals(new Money("1250.00"))).toBe(true)
    expect(result[0]!.total).toBe("1250")
  })

  it("(c) three accounts two currencies: USD first (largest absolute total), EUR second", () => {
    const accounts = [
      makeAccount({ currency: "USD", balance: "2500.00" }),
      makeAccount({ currency: "USD", balance: "1750.00" }),
      makeAccount({ currency: "EUR", balance: "1180.00" }),
    ]
    const result = computeNetWorthByCurrency(accounts)
    expect(result).toHaveLength(2)
    expect(result[0]!.currency).toBe("USD")
    // 2500 + 1750 = 4250
    expect(new Money(result[0]!.total).equals(new Money("4250"))).toBe(true)
    expect(result[1]!.currency).toBe("EUR")
    expect(new Money(result[1]!.total).equals(new Money("1180"))).toBe(true)
  })

  it("(d) negative balance in one currency: row shows negative value, sort still works", () => {
    const accounts = [
      makeAccount({ currency: "USD", balance: "500.00" }),
      makeAccount({ currency: "USD", balance: "-1500.00" }),
      makeAccount({ currency: "EUR", balance: "1180.00" }),
    ]
    const result = computeNetWorthByCurrency(accounts)
    expect(result).toHaveLength(2)
    // USD sum = 500 - 1500 = -1000, absolute = 1000
    // EUR = 1180, absolute = 1180 → EUR first
    expect(result[0]!.currency).toBe("EUR")
    expect(new Money(result[0]!.total).equals(new Money("1180"))).toBe(true)
    expect(result[1]!.currency).toBe("USD")
    expect(new Money(result[1]!.total).equals(new Money("-1000"))).toBe(true)
  })

  it("(e) mixed signs within one currency sum correctly without float drift", () => {
    // 0.1 + 0.2 = 0.3 exactly (Decimal arithmetic, no float drift)
    const accounts = [
      makeAccount({ currency: "USD", balance: "0.1" }),
      makeAccount({ currency: "USD", balance: "0.2" }),
    ]
    const result = computeNetWorthByCurrency(accounts)
    expect(result).toHaveLength(1)
    expect(result[0]!.total).toBe("0.3")
  })

  it("(f) tie-break: two currencies with equal absolute totals → ISO 4217 alphabetical ascending", () => {
    const accounts = [
      makeAccount({ currency: "USD", balance: "1000.00" }),
      makeAccount({ currency: "EUR", balance: "1000.00" }),
    ]
    const result = computeNetWorthByCurrency(accounts)
    expect(result).toHaveLength(2)
    // EUR < USD alphabetically, so EUR first
    expect(result[0]!.currency).toBe("EUR")
    expect(result[1]!.currency).toBe("USD")
  })

  it("(g) zero-balance currency: row renders with total === '0', not filtered out", () => {
    const accounts = [
      makeAccount({ currency: "USD", balance: "1000.00" }),
      makeAccount({ currency: "EUR", balance: "0" }),
    ]
    const result = computeNetWorthByCurrency(accounts)
    expect(result).toHaveLength(2)
    const eurRow = result.find((r) => r.currency === "EUR")
    expect(eurRow).toBeDefined()
    expect(eurRow!.total).toBe("0")
  })
})

// ---------------------------------------------------------------------------
// buildCashFlowShape
// ---------------------------------------------------------------------------

describe("buildCashFlowShape", () => {
  it("(h) empty rows returns empty array", () => {
    expect(buildCashFlowShape([])).toEqual([])
  })

  it("(i) single currency INCOME only", () => {
    const rows = [makeRow("USD", "INCOME", "5000.00")]
    const result = buildCashFlowShape(rows)
    expect(result).toHaveLength(1)
    expect(result[0]!.currency).toBe("USD")
    // Money.toString() strips trailing zeros; verify via numeric equality
    expect(new Money(result[0]!.income).equals(new Money("5000"))).toBe(true)
    expect(new Money(result[0]!.expense).equals(new Money("0"))).toBe(true)
    expect(new Money(result[0]!.net).equals(new Money("5000"))).toBe(true)
  })

  it("(j) single currency EXPENSE only", () => {
    const rows = [makeRow("USD", "EXPENSE", "-1200.00")]
    const result = buildCashFlowShape(rows)
    expect(result).toHaveLength(1)
    expect(result[0]!.currency).toBe("USD")
    expect(new Money(result[0]!.income).equals(new Money("0"))).toBe(true)
    expect(new Money(result[0]!.expense).equals(new Money("-1200"))).toBe(true)
    expect(new Money(result[0]!.net).equals(new Money("-1200"))).toBe(true)
  })

  it("(k) single currency both INCOME and EXPENSE", () => {
    const rows = [makeRow("USD", "INCOME", "5000.00"), makeRow("USD", "EXPENSE", "-1200.00")]
    const result = buildCashFlowShape(rows)
    expect(result).toHaveLength(1)
    expect(new Money(result[0]!.income).equals(new Money("5000"))).toBe(true)
    expect(new Money(result[0]!.expense).equals(new Money("-1200"))).toBe(true)
    expect(new Money(result[0]!.net).equals(new Money("3800"))).toBe(true)
  })

  it("(l) multi-currency: USD + EUR each with both → sorted by descending absolute net", () => {
    const rows = [
      makeRow("USD", "INCOME", "5000.00"),
      makeRow("USD", "EXPENSE", "-1200.00"), // net = 3800
      makeRow("EUR", "INCOME", "400.00"),
      makeRow("EUR", "EXPENSE", "-80.00"), // net = 320
    ]
    const result = buildCashFlowShape(rows)
    expect(result).toHaveLength(2)
    // USD net absolute (3800) > EUR net absolute (320) → USD first
    expect(result[0]!.currency).toBe("USD")
    expect(new Money(result[0]!.income).equals(new Money("5000"))).toBe(true)
    expect(new Money(result[0]!.expense).equals(new Money("-1200"))).toBe(true)
    expect(new Money(result[0]!.net).equals(new Money("3800"))).toBe(true)
    expect(result[1]!.currency).toBe("EUR")
    expect(new Money(result[1]!.income).equals(new Money("400"))).toBe(true)
    expect(new Money(result[1]!.expense).equals(new Money("-80"))).toBe(true)
    expect(new Money(result[1]!.net).equals(new Money("320"))).toBe(true)
  })

  it("(m) all-zero row: renders with all zeros, not filtered out", () => {
    const rows = [makeRow("USD", "INCOME", "0"), makeRow("USD", "EXPENSE", "0")]
    const result = buildCashFlowShape(rows)
    expect(result).toHaveLength(1)
    expect(result[0]!.income).toBe("0")
    expect(result[0]!.expense).toBe("0")
    expect(result[0]!.net).toBe("0")
  })
})
