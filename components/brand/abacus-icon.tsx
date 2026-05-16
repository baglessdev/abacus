type AbacusIconProps = {
  /** Square dimension in pixels. Default 20 (header size). */
  size?: number | string
  /** Extra className passthrough for color / margin overrides. */
  className?: string
  /**
   * Bead fill color discipline. "currentColor" inherits the surrounding text color
   * (used in mono contexts like the header, where the entire mark including beads
   * follows text color). "primary" uses the violet --primary token explicitly,
   * which is the bead-accent treatment described in FR-001.
   * Default: "primary".
   */
  accent?: "primary" | "currentColor"
  /**
   * Accessible name. When the icon is purely decorative (e.g., paired with a
   * visible wordmark), pass `aria-hidden="true"` via spread and omit this.
   * When the icon stands alone, pass a descriptive label.
   */
  "aria-label"?: string
  "aria-hidden"?: boolean | "true" | "false"
}

/**
 * AbacusIcon — the single brand-mark contract surface (FR-009).
 * Inline SVG, 20×20 viewBox, stroke-based frame + rods, filled beads.
 * Must remain recognizable at 16px (FR-002): all 3 rods + 6 beads always rendered.
 */
export function AbacusIcon({
  size = 20,
  className,
  accent = "primary",
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: AbacusIconProps) {
  // When no accessible label is provided, mark as decorative.
  const decorative = !ariaLabel
  const beadFill = accent === "primary" ? "hsl(var(--primary))" : "currentColor"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={ariaLabel}
      aria-hidden={decorative ? "true" : ariaHidden}
      role={ariaLabel ? "img" : undefined}
    >
      {/* Frame: rounded rectangle */}
      <rect
        x="2"
        y="3"
        width="16"
        height="14"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Rod 1 at y=7 */}
      <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1" />
      {/* Rod 2 at y=10 */}
      <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1" />
      {/* Rod 3 at y=13 */}
      <line x1="2" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="1" />
      {/* Beads: 2 per rod — positioned to suggest a number is being held */}
      {/* Rod 1 beads: cluster left, one right */}
      <circle cx="6" cy="7" r="1.2" fill={beadFill} />
      <circle cx="15" cy="7" r="1.2" fill={beadFill} />
      {/* Rod 2 beads: more even distribution */}
      <circle cx="7" cy="10" r="1.2" fill={beadFill} />
      <circle cx="12" cy="10" r="1.2" fill={beadFill} />
      {/* Rod 3 beads */}
      <circle cx="5" cy="13" r="1.2" fill={beadFill} />
      <circle cx="14" cy="13" r="1.2" fill={beadFill} />
    </svg>
  )
}
