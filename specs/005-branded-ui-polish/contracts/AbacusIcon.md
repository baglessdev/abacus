# UI Contract — `<AbacusIcon>`

The single brand-mark contract surface. Every place in the codebase that needs the Abacus mark renders this component (or, in the case of `app/icon.tsx` / `app/apple-icon.tsx` / `app/opengraph-image.tsx` where Tailwind classes don't reach, transcribes the same geometry inline). This is the structural enforcement of FR-009 — no parallel SVG file, no second brand-mark source.

## Location

`components/brand/abacus-icon.tsx`

## Signature

```ts
type AbacusIconProps = {
  /** Square dimension in pixels. Default 20 (header size). */
  size?: number
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
   * When the icon stands alone (e.g., the favicon's nominal alt context),
   * pass a descriptive label.
   */
  "aria-label"?: string
}

export function AbacusIcon(props: AbacusIconProps): JSX.Element
```

## Render contract

The component renders a single `<svg>` element containing:

- A **frame** — outer rectangle with rounded corners; stroke uses `currentColor`. The frame is two-sided (top + bottom rails) or four-sided (full rectangle) — implementer's choice, but the chosen geometry MUST be recognisable as an abacus frame at 16×16 px (FR-002).
- **Three rods** — short horizontal/vertical lines (orientation is implementer's choice but must be visually consistent with the chosen frame). Stroke uses `currentColor`.
- **Six beads** — two per rod, filled circles. Fill follows the `accent` prop: `"primary"` → `hsl(var(--primary))` (violet); `"currentColor"` → `currentColor`.

The component MUST NOT:

- Render any text (no wordmark inside the icon).
- Render any animation or transition.
- Make any network request (no `<image>` `href`, no font load).
- Apply any color other than `currentColor` and `--primary`. (No third color in the bead palette.)
- Vary geometry based on `size` — only the SVG `width`/`height` attributes change; the internal `viewBox` and path coordinates are fixed.
- Conditionally hide rods or beads at small sizes. The "minimum 2 rods + 4 beads visible at 16px" requirement (FR-002) is met by rendering all three rods and all six beads at every size; small sizes rely on the SVG's anti-aliased downscaling.

## Accessibility contract

- The root `<svg>` element accepts the `aria-label` prop and renders it as the SVG's accessible name when present.
- When `aria-label` is **not** provided, the component renders `aria-hidden="true"` on the SVG — the default for decorative usage paired with a visible wordmark.
- The SVG has no interactive elements; no `tabIndex`, no `role="button"`, no event handlers.
- Color is never the sole carrier of information — the mark's shape conveys "abacus" regardless of color rendering.
- Stroke widths are tuned for legibility at small sizes (the chosen stroke is approximately 1.5–2 px at the natural `viewBox` size, which means the favicon at 16×16 renders crisp strokes).

## Callers

### Current chore

| File | Usage |
|---|---|
| `components/shell/brand.tsx` | Header / sidebar brand area (replaces the `lucide Wallet`). Paired with the visible "Abacus" wordmark, so `aria-hidden` is appropriate. |
| `components/shell/shell-footer.tsx` | Authenticated-shell footer brand block. Paired with wordmark. |
| `components/marketing/marketing-header.tsx` | Marketing surface header. Paired with wordmark. |
| `components/marketing/marketing-footer.tsx` | Marketing surface footer (refreshed). Paired with wordmark. |
| `components/illustrations/abacus-illustration.tsx` | A re-export at larger size for the dashboard welcome panel. Pairs with the welcome panel's `<h1>`, so the SVG itself is `aria-hidden`. |
| `app/icon.tsx` | Favicon. Inline-style transcription of the same geometry (NOT a direct import, because `ImageResponse` does not honor Tailwind classes or React component CSS). |
| `app/apple-icon.tsx` | iOS pinned-tab / home-screen icon. Same transcription. |
| `app/opengraph-image.tsx` | Social-preview image. Same transcription, scaled up to ~200×200 inside the 1200×630 OG canvas. |

### Future (planned)

- Any future feature that needs the brand mark MUST import this component. No future feature may introduce a parallel SVG file. The "single contract surface" rule in FR-009 binds the codebase going forward.

## Applicable FRs

- **FR-001** — Custom Abacus brand mark depicting an abacus, replacing any generic icon. The component IS this brand mark.
- **FR-002** — Recognisable at favicon size: frame + ≥2 rods + ≥4 beads at 16 px. The render contract requires all 3 rods + 6 beads always; the geometry of the chosen frame is implementer's responsibility per the recognisability bar.
- **FR-003** — Favicon rendered from the same brand mark. Satisfied by `app/icon.tsx` transcribing the same geometry.
- **FR-004** — OG image using the brand mark. Satisfied by `app/opengraph-image.tsx` transcribing the same geometry.
- **FR-006** — Wordmark rendered alongside the brand mark in both the marketing header and the shell sidebar brand area. The component is the mark half of the lockup; the wordmark is rendered by the caller (`components/shell/brand.tsx`, `components/marketing/marketing-header.tsx`).
- **FR-009** — Single contract surface so visual drift across surfaces is structurally prevented. The component IS this single source of truth.
