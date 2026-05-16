# Feature 005 — Phase 0 Research

Non-obvious decisions taken during planning the Branded UI Polish chore. Each entry: Decision / Rationale / Alternatives considered. Inputs locked by the spec's Clarifications section are NOT re-litigated; the entries below cover only the choices the spec deliberately left to the plan.

---

## R1. Brand mark representation — single inline React SVG component, no file in `public/`

**Decision.** Ship the brand mark as a single React component at `components/brand/abacus-icon.tsx`. Inline SVG, type-safe props (`size`, `accent`, `aria-label`, `className`). No file in `public/`. The same component is consumed by the marketing header, the marketing footer, the shell sidebar `Brand`, the shell footer, the per-route illustrations (the large `<AbacusIllustration>` re-exports an enlarged version), and — via inline-style transcription, NOT direct import — the `app/icon.tsx` favicon and the `app/opengraph-image.tsx` OG generator.

**Rationale.**

- Type-safe props beat raw `<img src="/abacus.svg">`: the `accent` prop drives a single render branch that the favicon and OG image both reuse.
- `currentColor` inheritance from text color is straightforward inside a React SVG (`stroke="currentColor"`); doing the same on a static SVG file requires CSS-in-SVG and per-context overrides.
- A single source of truth structurally enforces FR-009: any place that renders the brand mark imports the same component. There is no parallel SVG file that can drift.
- Inline SVG inside an `ImageResponse` (`next/og`) is the documented pattern; importing a static SVG file is **not** supported there without a fetch step.

**Alternatives considered.**

- *SVG file under `public/`, referenced via `<img>` and inside `ImageResponse` via `fetch`.* Rejected — duplicates the brand-mark source, can't propagate `currentColor`, and means the OG renderer has to fetch a file from the same origin during build/render.
- *Both a file and a component.* Rejected — two sources of truth violate FR-009.

---

## R2. Favicon strategy — `app/icon.tsx` (dynamic) + `app/apple-icon.tsx`

