import { ImageResponse } from "next/og"

// Next.js apple-icon convention — generates /apple-icon.png
// Size: 180x180 (Apple home-screen + pinned-tab icon).
// iOS automatically rounds the corners; no need to round them here.
// Background: soft violet-tinted (#faf5ff) — Apple icons render best with a non-transparent
// background. The tinted background mirrors the OG image gradient start and echoes the brand.
// Runtime: Edge (recommended for ImageResponse perf)
export const runtime = "edge"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

// Violet primary hex value corresponding to --primary: 262 83% 58% in globals.css (light mode).
// If the brand palette changes, grep for BRAND_PRIMARY_HEX to find this file.
// hsl(262, 83%, 58%) → #7c3aed
const BRAND_PRIMARY_HEX = "#7c3aed"
// Frame/stroke color — dark slate that reads well on the light violet background.
const FRAME_COLOR = "#3b1f7a"
// Background: soft violet tint (matches OG image gradient start)
const BACKGROUND_COLOR = "#faf5ff"

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        background: BACKGROUND_COLOR,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="120"
        height="120"
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
    </div>,
    { ...size },
  )
}
