# Implementation Plan: Branded UI Polish

**Branch**: `branded-ui-polish` (chore) | **Date**: 2026-05-17 | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0

## Summary

A coordinated visual-identity pass that replaces the generic shadcn appearance across the marketing surface, the authenticated shell, the accounts list, and every empty state with a distinct Abacus identity. The work introduces five new UI contract surfaces (`AbacusIcon`, `Money`, `ShellFooter`, an upgraded `EmptyState`, and five per-route illustration components), self-hosts the Inter typeface via `next/font/google`, generates the favicon via `app/icon.tsx` and the Open Graph image via `app/opengraph-image.tsx` (both native Next.js conventions), adds a `money-positive` accent CSS token (reserved — NOT applied by the rendering primitive in this chore), regroups the sidebar nav into TRACK / MANAGE sections, replaces the stale `/dashboard` placeholder with a welcome panel, and migrates the accounts-list balance column to right-aligned tabular numerals through the new `<Money>` primitive. **No domain model, no Prisma migration, no new runtime dependency, no new API surface.** Every existing Playwright E2E from features 001–004 must continue to pass; no visual-regression infrastructure is introduced.

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19.2, Node 20.x |
| **Framework** | Next.js 16.2 (App Router) — unchanged |
| **Storage** | PostgreSQL 16 — unchanged; **no schema change in this chore** (FR-038) |
| **ORM** | Prisma 7 — unchanged |
| **Auth** | Auth.js v5 — unchanged |
| **Money** | `Prisma.Decimal` + `lib/money/format.ts` (from feature 004) — UNCHANGED. The new `<Money>` primitive **consumes** `formatAmount`; it does not reimplement formatting. |
| **UI primitives in use** | Existing shadcn set from features 002+004 (`button`, `card`, `input`, `label`, `alert`, `dropdown-menu`, `sheet`, `command`, `popover`, `switch`, `alert-dialog`, `table`, `badge`, `separator`, `scroll-area`) — no new shadcn primitives added |
| **New runtime deps** | **Zero.** Inter loads via `next/font/google` (built-in); OG image via `next/og` (built-in, transitive); favicon via `app/icon.tsx` convention (built-in). FR-039 binds this. |
| **Validation** | No new Zod boundaries (this chore is rendering-only). FR-035 (no `any`) still applies to all new TS. |
| **Testing** | All existing Vitest + Playwright suites preserved unchanged (FR-040). No new unit tests; no new E2E specs. No visual-regression tooling introduced. |
| **Target platform** | Local dev + the existing Vercel deployment surface; no new infra. |
| **Performance** | FR-005 perception bar: no obvious flash of unstyled-then-styled content on first paint. Inter loaded with `font-display: swap` and a tight system fallback. |
| **Constraints** | Constitution Principle I binds the `<Money>` primitive: never round, always show currency. FR-040 binds behavioral parity (every existing E2E green). |
| **Scope** | Five routes inside the shell (`/dashboard`, `/dashboard/{accounts,transactions,budgets,settings}`), the marketing surface (`/`), the favicon (`/icon.png`), the OG image (`/opengraph-image.png`). |

## Constitution Check

*Evaluated against `.specify/memory/constitution.md` v0.2.0. Re-evaluated after Phase 1 design (see end of doc).*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | YES (display-side only) | PASS | The new `<Money>` primitive does **no arithmetic**. It accepts a canonical decimal string (the wire format from `AccountDTO.startingBalance` per feature 004 R2) and a currency code, and delegates formatting to the existing `lib/money/format.ts`. FR-012 + FR-013 + FR-036 codify this. Currency is rendered alongside every amount, in 100% of states — the primitive's contract makes "render amount without currency" structurally impossible. `lib/money/format.ts` is **unchanged**. |
| **II — Type safety end-to-end** | YES | PASS | FR-035 binds strict TS / no `any`. All new components ship typed prop signatures; the per-route illustration components are typed inline React SVGs; the upgraded `EmptyState` preserves its existing prop typing and adds two new optional `ReactNode` slots. |
| **III — Validate at boundaries, trust internally** | NO | N/A | This chore introduces no new server actions, no new API routes, and no new Zod schemas. The existing boundaries from features 003 and 004 are unchanged. |
| **IV — Test the money paths** | YES (preservation) | PASS | The constitution-mandated money-correctness unit suite from feature 004 (four files under `tests/unit/money-*.test.ts`) is preserved verbatim — none of those tests depend on UI rendering. The constitution-mandated E2E coverage from features 001–003 (signup → login → logout) and from feature 004 (accounts US1+US2 round-trip) is preserved verbatim — FR-040 binds this and SC-007 makes it measurable. No new arithmetic is introduced; no new test coverage is required. |
| **V — Spec-driven development** | YES | PASS | spec → clarify → plan workflow observed; spec has 0 open clarifications (both clarifying questions answered in the 2026-05-17 session). One feature in flight (this chore). |

