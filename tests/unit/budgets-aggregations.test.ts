/**
 * tests/unit/budgets-aggregations.test.ts
 *
 * SC-009: 8+ cases covering attachActualsToBudgets, computeStatus, sortBudgetsByStatusAndProgress.
 * Constitution Principle IV: test the money paths.
 *
 * Critical test: computeStatus(new Money("32.00"), new Money("40.00")) MUST return "near"
 * (32/40 = 0.80 exactly — the boundary case; float arithmetic may be fragile here).
 */

import { describe, it, expect } from "vitest"
import { type Budget, type Category, BudgetPeriod } from "@prisma/client"

import { Money } from "@/lib/money/decimal"
import {
  computeStatus,
  attachActualsToBudgets,
  sortBudgetsByStatusAndProgress,
  type BudgetWithActuals,
} from "@/lib/budgets/aggregations"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const MONTHLY_WINDOW = {
  dateFrom: new Date("2026-05-01T00:00:00.000Z"),
  dateTo: new Date("2026-06-01T00:00:00.000Z"),
}
const YEARLY_WINDOW = {
  dateFrom: new Date("2026-01-01T00:00:00.000Z"),
  dateTo: new Date("2027-01-01T00:00:00.000Z"),
}
const PERIOD_WINDOWS = { MONTHLY: MONTHLY_WINDOW, YEARLY: YEARLY_WINDOW }

function makeBudget(overrides: Partial<Budget> & { id: string; categoryId: string }): Budget {
  return {
    userId: "user-1",
    period: "MONTHLY" as BudgetPeriod,
    amount: new Money("400"),
    currency: "USD",
    startDate: new Date("2026-05-01"),
    endDate: null,
    archivedAt: null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
    ...overrides,
  } as Budget
}

function makeCategory(id: string, name: string): Category {
  return {
    id,
    userId: "user-1",
    parentId: null,
    name,
    kind: "EXPENSE",
    color: "#000000",
    icon: "tag",
    archivedAt: null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
  } as Category
}

// ---------------------------------------------------------------------------
// computeStatus
// ---------------------------------------------------------------------------

describe("computeStatus", () => {
  // (b) under-budget: $150 vs $400 → 37.5%
  it("(b) actuals < 80% of amount → 'under'", () => {
    expect(computeStatus(new Money("150"), new Money("400"))).toBe("under")
  })

  // (c) near-budget at exactly 80% boundary: $320 vs $400
  it("(c) actuals == 80% of amount → 'near' (80% boundary is inclusive)", () => {
    expect(computeStatus(new Money("320"), new Money("400"))).toBe("near")
  })

  // CRITICAL: Decimal-precision test — 32/40 = 0.80 exactly. Float fragility check.
  it("CRITICAL: computeStatus(32, 40) → 'near' (32/40 = 0.80 exactly; Decimal-precision)", () => {
    expect(computeStatus(new Money("32.00"), new Money("40.00"))).toBe("near")
  })

  // (d) near-budget at 90%: $360 vs $400
  it("(d) actuals at 90% → 'near'", () => {
    expect(computeStatus(new Money("360"), new Money("400"))).toBe("near")
  })

  // (e) near-budget at 100% exactly: $400 vs $400 (100% inclusive of near per spec)
  it("(e) actuals == amount (100%) → 'near' (boundary inclusive per spec Clarification Q1)", () => {
    expect(computeStatus(new Money("400"), new Money("400"))).toBe("near")
  })

  // (f) over-budget at 100.01%: $400.01 vs $400
  it("(f) actuals > amount (100.01%) → 'over'", () => {
    expect(computeStatus(new Money("400.01"), new Money("400"))).toBe("over")
  })

  // (g) over-budget at 112.5%: $450 vs $400
  it("(g) actuals at 112.5% → 'over'", () => {
    expect(computeStatus(new Money("450"), new Money("400"))).toBe("over")
  })

  // (j) zero actuals → 'under'
  it("(j) zero actuals → 'under'", () => {
    expect(computeStatus(new Money("0"), new Money("400"))).toBe("under")
  })

  // Defensive: zero amount → 'under' (FR-005 prevents zero at Zod boundary)
  it("defensive: zero amount → 'under' (guarded at Zod boundary)", () => {
    expect(computeStatus(new Money("0"), new Money("0"))).toBe("under")
  })
})