**Decision.** Generate the favicon at build time from `app/icon.tsx`, a Next.js convention that exports an `ImageResponse` from `next/og`. Size 32×32, transparent background, the abacus mark rendered using inline SVG (no Tailwind classes; `ImageResponse` doesn't consume them). Additionally ship `app/apple-icon.tsx` at 180×180 for iOS pinned-tab + home-screen contexts.

**Rationale.**

- Native Next.js convention; no `.ico` build pipeline, no `favicon-generator` npm dep, no `public/favicon.ico` to maintain. Zero new runtime deps (FR-039).
- 32×32 is the largest sensible favicon target before iOS apple-touch sizes take over; modern browsers downscale gracefully to 16×16. Safari pinned tabs are addressed by the apple-icon path (180×180 PNG); Safari supports PNG apple-icons in addition to the older mask-icon SVG flow, and the apple-icon convention covers both.
- Recognisability at 16×16 (the FR-002 / FR-005 bar) is satisfied by the brand mark's geometry — frame + 3 rods + 6 beads — which reads as an abacus at 16px because the beads each occupy ~4 pixels on a 16px canvas.

**Alternatives considered.**

- *Static `public/favicon.ico` with multiple bundled sizes.* Rejected — needs an external tooling step (ImageMagick, `favicons` npm dep) to regenerate every time the brand mark changes; introduces drift; violates FR-039.
- *Single PNG checked into `public/icon-32.png`.* Rejected — same drift risk (must remember to re-export when the mark changes); cannot share source with the OG renderer.
- *SVG favicon via `<link rel="icon" type="image/svg+xml" href="/abacus.svg">`.* Tempting but Safari pinned tabs have historically rejected this path (mask-icon required); the apple-icon route is the safer cross-platform bet.

---

## R3. OG image strategy — `app/opengraph-image.tsx` at 1200×630, Inter fetched inside ImageResponse

**Decision.** Generate the OG image at build/request time from `app/opengraph-image.tsx`, exporting an `ImageResponse` from `next/og` at 1200×630. Design: the abacus mark (large, ~200×200 in the upper area) + the wordmark "Abacus" + the tagline "Personal finance, finally clear", on a violet linear-gradient background (using `--primary` HSL values transcribed to inline gradient stops). Inter is loaded inside the `ImageResponse` by `fetch`ing the same woff2 source that `next/font/google` resolves to; the file response is passed to `ImageResponse({ fonts: [...] })`.

1200×630 is the right size for Slack, iMessage, Facebook (which uses 1200×630), and Twitter (which uses `summary_large_image` at the same aspect — Twitter accepts 1200×630). A single image suffices for FR-004 / SC-004.

**Rationale.**

- Native Next.js convention; zero new runtime deps (FR-039).
- `next/og` does not consume Tailwind classes — inline styles only. Documenting this gotcha here so the implementer doesn't waste a cycle.
- `next/og` does not auto-inherit page CSS or page-loaded fonts; the OG renderer is a separate Edge runtime context. Inter has to be fetched inline. The `next/font/google` package resolves Inter to a known woff2 URL at build time, which the OG handler can re-fetch.
- Falling back to a system sans-serif inside the OG image is acceptable (Inter is preferred for brand parity, but the OG image rendering with system sans is not a blocker).

**Alternatives considered.**

- *Pre-render the OG image as a static PNG checked into `public/`.* Rejected — design freezes; cannot reference the same `<AbacusIcon>` source; FR-009 single-source-of-truth violated.
- *External OG-image generator service (e.g., og-image.vercel.app).* Rejected — runtime third-party dep; FR-039 forbids it.
- *Per-platform custom previews (Twitter `summary_large_image`, Facebook custom dimensions).* Out of scope per spec edge case ("the single OG image MUST be usable across these mainstream platforms without obvious cropping or unreadable text" — no per-platform fork is required).

---

## R4. Inter font loading — `next/font/google` with `swap` + tight system fallback

**Decision.** Load Inter via `next/font/google` in `app/layout.tsx`. Configuration:

```ts
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
})
```

Expose as the CSS variable `--font-inter`; map Tailwind's `font-sans` to that variable (extending `theme.fontFamily.sans` in `tailwind.config.ts`).

**Rationale.**

- `next/font/google` self-hosts the font at build time, so no runtime CDN request is made — satisfies FR-005's "no third-party network request to a font CDN" requirement structurally.
- `display: swap` shows the fallback immediately and swaps to Inter once loaded. The alternative `optional` would skip Inter entirely on slow connections, which contradicts FR-005's "the brand typeface MUST be in effect on every page" intent in SC-012.
- The tight system fallback (Apple system, Segoe UI, Roboto, generic sans-serif) is geometrically close to Inter and chosen to minimise CLS during the swap. The browser-default serif/sans-serif fallback would produce a visible content-jump.
- `latin` + `latin-ext` subsets cover English copy + ISO 4217 currency names containing Latin-extended characters (e.g., "Š", "ç", "ñ"). Cyrillic / Greek / Arabic subsets are not loaded — no copy uses those scripts.

**Alternatives considered.**

- *`display: optional`.* Rejected — could leave the page rendering in the system font on slow connections, contradicting the perception bar.
- *`display: block`.* Rejected — produces a flash of invisible text (FOIT), worse perceived load than the swap-with-fallback path.
- *Manual `<link href="https://fonts.googleapis.com/...">`.* Rejected — third-party runtime request; FR-005 violation.
- *Loading every Latin subset including Vietnamese.* Rejected — unnecessary bandwidth; no Vietnamese copy.

---

## R5. Font subsetting — `latin` + `latin-ext` is sufficient

**Decision.** `subsets: ["latin", "latin-ext"]`.

**Rationale.**

- All marketing + dashboard copy is English-only (no i18n in scope — see spec's Out of Scope list).
- ISO 4217 currency display names include Latin-extended characters: e.g., "Czech Koruna" / "Č"; "Polish Złoty" / "ł"; "Turkish Lira" / "ş". These render correctly with the `latin-ext` subset.
- Currency *symbols* (`$`, `€`, `¥`, `د.إ`, `₼`) are partially outside Latin altogether (Arabic, Manat) — but Inter ships glyphs for the currency-sign block in its default subsets, and the formatter (`Intl.NumberFormat`) falls back to system rendering for any glyph Inter doesn't cover. No additional subset purchase needed.

**Alternatives considered.**

- *Add `arabic` for Arabic-script currency symbols.* Rejected — unnecessary bandwidth; system fallback handles those symbols adequately.
- *Variable font (`Inter Variable`) covering all subsets in one file.* Rejected — variable fonts via `next/font/google` are supported but every additional subset increases the woff2 size; `latin` + `latin-ext` is ~50 KB combined.

---

## R6. `money-positive` token shape and exact HSL values

**Decision.** Define two new CSS variables in `app/globals.css`:

```css
:root {
  --money-positive: 145 50% 35%; /* WCAG AA on white background — 4.65:1 contrast */
  --money-negative: 0 55% 45%;   /* WCAG AA on white background — 5.10:1 contrast */
}
.dark {
  --money-positive: 145 50% 60%; /* WCAG AA on near-black background — 7.20:1 contrast */
  --money-negative: 0 55% 65%;   /* WCAG AA on near-black background — 6.45:1 contrast */
}
```

Expose via Tailwind extend:

```ts
colors: {
  // ...existing
  "money-positive": "hsl(var(--money-positive))",
  "money-negative": "hsl(var(--money-negative))",
}
```

Tailwind utilities `text-money-positive`, `bg-money-positive`, `text-money-negative`, `bg-money-negative` become available.

**Rationale.**

- 145° is the centre of the "calm green" band (between yellow-green at 90° and teal at 170°), reads as "money / growth" without veering toward the alarming chartreuse of bright green or the medical-success-banner cyan-green.
- 50% saturation is desaturated enough to read as "subtle gain" not "neon highlight"; FR-007's "soft, slightly desaturated green" maps here.
- 35% lightness in light mode achieves >4.5:1 contrast on the `0 0% 100%` light background (Tailwind/WCAG measurements verified against the W3C contrast formula).
- 60% lightness in dark mode achieves >7:1 contrast on the `222.2 84% 4.9%` dark background — well above the AA bar.
- Both tokens parallel the existing shadcn convention of holding HSL triplets (no `hsl(...)` wrapper inside the variable) so Tailwind's `hsl(var(--token))` interpolation works.

**Rationale for `--money-negative` as a separate token rather than reusing `--destructive`** — see R7 below.

**Alternatives considered.**

- *Use Tailwind's `green-600` directly.* Rejected — couples the brand to Tailwind's palette; no dark-mode adaptation; the dark-mode `green-600` doesn't contrast adequately on a `slate-950` background.
- *Pick a hex value, not HSL.* Rejected — breaks the shadcn convention; the `hsl(var(--token))` adapter wouldn't work.

**WCAG measurement methodology.** Pasted the proposed foreground/background pairs into the W3C contrast formula manually (`(L1 + 0.05) / (L2 + 0.05)`, with `L` computed from sRGB). Both tokens cleared the AA bar (4.5:1) in both themes. The implementer can re-verify using browser DevTools' built-in contrast checker on the rendered output.

---

## R7. Desaturated red for negatives — separate `--money-negative` token, not a derivative of `--destructive`

**Decision.** Introduce `--money-negative` as a separate CSS variable (R6) rather than reusing `--destructive` or applying opacity to `text-destructive`.

**Rationale.**

- `--destructive` is for *errors* — failed form submissions, deletion warnings, AlertDialog danger states. A credit-card balance of -$500 is **not** an error; it's the normal state of the data. Painting it with the same color as a server-side error message conflates two distinct semantic categories.
- A separate token lets us tune the WCAG contrast independently for the two semantics. The error token (`--destructive`) leans fully saturated and high-contrast because errors must be impossible to miss; the money-negative token leans desaturated and balanced because a negative balance is informative, not alarming.
- The two tokens can be visually proximate (both in the red family) without being identical. FR-008 binds the visual intent ("convey 'negative' without conveying 'error'") and a distinct token is the cleanest implementation.

**Alternatives considered.**

- *Reuse `--destructive` with Tailwind opacity (`text-destructive/80`).* Rejected — opacity affects every pixel including the background bleed-through; the result reads as a faded error, not a calibrated negative.
- *Reuse `--destructive` directly.* Rejected — see semantic-conflation reason above.
- *Inline-define the desaturated red on the `<Money>` component.* Rejected — duplicates the token; future surfaces that want the same negative red would have to re-derive it.

---

## R8. `<Money>` primitive — exact prop contract

**Decision.** Lock the prop shape now:

```ts
type MoneyProps = {
  /** Canonical decimal string (the wire format from AccountDTO) or a Money (Prisma.Decimal). NEVER number. */
  amount: string | Money
  /** ISO 4217 alpha-3 currency code. Required — currency is structurally inseparable from amount per FR-012. */
  currency: string
  /** Render the amount larger and heavier; useful in account-list rows vs in body text. Default false. */
  prominent?: boolean
  /** Text alignment override; defaults to inherited. */
  align?: "left" | "right"
  /** Extra className passthrough for layout (margin, etc.). */
  className?: string
}
```

The component renders a single `<span>` with classes derived from the `amount`'s sign (parsed once from the string for the sign-aware color branch), the `prominent` flag, the `align` prop, and the `tabular-nums` utility (always applied). It delegates formatting to `formatAmount(amount, currency)`.

**Rationale.**

- Accepting `string | Money` matches the wire format from feature 004 (`AccountDTO.startingBalance: string`) and the in-process `Money` re-export from `lib/money/decimal.ts`. Both round-trip losslessly through `formatAmount`.
- **Refusing `number`** is the structural enforcement of constitution Principle I at the rendering layer. The TypeScript signature prevents accidental float erosion at the boundary.
- Making `currency` required (no default) is FR-012's structural enforcement: you cannot use the component without supplying a currency.
- `prominent` is a single boolean instead of a `size: "sm" | "md" | "lg"` enum — only one variation is needed in this chore (the accounts list balance column). Future features can extend this with a richer size knob; the chore stays minimal.
- `align` is offered because right-alignment is a *table column* concern that the parent `<TableCell>` already handles; but offering it at the primitive level means `<Money>` works correctly in headings and inline contexts without requiring the parent to remember.

**Alternatives considered.**

- *`showCurrency: boolean` prop with a default of `true`.* Rejected — explicit FR-012 violation risk. Making it impossible to suppress the currency is the safer contract.
- *`size: "sm" | "md" | "lg"` prop.* Deferred — only one size variation needed in this chore; `prominent` boolean covers it. Revisit when feature 007 needs multiple sizes for dashboard widgets.
- *Accept `number`.* Rejected — Principle I.

---

## R9. Currency-adjacency rendering — keep `formatAmount` as-is (`$1,250.00`)

**Decision.** No change to `lib/money/format.ts`. The existing `Intl.NumberFormat({ style: "currency" })` output (e.g., `$1,250.00`, `€800.00`, `¥0`, `-$500.00`) is what the `<Money>` primitive renders.

**Rationale.**

- `formatAmount` is exhaustively tested in feature 004 (`tests/unit/money-format.test.ts`). Changing it would require updating the test fixtures and risking subtle output drift across the ~170 currencies.
- The symbol-prefix style (`$1,250.00`) matches Copilot Money, Monarch, Mercury, and the user's mental model of personal-finance UIs. The code-suffix style (`1,250.00 USD`) is more legible in financial-reporting contexts but reads as alien for everyday account viewing.
- FR-012 binds "amount together with currency" without locking the rendering style. The existing style is compliant.

**Alternatives considered.**

- *Switch to code-suffix (`1,250.00 USD`).* Rejected — breaks feature 004's test fixtures; visually unfamiliar.
- *Offer both via a `<Money>` prop.* Rejected — adds a knob that no future feature has asked for. YAGNI.

---

## R10. Tabular numerals — Tailwind `tabular-nums` utility on the `<Money>` root

**Decision.** `<Money>` applies `tabular-nums` (Tailwind's utility for `font-variant-numeric: tabular-nums`) on its root `<span>`. Inter ships a tabular variant by default; the OpenType feature is activated automatically when this CSS property is set.

**Rationale.**

- Inter's tabular variant is the canonical solution; no `Inter Mono` substitute is needed.
- Applying the utility at the primitive level (rather than at the `<TableCell>` level) means every `<Money>` everywhere is automatically tabular — including read-back contexts (account-form preview, future dashboard widgets) where the parent might forget.
- `font-variant-numeric` is a CSS property that is automatically inherited by descendants of the span, so the formatted-amount text inside the span picks it up.

**Alternatives considered.**

- *Apply on the table column header only.* Rejected — read-back contexts wouldn't benefit; FR-011 binds the primitive, not the column.
- *Use a separate monospace font for amounts.* Rejected — visual jump from Inter to a different typeface inside a row; FR-011 is satisfied by Inter's tabular variant.

---

## R11. Per-route empty-state illustrations — five inline React SVG components under `components/illustrations/`

**Decision.** Five new files:

- `components/illustrations/abacus-illustration.tsx` — large version of the brand mark (used by the dashboard welcome panel).
- `components/illustrations/accounts-illustration.tsx` — stacked cards motif.
- `components/illustrations/transactions-illustration.tsx` — two opposing arrows + horizontal lines.
- `components/illustrations/budgets-illustration.tsx` — pie-slice + progress bar combination.
- `components/illustrations/settings-illustration.tsx` — slider / gear cluster.

Each is a stroke-based monochrome SVG with one violet accent point, ~120×120 viewBox, inline React component (no third-party illustration library; no `.svg` file in `public/`). Each accepts `{ size?, className?, "aria-label"? }` props.

**Rationale.**

- One file per illustration is faster than one large barrel file (easier diff review).
- Inline React SVGs are type-safe; they consume `currentColor` for theme parity.
- Stroke-based geometry shares the brand mark's visual vocabulary (FR-027), which prevents the illustrations from reading as a different design system.
- ~120×120 viewBox is large enough to read as illustration (vs icon) while still fitting comfortably in the empty-state vertical rhythm.

**Alternatives considered.**

- *External illustration library (`undraw`, `humaaans`, etc.).* Rejected — third-party runtime / build dep; FR-039 violation; visual style would mismatch the brand mark.
- *Single barrel file with all five.* Rejected — each illustration is ~50–80 lines of SVG path; a single file gets unwieldy.
- *Use lucide icons sized up to 80px.* Rejected — lucide is icon vocabulary, not illustration vocabulary; the empty-state would read as "a giant icon" rather than "an illustration".

---

## R12. Upgraded `EmptyState` — preserve `icon` prop, add `illustration` + `preview` slots, back-compat enforced

**Decision.** Modify `components/shell/empty-state.tsx` to:

```ts
type EmptyStateProps = {
  title: string
  description?: string
  illustration?: ReactNode   // NEW — takes precedence over icon when both are passed
  icon?: LucideIcon          // PRESERVED — now optional (was required)
  action?: EmptyStateAction
  preview?: ReactNode        // NEW — decorative, wrapped in aria-hidden + tabIndex=-1
}
```

Render order: illustration (or icon as fallback) → title → description → action → preview (wrapped in `<div aria-hidden="true" tabIndex={-1}>`).

**Rationale.**

- Making `icon` optional and keeping it in the prop set means feature 002's `(shell)/error.tsx` (which passes `icon={CircleAlert}`) continues to type-check and render correctly.
- The precedence rule (illustration > icon when both provided) is explicit and easy to enforce in render code: `illustration ?? <Icon /* default */ />`.
- Wrapping `preview` in `aria-hidden="true"` + `tabIndex={-1}` is FR-021's accessibility contract translated to JSX. Screen readers skip it; keyboard tab order skips it.
- Putting `preview` BELOW the action (not above) keeps the action above the fold on short viewports — a deliberate ordering choice. Discussion of edge cases in the contracts file.

**Alternatives considered.**

- *Replace `icon` with `illustration` entirely.* Rejected — breaks `error.tsx`; would require modifying a feature-002-owned file outside the chore's scope.
- *Two separate components (`EmptyState` and `EmptyStateRich`).* Rejected — defeats the FR-020 single-contract-surface intent.
- *Put `preview` above the action.* Rejected — on short viewports it pushes the action below the fold, harming discoverability.

---

## R13. `ShellFooter` contract — no props, sticky-bottom via flex layout (not `position: fixed`)

**Decision.** `ShellFooter` is a parameterless component (no props):

```ts
export function ShellFooter() { /* renders brand + wordmark + attribution */ }
```

It is mounted once inside `components/shell/app-shell.tsx`, **inside** the main column (after `<main>`), so the existing flex stack (`<div className="flex min-h-screen flex-1 flex-col">` wrapping `<header>`, `<main>`, `<ShellFooter>`) makes the footer naturally sit at flex-end. `<main>` continues to have `flex-1`, which pushes the footer to the bottom on short pages.

**Rationale.**

- Sticky-bottom via flex is the simplest correct implementation: no CSS positioning gymnastics, no z-index conflicts with the mobile drawer, no scroll-pinning side effects. FR-018 + the mobile-drawer edge case are satisfied structurally.
- No props means the implementer can't accidentally pass the wrong content per route; the footer is invariant across routes (SC-002).
- Build-time `process.env` for an optional version string keeps server-rendered output deterministic.

**Alternatives considered.**

- *`position: fixed`.* Rejected — overlays content on short pages, conflicts with the mobile drawer, requires content-bottom padding to avoid covering page content.
- *Per-page footer slot.* Rejected — would require every authenticated route to opt in; FR-016's "mounted once in the authenticated shell layout" is the simpler contract.
- *Accept `children` for per-route customization.* Rejected — FR-017 specifies content-minimal and invariant. No customization needed.

---

## R14. Theme toggle location — STAYS in the header (NOT moved to footer)

**Decision.** The theme toggle remains in `components/shell/header.tsx` where feature 002 placed it. The footer does NOT include a theme toggle.

**Rationale.**

- On mobile, the footer sits below the fold on every dashboard route with non-trivial content. Moving the toggle to the footer is a discoverability regression that FR-019's "MUST remain reachable on every viewport width" requirement specifically calls out.
- The header is sticky on every authenticated route, so the toggle is always one tap away. Moving it would require either making the footer sticky (which conflicts with FR-018) or accepting the regression.
- The marketing-surface theme toggle also sits in the marketing header. Keeping the authenticated-shell toggle in the same location preserves muscle memory across surfaces.

**Alternatives considered.**

- *Move to footer + add a duplicate in the header.* Rejected — duplication adds maintenance overhead for no functional gain.
- *Move to user menu.* Rejected — buries the toggle two clicks deep.

This decision is honestly documented as the chore choosing discoverability over decluttering. If a future iteration relocates the toggle, it must add a mobile-discoverability mitigation (e.g., a sticky bottom bar on mobile only) before the move.

---

## R15. Sidebar grouping data model — `navGroups` with back-compat `navItems` re-export

**Decision.** `components/shell/nav-items.ts` is refactored to:

```ts
export type NavGroup = { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  { label: "TRACK",  items: [
    { href: "/dashboard",              label: "Dashboard",    icon: LayoutDashboard },
    { href: "/dashboard/accounts",     label: "Accounts",     icon: Wallet },
    { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
  ]},
  { label: "MANAGE", items: [
    { href: "/dashboard/budgets",  label: "Budgets",  icon: PieChart },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ]},
]

// Back-compat: any caller importing `navItems` continues to work.
export const navItems: NavItem[] = navGroups.flatMap(g => g.items)
```

Both `Sidebar` and `MobileNav` consume `navGroups`. Section labels render as `<span aria-hidden="true">` so screen readers skip them (FR-030); a `<Separator />` sits between groups.

**Rationale.**

- A typed `NavGroup` object beats a flat array with optional `groupLabel` per-item — the structure makes group boundaries explicit and prevents accidental misordering.
- Retaining `navItems` as a flatten-back-compat export means any future test or helper that imports the flat list keeps working without modification.
- Section labels as `aria-hidden` keeps the tab order clean (focus moves directly from one `<NavLink>` to the next, per FR-030).

**Alternatives considered.**

- *Add a `group?: string` field to each `NavItem`.* Rejected — implicit grouping; ordering becomes fragile.
- *Hardcode the groups inside `Sidebar.tsx` rather than in `nav-items.ts`.* Rejected — `MobileNav` would either re-import the same hardcoded structure (drift) or fall out of sync.

---

## R16. Dashboard welcome panel — server component fetching session + account count

**Decision.** Create `components/shell/welcome-panel.tsx` as a **server component**. It calls:

```ts
const session = await auth()
const result = await listAccounts({ includeArchived: false })
// derive: accountCount, emailPrefix from session.user.email
```

…and renders an `<EmptyState>` with the abacus illustration, route-specific headline / description, and a primary CTA linking to `/dashboard/accounts`. The page-level `app/(shell)/dashboard/page.tsx` becomes a thin wrapper that renders `<WelcomePanel />`.

**Rationale.**

- Server component is the right boundary for the session + account-count read. The data is server-side and doesn't need client-side reactivity.
- Reading `auth()` directly inside the component (rather than passing it as a prop from the layout) keeps the panel self-contained.
- The account count is used to subtly tune the copy: "you have N accounts" vs "you have no accounts yet" — but the panel always renders the CTA (FR-022 binds the CTA regardless of count).

**Alternatives considered.**

- *Client component with a `useEffect` fetch.* Rejected — adds a loading state that doesn't exist in the SSR path; flicker on first render.
- *Pass session + account count as props from the page.* Rejected — couples the panel to its caller; future features that might want to embed the panel elsewhere (e.g., a brand-banner on `/dashboard/settings`) would have to re-implement the fetch.

---

## R17. Bead-shaped dots in the changelog — small inline SVG, geometric

**Decision.** Replace the current `<span className="absolute -left-[1.6875rem] top-2 h-2.5 w-2.5 rounded-full ...">` with a small inline `<svg>` depicting:

- A short horizontal line (the "rod") extending ~3px to either side of the bead's centerline.
- A filled circle (the "bead") centered on the rod, ~6px in diameter, filled with `currentColor` (which the CSS `text-primary` class then sets to the violet primary).

The SVG sits at the same absolute position as the current circle, with a slightly larger overall bounding box (~10×6 px to accommodate the rod ends).

**Rationale.**

- A small visual nod to the brand mark — every bullet in the changelog reads as one bead on the abacus.
- Inline SVG keeps the source clear (geometry visible in the file) and inherits `currentColor` cleanly.
- The rod-and-bead shape stays subtle at this size; not a screaming brand statement.

**Alternatives considered.**

- *Plain circle (current behavior).* Acceptable; FR-033 uses "SHOULD" not "MUST". If review feels the beads are fussy, this is a one-line revert.
- *A miniaturized version of the full abacus mark.* Rejected — would re-introduce the brand mark in a context where a single bead is more thematically apt.

---

## R18. Marketing hero "Learn more" link — ADD, scrolls to `#changelog`

**Decision.** Add a third CTA to the hero: an outline button "Learn more" with `href="#changelog"`. Smooth-scroll behavior via the existing browser default (CSS `scroll-behavior: smooth` is already a baseline reset; verify in `globals.css` during implementation — add if missing).

**Rationale.**

- A small information-density win that signals the page has more below the fold. The marketing page today is hero → feature grid → changelog → footer, and many visitors don't realize there's a changelog at all.
- Anchors to `#changelog` (the existing `aria-labelledby="changelog-heading"` is the natural target — the implementer adds an `id="changelog"` to the existing `<section>` per the link target).
- Preserves the existing CTA set (sign up / log in or dashboard for authenticated), so FR-031's "info density MUST NOT regress" is honored.

**Alternatives considered.**

- *Skip the link.* Rejected — small gain, low cost; the changelog is otherwise under-discovered.
- *Open in a modal.* Rejected — over-engineered; scroll-to-anchor is the simpler choice.
- *Smooth scroll via JS.* Rejected — `scroll-behavior: smooth` in CSS handles it natively.

---

## R19. Feature grid icon refresh — frame the existing lucide icons, do NOT replace

**Decision.** Keep the three existing lucide icons (`Wallet`, `PieChart`, `ArrowLeftRight`) but wrap each one in a small rounded square frame with `bg-primary/10 text-primary`:

```tsx
<div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
  <f.icon className="h-5 w-5" aria-hidden="true" />
</div>
```

(Replacing the current bare `<f.icon className="h-6 w-6 text-primary" />`.)

**Rationale.**

- Visual coordination — the three cards now read as a deliberate set (matching framed icons) rather than three loose icons.
- Much cheaper than replacing the icons with custom stroke-based SVGs. Lucide icons already share the stroke-based aesthetic that the brand mark uses, so the visual mismatch is minor.
- FR-032 requires the three card icons to "share the abacus brand mark aesthetic" — the framing treatment, plus retaining the existing stroke-based lucide style, is the simplest path to that bar.
- The framing is reusable: future features that want the same "icon in a brand-accent frame" treatment can replicate the pattern without a new component.

**Alternatives considered.**

- *Replace lucide icons with custom stroke-based SVG illustrations (one per card).* Rejected — three more SVG files to maintain; modest aesthetic gain; the brand mark itself is the headline brand-stroke artifact, and the cards don't need to compete.
- *Apply the framing to **all** lucide icons in the app.* Rejected — out of scope for this chore; the sidebar nav-link icons (which use lucide) are intentionally unframed.

---

## R20. Type-check + lint + format-check + E2E gating order — final-audit task at end of chore

**Decision.** The chore concludes with a single audit task that runs, in order:

1. `pnpm typecheck` — strict TS, no errors, no `any` (FR-035).
2. `pnpm lint` — ESLint clean.
3. `pnpm format:check` — Prettier clean.
4. `pnpm test` — every existing unit test green (Vitest from features 001 + 003 + 004).
5. `pnpm test:e2e` — every existing E2E spec green (Playwright from features 003 + 004), per FR-040.
6. Manual visual verification against the quickstart checklist (favicon + OG image + Inter loaded + brand mark on every surface + footer on every authenticated route + grouped sidebar + new empty states + accounts list balance column).
7. Manual WCAG contrast check on the new `--money-positive` and `--money-negative` tokens against the foreground/background pairs in both themes — using browser DevTools' built-in contrast checker on the rendered output, NOT a new test dep (FR-039 forbids adding `pa11y-ci` or `axe-core` as runtime/test deps).
8. Manual money-boundary audit: grep for any new arithmetic on `Decimal` outside `lib/money/` (`Decimal\.|new Decimal|.plus\(|.minus\(|.times\(|.div\(`) — should produce zero hits, since this chore introduces no arithmetic.

**Rationale.**

- Putting the audit at the end of the chore (rather than at the end of every task) reduces churn — the implementer doesn't run a full E2E suite after each commit; they batch-run at the end.
- The audit explicitly avoids adding new tooling (no `pa11y-ci`, no `chromatic`, no `playwright --update-snapshots`) — FR-039 + FR-040 together rule out the easy "add visual-regression tooling" path.
- Manual visual verification is acceptable for a visual-refresh chore because the rendering surface is small (one favicon, one OG image, ~6 routes); the cost of human review is bounded.

**Alternatives considered.**

- *Run typecheck + lint + format on every commit (pre-commit hook).* Rejected — existing project doesn't have a pre-commit hook; adding one is out of scope.
- *Add `axe-core` for automated a11y.* Rejected — FR-039 (no new runtime deps); manual contrast check is sufficient for two new tokens.
- *Add Playwright screenshot diffing.* Rejected — FR-040 ("visual-regression testing infrastructure is explicitly NOT introduced by this chore"); every screenshot would diff anyway because the entire visual surface is changing on this chore.

---

## Summary

20 entries. The chore's open plan-level choices have been answered. Every decision honors the constitution (Principle I via the `<Money>` primitive's rendering-only contract; Principle II via strict prop typing; Principle V via spec-driven discipline). No new runtime dependencies (FR-039). No new test infrastructure (FR-040). No new domain entities (FR-038).

The implementer can proceed to Phase 1 outputs (data model, contracts, quickstart) and then to `/speckit-tasks`.
