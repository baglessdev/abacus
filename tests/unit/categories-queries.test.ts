/**
 * tests/unit/categories-queries.test.ts
 *
 * Locks the parent-validation + kind-change-blocked + sort rules per FR-005/006/009/019.
 * Uses vi.mock("@/lib/prisma") to stub Prisma calls — no real DB connection.
 * SC-013: mandatory new unit tests for category invariants.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"

import { HierarchyViolationError, KindChangeBlockedError } from "@/lib/categories/errors"

// ---- Prisma mock setup ----
// We mock the default export of @/lib/prisma so that all queries.ts helpers
// use the mock instead of a real PrismaClient.

vi.mock("@/lib/prisma", () => {
  const mockCategory = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  }
  return {
    default: { category: mockCategory },
    prisma: { category: mockCategory },
  }
})

// Import AFTER mock is registered
import prisma from "@/lib/prisma"
import {
  listCategoriesForUser,
  createCategoryForUser,
  updateCategoryForUser,
} from "@/lib/categories/queries"

// Helper to access the mocked prisma.category
// Cast through unknown because the vi.mock replaces the real delegate with a plain mock object.
const mockCat = prisma.category as unknown as {
  findMany: ReturnType<typeof vi.fn>
  findFirst: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  updateMany: ReturnType<typeof vi.fn>
}

/** A minimal Category row fixture */
function makeCategory(
  overrides: Partial<{
    id: string
    userId: string
    parentId: string | null
    name: string
    kind: "INCOME" | "EXPENSE"
    color: string
    icon: string
    archivedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return {
    id: "cat-1",
    userId: "user-1",
    parentId: null,
    name: "Food",
    kind: "EXPENSE" as const,
    color: "red",
    icon: "Utensils",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// listCategoriesForUser
// ---------------------------------------------------------------------------

describe("listCategoriesForUser — sort order (FR-019)", () => {
  it("passes orderBy: { name: 'asc' } to Prisma", async () => {
    mockCat.findMany.mockResolvedValueOnce([])

    await listCategoriesForUser("user-1", { includeArchived: false })

    expect(mockCat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } }),
    )
  })

  it("filters by userId and archivedAt: null when includeArchived is false", async () => {
    mockCat.findMany.mockResolvedValueOnce([])

    await listCategoriesForUser("user-1", { includeArchived: false })

    expect(mockCat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", archivedAt: null } }),
    )
  })

  it("filters by userId only when includeArchived is true", async () => {
    mockCat.findMany.mockResolvedValueOnce([])

    await listCategoriesForUser("user-1", { includeArchived: true })

    expect(mockCat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    )
  })
})

// ---------------------------------------------------------------------------
// createCategoryForUser — no parent
// ---------------------------------------------------------------------------

