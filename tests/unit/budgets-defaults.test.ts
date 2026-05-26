/**
 * tests/unit/budgets-defaults.test.ts
 *
 * Unit tests for computeDefaultCurrencyForBudget.
 * Covers the three cascading paths from research.md R4 / Clarification Q2.
 * Constitution Principle IV.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any imports that reference these modules
// ---------------------------------------------------------------------------

vi.mock("@/lib/transactions/queries", () => ({
  getMostUsedExpenseCurrencyForUser: vi.fn(),
}))

vi.mock("@/lib/accounts/queries", () => ({
  listAccountsForUser: vi.fn(),
}))

import { getMostUsedExpenseCurrencyForUser } from "@/lib/transactions/queries"
import { listAccountsForUser } from "@/lib/accounts/queries"
import { computeDefaultCurrencyForBudget } from "@/lib/budgets/defaults"

const mockGetMostUsed = getMostUsedExpenseCurrencyForUser as Mock
const mockListAccounts = listAccountsForUser as Mock

describe("computeDefaultCurrencyForBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) user has recent EXPENSE transactions → returns the count-winning currency
  it("(a) recent EXPENSE transactions exist → returns most-used currency", async () => {
    mockGetMostUsed.mockResolvedValue("USD")
    mockListAccounts.mockResolvedValue([]) // not called

    const result = await computeDefaultCurrencyForBudget("user-1")
    expect(result).toBe("USD")
    expect(mockGetMostUsed).toHaveBeenCalledWith("user-1", 90)
    // listAccountsForUser should NOT be called when transactions provide the answer
    expect(mockListAccounts).not.toHaveBeenCalled()
  })

  // (b) user has no recent EXPENSE but ≥ 1 non-archived account → returns first account's currency
  it("(b) no recent EXPENSE transactions → falls back to first account's currency", async () => {
    mockGetMostUsed.mockResolvedValue(null)
    mockListAccounts.mockResolvedValue([
      {
        id: "acc-b",
        currency: "EUR",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "acc-a",
        currency: "GBP",
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ])

    const result = await computeDefaultCurrencyForBudget("user-1")
    // acc-b was created first (2026-01-01) → EUR is the fallback
    expect(result).toBe("EUR")
    expect(mockListAccounts).toHaveBeenCalledWith("user-1", { includeArchived: false })
  })

  // (c) user has no transactions and no accounts → returns null
  it("(c) no transactions and no accounts → null", async () => {
    mockGetMostUsed.mockResolvedValue(null)
    mockListAccounts.mockResolvedValue([])

    const result = await computeDefaultCurrencyForBudget("user-1")
    expect(result).toBeNull()
  })

  // (d) tie-break by id when createdAt is identical
  it("(d) accounts with same createdAt → id asc tie-break determines winner", async () => {
    const sameTime = "2026-03-01T00:00:00.000Z"
    mockGetMostUsed.mockResolvedValue(null)
    mockListAccounts.mockResolvedValue([
      { id: "acc-zzz", currency: "CHF", createdAt: sameTime },
      { id: "acc-aaa", currency: "DKK", createdAt: sameTime },
    ])

    const result = await computeDefaultCurrencyForBudget("user-1")
    // "acc-aaa" < "acc-zzz" alphabetically → DKK wins
    expect(result).toBe("DKK")
  })

  // Ensures the 90-day sinceDays parameter is forwarded correctly
  it("passes sinceDays=90 to getMostUsedExpenseCurrencyForUser", async () => {
    mockGetMostUsed.mockResolvedValue("JPY")
    await computeDefaultCurrencyForBudget("user-42")
    expect(mockGetMostUsed).toHaveBeenCalledWith("user-42", 90)
  })
})
