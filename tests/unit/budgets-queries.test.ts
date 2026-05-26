/**
 * tests/unit/budgets-queries.test.ts
 *
 * Locks the uniqueness pre-check, cross-user-collapses-to-null, and P2002 race-guard
 * semantics per research.md R7 and the spec's edge cases.
 *
 * Strategy: vi.mock("@/lib/prisma") to intercept all Prisma calls without touching
 * the real database. Also mocks lib/categories/queries for the EXPENSE-kind check.
 *
 * Constitution Principle IV.
 */

import { type Mock, beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma, type BudgetPeriod } from "@prisma/client"

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => {
  const budgetMock = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  }

  return {
    default: {
      budget: budgetMock,
    },
  }
})

vi.mock("@/lib/categories/queries", () => ({
  getCategoryForUser: vi.fn(),
}))

// Transactions queries are not directly called by budgets/queries.ts in tests
// (they're called by listBudgetsWithActualsForUser which requires a real DB for the groupBy)
vi.mock("@/lib/transactions/queries", () => ({
  sumExpenseByCategoryForBudgetsForUser: vi.fn().mockResolvedValue([]),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import prisma from "@/lib/prisma"
import { getCategoryForUser } from "@/lib/categories/queries"
import {
  createBudgetForUser,
  getBudgetForUser,
  listBudgetsForUser,
  setArchivedAtForUser,
} from "@/lib/budgets/queries"
import { BudgetExistsError, CategoryWrongKindError } from "@/lib/budgets/errors"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockBudgetPrisma = prisma.budget as unknown as {
  create: Mock
  findFirst: Mock
  findMany: Mock
  updateMany: Mock
}

function fakeBudget(
  overrides: Partial<{ id: string; period: string; archivedAt: Date | null }> = {},
) {
  return {
    id: overrides.id ?? "bud-1",
    userId: "user-1",
    categoryId: "cat-1",
    period: (overrides.period ?? "MONTHLY") as BudgetPeriod,
    amount: new Prisma.Decimal("400"),
    currency: "USD",
    startDate: new Date("2026-05-01"),
    endDate: null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
    category: {
      id: "cat-1",
      userId: "user-1",
      parentId: null,
      name: "Groceries",
      kind: "EXPENSE",
      color: "#000",
      icon: "tag",
      archivedAt: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
  }
}

function fakeCategory(kind: "EXPENSE" | "INCOME" = "EXPENSE") {
  return {
    id: "cat-1",
    userId: "user-1",
    parentId: null,
    name: "Groceries",
    kind,
    color: "#000",
    icon: "tag",
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  }
}

const validCreateInput = {
  categoryId: "cat-1",
  period: "MONTHLY" as BudgetPeriod,
  amount: "400",
  currency: "USD",
  startDate: new Date("2026-05-01"),
  endDate: null,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createBudgetForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) pre-check finds existing → throws BudgetExistsError
  it("(a) pre-check finds existing active budget → throws BudgetExistsError", async () => {
    // findFirst returns an existing active budget (pre-check)
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(fakeBudget()) // pre-check hit

    await expect(createBudgetForUser("user-1", validCreateInput)).rejects.toBeInstanceOf(
      BudgetExistsError,
    )
    // Should NOT proceed to create
    expect(mockBudgetPrisma.create).not.toHaveBeenCalled()
  })

  // (b) pre-check returns null → proceeds to create
  it("(b) pre-check returns null → proceeds to create call", async () => {
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(null) // pre-check: no conflict
    ;(getCategoryForUser as Mock).mockResolvedValueOnce(fakeCategory("EXPENSE"))
    mockBudgetPrisma.create.mockResolvedValueOnce(fakeBudget())

    const result = await createBudgetForUser("user-1", validCreateInput)
    expect(mockBudgetPrisma.create).toHaveBeenCalledOnce()
    expect(result).toBeDefined()
  })

  // (c) P2002 on create → re-throws as BudgetExistsError (race guard)
  it("(c) Prisma P2002 on create → re-throws as BudgetExistsError (race condition guard)", async () => {
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(null) // pre-check passes
    ;(getCategoryForUser as Mock).mockResolvedValueOnce(fakeCategory("EXPENSE"))
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.0.0",
    })
    mockBudgetPrisma.create.mockRejectedValueOnce(p2002)

    await expect(createBudgetForUser("user-1", validCreateInput)).rejects.toBeInstanceOf(
      BudgetExistsError,
    )
  })

  // EXPENSE-only check: INCOME category → throws CategoryWrongKindError
  it("INCOME category → throws CategoryWrongKindError", async () => {
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(null) // pre-check passes
    ;(getCategoryForUser as Mock).mockResolvedValueOnce(fakeCategory("INCOME"))

    await expect(createBudgetForUser("user-1", validCreateInput)).rejects.toBeInstanceOf(
      CategoryWrongKindError,
    )
    expect(mockBudgetPrisma.create).not.toHaveBeenCalled()
  })

  // findExistingActiveBudgetForUser is called with the correct where clause
  it("pre-check calls findFirst with { userId, categoryId, currency, period, archivedAt: null }", async () => {
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(null)
    ;(getCategoryForUser as Mock).mockResolvedValueOnce(fakeCategory("EXPENSE"))
    mockBudgetPrisma.create.mockResolvedValueOnce(fakeBudget())

    await createBudgetForUser("user-1", validCreateInput)

    expect(mockBudgetPrisma.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        categoryId: "cat-1",
        currency: "USD",
        period: "MONTHLY",
        archivedAt: null,
      },
    })
  })
})

