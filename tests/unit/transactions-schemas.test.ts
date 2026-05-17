import { describe, expect, it } from "vitest"

import {
  createTransactionSchema,
  createTransferSchema,
  updateTransactionSchema,
} from "@/lib/transactions/schemas"

/**
 * tests/unit/transactions-schemas.test.ts
 *
 * Locks the Zod boundary rules per contracts/ and plan.md §Schemas.
 * Constitution Principle IV — mandatory unit test for the transaction schema boundary.
 * These tests are mock-free: Zod schemas are pure synchronous functions.
 */

// ---------------------------------------------------------------------------
// Shared valid test inputs
// ---------------------------------------------------------------------------

const validCreateExpense = {
  accountId: "acc_001",
  categoryId: "cat_001",
  date: "2026-05-17",
  amount: "-50.00",
  currency: "USD",
  type: "EXPENSE" as const,
  payee: "Whole Foods",
  notes: "Weekly shop",
}

const validCreateIncome = {
  accountId: "acc_001",
  categoryId: "cat_002",
  date: "2026-05-17",
  amount: "3200.00",
  currency: "USD",
  type: "INCOME" as const,
  payee: "Acme Corp",
  notes: "",
}

const validCreateTransfer = {
  fromAccountId: "acc_001",
  toAccountId: "acc_002",
  date: "2026-05-17",
  amount: "500.00",
  notes: "",
}

// ---------------------------------------------------------------------------
// createTransactionSchema — EXPENSE
// ---------------------------------------------------------------------------

describe("createTransactionSchema — EXPENSE", () => {
  it("accepts valid EXPENSE with negative amount", () => {
    const result = createTransactionSchema.safeParse(validCreateExpense)
    expect(result.success).toBe(true)
  })

  it("sign_mismatch: EXPENSE with positive amount → fails", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      amount: "50.00", // positive, but type=EXPENSE
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const amountErrors = result.error.flatten().fieldErrors.amount ?? []
      expect(amountErrors.length).toBeGreaterThan(0)
    }
  })

  it("sign_mismatch: EXPENSE with zero amount → fails", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      amount: "0",
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createTransactionSchema — INCOME
// ---------------------------------------------------------------------------

describe("createTransactionSchema — INCOME", () => {
  it("accepts valid INCOME with positive amount", () => {
    const result = createTransactionSchema.safeParse(validCreateIncome)
    expect(result.success).toBe(true)
  })

  it("sign_mismatch: INCOME with negative amount → fails", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateIncome,
      amount: "-100.00", // negative, but type=INCOME
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const amountErrors = result.error.flatten().fieldErrors.amount ?? []
      expect(amountErrors.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// createTransactionSchema — currency validation
// ---------------------------------------------------------------------------

describe("createTransactionSchema — currency", () => {
  it("rejects invalid currency 'DEM'", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      currency: "DEM",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.currency ?? []
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it("accepts valid currency 'EUR'", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      currency: "EUR",
    })
    expect(result.success).toBe(true)
  })

  it("normalizes lowercase currency 'usd' to 'USD'", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      currency: "usd",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currency).toBe("USD")
    }
  })
})

// ---------------------------------------------------------------------------
// createTransactionSchema — date validation
// ---------------------------------------------------------------------------

describe("createTransactionSchema — date", () => {
  it("rejects non-ISO date '05/17/2026'", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      date: "05/17/2026",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.date ?? []
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it("rejects ISO timestamp '2026-05-17T00:00:00Z'", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      date: "2026-05-17T00:00:00Z",
    })
    expect(result.success).toBe(false)
  })

  it("accepts '2026-05-17' and transforms to UTC midnight Date", () => {
    const result = createTransactionSchema.safeParse(validCreateExpense)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.date).toBeInstanceOf(Date)
      expect(result.data.date.getUTCFullYear()).toBe(2026)
      expect(result.data.date.getUTCMonth()).toBe(4) // May
      expect(result.data.date.getUTCDate()).toBe(17)
      expect(result.data.date.getUTCHours()).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// createTransactionSchema — payee / notes length
// ---------------------------------------------------------------------------

describe("createTransactionSchema — payee and notes limits", () => {
  it("rejects payee longer than 120 characters", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      payee: "A".repeat(121),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.payee ?? []
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it("accepts payee of exactly 120 characters", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      payee: "A".repeat(120),
    })
    expect(result.success).toBe(true)
  })

  it("rejects notes longer than 500 characters", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      notes: "N".repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.notes ?? []
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it("accepts notes of exactly 500 characters", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      notes: "N".repeat(500),
    })
    expect(result.success).toBe(true)
  })

  it("empty payee string → transforms to null", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      payee: "",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.payee).toBeNull()
    }
  })

  it("empty notes string → transforms to null", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      notes: "",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notes).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// createTransactionSchema — required fields
