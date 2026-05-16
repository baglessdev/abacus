# UI Contract — `<Money>`

The single monetary-display contract surface going forward. After this chore lands, any future feature that displays money MUST render through this primitive (FR-015). The primitive's role is **rendering only** — it does not perform arithmetic, it does not round, and it cannot be configured to suppress the currency.

## Location

`components/money/money.tsx`

## Signature

```ts
import type { Money } from "@/lib/money/decimal" // Prisma.Decimal re-export from feature 004

type MoneyProps = {
  /**
   * Canonical decimal string (the wire format from AccountDTO.startingBalance,
   * e.g., "1250.00", "-500.00", "0") or a Money (Prisma.Decimal) instance.
   * NEVER accepts `number` — TypeScript blocks the float-erosion path
   * (constitution Principle I).
   */
  amount: string | Money
  /**
   * ISO 4217 alpha-3 currency code (e.g., "USD", "EUR", "JPY", "BHD").
   * REQUIRED — currency is structurally inseparable from amount per FR-012.
   * No default. No way to suppress. No way to render an amount without a currency.
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
   * The parent <TableCell> can also set alignment; this is a convenience.
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

export function Money(props: MoneyProps): JSX.Element
```

## Render contract

The component:

1. Normalises `amount` to a string: if it's a `Money` (`Prisma.Decimal`), call `.toString()`; otherwise pass through.
2. Detects sign by reading the first non-whitespace character of the normalised string: `-` → negative; otherwise check whether the numeric portion is `0` / `0.0` / `0.00` → zero; otherwise → positive.
3. Calls `formatAmount(amount, currency)` from `lib/money/format.ts` — UNCHANGED from feature 004. The output is a single formatted string (e.g., `"$1,250.00"`, `"€800.00"`, `"-$500.00"`, `"¥0"`).
4. Renders a single `<span>` containing the formatted string, with the following classes applied:
   - **Always**: `tabular-nums` (FR-011).
   - **Sign-aware color**:
     - Positive → `text-foreground` (default; FR-013).
     - Zero → `text-muted-foreground` (FR-013).
     - Negative → `text-money-negative` (the new desaturated-red token from research.md R6 + R7; FR-008, FR-013). **NOT** `text-destructive`.
   - **When `prominent`**: `font-semibold text-lg` (heavier and slightly larger).
   - **When `align="right"`**: `text-right`.
   - **`className` prop**: appended after the above so callers can add layout-only utilities (margins, gaps); the component's own classes are NOT overridable.

The component MUST NOT:

- Perform any arithmetic on `amount`. No addition, no comparison beyond the sign-detection char check, no rounding. (Constitution Principle I; FR-036.)
- Accept a `number` for `amount`. TypeScript's static type system blocks this; the component MUST NOT have a runtime branch that handles `number`.
- Suppress the currency. There is no `showCurrency` prop. The currency is structurally inseparable from the amount via `formatAmount`'s contract (which always returns a string containing both).
- Apply `text-money-positive` to positive amounts. **The `money-positive` token is reserved for future features (FR-013)** — the primitive uses default `text-foreground` for positives.
- Strip or substitute the formatter's sign character. Negative amounts retain the `-` (or whatever sign character `Intl.NumberFormat` produces) so color is NOT the sole carrier of sign information (FR-013).
- Render any element other than a single `<span>` (no wrapper divs, no nested spans for the currency vs amount portions). Keeps the DOM minimal and the inheritance of `tabular-nums` + color clean.

## Accessibility contract

- The component renders a single `<span>` with no `role`, no `aria-*` attributes, no `tabIndex`. It is inline text.
- Screen readers announce the formatted string as text content (e.g., the user hears "minus dollar five hundred" or "minus five hundred dollars" depending on the screen reader's currency-handling).
- The sign character (`-`) remains in the output, so screen readers convey negativity verbally even when visual color cues are unavailable. FR-013 binds this.
- `tabular-nums` is purely visual and has no a11y impact.
- The `prominent` styling does not change the semantic — there is no `<strong>` or `<b>`; the visual weight is conveyed purely via CSS (`font-semibold`).

## Callers

### Current chore

| File | Usage |
|---|---|
| `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` | Balance column in the accounts table. Replaces the direct `formatAmount(...)` call. Used with `prominent` and `align="right"` to make the balance column the most prominent column (FR-014). |
| `app/(shell)/dashboard/accounts/_components/account-form.tsx` | Optional: balance read-back inside the edit sheet. The editable input remains a plain numeric input control (FR-014's "the editable input itself uses a plain numeric input control"). |
| `app/(shell)/dashboard/transactions/page.tsx` (decorative preview slot) | Amount cells in the faded mock two-row transaction layout. The cells use real `<Money>` rendering so the decorative preview is typographically truthful — but the data values are dummy ("0.00 USD" etc.) and the entire preview is wrapped in `aria-hidden="true"`. |
| `app/(shell)/dashboard/budgets/page.tsx` (decorative preview slot) | Total under the progress-bar mock. Same dummy-data treatment, same `aria-hidden`. |

### Future (planned)

- Feature 006 (Transactions) — every transaction row's amount renders through `<Money>`.
- Feature 007 (Dashboard) — net worth, this-month cash flow, and recent-transaction amounts.
- Feature 008 (Budgets) — budget caps, spent amounts, remaining amounts. (Note: surplus / under-budget contexts MAY opt into `text-money-positive` via a future prop or via a richer variant.)
- Feature 015 (Charts) — tooltip amount labels.
- Feature 020 (FX / aggregation) — any cross-currency total widget.

No future feature may introduce a parallel money-display component. FR-015 binds the codebase.

## Applicable FRs

- **FR-010** — Money rendering primitive distinct from `lib/money/` arithmetic layer; rendering only; no arithmetic. ✓ (The component is rendering-only; arithmetic stays in `lib/money/`.)
- **FR-011** — Tabular numerals. ✓ (`tabular-nums` always applied.)
- **FR-012** — Render amount together with currency in 100% of states; no configuration suppresses currency. ✓ (`currency` is a required prop; `formatAmount` always includes it; no `showCurrency` prop exists.)
- **FR-013** — Sign-aware color: positive → foreground (default); zero → muted-foreground; negative → desaturated red; `money-positive` NOT applied by this primitive in this chore. ✓ (Render contract codifies this.)
- **FR-014** — Accounts list balance column migrated to this primitive, right-aligned, most prominent column. ✓ (`prominent` + `align="right"` props used by the caller.)
- **FR-015** — Single contract surface for monetary display across all surfaces. ✓ (No parallel component; future features must use this one.)
- **FR-036** — Decimal value is never rounded by the rendering primitive itself, only formatted by `lib/money/format.ts`. ✓ (The component delegates to `formatAmount`; does no arithmetic.)
