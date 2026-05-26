/**
 * tests/unit/budgets-serialize.test.ts
 *
 * Unit tests for serializeBudget and serializeBudgetWithActuals.
 * Verifies Decimal → canonical string, Date → ISO string, null handling.
 */

import { describe, it, expect } from "vitest"
import { type Budget, type Category, BudgetPeriod } from "@prisma/client"
import { Money } from "@/lib/money/decimal"
import { serializeBudget, serializeBudgetWithActuals } from "@/lib/budgets/serialize"
import { type BudgetWithActuals } from "@/lib/budgets/aggregations"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseBudget: Budget = {
  id: "bud-abc",
  userId: "user-1",
  categoryId: "cat-xyz",
  period: "MONTHLY" as BudgetPeriod,
  amount: new Money("400.50000000") as Budget["amount"],
  currency: "USD",
  startDate: new Date("2026-05-01T00:00:00.000Z"),
  endDate: null,
  archivedAt: null,
  createdAt: new Date("2026-04-01T12:00:00.000Z"),
  updatedAt: new Date("2026-04-02T12:00:00.000Z"),
}

const baseCategory: Category = {
  id: "cat-xyz",
  userId: "user-1",
  parentId: null,
  name: "Groceries",
  kind: "EXPENSE",
  color: "#00ff00",
  icon: "shopping-cart",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}

// ---------------------------------------------------------------------------
// serializeBudget
// ---------------------------------------------------------------------------

describe("serializeBudget", () => {
  it("converts Decimal amount → canonical string", () => {
    const dto = serializeBudget(baseBudget)
    // Decimal.toString() strips trailing zeros: "400.50000000" → "400.5"
    expect(dto.amount).toBe("400.5")
    expect(typeof dto.amount).toBe("string")
  })

  it("converts startDate → ISO date-only string", () => {
    const dto = serializeBudget(baseBudget)
    expect(dto.startDate).toBe("2026-05-01")
  })

  it("null endDate → null in DTO", () => {
    const dto = serializeBudget(baseBudget)
    expect(dto.endDate).toBeNull()
  })

  it("non-null endDate → ISO date-only string", () => {
    const withEnd = { ...baseBudget, endDate: new Date("2026-12-31T00:00:00.000Z") }
    const dto = serializeBudget(withEnd)
    expect(dto.endDate).toBe("2026-12-31")
  })

  it("null archivedAt → null in DTO", () => {
    const dto = serializeBudget(baseBudget)
    expect(dto.archivedAt).toBeNull()
  })

  it("non-null archivedAt → ISO UTC string", () => {
    const archived = { ...baseBudget, archivedAt: new Date("2026-06-01T09:00:00.000Z") }
    const dto = serializeBudget(archived)
    expect(dto.archivedAt).toBe("2026-06-01T09:00:00.000Z")
  })

  it("copies scalar fields correctly", () => {
    const dto = serializeBudget(baseBudget)
    expect(dto.id).toBe("bud-abc")
    expect(dto.userId).toBe("user-1")
    expect(dto.categoryId).toBe("cat-xyz")
    expect(dto.period).toBe("MONTHLY")
    expect(dto.currency).toBe("USD")
  })
})

// ---------------------------------------------------------------------------
// serializeBudgetWithActuals
// ---------------------------------------------------------------------------

describe("serializeBudgetWithActuals", () => {
  const bwa: BudgetWithActuals = {
    budget: baseBudget,
    category: baseCategory,
    actuals: new Money("150"),
    remaining: new Money("250.50000000"),
    progressRatio: 0.375,
    status: "under",
    periodStart: new Date("2026-05-01T00:00:00.000Z"),
    periodEnd: new Date("2026-06-01T00:00:00.000Z"),
  }

  it("actuals serialized as canonical string", () => {
    const dto = serializeBudgetWithActuals(bwa)
    expect(dto.actuals).toBe("150")
    expect(typeof dto.actuals).toBe("string")
  })

  it("remaining serialized as canonical string", () => {
    const dto = serializeBudgetWithActuals(bwa)
    // Decimal.toString() strips trailing zeros: "250.50000000" → "250.5"
    expect(dto.remaining).toBe("250.5")
  })

  it("progressRatio is a number (float)", () => {
    const dto = serializeBudgetWithActuals(bwa)
    expect(typeof dto.progressRatio).toBe("number")
    expect(dto.progressRatio).toBeCloseTo(0.375, 5)
  })

  it("status field preserved", () => {
    const dto = serializeBudgetWithActuals(bwa)
    expect(dto.status).toBe("under")
  })

  it("periodStart → ISO date-only string", () => {
    const dto = serializeBudgetWithActuals(bwa)
    expect(dto.periodStart).toBe("2026-05-01")
  })

  it("periodEnd → ISO date-only string", () => {
    const dto = serializeBudgetWithActuals(bwa)
    expect(dto.periodEnd).toBe("2026-06-01")
  })

  it("budget field is a BudgetDTO", () => {
    const dto = serializeBudgetWithActuals(bwa)
    // Decimal.toString() strips trailing zeros
    expect(dto.budget.amount).toBe("400.5")
    expect(dto.budget.id).toBe("bud-abc")
  })

  it("category field is a CategoryDTO", () => {
    const dto = serializeBudgetWithActuals(bwa)
    expect(dto.category.name).toBe("Groceries")
    expect(dto.category.kind).toBe("EXPENSE")
  })

  it("negative remaining (over-budget) serialized with minus sign", () => {
    const overBwa: BudgetWithActuals = {
      ...bwa,
      actuals: new Money("450"),
      remaining: new Money("-50"),
      progressRatio: 1.125,
      status: "over",
    }
    const dto = serializeBudgetWithActuals(overBwa)
    expect(dto.remaining).toBe("-50")
    expect(dto.status).toBe("over")
  })
})