describe("getBudgetForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (d) cross-user attempt → returns null (not found)
  it("(d) calls findFirst with { id, userId } — cross-user collapses to null", async () => {
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(null)

    const result = await getBudgetForUser("user-1", "bud-other-user")
    expect(result).toBeNull()
    expect(mockBudgetPrisma.findFirst).toHaveBeenCalledWith({
      where: { id: "bud-other-user", userId: "user-1" },
      include: { category: true },
    })
  })
})

describe("listBudgetsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (f) includeArchived: false → where includes archivedAt: null
  it("(f) includeArchived: false → where clause includes archivedAt: null", async () => {
    mockBudgetPrisma.findMany.mockResolvedValueOnce([])

    await listBudgetsForUser("user-1", { includeArchived: false })

    expect(mockBudgetPrisma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", archivedAt: null },
      }),
    )
  })

  it("includeArchived: true → where clause omits archivedAt filter", async () => {
    mockBudgetPrisma.findMany.mockResolvedValueOnce([])

    await listBudgetsForUser("user-1", { includeArchived: true })

    expect(mockBudgetPrisma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      }),
    )
  })
})

describe("setArchivedAtForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (e) uses updateMany — count=0 on cross-user attempt → returns null
  it("(e) uses updateMany; count=0 (cross-user attempt) → returns null", async () => {
    // For archiving (value = Date), no pre-check getBudget is called
    mockBudgetPrisma.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await setArchivedAtForUser("user-1", "bud-other-user", new Date())
    expect(result).toBeNull()
    expect(mockBudgetPrisma.updateMany).toHaveBeenCalledWith({
      where: { id: "bud-other-user", userId: "user-1" },
      data: { archivedAt: expect.any(Date) },
    })
  })

  it("archive success → calls findFirst to return the updated row", async () => {
    mockBudgetPrisma.updateMany.mockResolvedValueOnce({ count: 1 })
    const archived = fakeBudget({ archivedAt: new Date() })
    mockBudgetPrisma.findFirst.mockResolvedValueOnce(archived)

    const result = await setArchivedAtForUser("user-1", "bud-1", new Date())
    expect(result).toBeDefined()
    expect(result?.archivedAt).not.toBeNull()
  })

  it("unarchive (null) → runs uniqueness pre-check via getBudget + findExisting", async () => {
    // getBudget call in setArchivedAtForUser when value=null
    mockBudgetPrisma.findFirst
      .mockResolvedValueOnce(fakeBudget()) // getBudgetForUser
      .mockResolvedValueOnce(null) // findExistingActiveBudgetForUser: no conflict
      .mockResolvedValueOnce(fakeBudget({ archivedAt: null })) // post-update findFirst

    mockBudgetPrisma.updateMany.mockResolvedValueOnce({ count: 1 })

    const result = await setArchivedAtForUser("user-1", "bud-1", null)
    expect(result).toBeDefined()
    // updateMany should set archivedAt to null
    expect(mockBudgetPrisma.updateMany).toHaveBeenCalledWith({
      where: { id: "bud-1", userId: "user-1" },
      data: { archivedAt: null },
    })
  })
})
