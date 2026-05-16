type AbacusIllustrationProps = {
  className?: string
}

/**
 * AbacusIllustration — large stylized abacus mark for the dashboard WelcomePanel.
 * ~120×120 viewBox, 4 rods, stroke-based monochrome with violet primary accent on beads.
 * Static inline SVG; no animation; no third-party library (FR-027 + FR-039).
 * Decorative: aria-hidden="true" — the caller's EmptyState title provides the semantic label.
 */
export function AbacusIllustration({ className }: AbacusIllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      width="120"
      height="120"
    >
      {/* Frame: rounded rectangle */}
      <rect
        x="10"
        y="18"
        width="100"
        height="84"
        rx="8"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      {/* Rod 1 at y=40 */}
      <line x1="10" y1="40" x2="110" y2="40" stroke="currentColor" strokeWidth="2.5" />
      {/* Rod 2 at y=57 */}
      <line x1="10" y1="57" x2="110" y2="57" stroke="currentColor" strokeWidth="2.5" />
      {/* Rod 3 at y=74 */}
      <line x1="10" y1="74" x2="110" y2="74" stroke="currentColor" strokeWidth="2.5" />
      {/* Rod 4 at y=91 */}
      <line x1="10" y1="91" x2="110" y2="91" stroke="currentColor" strokeWidth="2.5" />

      {/* Beads — filled with violet primary accent (FR-027) */}
      {/* Rod 1: 3 beads — cluster left, one right */}
      <circle cx="32" cy="40" r="7" fill="hsl(var(--primary))" />
      <circle cx="50" cy="40" r="7" fill="hsl(var(--primary))" />
      <circle cx="90" cy="40" r="7" fill="hsl(var(--primary))" />
      {/* Rod 2: 2 beads — more spread */}
      <circle cx="38" cy="57" r="7" fill="hsl(var(--primary))" />
      <circle cx="78" cy="57" r="7" fill="hsl(var(--primary))" />
      {/* Rod 3: 2 beads */}
      <circle cx="28" cy="74" r="7" fill="hsl(var(--primary))" />
      <circle cx="85" cy="74" r="7" fill="hsl(var(--primary))" />
      {/* Rod 4: 2 beads */}
      <circle cx="42" cy="91" r="7" fill="hsl(var(--primary))" />
      <circle cx="70" cy="91" r="7" fill="hsl(var(--primary))" />
    </svg>
  )
}