// ---------------------------------------------------------------------------

describe("createTransactionSchema — required fields", () => {
  it("rejects missing accountId", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accountId: _accountId, ...rest } = validCreateExpense
    const result = createTransactionSchema.safeParse({ ...rest, accountId: "" })
    expect(result.success).toBe(false)
  })

  it("rejects missing amount", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      amount: "",
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createTransferSchema
// ---------------------------------------------------------------------------

describe("createTransferSchema", () => {
  it("accepts valid transfer", () => {
    const result = createTransferSchema.safeParse(validCreateTransfer)
    expect(result.success).toBe(true)
  })

  it("rejects negative amount (transfer amount must be positive)", () => {
    const result = createTransferSchema.safeParse({
      ...validCreateTransfer,
      amount: "-500.00",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.amount ?? []
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it("rejects zero amount", () => {
    const result = createTransferSchema.safeParse({
      ...validCreateTransfer,
      amount: "0",
    })
    expect(result.success).toBe(false)
  })

  it("accepts positive amount and transforms date to UTC midnight Date", () => {
    const result = createTransferSchema.safeParse(validCreateTransfer)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.date).toBeInstanceOf(Date)
      expect(result.data.date.getUTCFullYear()).toBe(2026)
      expect(result.data.date.getUTCDate()).toBe(17)
      expect(result.data.date.getUTCHours()).toBe(0)
    }
  })

  it("rejects missing fromAccountId", () => {
    const result = createTransferSchema.safeParse({
      ...validCreateTransfer,
      fromAccountId: "",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing toAccountId", () => {
    const result = createTransferSchema.safeParse({
      ...validCreateTransfer,
      toAccountId: "",
    })
    expect(result.success).toBe(false)
  })

  // Self-transfer (fromAccountId === toAccountId) is enforced at the queries layer,
  // not in this schema. This test documents that the schema alone does not reject it.
  it("schema does not reject fromAccountId === toAccountId (queries layer enforces this)", () => {
    const result = createTransferSchema.safeParse({
      ...validCreateTransfer,
      fromAccountId: "acc_001",
      toAccountId: "acc_001",
    })
    // The schema itself does NOT reject same-account — the queries layer does.
    // This test documents the boundary location (Principle III: cross-field rules at queries layer).
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// updateTransactionSchema
// ---------------------------------------------------------------------------

describe("updateTransactionSchema", () => {
  it("requires id", () => {
    const result = updateTransactionSchema.safeParse({
      ...validCreateExpense,
      id: "",
    })
    expect(result.success).toBe(false)
  })

  it("accepts valid update with id", () => {
    const result = updateTransactionSchema.safeParse({
      ...validCreateExpense,
      id: "txn_001",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe("txn_001")
    }
  })
})

// ---------------------------------------------------------------------------
// too_many_decimals via createTransactionSchema
// ---------------------------------------------------------------------------

describe("createTransactionSchema — too_many_decimals", () => {
  it("rejects EXPENSE with amount='-1.234' for USD (max 2 decimals)", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateExpense,
      amount: "-1.234",
      currency: "USD",
    })
    expect(result.success).toBe(false)
  })

  it("accepts INCOME with amount='1.23' for USD (exactly 2 decimals)", () => {
    const result = createTransactionSchema.safeParse({
      ...validCreateIncome,
      amount: "1.23",
      currency: "USD",
    })
    expect(result.success).toBe(true)
  })
})
