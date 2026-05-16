type TransactionsIllustrationProps = {
  className?: string
}

/**
 * TransactionsIllustration — two-direction arrows + horizontal line rows.
 * ~120×120 viewBox. Arrow pointing right (income/inflow) + arrow pointing left (expense/outflow)
 * with horizontal lines representing transaction rows. Violet accent on arrowheads.
 * Stroke-based monochrome with one violet primary accent (FR-027).
 * Static inline SVG; no animation; no third-party library (FR-039).
 * Decorative: aria-hidden="true" — the caller's EmptyState title provides the semantic label.
 */
export function TransactionsIllustration({ className }: TransactionsIllustrationProps) {
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
      {/* Arrow pointing right (inflow) — centered upper area */}
      <line
        x1="20"
        y1="38"
        x2="82"
        y2="38"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Arrowhead pointing right — violet accent */}
      <polyline
        points="70,28 82,38 70,48"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Arrow pointing left (outflow) — centered lower area */}
      <line
        x1="38"
        y1="62"
        x2="100"
        y2="62"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Arrowhead pointing left — violet accent */}
      <polyline
        points="50,52 38,62 50,72"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Horizontal lines representing transaction rows */}
      <line
        x1="16"
        y1="84"
        x2="104"
        y2="84"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.5"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="95"
        x2="80"
        y2="95"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="106"
        x2="92"
        y2="106"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
