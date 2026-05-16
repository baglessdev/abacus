// lib/money/ — barrel re-export
// The canonical boundary for all monetary arithmetic (constitution Principle I, FR-016).
// No file outside this directory may perform arithmetic on monetary amounts.

export { Money, plus, minus, cmp, isZero, isNegative } from "@/lib/money/decimal"
export type { Money as MoneyType } from "@/lib/money/decimal"

export type { Currency } from "@/lib/money/currencies"
export { CURRENCIES, CURRENCY_CODES, getCurrency, isCurrencyCode } from "@/lib/money/currencies"

export { allowsNegativeStartingBalance, validateStartingBalance } from "@/lib/money/validate"

export { formatAmount } from "@/lib/money/format"

/**
 * Account types that allow a negative starting balance — re-exported for use in the
 * type select dropdown (lib/accounts/index.ts, T024).
 */
export const ACCOUNT_TYPES_ALLOWING_NEGATIVE = ["CREDIT", "OTHER"] as const
