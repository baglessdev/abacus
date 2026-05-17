import { describe, expect, it } from "vitest"

import {
  allowsNegativeStartingBalance,
  validateStartingBalance,
  validateTransactionAmount,
} from "@/lib/money/validate"

describe("allowsNegativeStartingBalance — FR-006 / FR-022 / SC-010", () => {
  it("returns true for CREDIT", () => {
    expect(allowsNegativeStartingBalance("CREDIT")).toBe(true)
  })

  it("returns true for OTHER", () => {
    expect(allowsNegativeStartingBalance("OTHER")).toBe(true)
  })

  it("returns false for CHECKING", () => {
    expect(allowsNegativeStartingBalance("CHECKING")).toBe(false)
  })

  it("returns false for SAVINGS", () => {
    expect(allowsNegativeStartingBalance("SAVINGS")).toBe(false)
  })

  it("returns false for CASH", () => {
    expect(allowsNegativeStartingBalance("CASH")).toBe(false)
  })

  it("returns false for INVESTMENT", () => {
    expect(allowsNegativeStartingBalance("INVESTMENT")).toBe(false)
  })
})

describe("validateStartingBalance — FR-006 / FR-022 / SC-010", () => {
  // Zero is always valid for every type
  describe("'0' is valid for every account type", () => {
    const types = ["CHECKING", "SAVINGS", "CREDIT", "CASH", "INVESTMENT", "OTHER"] as const

    for (const type of types) {
      it(`accepts '0' for ${type}`, () => {
        const result = validateStartingBalance({ type, currency: "USD", amount: "0" })
        expect(result.ok).toBe(true)
      })
    }
  })

  // Negative values: only allowed on CREDIT and OTHER
  describe("negative balance rule", () => {
    it("rejects '-1' on CHECKING", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "USD", amount: "-1" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("negative_not_allowed")
      }
    })

    it("rejects '-1' on SAVINGS", () => {
      const result = validateStartingBalance({ type: "SAVINGS", currency: "USD", amount: "-1" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("negative_not_allowed")
      }
    })

    it("rejects '-1' on CASH", () => {
      const result = validateStartingBalance({ type: "CASH", currency: "USD", amount: "-1" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("negative_not_allowed")
      }
    })

    it("rejects '-1' on INVESTMENT", () => {
      const result = validateStartingBalance({ type: "INVESTMENT", currency: "USD", amount: "-1" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("negative_not_allowed")
      }
    })

    it("accepts '-1' on CREDIT", () => {
      const result = validateStartingBalance({ type: "CREDIT", currency: "USD", amount: "-1" })
      expect(result.ok).toBe(true)
    })

    it("accepts '-1' on OTHER", () => {
      const result = validateStartingBalance({ type: "OTHER", currency: "USD", amount: "-1" })
      expect(result.ok).toBe(true)
    })

    it("accepts '-500.00' on CREDIT (spec edge case: $500 debt at tracking start)", () => {
      const result = validateStartingBalance({ type: "CREDIT", currency: "USD", amount: "-500.00" })
      expect(result.ok).toBe(true)
    })
  })

  // Currency-aware decimal-place rule
  describe("decimal-place rule", () => {
    it("rejects '1.234' for USD (max 2 decimals)", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "USD", amount: "1.234" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("too_many_decimals")
      }
    })

    it("accepts '1.23' for USD (exactly 2 decimals)", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "USD", amount: "1.23" })
      expect(result.ok).toBe(true)
    })

    it("accepts '1.234' for BHD (max 3 decimals)", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "BHD", amount: "1.234" })
      expect(result.ok).toBe(true)
    })

    it("rejects '1.5' for JPY (0 decimals allowed)", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "JPY", amount: "1.5" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("too_many_decimals")
      }
    })

    it("accepts '1' for JPY (no decimal point)", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "JPY", amount: "1" })
      expect(result.ok).toBe(true)
    })

    it("accepts '0' for JPY", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "JPY", amount: "0" })
      expect(result.ok).toBe(true)
    })

    it("rejects '1.2345' for BHD (4 decimals, max is 3)", () => {
      const result = validateStartingBalance({
        type: "CHECKING",
        currency: "BHD",
        amount: "1.2345",
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("too_many_decimals")
      }
    })
  })

  // Not-a-number inputs
  describe("not_a_number inputs", () => {
    it("rejects empty string", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "USD", amount: "" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("not_a_number")
      }
    })

    it("rejects 'abc'", () => {
      const result = validateStartingBalance({ type: "CHECKING", currency: "USD", amount: "abc" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("not_a_number")
      }
    })
  })
})

