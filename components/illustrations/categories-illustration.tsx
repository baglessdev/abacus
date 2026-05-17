type CategoriesIllustrationProps = {
  className?: string
}

/**
 * CategoriesIllustration — stacked tag cluster glyph for the categories zero-state.
 * ~120×120 viewBox. Three overlapping rounded-rectangle "tag" shapes with a small
 * circle hole punch on each (classic price-tag shape), violet accent on the front tag.
 * Stroke-based monochrome with one violet primary accent.
 * Static inline SVG; no animation; no third-party library.
 * Decorative: aria-hidden="true" — the caller's EmptyState title provides the semantic label.
 */
export function CategoriesIllustration({ className }: CategoriesIllustrationProps) {
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
      {/* Back tag — furthest back, rotated slightly clockwise */}
      <g transform="rotate(15, 60, 60)">
        <rect
          x="30"
          y="38"
          width="56"
          height="36"
          rx="6"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
          opacity="0.35"
        />
        {/* Tag hole */}
        <circle
          cx="39"
          cy="56"
          r="4"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          opacity="0.35"
        />
        {/* Tag label lines */}
        <line
          x1="50"
          y1="50"
          x2="76"
          y2="50"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.25"
          strokeLinecap="round"
        />
        <line
          x1="50"
          y1="62"
          x2="68"
          y2="62"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.2"
          strokeLinecap="round"
        />
      </g>

      {/* Middle tag — slightly rotated counter-clockwise */}
      <g transform="rotate(-8, 60, 60)">
        <rect
          x="26"
          y="34"
          width="58"
          height="36"
          rx="6"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="hsl(var(--background))"
          opacity="0.8"
        />
        {/* Tag hole */}
        <circle
          cx="36"
          cy="52"
          r="4"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
        {/* Tag label lines */}
        <line
          x1="48"
          y1="46"
          x2="74"
          y2="46"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.35"
          strokeLinecap="round"
        />
        <line
          x1="48"
          y1="58"
          x2="66"
          y2="58"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.3"
          strokeLinecap="round"
        />
      </g>

      {/* Front tag — primary/accent, straight */}
      <rect
        x="22"
        y="38"
        width="62"
        height="38"
        rx="7"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        fill="none"
      />
      {/* Accent fill on tag header strip */}
      <rect x="22" y="38" width="62" height="14" rx="7" fill="hsl(var(--primary))" opacity="0.12" />
      {/* Tag hole — accent */}
      <circle cx="33" cy="57" r="4.5" stroke="hsl(var(--primary))" strokeWidth="2.5" fill="none" />
      {/* Tag label lines */}
      <line
        x1="46"
        y1="51"
        x2="76"
        y2="51"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.5"
        strokeLinecap="round"
      />
      <line
        x1="46"
        y1="63"
        x2="68"
        y2="63"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
        strokeLinecap="round"
      />

      {/* Small accent bead — top right of front tag */}
      <circle cx="76" cy="45" r="4.5" fill="hsl(var(--primary))" />

      {/* Hierarchy connector lines — suggest parent/child grouping below */}
      <line
        x1="42"
        y1="80"
        x2="42"
        y2="94"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
        strokeLinecap="round"
      />
      <line
        x1="42"
        y1="94"
        x2="58"
        y2="94"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.3"
        strokeLinecap="round"
      />
      <line
        x1="42"
        y1="94"
        x2="58"
        y2="100"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.2"
        strokeLinecap="round"
      />
      <rect
        x="58"
        y="90"
        width="36"
        height="8"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.3"
      />
      <rect
        x="58"
        y="96"
        width="30"
        height="8"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.2"
      />
    </svg>
  )
}