describe("createCategoryForUser — top-level (no parentId)", () => {
  it("creates successfully without parent validation when parentId is undefined", async () => {
    const created = makeCategory()
    mockCat.create.mockResolvedValueOnce(created)

    const result = await createCategoryForUser("user-1", {
      name: "Food",
      kind: "EXPENSE",
      color: "red",
      icon: "Utensils",
      parentId: undefined,
    })

    expect(result).toEqual(created)
    // findFirst should NOT have been called for parent validation
    expect(mockCat.findFirst).not.toHaveBeenCalled()
  })

  it("creates successfully when parentId is null", async () => {
    const created = makeCategory()
    mockCat.create.mockResolvedValueOnce(created)

    const result = await createCategoryForUser("user-1", {
      name: "Food",
      kind: "EXPENSE",
      color: "red",
      icon: "Utensils",
      parentId: null,
    })

    expect(result).toEqual(created)
    expect(mockCat.findFirst).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// createCategoryForUser — parent validation
// ---------------------------------------------------------------------------

describe("createCategoryForUser — parent validation (FR-006, FR-009)", () => {
  it("throws HierarchyViolationError when parent does not exist", async () => {
    // getCategoryForUser returns null (parent not found)
    mockCat.findFirst.mockResolvedValueOnce(null)

    await expect(
      createCategoryForUser("user-1", {
        name: "Groceries",
        kind: "EXPENSE",
        color: "blue",
        icon: "ShoppingBag",
        parentId: "nonexistent-parent-id",
      }),
    ).rejects.toThrow(HierarchyViolationError)
  })

  it("throws HierarchyViolationError when parent.parentId !== null (would-be-grandchild, FR-006)", async () => {
    // Parent is itself a child (parentId !== null)
    const child = makeCategory({ id: "parent-id", parentId: "grandparent-id" })
    mockCat.findFirst.mockResolvedValueOnce(child)

    await expect(
      createCategoryForUser("user-1", {
        name: "Great-grandchild",
        kind: "EXPENSE",
        color: "blue",
        icon: "ShoppingBag",
        parentId: "parent-id",
      }),
    ).rejects.toThrow(HierarchyViolationError)
  })

  it("throws HierarchyViolationError when parent.kind !== input.kind (kind mismatch, FR-009)", async () => {
    // Parent is INCOME but child is EXPENSE
    const incomeParent = makeCategory({ id: "income-cat", parentId: null, kind: "INCOME" })
    mockCat.findFirst.mockResolvedValueOnce(incomeParent)

    await expect(
      createCategoryForUser("user-1", {
        name: "Groceries",
        kind: "EXPENSE",
        color: "blue",
        icon: "ShoppingBag",
        parentId: "income-cat",
      }),
    ).rejects.toThrow(HierarchyViolationError)
  })

  it("creates successfully when parent is valid top-level with matching kind", async () => {
    const parent = makeCategory({ id: "food-id", parentId: null, kind: "EXPENSE" })
    const created = makeCategory({ id: "groceries-id", parentId: "food-id" })
    // First findFirst call = getCategoryForUser for parent
    mockCat.findFirst.mockResolvedValueOnce(parent)
    mockCat.create.mockResolvedValueOnce(created)

    const result = await createCategoryForUser("user-1", {
      name: "Groceries",
      kind: "EXPENSE",
      color: "blue",
      icon: "ShoppingBag",
      parentId: "food-id",
    })

    expect(result).toEqual(created)
  })
})

// ---------------------------------------------------------------------------
// updateCategoryForUser — self-parent (FR-006)
// ---------------------------------------------------------------------------

describe("updateCategoryForUser — self-parent rule (FR-006)", () => {
  it("throws HierarchyViolationError when parentId === categoryId", async () => {
    // existing row fetch
    mockCat.findFirst.mockResolvedValueOnce(makeCategory({ id: "cat-1" }))

    await expect(
      updateCategoryForUser("user-1", "cat-1", {
        parentId: "cat-1", // self-parent
      }),
    ).rejects.toThrow(HierarchyViolationError)
  })
})

// ---------------------------------------------------------------------------
// updateCategoryForUser — kind-change-blocked (FR-005)
// ---------------------------------------------------------------------------

describe("updateCategoryForUser — kind-change-blocked rule (FR-005)", () => {
  it("throws KindChangeBlockedError when changing kind on a category with children", async () => {
    // existing row has kind EXPENSE
    const existing = makeCategory({ id: "cat-1", kind: "EXPENSE" })
    mockCat.findFirst.mockResolvedValueOnce(existing)
    // hasChildrenForUser returns true (count > 0)
    mockCat.count.mockResolvedValueOnce(2)

    await expect(
      updateCategoryForUser("user-1", "cat-1", {
        kind: "INCOME", // changing kind
      }),
    ).rejects.toThrow(KindChangeBlockedError)
  })

  it("succeeds when changing kind on a category with NO children", async () => {
    const existing = makeCategory({ id: "cat-1", kind: "EXPENSE" })
    const updated = makeCategory({ id: "cat-1", kind: "INCOME" })

    // existing row fetch
    mockCat.findFirst.mockResolvedValueOnce(existing)
    // hasChildrenForUser returns false (count === 0)
    mockCat.count.mockResolvedValueOnce(0)
    // updateMany succeeds
    mockCat.updateMany.mockResolvedValueOnce({ count: 1 })
    // findFirst after update returns the updated row
    mockCat.findFirst.mockResolvedValueOnce(updated)

    const result = await updateCategoryForUser("user-1", "cat-1", {
      kind: "INCOME",
    })

    expect(result).toEqual(updated)
    expect(mockCat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cat-1", userId: "user-1" } }),
    )
  })
})

// ---------------------------------------------------------------------------
// updateCategoryForUser — returns null for non-existent category
// ---------------------------------------------------------------------------

describe("updateCategoryForUser — cross-user / not-found collapse (FR-013)", () => {
  it("returns null when the category does not belong to the user", async () => {
    // existing row fetch returns null (wrong userId or non-existent)
    mockCat.findFirst.mockResolvedValueOnce(null)

    const result = await updateCategoryForUser("user-1", "cat-from-other-user", {
      name: "Tampered",
    })

    expect(result).toBeNull()
  })
})
