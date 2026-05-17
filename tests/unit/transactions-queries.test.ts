import { type Mock, beforeEach, describe, expect, it, vi } from "vitest"

import {
  TransferCrossCurrencyError,
  ArchivedAccountTransferBlockedError,
} from "@/lib/transactions/errors"

/**
 * tests/unit/transactions-queries.test.ts
 *
 * Locks the transfer-pair invariant, balance computation, and cascade archive
 * per research.md R26 and plan.md §Unit-test suite.
 * Constitution Principle IV — MANDATORY unit test for transfer atomicity.
 *
 * Strategy: vi.mock("@/lib/prisma") to intercept all Prisma calls without
 * touching the real database. Also mocks lib/accounts/queries to supply
 * test doubles for account lookups.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Must be hoisted before any imports that reference these modules.

vi.mock("@/lib/prisma", () => {
  const transactionMock = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  }

  return {
    default: {
      transaction: transactionMock,
      // prisma.$transaction(callback) — execute the callback synchronously in tests
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ transaction: transactionMock }),
      ),
    },
  }
})

vi.mock("@/lib/accounts/queries", () => ({
  getAccountForUser: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import prisma from "@/lib/prisma"
import { getAccountForUser } from "@/lib/accounts/queries"
import {
  createTransferForUser,
  setArchivedAtForUser,
  sumAmountsForAccount,
  sumAmountsForAccountsBatch,
} from "@/lib/transactions/queries"
import { Money } from "@/lib/money/decimal"
import { Prisma } from "@prisma/client"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Factory for a fake Prisma Transaction row */
function fakeTransaction(
  overrides: Partial<{
    id: string
    userId: string
    accountId: string
    categoryId: string | null
    date: Date
    amount: Prisma.Decimal
    currency: string
    type: "INCOME" | "EXPENSE" | "TRANSFER"
    payee: string | null
    notes: string | null
    transferGroupId: string | null
    archivedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return {
    id: overrides.id ?? "txn_source",
    userId: overrides.userId ?? "user_001",
    accountId: overrides.accountId ?? "acc_checking",
    categoryId: overrides.categoryId ?? null,
    date: overrides.date ?? new Date("2026-05-17"),
    amount: overrides.amount ?? new Prisma.Decimal("-500"),
    currency: overrides.currency ?? "USD",
    type: overrides.type ?? "TRANSFER",
    payee: overrides.payee ?? null,
    notes: overrides.notes ?? null,
    transferGroupId: overrides.transferGroupId ?? "tg_001",
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  }
}

const usdCheckingAccount = {
  id: "acc_checking",
  userId: "user_001",
  name: "Chase Checking",
  type: "CHECKING" as const,
  currency: "USD",
  startingBalance: new Prisma.Decimal("1000"),
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const usdSavingsAccount = {
  id: "acc_savings",
  userId: "user_001",
  name: "Savings",
  type: "SAVINGS" as const,
  currency: "USD",
  startingBalance: new Prisma.Decimal("0"),
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const eurAccount = {
  ...usdSavingsAccount,
  id: "acc_eur",
  currency: "EUR",
  name: "Euro Account",
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// (a) createTransferForUser — transfer-pair invariant
// ---------------------------------------------------------------------------

describe("createTransferForUser — transfer-pair invariant (FR-014, Principle IV)", () => {
  it("calls prisma.$transaction with a callback", async () => {
    const mockCreate = prisma.transaction.create as Mock
    mockCreate
      .mockResolvedValueOnce(
        fakeTransaction({ id: "txn_source", amount: new Prisma.Decimal("-500") }),
      )
      .mockResolvedValueOnce(
        fakeTransaction({
          id: "txn_dest",
          amount: new Prisma.Decimal("500"),
          accountId: "acc_savings",
        }),
      )
    ;(getAccountForUser as Mock)
      .mockResolvedValueOnce(usdCheckingAccount)
      .mockResolvedValueOnce(usdSavingsAccount)

    await createTransferForUser("user_001", {
      fromAccountId: "acc_checking",
      toAccountId: "acc_savings",
      date: new Date("2026-05-17"),
      amount: "500",
      notes: null,
    })

    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it("creates exactly 2 Transaction rows (source and destination)", async () => {
    const mockCreate = prisma.transaction.create as Mock
    mockCreate
      .mockResolvedValueOnce(fakeTransaction({ id: "txn_source" }))
      .mockResolvedValueOnce(fakeTransaction({ id: "txn_dest" }))
    ;(getAccountForUser as Mock)
      .mockResolvedValueOnce(usdCheckingAccount)
      .mockResolvedValueOnce(usdSavingsAccount)

    await createTransferForUser("user_001", {
      fromAccountId: "acc_checking",
      toAccountId: "acc_savings",
      date: new Date("2026-05-17"),
      amount: "500",
      notes: null,
    })

    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it("source leg has negative amount and destination has positive amount", async () => {
    const mockCreate = prisma.transaction.create as Mock
    mockCreate
      .mockResolvedValueOnce(fakeTransaction({ id: "txn_source" }))
      .mockResolvedValueOnce(fakeTransaction({ id: "txn_dest" }))
    ;(getAccountForUser as Mock)
      .mockResolvedValueOnce(usdCheckingAccount)
      .mockResolvedValueOnce(usdSavingsAccount)

    await createTransferForUser("user_001", {
      fromAccountId: "acc_checking",
      toAccountId: "acc_savings",
      date: new Date("2026-05-17"),
      amount: "500",
      notes: null,
    })

    const firstCall = mockCreate.mock.calls[0]
    const secondCall = mockCreate.mock.calls[1]
    expect(firstCall).toBeDefined()
    expect(secondCall).toBeDefined()

    if (!firstCall || !secondCall) return // already asserted defined above

    const sourceData = firstCall[0].data
    const destData = secondCall[0].data

    // Source leg: negative amount
    expect(new Money(sourceData.amount).isNegative()).toBe(true)
    expect(new Money(sourceData.amount).abs().eq(new Money("500"))).toBe(true)

    // Destination leg: positive amount
    expect(new Money(destData.amount).isNegative()).toBe(false)
    expect(new Money(destData.amount).eq(new Money("500"))).toBe(true)
  })

  it("both legs share the same transferGroupId, date, currency, userId, type=TRANSFER", async () => {
    const mockCreate = prisma.transaction.create as Mock
    mockCreate
      .mockResolvedValueOnce(fakeTransaction({ id: "txn_source" }))
      .mockResolvedValueOnce(fakeTransaction({ id: "txn_dest" }))
    ;(getAccountForUser as Mock)
      .mockResolvedValueOnce(usdCheckingAccount)
      .mockResolvedValueOnce(usdSavingsAccount)

    await createTransferForUser("user_001", {
      fromAccountId: "acc_checking",
      toAccountId: "acc_savings",
      date: new Date("2026-05-17"),
      amount: "500",
      notes: null,
    })

    const firstCall = mockCreate.mock.calls[0]
    const secondCall = mockCreate.mock.calls[1]
    expect(firstCall).toBeDefined()
    expect(secondCall).toBeDefined()

    if (!firstCall || !secondCall) return // already asserted defined above

    const sourceData = firstCall[0].data
    const destData = secondCall[0].data

    // Shared invariants
    expect(sourceData.transferGroupId).toBe(destData.transferGroupId)
    expect(typeof sourceData.transferGroupId).toBe("string")
    expect(sourceData.transferGroupId.length).toBeGreaterThan(0)

    expect(sourceData.userId).toBe(destData.userId)
    expect(sourceData.currency).toBe(destData.currency)
    expect(sourceData.type).toBe("TRANSFER")
    expect(destData.type).toBe("TRANSFER")
    expect(sourceData.categoryId).toBeNull()
    expect(destData.categoryId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// (b) createTransferForUser — structural guards
// ---------------------------------------------------------------------------

describe("createTransferForUser — structural guards", () => {
  it("throws when fromAccountId === toAccountId", async () => {
    // The guard is hit before account fetching
    await expect(
      createTransferForUser("user_001", {
        fromAccountId: "acc_checking",
        toAccountId: "acc_checking", // same
        date: new Date("2026-05-17"),
        amount: "500",
        notes: null,
      }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// (c) createTransferForUser — currency-mismatch rejection
// ---------------------------------------------------------------------------

describe("createTransferForUser — cross-currency rejection (FR-015)", () => {
  it("throws TransferCrossCurrencyError when accounts have different currencies", async () => {
    ;(getAccountForUser as Mock)
      .mockResolvedValueOnce(usdCheckingAccount) // USD
      .mockResolvedValueOnce(eurAccount) // EUR

    await expect(
      createTransferForUser("user_001", {
        fromAccountId: "acc_checking",
        toAccountId: "acc_eur",
        date: new Date("2026-05-17"),
        amount: "500",
        notes: null,
      }),
    ).rejects.toBeInstanceOf(TransferCrossCurrencyError)
  })
})

// ---------------------------------------------------------------------------
// (d) setArchivedAtForUser — TRANSFER cascades to both legs
// ---------------------------------------------------------------------------

describe("setArchivedAtForUser — TRANSFER cascade (FR-018, Principle IV)", () => {
  it("invokes updateMany with WHERE { userId, transferGroupId } when row.type === TRANSFER", async () => {
    const transferRow = fakeTransaction({
      id: "txn_source",
      type: "TRANSFER",
      transferGroupId: "tg_abc",
    })

    // getTransactionForUser → the anchor row
    ;(prisma.transaction.findFirst as Mock)
      .mockResolvedValueOnce(transferRow) // initial fetch in setArchivedAtForUser
      .mockResolvedValueOnce(transferRow) // final re-fetch after updateMany
    ;(prisma.transaction.updateMany as Mock).mockResolvedValueOnce({ count: 2 })

    await setArchivedAtForUser("user_001", "txn_source", new Date())

    // Should use prisma.$transaction wrapping updateMany
    expect(prisma.$transaction).toHaveBeenCalledOnce()

    // updateMany should be called with transferGroupId filter
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_001",
          transferGroupId: "tg_abc",
        }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// (e) setArchivedAtForUser — single-leg (non-TRANSFER) updates just that row
// ---------------------------------------------------------------------------

describe("setArchivedAtForUser — single-leg (non-TRANSFER)", () => {
  it("invokes updateMany with WHERE { id, userId } (not transferGroupId) when row.type !== TRANSFER", async () => {
    const expenseRow = fakeTransaction({
      id: "txn_expense",
      type: "EXPENSE",
      transferGroupId: null,
    })

    ;(prisma.transaction.findFirst as Mock)
      .mockResolvedValueOnce(expenseRow)
      .mockResolvedValueOnce(expenseRow) // re-fetch after updateMany
    ;(prisma.transaction.updateMany as Mock).mockResolvedValueOnce({ count: 1 })

    await setArchivedAtForUser("user_001", "txn_expense", new Date())

    // $transaction should NOT be called for single-leg archive
    expect(prisma.$transaction).not.toHaveBeenCalled()

    // updateMany should be called with { id, userId } — NOT transferGroupId
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "txn_expense", userId: "user_001" },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// (f) sumAmountsForAccount — aggregate call shape
// ---------------------------------------------------------------------------

describe("sumAmountsForAccount — aggregate call shape (FR-019a)", () => {
  it("calls prisma.transaction.aggregate with WHERE { userId, accountId, archivedAt: null }", async () => {
    ;(prisma.transaction.aggregate as Mock).mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal("1500") },
    })

    const result = await sumAmountsForAccount("user_001", "acc_checking")

    expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_001", accountId: "acc_checking", archivedAt: null },
        _sum: { amount: true },
      }),
    )

    expect(result.eq(new Money("1500"))).toBe(true)
  })

  it("returns Money(0) when _sum.amount is null (no matching transactions)", async () => {
    ;(prisma.transaction.aggregate as Mock).mockResolvedValueOnce({
      _sum: { amount: null },
    })

    const result = await sumAmountsForAccount("user_001", "acc_empty")
    expect(result.isZero()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// (g) sumAmountsForAccountsBatch — groupBy call shape + Map result
// ---------------------------------------------------------------------------

describe("sumAmountsForAccountsBatch — groupBy call shape + Map result (FR-019a)", () => {
  it("calls prisma.transaction.groupBy with correct WHERE and returns a Map", async () => {
    const accountIds = ["acc_a", "acc_b", "acc_c"]

    ;(prisma.transaction.groupBy as Mock).mockResolvedValueOnce([
      { accountId: "acc_a", _sum: { amount: new Prisma.Decimal("1000") } },
      { accountId: "acc_b", _sum: { amount: new Prisma.Decimal("-200") } },
      // acc_c has no transactions — not in the result
    ])

    const result = await sumAmountsForAccountsBatch("user_001", accountIds)

    expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["accountId"],
        where: {
          userId: "user_001",
          accountId: { in: accountIds },
          archivedAt: null,
        },
        _sum: { amount: true },
      }),
    )

    expect(result).toBeInstanceOf(Map)
    expect(result.get("acc_a")?.eq(new Money("1000"))).toBe(true)
    expect(result.get("acc_b")?.eq(new Money("-200"))).toBe(true)
    // acc_c is not in the map — callers use ?? new Money(0)
    expect(result.has("acc_c")).toBe(false)
  })

  it("returns empty Map when accountIds is empty (no DB call)", async () => {
    const result = await sumAmountsForAccountsBatch("user_001", [])
    expect(result.size).toBe(0)
    expect(prisma.transaction.groupBy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// (h) createTransferForUser — archived-account rejection
// ---------------------------------------------------------------------------

describe("createTransferForUser — archived account rejection", () => {
  it("throws ArchivedAccountTransferBlockedError when fromAccount is archived", async () => {
    const archivedChecking = { ...usdCheckingAccount, archivedAt: new Date() }

    ;(getAccountForUser as Mock)
      .mockResolvedValueOnce(archivedChecking) // fromAccount is archived
      .mockResolvedValueOnce(usdSavingsAccount)

    await expect(
      createTransferForUser("user_001", {
        fromAccountId: "acc_checking",
        toAccountId: "acc_savings",
        date: new Date("2026-05-17"),
        amount: "500",
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ArchivedAccountTransferBlockedError)
  })
})