**Conventions check.**

| Convention | Status | Note |
|---|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS | New components land under `components/brand/` (new dir) and `components/illustrations/` (new dir); the upgraded `EmptyState` stays at `components/shell/empty-state.tsx`; the `<Money>` primitive lands under `components/money/`; the `<ShellFooter>` lands under `components/shell/`. No code lands outside the established roots. |
| **Money helpers — all monetary operations go through `lib/money/`** | PASS | The `<Money>` UI primitive imports `formatAmount` from `lib/money/format.ts`. It does **not** perform arithmetic. Display-side rounding is the responsibility of `formatAmount` (which doesn't round — it pads, per feature 004 FR-011). |
| Migrations (no `db push`) | N/A | No schema change (FR-038). |
| Secrets (`.env.local` only) | N/A | No env vars added. |
| API response envelope | N/A | No API added. |
| Dates UTC | N/A | No date handling added. |
| CSV exports | N/A | No CSV in scope. |
| **Data scoping — every domain row owned by `userId`** | N/A | No data, no queries. The only server-side data this chore touches is the existing `auth()` + `listAccounts({ includeArchived: false })` read inside the dashboard welcome panel; both already obey the rule (feature 004). |

**No violations.** No justification required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-branded-ui-polish/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log (R1..R20)
├── data-model.md        # Phase 1 — "no domain entities" + UI contract surfaces
├── quickstart.md        # Phase 1 — local-run delta + visual-verification checklist
├── contracts/           # Phase 1 — one file per UI contract surface (NOT per HTTP endpoint)
│   ├── README.md
│   ├── AbacusIcon.md
│   ├── Money.md
│   ├── ShellFooter.md
│   └── EmptyState.md
├── checklists/          # existing (untouched by /speckit-plan)
├── spec.md              # Approved, 0 open clarifications
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

### Source code (after this feature)

```text
abacus/
├── app/
│   ├── layout.tsx                                # MODIFIED — load Inter via next/font/google; expose CSS variable
│   ├── icon.tsx                                  # NEW — 32×32 favicon via ImageResponse (next/og)
│   ├── apple-icon.tsx                            # NEW — 180×180 iOS icon via ImageResponse
│   ├── opengraph-image.tsx                       # NEW — 1200×630 OG image via ImageResponse
│   ├── globals.css                               # MODIFIED — add --money-positive and --money-negative tokens (light + dark)
│   ├── (marketing)/
│   │   ├── layout.tsx                            # unchanged
│   │   └── page.tsx                              # unchanged (renders updated sub-components)
│   └── (shell)/
│       ├── layout.tsx                            # MODIFIED — pass children into AppShell which now mounts ShellFooter
│       ├── error.tsx                             # unchanged (uses EmptyState — back-compat preserved)
│       ├── loading.tsx                           # unchanged
│       └── dashboard/
│           ├── page.tsx                          # MODIFIED — replaces stale placeholder with WelcomePanel
│           ├── accounts/
│           │   ├── page.tsx                      # unchanged
│           │   └── _components/
│           │       └── accounts-list.tsx         # MODIFIED — replace formatAmount-in-cell with <Money> in balance column
│           ├── transactions/page.tsx             # MODIFIED — coming-soon empty state with preview, no CTA
│           ├── budgets/page.tsx                  # MODIFIED — coming-soon empty state with preview, no CTA
│           └── settings/page.tsx                 # MODIFIED — coming-soon empty state, no preview, no CTA
├── components/
│   ├── brand/
│   │   └── abacus-icon.tsx                       # NEW — single contract surface for the brand mark (SVG React component)
│   ├── money/
│   │   └── money.tsx                             # NEW — <Money> rendering primitive (tabular-nums, sign-aware color)
│   ├── illustrations/
│   │   ├── abacus-illustration.tsx               # NEW — large brand-mark illustration for the dashboard welcome panel
│   │   ├── accounts-illustration.tsx             # NEW
│   │   ├── transactions-illustration.tsx         # NEW
│   │   ├── budgets-illustration.tsx              # NEW
│   │   └── settings-illustration.tsx             # NEW
│   ├── shell/
│   │   ├── app-shell.tsx                         # MODIFIED — mount <ShellFooter> in the shell layout
│   │   ├── brand.tsx                             # MODIFIED — replace lucide Wallet with <AbacusIcon>
│   │   ├── shell-footer.tsx                      # NEW — sticky-bottom footer for authenticated shell
│   │   ├── sidebar.tsx                           # MODIFIED — consume navGroups; render section labels + separator
│   │   ├── mobile-nav.tsx                        # MODIFIED — same grouping inside the drawer
│   │   ├── nav-items.ts                          # MODIFIED — export navGroups instead of flat navItems (back-compat re-export retained)
│   │   ├── empty-state.tsx                       # MODIFIED — extend with `illustration` and `preview` slots; preserve `icon` prop
│   │   └── welcome-panel.tsx                     # NEW — dashboard home welcome content using upgraded EmptyState
│   ├── marketing/
│   │   ├── marketing-header.tsx                  # MODIFIED — use <AbacusIcon>
│   │   ├── marketing-footer.tsx                  # MODIFIED — use <AbacusIcon>
│   │   ├── hero.tsx                              # MODIFIED — typography pass + "Learn more" outline link
│   │   ├── feature-grid.tsx                      # MODIFIED — icon treatment (lucide framed in bg-primary/10)
│   │   └── changelog.tsx                         # MODIFIED — bead-shaped dots
│   ├── theme-toggle.tsx                          # unchanged
│   └── ui/                                       # unchanged
├── lib/
│   ├── money/                                    # unchanged
│   └── accounts/                                 # unchanged
├── db/                                           # unchanged (FR-038)
├── tailwind.config.ts                            # MODIFIED — extend colors with money-positive + money-negative; expose font family from CSS variable
└── tests/                                        # unchanged (FR-040)
```

**Structure Decision.** Three new top-level component directories — `components/brand/` for the brand-mark contract, `components/money/` for the `<Money>` rendering contract, and `components/illustrations/` for the per-route stroke-based SVGs. The existing `components/shell/`, `components/marketing/`, and `components/ui/` roots stay. No re-organisation of feature 004's `_components/` page-local directory.

## Data Model Changes

**None.** This chore introduces no Prisma model, no migration, no domain entity, no database column. FR-038 binds this and is verifiable by inspection: `git diff db/` produces no changes. Full reasoning + the UI-contract surfaces (not entities, since they have no persistence) are documented in [`data-model.md`](./data-model.md).

## API Surface

**None.** No file under `app/api/*` is added or modified. No server action is added or modified. The existing `listAccounts` action from feature 004 is consumed verbatim by the dashboard welcome panel server component for its account-count read. Discussion in research.md R16.

## UI Surface

### Routes (paths and files)

| URL | File | Change |
|---|---|---|
| `/` | `app/(marketing)/page.tsx` | unchanged (renders updated sub-components) |
| `/dashboard` | `app/(shell)/dashboard/page.tsx` | **MODIFIED** — replaces the "Add your first account (disabled)" + "Account creation lands in a future feature" placeholder with `<WelcomePanel />`, a server component fetching session + account count and rendering the upgraded `EmptyState` with the abacus illustration |
| `/dashboard/accounts` | `app/(shell)/dashboard/accounts/page.tsx` | unchanged; the page-local `accounts-list.tsx` is modified |
| `/dashboard/transactions` | `app/(shell)/dashboard/transactions/page.tsx` | **MODIFIED** — coming-soon empty state with illustration + preview (two-row transaction-list mock); no CTA |
| `/dashboard/budgets` | `app/(shell)/dashboard/budgets/page.tsx` | **MODIFIED** — coming-soon empty state with illustration + preview (progress-bar widget mock); no CTA |
| `/dashboard/settings` | `app/(shell)/dashboard/settings/page.tsx` | **MODIFIED** — coming-soon empty state with illustration; **no preview, no CTA** (FR-026) |
| `/icon.png` | `app/icon.tsx` | **NEW** — 32×32 ImageResponse rendering the AbacusIcon on a transparent background |
| `/apple-icon.png` | `app/apple-icon.tsx` | **NEW** — 180×180 ImageResponse for iOS pinned-tab + home-screen icons |
| `/opengraph-image.png` | `app/opengraph-image.tsx` | **NEW** — 1200×630 ImageResponse: AbacusIcon (large) + "Abacus" wordmark + "Personal finance, finally clear" tagline on a violet gradient |

### UI contract surfaces (full prop sketches in `contracts/`)

| Contract | Location | Purpose | Key props |
|---|---|---|---|
| `<AbacusIcon>` | `components/brand/abacus-icon.tsx` | The single brand mark — frame, three rods, six beads. Inherits `currentColor` for the frame/strokes; beads can use `accent` to surface the violet primary. Consumed by header, sidebar, footer (marketing + shell), OG image, favicon, and the welcome panel. | `{ size?, className?, accent?: "primary" \| "currentColor", aria-label? }` |
| `<Money>` | `components/money/money.tsx` | The single monetary-display contract going forward. Accepts a canonical decimal string + currency code; delegates formatting to `formatAmount`. Sign-aware color (foreground / muted-foreground / desaturated red). Tabular numerals. Never accepts `number`. | `{ amount: string \| Money, currency: string, prominent?, align?, className? }` |
| `<ShellFooter>` | `components/shell/shell-footer.tsx` | Sticky-bottom (via flex layout, not `position: fixed`) footer rendered once inside `(shell)/layout.tsx`. Brand mark + wordmark + short attribution. | `{}` (no props; uses build-time `process.env` for version string if any) |
| `EmptyState` (upgraded) | `components/shell/empty-state.tsx` | Extends the existing primitive (feature 002). New optional `illustration` slot (takes precedence over `icon` when both provided); new optional `preview` slot rendered below the action, wrapped in `<div aria-hidden="true" tabIndex={-1}>`. | `{ title, description?, illustration?: ReactNode, icon?: LucideIcon, action?, preview?: ReactNode }` |

### Per-route illustration components (call sites of the brand mark contract, not separate contracts)

Five inline React SVG components under `components/illustrations/`. Each is stroke-based, monochrome with one violet accent, ~120×120 viewBox, static (no animation), no third-party illustration library (FR-027 + FR-039).

| Component | Used by | Glyph concept |
|---|---|---|
| `<AbacusIllustration>` | `/dashboard` welcome panel | Larger version of the brand abacus mark |
| `<AccountsIllustration>` | `/dashboard/accounts` zero-state | Stacked cards |
| `<TransactionsIllustration>` | `/dashboard/transactions` coming-soon | Two-direction arrows + horizontal lines |
| `<BudgetsIllustration>` | `/dashboard/budgets` coming-soon | Pie-slice + progress bar |
| `<SettingsIllustration>` | `/dashboard/settings` coming-soon | Sliders / gear cluster |

### Decorative preview slots (per route)

| Route | Preview content |
|---|---|
| `/dashboard/transactions` | A faded two-row mock: date column + description column + amount column, where the amount column uses `<Money>` (decorative but typographically truthful so the preview tells the user "transactions are tabular with right-aligned money"). Wrapped in `aria-hidden="true"`. |
| `/dashboard/budgets` | A faded progress-bar mock: one row showing a labelled bar at ~60% fill plus a `<Money>` total below. Wrapped in `aria-hidden="true"`. |
| `/dashboard`, `/dashboard/accounts`, `/dashboard/settings` | No preview. The dashboard welcome panel has a CTA instead; the accounts zero-state has a CTA; settings is intentionally preview-less (FR-026). |

### Sidebar grouping

`components/shell/nav-items.ts` is refactored from:

```ts
export const navItems: NavItem[] = [/* flat list of 5 */]
```

to:

```ts
export type NavGroup = { label: string; items: NavItem[] }
export const navGroups: NavGroup[] = [
  { label: "TRACK", items: [Dashboard, Accounts, Transactions] },
  { label: "MANAGE", items: [Budgets, Settings] },
]
// back-compat re-export retained for any internal caller that still needs the flat list:
export const navItems: NavItem[] = navGroups.flatMap(g => g.items)
```

`Sidebar` and `MobileNav` both consume `navGroups`. Section labels are rendered as `<span>` with `aria-hidden="true"`, uppercase, letter-spaced, muted-foreground, small. A `<Separator />` sits between groups. Per FR-030, section labels are NOT focusable (screen readers skip them; keyboard tab order goes nav-item → nav-item).

### Charts

None this chore (Recharts lands with feature 015).

### Currency display in the accounts list (the migration to `<Money>`)

Today (`accounts-list.tsx` line 202–204):

```tsx
<TableCell className="text-right">
  {formatAmount(account.startingBalance, account.currency)}
</TableCell>
```

After:

```tsx
<TableCell className="text-right">
  <Money amount={account.startingBalance} currency={account.currency} prominent align="right" />
</TableCell>
```

The `<Money>` primitive internally calls `formatAmount` and wraps the result in a `<span>` with `tabular-nums`, sign-aware color classes, and (when `prominent`) heavier weight. `formatAmount` is **not** modified.

## File-Level Layout

### Files to ADD

| Path | Purpose |
|---|---|
| `app/icon.tsx` | 32×32 favicon via `ImageResponse` from `next/og`. Renders `<AbacusIcon>` inline (using inline styles, since `ImageResponse` does not consume Tailwind classes — research.md R2). |
| `app/apple-icon.tsx` | 180×180 iOS icon via `ImageResponse`. Same shape as `icon.tsx`. |
| `app/opengraph-image.tsx` | 1200×630 social-preview image via `ImageResponse`. Brand mark (large) + "Abacus" wordmark + "Personal finance, finally clear" tagline on a violet gradient. Inter loaded inside the ImageResponse from the same source as `next/font/google` (research.md R3). |
| `components/brand/abacus-icon.tsx` | The single brand-mark contract. Inline SVG React component. Frame + 3 rods + 6 beads (2 per rod). Default 20×20 px (header size); scales up cleanly via the `size` prop. |
| `components/money/money.tsx` | The `<Money>` rendering primitive. Imports `formatAmount` from `lib/money/format.ts`. |
| `components/shell/shell-footer.tsx` | The authenticated-shell footer. Brand mark + wordmark + copyright/attribution. Sticky-bottom via flex layout. |
| `components/shell/welcome-panel.tsx` | Dashboard home welcome content. Server component fetching session via `auth()` and account count via `listAccounts({ includeArchived: false })`. Passes derived values to the upgraded `EmptyState`. |
| `components/illustrations/abacus-illustration.tsx` | Larger version of the brand mark for the welcome panel. |
| `components/illustrations/accounts-illustration.tsx` | Per-route illustration for the accounts zero-state. |
| `components/illustrations/transactions-illustration.tsx` | Per-route illustration for the transactions coming-soon state. |
| `components/illustrations/budgets-illustration.tsx` | Per-route illustration for the budgets coming-soon state. |
| `components/illustrations/settings-illustration.tsx` | Per-route illustration for the settings coming-soon state. |

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `app/layout.tsx` | Load Inter via `next/font/google` (subsets: `['latin', 'latin-ext']`, display: `swap`); expose as CSS variable `--font-inter`; apply `font-sans` (mapped to the variable) on `<body>`. |
| `app/globals.css` | Add `--money-positive` and `--money-negative` CSS variables in `:root` and `.dark` selectors; minor body-font-family touch-up to consume the new Inter variable. |
| `tailwind.config.ts` | Extend `theme.colors` with `money-positive` and `money-negative` (both `hsl(var(--money-*))` per existing pattern); extend `theme.fontFamily.sans` to `["var(--font-inter)", ...defaultSansStack]`. |
| `app/(shell)/dashboard/page.tsx` | Replace the placeholder `EmptyState` + caption with `<WelcomePanel />`. |
| `app/(shell)/dashboard/transactions/page.tsx` | Replace `<EmptyState>` with the upgraded primitive: `<TransactionsIllustration>` + headline + 1-line description + decorative preview slot; no action. |
| `app/(shell)/dashboard/budgets/page.tsx` | Replace `<EmptyState>` with the upgraded primitive: `<BudgetsIllustration>` + headline + 1-line description + decorative preview slot; no action. |
| `app/(shell)/dashboard/settings/page.tsx` | Replace `<EmptyState>` with the upgraded primitive: `<SettingsIllustration>` + headline + 1-line description; no preview, no action. |
| `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` | (1) Balance cell uses `<Money>` instead of bare `formatAmount(...)`; (2) zero-state `EmptyState` passes `<AccountsIllustration>` via the new `illustration` prop (the existing `icon: Wallet` is removed once the illustration prop is in place — the back-compat path stays available for callers that haven't migrated). |
| `components/shell/app-shell.tsx` | Restructure inner div from `<div className="flex min-h-screen flex-1 flex-col">` to wrap `<main>` and `<ShellFooter>` so the footer sits at flex end of the main column. The mobile drawer remains outside this stack, so FR-018's "footer must not visually conflict with the mobile drawer" is satisfied structurally. |
| `components/shell/brand.tsx` | Replace `lucide Wallet` with `<AbacusIcon>`; preserve the wordmark + the height/spacing. |
| `components/shell/sidebar.tsx` | Consume `navGroups` from `nav-items.ts`. Render: `<Brand>` → `<Separator>` → for each group: `<span aria-hidden="true">{group.label}</span>` + list of `<NavLink>` + `<Separator>` between groups. |
| `components/shell/mobile-nav.tsx` | Same grouping inside the drawer; same structure as `sidebar.tsx`. |
| `components/shell/nav-items.ts` | Add `NavGroup` type and `navGroups` export; retain `navItems` as a flattened back-compat export. |
| `components/shell/empty-state.tsx` | Extend props: new optional `illustration?: ReactNode` slot (renders above the title; takes precedence over `icon` when both are provided); new optional `preview?: ReactNode` slot (renders below the action, wrapped in `<div aria-hidden="true" tabIndex={-1}>`); existing `icon: LucideIcon` made optional and preserved for back-compat (per FR-020). |
| `components/marketing/marketing-header.tsx` | Replace `lucide Wallet` with `<AbacusIcon>`. |
| `components/marketing/marketing-footer.tsx` | Replace plain text-only footer with a footer that leads with `<AbacusIcon>` + wordmark on the same line as the existing copyright. |
| `components/marketing/hero.tsx` | Headline line-height + size tightened to take advantage of Inter; add a third "Learn more" outline link below the existing CTAs, with `href="#changelog"` (smooth-scroll behavior). The existing CTA set is preserved (FR-031 — info density must not regress). |
| `components/marketing/feature-grid.tsx` | Each card's icon is wrapped in `<div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">`; icon size remains 6px → 5px to fit; lucide icons themselves are unchanged (research.md R19). |
| `components/marketing/changelog.tsx` | Replace the `<span className="… rounded-full …">` plain circle with a small inline SVG depicting a bead — a horizontal rod-stub + a filled circle — sized to match the existing geometry. |

### Files NOT touched

- `lib/money/*` (the arithmetic + formatting boundary is stable).
- `lib/accounts/*` (no behavioral change; the welcome panel consumes the existing `listAccounts` action).
- `middleware.ts`, `app/api/*` (no auth or API change).
- `db/schema.prisma`, `db/migrations/*` (FR-038).
- `tests/unit/*`, `tests/e2e/*` (FR-040 — every existing test preserved).
- Every shadcn primitive under `components/ui/*` (no new primitive; no primitive modified).
- `package.json` (zero new runtime deps per FR-039 — Inter, OG, favicon are all native to Next.js).

## Money & Currency Notes

This chore is **rendering-layer-only** for money. No arithmetic is introduced. Constitution Principle I is honored structurally:

- The new `<Money>` primitive imports `formatAmount` from `lib/money/format.ts` and renders its output. It does **not** reimplement formatting. It does **not** round. It does **not** accept `number` — only `string` (the canonical decimal string from the wire, per feature 004 R2) or `Money` (the `Prisma.Decimal` re-export).
- **Currency adjacency** is preserved as-is: `formatAmount` uses `Intl.NumberFormat({ style: "currency" })`, which produces `$1,250.00` / `€800.00` / `¥0`. The `<Money>` primitive renders that string directly. No code-suffix variant (`1,250.00 USD`) is introduced — keeping the existing behavior keeps the chore minimal and feature 004's expectations stable. Discussion: research.md R9.
- **Sign-aware color** is applied by the primitive itself, per FR-013: positive → `foreground`; zero → `muted-foreground`; negative → `--money-negative` (a new desaturated-red token derived from `--destructive`, NOT `--destructive` itself, so future error messaging keeps its own color space). Discussion: research.md R7.
- **`money-positive` is reserved, NOT applied.** The new `--money-positive` token exists as a CSS variable + Tailwind utility (`text-money-positive`, `bg-money-positive`) and is contrast-verified (WCAG AA in both themes — research.md R6) — but it is **NOT applied by the `<Money>` primitive in this chore**. Future features (007 Dashboard income widgets, 008 Budget surplus markers, 015 Charts gain series) opt into it explicitly. FR-013 + FR-007 codify this.
- **Tabular numerals** are applied at the primitive level (`font-variant-numeric: tabular-nums` via Tailwind's `tabular-nums` utility). Inter ships with a tabular variant; research.md R10 verifies.
- **FX conversion / aggregation** — still out of scope (feature 020). No total-row added; the accounts table continues to show each account's balance in its own currency. The chore is forward-compatible because the `<Money>` primitive is already shaped to take an arbitrary currency.
- **Transfers** — out of scope. Constitution Principle I's transfer atomicity rule binds feature 006, not this one.

## Auth & Validation Boundaries

No new auth boundaries. No new Zod schemas. The only server-side data fetch added is the dashboard welcome panel's session + account-count read, which goes through the existing `auth()` helper + the existing `listAccounts({ includeArchived: false })` action from feature 004. Both are unchanged. The welcome panel's component renders a server-rendered shell that the existing `middleware.ts` already gates.

## Testing Strategy

### Unit (Vitest)

**No new unit tests.** The four money-correctness tests from feature 004 (`money-decimal.test.ts`, `money-currencies.test.ts`, `money-validate.test.ts`, `money-format.test.ts`) are preserved verbatim. None of them depend on UI rendering; all four must continue to pass.

Rationale for skipping new unit tests on the `<Money>` primitive: the primitive is a thin wrapper over `formatAmount` (which is already exhaustively tested) plus three Tailwind class branches keyed by sign. Adding rendering-snapshot tests would couple the suite to className strings — high churn, low signal. The constitution's "test the money paths" bar applies to arithmetic and transfer logic, not display strings.

### E2E (Playwright) — preservation

**No new E2E specs.** Every existing E2E from features 001–004 must continue to pass (FR-040 + SC-007). The specs depend on:

- DOM landmarks (`<nav>`, `<main>`, `<header>`) — unchanged.
- Route URLs — unchanged.
- Form-control role assertions (button, switch, dialog) — unchanged.
- Text assertions (e.g., "Add your first account" CTA, "Show archived" label, "Sign up" form heading) — preserved verbatim by the chore. The chore audit task (T-Final, see Phase 2 sketch) greps the affected specs for hard-coded text and confirms each string still ships in the new code.

The chore explicitly does NOT introduce Playwright visual-regression diffing, Chromatic, Percy, or any equivalent. The rationale is in research.md R20: visual diffing for a deliberate visual refresh is anti-productive — every screenshot will diff. Behavioral E2E is the right granularity.

### What can skip tests

- The favicon and OG image render — these are static build-time artifacts; their correctness is verified by visual inspection in the quickstart checklist, not by E2E.
- WCAG contrast of `--money-positive` and `--money-negative` — verified by direct measurement in research.md R6, not by automated test. (Adding `pa11y-ci` or axe would be a new runtime / test dep, violating FR-039.)
- Inter font load timing — verified by visual inspection per FR-005's perception bar; adding a CLS measurement test is overhead.

### Constitution coverage summary

- Principle IV money-paths unit suite: PASS (preserved verbatim from feature 004).
- Principle IV signup→login→logout E2E: PASS (preserved from feature 003).
- Principle IV transfer E2E: still deferred to feature 006.
- FR-040 (every existing E2E green): verified by `pnpm test:e2e` in CI at the end of the chore.

## Risks & Trade-offs

1. **Inter via `next/font/google` adds a build-time download** (~50 KB woff2 for the two subsets we pick: `latin` + `latin-ext`). Modest build-time + bundle cost. **Decision: accept.** The alternative is a manual `<link href="https://fonts.googleapis.com/...">` in `<head>`, which violates FR-005 ("no third-party network request to a font CDN at runtime"). The built-in Next.js convention is the only path that satisfies FR-005 structurally.

2. **`app/icon.tsx` + `app/opengraph-image.tsx` use `ImageResponse` from `next/og`**, which renders JSX but does **not** consume Tailwind classes — only inline styles are honored, and custom fonts must be loaded inside the `ImageResponse` separately (a `fetch` to the same Inter woff source). **Decision: accept**, with explicit research entries (R2, R3) documenting the gotcha so the implementer doesn't ship a broken OG. Alternative: pre-render the OG as a static PNG checked into `public/` — rejected because it freezes the design, can't reference the same `<AbacusIcon>` source, and violates FR-009's single-source-of-truth rule.

3. **Theme toggle stays in the header**, not moved to the footer. FR-019 leaves the location plan-level. **Decision: keep in header.** On mobile the footer is below the fold on tall pages; moving the toggle there is a discoverability regression. Documented in research.md R14.

4. **Bead-shaped dots in the changelog** are a small visual flourish. If they read as fussy at review time, reverting to plain circles is a one-line change and does not break any FR (FR-033 uses "SHOULD", not "MUST"). **Decision: ship the bead dots**; flag in research.md R17 for a possible revert.

5. **Per-route preview slots are decorative mocks, not commitments.** A faded preview of "two-row transactions" or "progress-bar budgets" creates a small expectation that the loaded UI will look approximately like that. **Decision: accept the small commitment**, with two mitigations: (a) FR-021 binds them aria-hidden so screen-reader users don't read the mock as real content; (b) the mocks visually communicate shape/affordance only — they never include real data, real currency amounts, or real category names. Documented in research.md R12.

6. **The upgraded `EmptyState` is back-compat by design.** The existing `icon: LucideIcon` prop stays required-or-optional in a way that doesn't break feature 002's `(shell)/error.tsx`, which passes `icon={CircleAlert}`. **Decision: make `icon` optional**, allow `illustration` to take precedence when both are provided, and add a runtime invariant: the component renders if and only if `title` is provided. The `icon`-only call sites in feature 002 (`error.tsx`) continue to work without modification.

## Constitution Compliance — Post-Design Re-Check

After Phase 0 (research) and Phase 1 (data model, contracts, quickstart), the design re-passes every applicable gate:

| Principle | Status | Why |
|---|---|---|
| **I — Money math** | PASS | `<Money>` does no arithmetic; consumes `formatAmount` from the existing `lib/money/` boundary; currency is structurally inseparable from amount in the primitive's contract; no rounding introduced. |
| **II — Type safety** | PASS | Strict TS preserved; no `any` introduced; every new component has a typed prop signature. |
| **III — Validate at boundaries** | N/A | No new validation boundaries. |
| **IV — Test the money paths** | PASS | Existing money-correctness unit suite preserved; FR-040 binds existing E2E preservation; no new arithmetic to test. |
| **V — Spec-driven** | PASS | spec → plan order observed; spec has 0 open clarifications. |

**Conventions** (after Phase 1 design): no folder-layout drift; money helpers remain consolidated under `lib/money/`; no migration; no env vars; no API; data-scoping convention not exercised (no new data, no new queries). All N/A rows are correctly N/A.

**No constitution violations identified. No Complexity Tracking entries required.**

## Phase 2 — Task Planning Approach

`/speckit-tasks` will generate `tasks.md` from this plan. Expected task bundles (provided here as a sketch; the actual atomic task list is produced by `/speckit-tasks`):

1. **Foundational — tokens, fonts, brand mark.** Add `--money-positive` + `--money-negative` to `app/globals.css`; extend `tailwind.config.ts` with the new color tokens; wire Inter via `next/font/google` in `app/layout.tsx`; create `components/brand/abacus-icon.tsx`. Every later task depends on these.
2. **Favicon + OG image.** `app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx` using `ImageResponse` from `next/og`. Verify rendering at `/icon.png`, `/apple-icon.png`, `/opengraph-image.png`.
3. **`<Money>` primitive.** Create `components/money/money.tsx`. Internally calls `formatAmount`; applies tabular-nums, sign-aware color classes, and the `prominent` styling hint.
4. **Accounts list migration.** Modify `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` balance cell to use `<Money>`. Confirm `tests/e2e/accounts.spec.ts` still passes.
5. **`<ShellFooter>` + shell layout restructure.** Create `components/shell/shell-footer.tsx`; modify `components/shell/app-shell.tsx` to mount the footer at flex-end inside the main column.
6. **Upgrade `EmptyState`.** Extend `components/shell/empty-state.tsx` with `illustration` and `preview` slots; keep `icon` back-compat. Run typecheck — `(shell)/error.tsx` must still type-check unchanged.
7. **Per-route illustrations.** Create the five SVG components under `components/illustrations/`.
8. **Per-route empty states.** Modify `transactions/page.tsx`, `budgets/page.tsx`, `settings/page.tsx` to use the upgraded `EmptyState` with the right illustration + headline + one-line description + (where applicable) preview slot. No CTA on any of the three.
9. **Dashboard welcome panel.** Create `components/shell/welcome-panel.tsx` (server component). Modify `app/(shell)/dashboard/page.tsx` to render it. Remove the legacy disabled-CTA placeholder + the "future feature" caption.
10. **Sidebar grouping.** Modify `components/shell/nav-items.ts` to export `navGroups`; modify `components/shell/sidebar.tsx` and `components/shell/mobile-nav.tsx` to consume the groups + render labels + separator.
11. **Marketing polish.** Modify `marketing-header.tsx`, `marketing-footer.tsx` (use `<AbacusIcon>`); modify `hero.tsx` (typography + "Learn more" link); modify `feature-grid.tsx` (icon framing); modify `changelog.tsx` (bead-shaped dots).
12. **Final audits.** `pnpm typecheck` (no `any`, no errors); `pnpm lint`; `pnpm format:check`; `pnpm test` (existing unit suite green); `pnpm test:e2e` (every existing spec green per FR-040); visual verification against the quickstart checklist; WCAG contrast check for the two new tokens against light + dark backgrounds (manual measurement, no new tooling per FR-039); a money-boundary audit confirming no arithmetic was introduced in any new file.

The `/speckit-tasks` output will expand these 12 bundles into ~40–55 atomic, individually-verifiable units.

## Complexity Tracking

No constitution violations. No justification entries required.

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, all four UI contracts written, zero new runtime deps, no open clarifications, no migration, FR-040 preservation strategy explicit
File: /Users/rgederin/git/abacus/specs/005-branded-ui-polish/plan.md
```
