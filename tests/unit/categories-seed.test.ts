/**
 * tests/unit/categories-seed.test.ts
 *
 * Locks the seed contents per spec FR-012 and SC-013.
 * Pure unit tests — no DB, no auth, no Prisma.
 */

import { describe, expect, it } from "vitest"

import { DEFAULT_CATEGORIES } from "@/lib/categories/seed"
import { CATEGORY_COLOR_TOKENS } from "@/lib/categories/colors"
import { CATEGORY_ICON_NAMES } from "@/lib/categories/icons"

describe("DEFAULT_CATEGORIES — top-level structure (FR-012)", () => {
  it("has exactly 9 top-level entries (7 EXPENSE + 2 INCOME)", () => {
    expect(DEFAULT_CATEGORIES.length).toBe(9)
  })

  it("has exactly 7 top-level EXPENSE entries", () => {
    const expense = DEFAULT_CATEGORIES.filter((c) => c.kind === "EXPENSE")
    expect(expense.length).toBe(7)
  })

  it("has exactly 2 top-level INCOME entries", () => {
    const income = DEFAULT_CATEGORIES.filter((c) => c.kind === "INCOME")
    expect(income.length).toBe(2)
  })

  it("top-level EXPENSE names match exactly the spec list (any order)", () => {
    const expenseNames = DEFAULT_CATEGORIES.filter((c) => c.kind === "EXPENSE").map((c) => c.name)
    const expected = [
      "Food",
      "Housing",
      "Transport",
      "Utilities",
      "Entertainment",
      "Health",
      "Other Expenses",
    ]
    expect(expenseNames.sort()).toEqual(expected.sort())
  })

  it("top-level INCOME names match exactly the spec list", () => {
    const incomeNames = DEFAULT_CATEGORIES.filter((c) => c.kind === "INCOME").map((c) => c.name)
    const expected = ["Salary", "Other Income"]
    expect(incomeNames.sort()).toEqual(expected.sort())
  })
})

describe("DEFAULT_CATEGORIES — Food children (FR-012)", () => {
  const food = DEFAULT_CATEGORIES.find((c) => c.name === "Food")

  it("Food entry exists", () => {
    expect(food).toBeDefined()
  })

  it("Food is EXPENSE kind", () => {
    expect(food?.kind).toBe("EXPENSE")
  })

  it("Food has exactly 2 children", () => {
    expect(food?.children).toBeDefined()
    expect(food?.children?.length).toBe(2)
  })

  it("Food children are named Groceries and Restaurants", () => {
    const childNames = food?.children?.map((c) => c.name).sort()
    expect(childNames).toEqual(["Groceries", "Restaurants"].sort())
  })
})

describe("DEFAULT_CATEGORIES — no other entry has children", () => {
  it("only Food has children", () => {
    const withChildren = DEFAULT_CATEGORIES.filter(
      (c) => c.name !== "Food" && c.children !== undefined && c.children.length > 0,
    )
    expect(withChildren).toHaveLength(0)
  })
})

describe("DEFAULT_CATEGORIES — allow-list membership (FR-007, FR-008)", () => {
  it("every top-level entry has a color that is a member of CATEGORY_COLOR_TOKENS", () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(
        CATEGORY_COLOR_TOKENS.has(c.color),
        `${c.name} color "${c.color}" is not in the allow-list`,
      ).toBe(true)
    }
  })

  it("every top-level entry has an icon that is a member of CATEGORY_ICON_NAMES", () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(
        CATEGORY_ICON_NAMES.has(c.icon),
        `${c.name} icon "${c.icon}" is not in the allow-list`,
      ).toBe(true)
    }
  })

  it("every child entry has a color that is a member of CATEGORY_COLOR_TOKENS", () => {
    for (const c of DEFAULT_CATEGORIES) {
      for (const child of c.children ?? []) {
        expect(
          CATEGORY_COLOR_TOKENS.has(child.color),
          `${c.name}/${child.name} color "${child.color}" is not in the allow-list`,
        ).toBe(true)
      }
    }
  })

  it("every child entry has an icon that is a member of CATEGORY_ICON_NAMES", () => {
    for (const c of DEFAULT_CATEGORIES) {
      for (const child of c.children ?? []) {
        expect(
          CATEGORY_ICON_NAMES.has(child.icon),
          `${c.name}/${child.name} icon "${child.icon}" is not in the allow-list`,
        ).toBe(true)
      }
    }
  })
})

describe("DEFAULT_CATEGORIES — no empty fields", () => {
  it("every top-level entry has non-empty name, color, icon", () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.color.length).toBeGreaterThan(0)
      expect(c.icon.length).toBeGreaterThan(0)
    }
  })

  it("every child entry has non-empty name, color, icon", () => {
    for (const c of DEFAULT_CATEGORIES) {
      for (const child of c.children ?? []) {
        expect(child.name.length).toBeGreaterThan(0)
        expect(child.color.length).toBeGreaterThan(0)
        expect(child.icon.length).toBeGreaterThan(0)
      }
    }
  })
})
