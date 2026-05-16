// Alias the Money type to avoid a naming collision with the exported `Money` component function.
// `lib/money/decimal.ts` exports `type Money = Prisma.Decimal`; we import it as `MoneyValue` here.
import type { Money as MoneyValue } from "@/lib/money/decimal"
import { formatAmount } from "@/lib/money/format"
import { cn } from "@/lib/utils"

type MoneyProps = {
  /**
   * Canonical decimal string (the wire format from AccountDTO.startingBalance,
   * e.g., "1250.00", "-500.00", "0") or a Money (Prisma.Decimal) instance.
   * NEVER accepts `number` — TypeScript blocks the float-erosion path
   * (constitution Principle I).
   */
  amount: string | MoneyValue
  /**
   * ISO 4217 alpha-3 currency code (e.g., "USD", "EUR", "JPY", "BHD").
   * REQUIRED — currency is structurally inseparable from amount per FR-012.
   */
  currency: string
  /**
   * Render the amount larger and heavier. Used when this is the most
   * prominent piece of typography in its container (e.g., the accounts list
   * balance column per FR-014). Default false.
   */
  prominent?: boolean
  /**
   * Text-alignment hint. Useful inside table cells or right-aligned columns.
   * Default: inherit.
   */
  align?: "left" | "right"
  /**
   * Extra className passthrough for layout overrides (margin, gap, etc.).
   * The component-internal classes (tabular-nums, sign-aware color, prominent
   * styling) are not overridable via this prop.
   */
  className?: string
}

/**
 * Money — the single monetary-display contract surface (FR-015).
 * Rendering-only: no arithmetic, no rounding, no currency suppression.
 * Delegates formatting to formatAmount (lib/money/format.ts) — unchanged.
 * Sign-aware color: positive → text-foreground, zero → text-muted-foreground,
 * negative → text-money-negative (NOT text-money-positive — FR-013).
 */
export function Money({ amount, currency, prominent, align, className }: MoneyProps) {
  // Step 1: Normalize amount to string — no arithmetic, just serialization.
  const amountStr = typeof amount === "string" ? amount : amount.toString()

  // Step 2: Detect sign by reading the leading non-whitespace character.
  // Never compute mathematically — only string-parse the sign character.
  const trimmed = amountStr.trimStart()
  let sign: "negative" | "zero" | "positive"
  if (trimmed.startsWith("-")) {
    sign = "negative"
  } else if (/^0(\.0+)?$/.test(trimmed)) {
    // Covers "0", "0.0", "0.00", "0.000", etc.
    sign = "zero"
  } else {
    sign = "positive"
  }

  // Step 3: Format the amount — delegate entirely to formatAmount, no rounding here.
  const formatted = formatAmount(amountStr, currency)

  // Step 4: Build class list.
  const classes = cn(
    // Always: tabular numerals (FR-011).
    "tabular-nums",
    // Sign-aware color (FR-013). NEVER apply text-money-positive here.
    sign === "negative" && "text-money-negative",
    sign === "zero" && "text-muted-foreground",
    sign === "positive" && "text-foreground",
    // Prominent variant: heavier weight + slightly larger.
    prominent && "font-semibold text-lg",
    // Alignment: right-align makes the span block-level so text-right takes effect.
    align === "right" && "text-right block",
    align === "left" && "text-left",
    // Caller overrides (layout only — the component's own classes take priority).
    className,
  )

  // Step 5: Render a single <span> — no wrapper divs, no nested spans (per contract).
  return <span className={classes}>{formatted}</span>
}
