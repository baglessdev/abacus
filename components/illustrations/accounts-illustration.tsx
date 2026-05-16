type AccountsIllustrationProps = {
  className?: string
}

/**
 * AccountsIllustration — stacked-cards glyph for the accounts zero-state.
 * ~120×120 viewBox, 3 overlapping rounded rectangles (cards), violet accent on top card.
 * Stroke-based monochrome with one violet primary accent (FR-027).
 * Static inline SVG; no animation; no third-party library (FR-039).
 * Decorative: aria-hidden="true" — the caller's EmptyState title provides the semantic label.
 */
export function AccountsIllustration({ className }: AccountsIllustrationProps) {
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
      {/* Bottom card — furthest back, slightly offset */}
      <rect
        x="18"
        y="38"
        width="78"
        height="52"
        rx="8"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      {/* Middle card */}
      <rect
        x="12"
        y="30"
        width="78"
        height="52"
        rx="8"
        stroke="currentColor"
        strokeWidth="3"
        fill="hsl(var(--background))"
      />
      {/* Top card — accent stripe + small abacus mark suggestion */}
      <rect
        x="6"
        y="22"
        width="78"
        height="52"
        rx="8"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        fill="none"
      />
      {/* Accent stripe on top card */}
      <rect x="6" y="22" width="78" height="16" rx="8" fill="hsl(var(--primary))" opacity="0.15" />
      {/* Small horizontal lines on top card (representing data rows) */}
      <line x1="18" y1="52" x2="72" y2="52" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <line x1="18" y1="62" x2="58" y2="62" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      {/* Small bead accent on top right of top card */}
      <circle cx="72" cy="32" r="5" fill="hsl(var(--primary))" />
    </svg>
  )
}
