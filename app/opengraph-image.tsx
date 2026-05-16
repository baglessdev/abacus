import { ImageResponse } from "next/og"

// Next.js opengraph-image convention — generates /opengraph-image.png
// Size: 1200x630 (standard OG / Twitter summary_large_image dimensions).
// Works for Slack, iMessage, and Twitter-style cards without cropping.
//
// Font note: next/font/google's Inter does NOT work inside ImageResponse — it's a
// different render context (Edge runtime, no page CSS). Fetching Inter from Google Fonts
// inside ImageResponse is complex and fragile (requires parsing CSS to extract woff2 URLs).
// Trade-off: ship with system-ui fallback for v1. The OG image brand mark + layout reads
// clearly; perfect Inter parity in the OG image is future polish.
// To upgrade: fetch Inter woff2 at handler run time and pass to ImageResponse({ fonts: [...] }).
//
// Runtime: Edge (recommended for ImageResponse perf)
export const runtime = "edge"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Abacus — Personal finance, finally clear"

// Violet primary hex value corresponding to --primary: 262 83% 58% in globals.css (light mode).
// If the brand palette changes, grep for BRAND_PRIMARY_HEX to find this file.
// hsl(262, 83%, 58%) → #7c3aed
const BRAND_PRIMARY_HEX = "#7c3aed"
// Frame/stroke color — dark slate/violet for legibility on the light background.
const FRAME_COLOR = "#3b1f7a"

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        // Violet gradient background: matches the brand accent palette
        background: "linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Abacus brand mark — large (~200px) */}
      <svg
        width="200"
        height="200"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Frame: rounded rectangle */}
        <rect
          x="2"
          y="3"
          width="16"
          height="14"
          rx="1.5"
          stroke={FRAME_COLOR}
          strokeWidth="1.5"
          fill="none"
        />
        {/* Rod 1 at y=7 */}
        <line x1="2" y1="7" x2="18" y2="7" stroke={FRAME_COLOR} strokeWidth="1" />
        {/* Rod 2 at y=10 */}
        <line x1="2" y1="10" x2="18" y2="10" stroke={FRAME_COLOR} strokeWidth="1" />
        {/* Rod 3 at y=13 */}
        <line x1="2" y1="13" x2="18" y2="13" stroke={FRAME_COLOR} strokeWidth="1" />
        {/* Beads: 2 per rod — violet primary accent */}
        {/* Rod 1 beads */}
        <circle cx="6" cy="7" r="1.2" fill={BRAND_PRIMARY_HEX} />
        <circle cx="15" cy="7" r="1.2" fill={BRAND_PRIMARY_HEX} />
        {/* Rod 2 beads */}
        <circle cx="7" cy="10" r="1.2" fill={BRAND_PRIMARY_HEX} />
        <circle cx="12" cy="10" r="1.2" fill={BRAND_PRIMARY_HEX} />
        {/* Rod 3 beads */}
        <circle cx="5" cy="13" r="1.2" fill={BRAND_PRIMARY_HEX} />
        <circle cx="14" cy="13" r="1.2" fill={BRAND_PRIMARY_HEX} />
      </svg>

      {/* Wordmark */}
      <div
        style={{
          fontSize: 80,
          fontWeight: 700,
          color: FRAME_COLOR,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        Abacus
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 32,
          fontWeight: 400,
          color: "#6d28d9",
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
        }}
      >
        Personal finance, finally clear
      </div>
    </div>,
    { ...size },
  )
}