// ---------------------------------------------------------------------------
// attachActualsToBudgets
// ---------------------------------------------------------------------------

describe("attachActualsToBudgets", () => {
  // (a) empty budgets
  it("(a) empty budgets → empty result", () => {
    const result = attachActualsToBudgets([], new Map(), PERIOD_WINDOWS)
    expect(result).toHaveLength(0)
  })

  // (b) single MONTHLY budget, under-budget ($150 actuals vs $400)
  it("(b) single MONTHLY under-budget → status 'under', correct actuals/remaining/ratio", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const budgetWithCat = { ...budget, category: cat }
    const sumMap = new Map([["MONTHLY::cat-1::USD", new Money("150")]])

    const [result] = attachActualsToBudgets([budgetWithCat], sumMap, PERIOD_WINDOWS)!

    expect(result!.actuals.toString()).toBe("150")
    expect(result!.remaining.toString()).toBe("250")
    expect(result!.status).toBe("under")
    expect(result!.progressRatio).toBeCloseTo(0.375, 5)
    expect(result!.periodStart.toISOString()).toBe(MONTHLY_WINDOW.dateFrom.toISOString())
    expect(result!.periodEnd.toISOString()).toBe(MONTHLY_WINDOW.dateTo.toISOString())
  })

  // (c) near at 80%: $320 vs $400
  it("(c) actuals at 80% → status 'near'", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const sumMap = new Map([["MONTHLY::cat-1::USD", new Money("320")]])
    const [result] = attachActualsToBudgets([{ ...budget, category: cat }], sumMap, PERIOD_WINDOWS)!
    expect(result!.status).toBe("near")
    expect(result!.actuals.toString()).toBe("320")
  })

  // (d) near at 90%: $360 vs $400
  it("(d) actuals at 90% → status 'near'", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const sumMap = new Map([["MONTHLY::cat-1::USD", new Money("360")]])
    const [result] = attachActualsToBudgets([{ ...budget, category: cat }], sumMap, PERIOD_WINDOWS)!
    expect(result!.status).toBe("near")
  })

  // (e) near at 100% exactly
  it("(e) actuals == amount (100%) → status 'near' (inclusive boundary)", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const sumMap = new Map([["MONTHLY::cat-1::USD", new Money("400")]])
    const [result] = attachActualsToBudgets([{ ...budget, category: cat }], sumMap, PERIOD_WINDOWS)!
    expect(result!.status).toBe("near")
    expect(result!.remaining.toString()).toBe("0")
  })

  // (f) over at 100.01%
  it("(f) actuals > amount → status 'over', remaining is negative", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const sumMap = new Map([["MONTHLY::cat-1::USD", new Money("400.01")]])
    const [result] = attachActualsToBudgets([{ ...budget, category: cat }], sumMap, PERIOD_WINDOWS)!
    expect(result!.status).toBe("over")
    // remaining = 400 - 400.01 = -0.01
    expect(parseFloat(result!.remaining.toString())).toBeCloseTo(-0.01, 8)
  })

  // (g) over at 112.5%: $450 vs $400
  it("(g) actuals at 112.5% → status 'over'", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const sumMap = new Map([["MONTHLY::cat-1::USD", new Money("450")]])
    const [result] = attachActualsToBudgets([{ ...budget, category: cat }], sumMap, PERIOD_WINDOWS)!
    expect(result!.status).toBe("over")
  })

  // (h) multi-currency: USD-Groceries $150 + EUR-Groceries €80 → two rows, separate
  it("(h) multi-currency budgets are isolated — no cross-currency mixing (FR-019)", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const usdBudget = makeBudget({
      id: "bud-usd",
      categoryId: "cat-1",
      currency: "USD",
      amount: new Money("400") as Budget["amount"],
    })
    const eurBudget = makeBudget({
      id: "bud-eur",
      categoryId: "cat-1",
      currency: "EUR",
      amount: new Money("100") as Budget["amount"],
    })
    const sumMap = new Map([
      ["MONTHLY::cat-1::USD", new Money("150")],
      ["MONTHLY::cat-1::EUR", new Money("80")],
    ])
    const results = attachActualsToBudgets(
      [
        { ...usdBudget, category: cat },
        { ...eurBudget, category: cat },
      ],
      sumMap,
      PERIOD_WINDOWS,
    )
    expect(results).toHaveLength(2)
    const usdResult = results.find((r) => r.budget.currency === "USD")!
    const eurResult = results.find((r) => r.budget.currency === "EUR")!
    expect(usdResult.actuals.toString()).toBe("150")
    expect(eurResult.actuals.toString()).toBe("80")
  })

  // (i) zero actuals (missing from map) → default to Money(0)
  it("(i) missing from sumMap → actuals = Money(0), status = 'under'", () => {
    const cat = makeCategory("cat-1", "Groceries")
    const budget = makeBudget({ id: "bud-1", categoryId: "cat-1", currency: "USD" })
    const sumMap = new Map<string, Money>() // empty — no transactions
    const [result] = attachActualsToBudgets([{ ...budget, category: cat }], sumMap, PERIOD_WINDOWS)!
    expect(result!.actuals.toString()).toBe("0")
    expect(result!.status).toBe("under")
    expect(result!.remaining.toString()).toBe("400")
  })
})

