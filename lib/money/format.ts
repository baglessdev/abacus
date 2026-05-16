import { type Money } from "@/lib/money/decimal"
import { getCurrency } from "@/lib/money/currencies"

/**
 * Formats a monetary amount for display, keyed by the currency's ISO 4217 `decimals` count.
 * Uses `Intl.NumberFormat` for locale-aware thousand separators and symbol placement.
 * Never rounds (FR-011) — the boundary validator rejects over-precision input before it reaches here.
 * Pads to the currency's `decimals` count (e.g., "800" → "€800.00" for EUR).
 *
 * Output examples (plan.md §Currency display):
 *   formatAmount("1250.00", "USD") → "$1,250.00"
 *   formatAmount("800",     "EUR") → "€800.00"
 *   formatAmount("0",       "JPY") → "¥0"
 *   formatAmount("-500",    "USD") → "-$500.00"
 *   formatAmount("1.234",   "BHD") → "BD 1.234" (or locale-specific BHD formatting)
 */
export function formatAmount(amount: string | Money, currency: string): string {
  const amountStr = typeof amount === "string" ? amount : amount.toString()
  const currencyRecord = getCurrency(currency)
  const decimals = currencyRecord?.decimals ?? 2

  // Parse the numeric value as a JS number for Intl.NumberFormat.
  // We validated precision at the boundary; the only risk is float representation
  // for very large numbers, which is not a concern at personal-finance scale.
  const numericValue = parseFloat(amountStr)

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numericValue)
  } catch {
    // If Intl.NumberFormat rejects the currency code (unusual codes like XBA),
    // fall back to a simple manual format: symbol + amount.
    const symbol = currencyRecord?.symbol ?? currency
    const absValue = Math.abs(numericValue)
    const formatted = absValue.toFixed(decimals)
    const thousands = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return numericValue < 0 ? `-${symbol} ${thousands}` : `${symbol} ${thousands}`
  }
}
