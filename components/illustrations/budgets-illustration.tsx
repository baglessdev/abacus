type BudgetsIllustrationProps = {
  className?: string
}

/**
 * BudgetsIllustration — pie-slice + horizontal progress bar cluster.
 * ~120×120 viewBox. Partial pie/donut arc suggesting a spending slice,
 * plus 3 labeled progress bars below. Violet accent on the filled arc + bar fills.
 * Stroke-based monochrome with one violet primary accent (FR-027).
 * Static inline SVG; no animation; no third-party library (FR-039).
 * Decorative: aria-hidden="true" — the caller's EmptyState title provides the semantic label.
 */
export function BudgetsIllustration({ className }: BudgetsIllustrationProps) {
  // Donut arc: center (42,42), radius 28, stroke-based arc representing ~65% fill.
  // Arc from -90deg (top) clockwise ~234deg (65% of 360).
  // Using path with A command for the arc.
  // Start point: 42 + 28*cos(-90°) = 42, 42 + 28*sin(-90°) = 14  → (42, 14)
  // End point for 234° arc: angle = -90 + 234 = 144°
  //   x = 42 + 28*cos(144°) = 42 + 28*(-0.809) = 42 - 22.65 ≈ 19.35
  //   y = 42 + 28*sin(144°) = 42 + 28*(0.588) = 42 + 16.46 ≈ 58.46
  const cx = 42
  const cy = 42
  const r = 28

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
      {/* Donut background track */}
      <circle cx={cx} cy={cy} r={r} stroke="currentColor" strokeWidth="8" opacity="0.15" />
      {/* Donut filled arc — violet accent, ~65% fill */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="hsl(var(--primary))"
        strokeWidth="8"
        strokeDasharray={`${Math.round(2 * Math.PI * r * 0.65)} ${Math.round(2 * Math.PI * r)}`}
        strokeDashoffset={Math.round(2 * Math.PI * r * 0.25)}
        strokeLinecap="round"
      />

      {/* Progress bars — stacked below, right side of the illustration */}
      {/* Bar 1 — ~75% fill */}
      <rect
        x="80"
        y="20"
        width="32"
        height="6"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <rect x="80" y="20" width="24" height="6" rx="3" fill="hsl(var(--primary))" opacity="0.8" />

      {/* Bar 2 — ~50% fill */}
      <rect
        x="80"
        y="36"
        width="32"
        height="6"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <rect x="80" y="36" width="16" height="6" rx="3" fill="hsl(var(--primary))" opacity="0.6" />

      {/* Bar 3 — ~30% fill */}
      <rect
        x="80"
        y="52"
        width="32"
        height="6"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <rect x="80" y="52" width="10" height="6" rx="3" fill="hsl(var(--primary))" opacity="0.4" />

      {/* Small label lines next to bars */}
      <line x1="80" y1="31" x2="100" y2="31" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="80" y1="47" x2="92" y2="47" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="80" y1="63" x2="96" y2="63" stroke="currentColor" strokeWidth="1" opacity="0.3" />

      {/* Horizontal line separating sections */}
      <line
        x1="14"
        y1="86"
        x2="106"
        y2="86"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.3"
      />

      {/* Summary row */}
      <line
        x1="14"
        y1="100"
        x2="60"
        y2="100"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
        strokeLinecap="round"
      />
      <line
        x1="70"
        y1="100"
        x2="106"
        y2="100"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
