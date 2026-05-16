type SettingsIllustrationProps = {
  className?: string
}

/**
 * SettingsIllustration — three horizontal slider tracks with knobs at different positions.
 * ~120×120 viewBox. Violet accent on the slider knobs.
 * Stroke-based monochrome with one violet primary accent (FR-027).
 * Static inline SVG; no animation; no third-party library (FR-039).
 * Decorative: aria-hidden="true" — the caller's EmptyState title provides the semantic label.
 */
export function SettingsIllustration({ className }: SettingsIllustrationProps) {
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
      {/* Slider 1 — knob at ~30% position */}
      {/* Track */}
      <line
        x1="14"
        y1="34"
        x2="106"
        y2="34"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Filled track portion (left of knob) */}
      <line
        x1="14"
        y1="34"
        x2="41"
        y2="34"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Knob */}
      <circle cx="41" cy="34" r="8" fill="hsl(var(--primary))" />
      <circle cx="41" cy="34" r="4" fill="hsl(var(--primary-foreground))" opacity="0.8" />

      {/* Slider 2 — knob at ~65% position */}
      {/* Track */}
      <line
        x1="14"
        y1="60"
        x2="106"
        y2="60"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Filled track portion */}
      <line
        x1="14"
        y1="60"
        x2="74"
        y2="60"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Knob */}
      <circle cx="74" cy="60" r="8" fill="hsl(var(--primary))" />
      <circle cx="74" cy="60" r="4" fill="hsl(var(--primary-foreground))" opacity="0.8" />

      {/* Slider 3 — knob at ~50% position */}
      {/* Track */}
      <line
        x1="14"
        y1="86"
        x2="106"
        y2="86"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Filled track portion */}
      <line
        x1="14"
        y1="86"
        x2="60"
        y2="86"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Knob */}
      <circle cx="60" cy="86" r="8" fill="hsl(var(--primary))" />
      <circle cx="60" cy="86" r="4" fill="hsl(var(--primary-foreground))" opacity="0.8" />
    </svg>
  )
}