// ---------------------------------------------------------------------------
// validateTransactionAmount — FR-008, FR-009, research.md R3, constitution Principle IV
// ---------------------------------------------------------------------------

describe("validateTransactionAmount — FR-008 / FR-009 / R3 / Principle IV", () => {
  // Success paths
  describe("success paths", () => {
    it("INCOME with amount='100' → ok", () => {
      const result = validateTransactionAmount({ type: "INCOME", amount: "100", currency: "USD" })
      expect(result.ok).toBe(true)
    })

    it("INCOME with amount='0.01' → ok (smallest positive)", () => {
      const result = validateTransactionAmount({ type: "INCOME", amount: "0.01", currency: "USD" })
      expect(result.ok).toBe(true)
    })

    it("EXPENSE with amount='-50' → ok", () => {
      const result = validateTransactionAmount({ type: "EXPENSE", amount: "-50", currency: "USD" })
      expect(result.ok).toBe(true)
    })

    it("EXPENSE with amount='-0.01' → ok (smallest negative)", () => {
      const result = validateTransactionAmount({
        type: "EXPENSE",
        amount: "-0.01",
        currency: "USD",
      })
      expect(result.ok).toBe(true)
    })

    it("TRANSFER with amount='100' → ok (positive magnitude, queries layer signs legs)", () => {
      const result = validateTransactionAmount({
        type: "TRANSFER",
        amount: "100",
        currency: "USD",
      })
      expect(result.ok).toBe(true)
    })

    it("TRANSFER with amount='-100' → ok (negative magnitude also allowed for TRANSFER)", () => {
      const result = validateTransactionAmount({
        type: "TRANSFER",
        amount: "-100",
        currency: "USD",
      })
      expect(result.ok).toBe(true)
    })
  })

  // sign_mismatch
  describe("sign_mismatch", () => {
    it("INCOME with amount='-100' → sign_mismatch", () => {
      const result = validateTransactionAmount({
        type: "INCOME",
        amount: "-100",
        currency: "USD",
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("sign_mismatch")
      }
    })

    it("EXPENSE with amount='50' → sign_mismatch", () => {
      const result = validateTransactionAmount({ type: "EXPENSE", amount: "50", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("sign_mismatch")
      }
    })
  })

  // zero_amount
  describe("zero_amount", () => {
    it("TRANSFER with amount='0' → zero_amount", () => {
      const result = validateTransactionAmount({ type: "TRANSFER", amount: "0", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("zero_amount")
      }
    })

    it("INCOME with amount='0' → zero_amount", () => {
      const result = validateTransactionAmount({ type: "INCOME", amount: "0", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("zero_amount")
      }
    })

    it("EXPENSE with amount='0' → zero_amount", () => {
      const result = validateTransactionAmount({ type: "EXPENSE", amount: "0", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("zero_amount")
      }
    })
  })

  // too_many_decimals
  describe("too_many_decimals", () => {
    it("INCOME with amount='1.234' for USD → too_many_decimals (USD max 2)", () => {
      const result = validateTransactionAmount({
        type: "INCOME",
        amount: "1.234",
        currency: "USD",
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("too_many_decimals")
      }
    })

    it("EXPENSE with amount='-1.5' for JPY → too_many_decimals (JPY max 0)", () => {
      const result = validateTransactionAmount({
        type: "EXPENSE",
        amount: "-1.5",
        currency: "JPY",
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("too_many_decimals")
      }
    })

    it("TRANSFER with amount='1.234' for BHD → ok (BHD max 3)", () => {
      const result = validateTransactionAmount({
        type: "TRANSFER",
        amount: "1.234",
        currency: "BHD",
      })
      expect(result.ok).toBe(true)
    })
  })

  // not_a_number
  describe("not_a_number", () => {
    it("amount='abc' → not_a_number", () => {
      const result = validateTransactionAmount({ type: "INCOME", amount: "abc", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("not_a_number")
      }
    })

    it("amount='' (empty) → not_a_number", () => {
      const result = validateTransactionAmount({ type: "EXPENSE", amount: "", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("not_a_number")
      }
    })

    it("amount='1e5' (scientific notation) → not_a_number", () => {
      const result = validateTransactionAmount({ type: "INCOME", amount: "1e5", currency: "USD" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("not_a_number")
      }
    })
  })
})
