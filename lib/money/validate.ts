import { type AccountType } from "@prisma/client"

import { getCurrency } from "@/lib/money/currencies"

/**
 * Returns true for account types that allow a negative starting balance (CREDIT, OTHER).
 * All other types (CHECKING, SAVINGS, CASH, INVESTMENT) require zero or positive (FR-006).
 */
export function allowsNegativeStartingBalance(type: AccountType): boolean {
  return type === "CREDIT" || type === "OTHER"
}

type ValidationCode = "negative_not_allowed" | "too_many_decimals" | "not_a_number"

type ValidateStartingBalanceResult =
  | { ok: true }
  | { ok: false; code: ValidationCode; message: string }

/**
 * Validates a starting balance string for the given account type and currency.
 * Checks:
 *   1. The string is a parseable number.
 *   2. The number of fractional digits does not exceed the currency's `decimals` count (FR-006).
 *   3. Negative values are only allowed for CREDIT and OTHER (FR-006).
 *
 * Callers are responsible for passing an already-uppercased ISO 4217 currency code
 * (the Zod schema normalizes this before calling; research.md R5).
 */
export function validateStartingBalance(input: {
  type: AccountType
  currency: string
  amount: string
}): ValidateStartingBalanceResult {
  const { type, currency, amount } = input

  // Step 1: is it a parseable number? Accept the ISO decimal form (optional sign, digits, optional decimal point + digits).
  if (!/^-?\d+(\.\d+)?$/.test(amount.trim())) {
    return {
      ok: false,
      code: "not_a_number",
      message: "Enter a valid amount (e.g., 1250.00 or -500.00).",
    }
  }

  const trimmed = amount.trim()

  // Step 2: currency-aware decimal-place rule.
  const currencyRecord = getCurrency(currency)
  if (currencyRecord !== undefined) {
    const dotIndex = trimmed.indexOf(".")
    if (dotIndex !== -1) {
      const fractionalDigits = trimmed.length - dotIndex - 1
      if (fractionalDigits > currencyRecord.decimals) {
        return {
          ok: false,
          code: "too_many_decimals",
          message:
            currencyRecord.decimals === 0
              ? `${currency} does not support decimal places.`
              : `${currency} supports at most ${currencyRecord.decimals} decimal place${currencyRecord.decimals === 1 ? "" : "s"}.`,
        }
      }
    }
  }

  // Step 3: negative-balance rule per account type.
  const isNegative = trimmed.startsWith("-") && parseFloat(trimmed) < 0
  if (isNegative && !allowsNegativeStartingBalance(type)) {
    return {
      ok: false,
      code: "negative_not_allowed",
      message: `A ${type.charAt(0) + type.slice(1).toLowerCase()} account cannot have a negative starting balance.`,
    }
  }

  return { ok: true }
}