// ---------------------------------------------------------------------------
// sortBudgetsByStatusAndProgress
// ---------------------------------------------------------------------------

describe("sortBudgetsByStatusAndProgress", () => {
  function makeBWA(
    id: string,
    status: "under" | "near" | "over",
    progressRatio: number,
    categoryName: string,
  ): BudgetWithActuals {
    const amount = new Money("100")
    const actuals = new Money(String(progressRatio * 100))
    return {
      budget: makeBudget({
        id,
        categoryId: `cat-${id}`,
        currency: "USD",
        amount: amount as Budget["amount"],
      }),
      category: makeCategory(`cat-${id}`, categoryName),
      actuals,
      remaining: amount.minus(actuals),
      progressRatio,
      status,
      periodStart: MONTHLY_WINDOW.dateFrom,
      periodEnd: MONTHLY_WINDOW.dateTo,
    }
  }

  // (k) sort by status: over → near → under
  it("(k) sort by status priority: over → near → under", () => {
    const input = [
      makeBWA("1", "under", 0.3, "Groceries"),
      makeBWA("2", "over", 1.1, "Health"),
      makeBWA("3", "near", 0.85, "Restaurants"),
    ]
    const sorted = sortBudgetsByStatusAndProgress(input)
    expect(sorted[0]!.status).toBe("over")
    expect(sorted[1]!.status).toBe("near")
    expect(sorted[2]!.status).toBe("under")
  })

  // (l) tie-break by progressRatio desc within status
  it("(l) within same status: higher progressRatio first", () => {
    const input = [makeBWA("1", "over", 1.05, "Groceries"), makeBWA("2", "over", 1.15, "Health")]
    const sorted = sortBudgetsByStatusAndProgress(input)
    expect(sorted[0]!.budget.id).toBe("2") // 1.15 > 1.05
    expect(sorted[1]!.budget.id).toBe("1")
  })

  // (m) tie-break by category.name asc within identical progressRatio
  it("(m) within same status and progressRatio: category.name asc (alphabetical)", () => {
    const input = [
      makeBWA("1", "under", 0.5, "Restaurants"),
      makeBWA("2", "under", 0.5, "Groceries"),
    ]
    const sorted = sortBudgetsByStatusAndProgress(input)
    expect(sorted[0]!.category.name).toBe("Groceries")
    expect(sorted[1]!.category.name).toBe("Restaurants")
  })

  it("does NOT mutate the input array", () => {
    const input = [makeBWA("1", "under", 0.3, "Groceries"), makeBWA("2", "over", 1.1, "Health")]
    const originalOrder = input.map((b) => b.budget.id)
    sortBudgetsByStatusAndProgress(input)
    expect(input.map((b) => b.budget.id)).toEqual(originalOrder)
  })
})
