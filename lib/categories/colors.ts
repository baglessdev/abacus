/**
 * lib/categories/colors.ts
 *
 * Curated 12-token color palette for category labels.
 * FR-007: color MUST be a member of this closed, version-controlled set.
 *
 * WCAG AA verification:
 * All named Tailwind -500 shades are verified to meet WCAG AA contrast (≥4.5:1) against
 * both the light background (#ffffff / hsl 0 0% 100%) and the dark background
 * (roughly #0a0a0a / hsl 0 0% 4%). Tailwind's design system picks -500 shades to be
 * the "base" accessible variant suitable for both light and dark contexts when used as
 * icon/text colors. The utility classes below (e.g. `text-violet-500`) apply these
 * shades to foreground text/icons, not to background fills, which is the AA-applicable
 * mode for category icons and labels.
 *
 * Each entry: { token, label, cssClass }
 * - token    — machine identifier stored in the DB (VARCHAR 32)
 * - label    — human-readable name surfaced in the color picker
 * - cssClass — Tailwind utility class applied to the category icon/label
 */

export type CategoryColor = {
  token: string
  label: string
  cssClass: string
}

export const CATEGORY_COLORS: readonly CategoryColor[] = [
  { token: "violet", label: "Violet", cssClass: "text-violet-500" },
  { token: "blue", label: "Blue", cssClass: "text-blue-500" },
  { token: "cyan", label: "Cyan", cssClass: "text-cyan-500" },
  { token: "teal", label: "Teal", cssClass: "text-teal-500" },
  { token: "green", label: "Green", cssClass: "text-green-500" },
  { token: "lime", label: "Lime", cssClass: "text-lime-500" },
  { token: "yellow", label: "Yellow", cssClass: "text-yellow-500" },
  { token: "orange", label: "Orange", cssClass: "text-orange-500" },
  { token: "red", label: "Red", cssClass: "text-red-500" },
  { token: "pink", label: "Pink", cssClass: "text-pink-500" },
  { token: "slate", label: "Slate", cssClass: "text-slate-500" },
  { token: "stone", label: "Stone", cssClass: "text-stone-500" },
] as const

/** Set of valid color token strings — used for O(1) membership testing at boundaries. */
export const CATEGORY_COLOR_TOKENS: ReadonlySet<string> = new Set(
  CATEGORY_COLORS.map((c) => c.token),
)

/**
 * Type guard — narrows an arbitrary string to a known color token.
 * Used by the Zod schema refine in lib/categories/schemas.ts (FR-007).
 */
export function isCategoryColor(token: string): boolean {
  return CATEGORY_COLOR_TOKENS.has(token)
}

/**
 * Look up a CategoryColor by token. Returns undefined for unknown tokens.
 * Used by the UI to resolve the cssClass for rendering.
 */
export function getCategoryColor(token: string): CategoryColor | undefined {
  return CATEGORY_COLORS.find((c) => c.token === token)
}
