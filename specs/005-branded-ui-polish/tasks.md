---

description: "Task list for branded UI polish chore"
---

# Tasks: Branded UI Polish

**Input**: Design documents from `/specs/005-branded-ui-polish/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: No new tests are added by this chore. FR-040 binds preservation of every existing Vitest + Playwright suite (105 unit tests + 17 e2e tests). Polish-phase tasks (T032–T038) verify behavioral parity.

**Organization**: Tasks grouped by user story. The MVP is **US1 + US2 + US3 together** (the three P1 stories); US4 and US5 are P2 follow-ups that add visible polish but ship independently.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase (different files, no dependencies on incomplete tasks).
- **[Story]**: Maps task to user story (US1–US5). Setup / Foundational / Polish tasks have no story label.
- File paths are absolute repository paths under `/Users/rgederin/git/abacus/`.

## Path Conventions

Next.js 16 App Router layout (per [plan.md §Project Structure](./plan.md)). All paths repo-relative below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Typography and color tokens required by every later phase.

- [x] T001 Add the Inter typeface via `next/font/google` in `app/layout.tsx`: import `Inter` from `next/font/google`, configure `subsets: ['latin', 'latin-ext']`, `display: 'swap'`, `variable: '--font-inter'`. Apply the variable class to `<html>` or `<body>`. Extend `tailwind.config.ts` `theme.fontFamily.sans` to lead with `["var(--font-inter)", ...defaultSansStack]` so all `font-sans` consumers automatically pick up Inter with a graceful system fallback (per FR-005 + research.md R4).
- [x] T002 Add two new CSS color tokens in `app/globals.css`: `--money-positive` and `--money-negative`, each with a `:root` (light-mode) value and a `.dark` (dark-mode) value chosen per research.md R6 + R7. Light: `--money-positive: 145 50% 35%`, `--money-negative: 0 65% 40%`. Dark: `--money-positive: 145 50% 60%`, `--money-negative: 0 70% 65%`. Extend `tailwind.config.ts` `theme.extend.colors` with `"money-positive": "hsl(var(--money-positive))"` and `"money-negative": "hsl(var(--money-negative))"` so they're consumable as `text-money-positive` / `text-money-negative` / `bg-money-positive` utilities. **Verify with the browser DevTools accessibility checker that both tokens pass WCAG AA contrast against `--background` in both themes** (per FR-037 + SC-008).

**Checkpoint**: `pnpm typecheck` passes; `pnpm lint` passes; `pnpm dev` renders existing pages with Inter visibly applied (compare to the system default).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The UI contract surfaces every later story depends on — brand mark, money primitive, upgraded empty-state primitive, and five per-route illustrations.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 is complete.

### UI contract surfaces

- [x] T003 Create `components/brand/abacus-icon.tsx`: the single `<AbacusIcon>` contract surface per `specs/005-branded-ui-polish/contracts/AbacusIcon.md`. Stroke-based SVG, 20×20 default viewBox. Frame (rectangle with rounded corners) + 3 horizontal rods + 6 beads (2 per rod, positioned to suggest a number is being held). Props: `{ size?: number | string, className?, accent?: "primary" | "currentColor", "aria-label"?, "aria-hidden"? }`. Frame and rods inherit `currentColor`; beads use `fill-primary` when `accent === "primary"` (default), `fill-current` when `accent === "currentColor"`. **Must remain recognizable at 16px** (FR-002 + SC-005): verify by rendering at 16px in a test page and confirming frame + at least 2 rods + at least 4 beads are visible.
- [x] T004 Upgrade `components/shell/empty-state.tsx` per `specs/005-branded-ui-polish/contracts/EmptyState.md`. Add two new optional props: `illustration?: ReactNode` (rendered above the title; takes precedence over `icon` when both provided) and `preview?: ReactNode` (rendered below the action, wrapped in `<div aria-hidden="true" tabIndex={-1}>`). The existing `icon?: LucideIcon` and `action?` props remain unchanged (back-compat per FR-020 — `app/(shell)/error.tsx` and any other existing caller using `icon` keeps working without modification). Preserve all existing class names + layout; only ADD slots.
- [x] T005 Create `components/money/money.tsx`: the `<Money>` primitive per `specs/005-branded-ui-polish/contracts/Money.md`. Props: `{ amount: string, currency: string, prominent?: boolean, align?: "left" | "right", className? }`. **Must NEVER accept `number`** (FR-010 + Principle I). **Naming-collision note**: `Money` is also the name of the TS type re-exported from `lib/money/decimal.ts` (Prisma.Decimal re-export). If the component needs that type, the type import inside `components/money/money.tsx` MUST be aliased — e.g., `import type { Money as MoneyValue } from "@/lib/money/decimal"` — to avoid a duplicate-identifier compile error against `export function Money(...)`. The component itself stays named `Money`. Internally imports `formatAmount` from `@/lib/money/format`, wraps the result in a `<span>` with `tabular-nums` (Tailwind utility), applies sign-aware color: positive → `text-foreground`, zero → `text-muted-foreground`, negative → `text-money-negative` (NOT `text-money-positive` — FR-013 reserves the green token). When `prominent`, applies `font-semibold text-lg` or equivalent (research.md R8 prop sketch). When `align === "right"`, applies `text-right block`. Sign detection: parse the leading character of `amount` (`-` → negative, `0` or `0.0…` → zero, otherwise positive). Do NOT compute anything mathematically.

### Per-route illustrations

- [x] T006 [P] Create `components/illustrations/abacus-illustration.tsx`: larger stylized abacus mark (~120×120 viewBox), used by the dashboard `<WelcomePanel>`. Stroke-based, monochrome with a single violet primary accent on the beads. No animation. No third-party library (FR-027 + FR-039). Static inline React SVG component.
- [x] T007 [P] Create `components/illustrations/accounts-illustration.tsx`: stacked-cards glyph (~120×120 viewBox). Stroke-based, monochrome with one violet accent. Used by `accounts-list.tsx` zero-state (US3).
- [x] T008 [P] Create `components/illustrations/transactions-illustration.tsx`: two-direction arrows + horizontal lines glyph (~120×120 viewBox). Stroke-based, monochrome with one violet accent. Used by `/dashboard/transactions` (US4).
- [x] T009 [P] Create `components/illustrations/budgets-illustration.tsx`: pie-slice + progress-bar cluster glyph (~120×120 viewBox). Stroke-based, monochrome with one violet accent. Used by `/dashboard/budgets` (US4).
- [x] T010 [P] Create `components/illustrations/settings-illustration.tsx`: sliders or gear cluster glyph (~120×120 viewBox). Stroke-based, monochrome with one violet accent. Used by `/dashboard/settings` (US4).

**Checkpoint**: `pnpm typecheck` + `pnpm lint` pass. All 6 illustration components importable and render at their target sizes. Money primitive correctly applies tabular numerals + sign-aware color when manually tested.

---

## Phase 3: User Story 1 — Marketing brand recognition (Priority: P1) 🎯 MVP-START

**Goal**: A first-time visitor on `/` immediately sees the custom Abacus brand mark, the Inter typeface, a tailored hero typography pass, and (when sharing the URL) a branded Open Graph preview.

**Independent Test**: Visit `/` in a fresh browser session. Confirm: (1) the marketing header shows the AbacusIcon (not lucide Wallet); (2) the favicon in the browser tab shows the abacus mark; (3) Inter is visibly the body font; (4) the hero includes a "Learn more" link anchored to `#changelog`; (5) the feature-grid cards have the new icon treatment (violet-tinted rounded square behind the lucide icon); (6) the changelog uses bead-shaped dots; (7) the marketing footer shows the AbacusIcon. Paste `http://localhost:3000` into a tool that resolves OG metadata (Slack message composer, Twitter card validator, or `pnpm exec next start` + curl `/opengraph-image.png`) and confirm the resolved preview shows the abacus mark + "Abacus" wordmark + tagline on a branded background.

### Implementation for User Story 1

- [x] T011 [US1] Update `components/marketing/marketing-header.tsx`: replace `import { Wallet } from "lucide-react"` and `<Wallet …>` with `import { AbacusIcon } from "@/components/brand/abacus-icon"` and `<AbacusIcon className="h-6 w-6" />`. The wordmark span and surrounding flex layout stay unchanged. Per FR-006.
- [x] T012 [US1] Update `components/marketing/marketing-footer.tsx`: lead with `<AbacusIcon className="h-5 w-5 text-muted-foreground" accent="currentColor" />` + the wordmark on the same line as the existing copyright text. Preserve the existing footer structure (no new links).
- [x] T013 [US1] [P] Create `app/icon.tsx`: a Next.js icon route that exports an `ImageResponse` from `next/og` rendering the AbacusIcon at 32×32 on a transparent background. Use inline styles only (no Tailwind classes work inside `ImageResponse` per research.md R2). Beads use the violet primary hex value (resolve `--primary` HSL to a hex literal — document the exact hex in the file so future palette changes are findable via grep).
- [x] T014 [US1] [P] Create `app/apple-icon.tsx`: 180×180 ImageResponse for iOS home-screen + pinned-tab icons. Same shape as `icon.tsx` but scaled up; consider a tinted-background variant (Apple icons traditionally have a non-transparent background — research.md R2). Document choice in the file.
- [x] T015 [US1] [P] Create `app/opengraph-image.tsx`: 1200×630 ImageResponse for social-preview previews. Inline layout: AbacusIcon (large, ~200px) + "Abacus" wordmark + tagline "Personal finance, finally clear" centered on a violet gradient background. Inter MUST be loaded INSIDE the ImageResponse via a separate `fetch()` to a Google Fonts CSS URL or via the `next/og` font option (research.md R3). Use inline styles only. Verify by running `pnpm exec next start` and curling `/opengraph-image.png` to inspect the output.
- [x] T016 [US1] Update `components/marketing/hero.tsx`: tighten the headline `line-height` and `letter-spacing` to take advantage of Inter (research.md R18). Add a third "Learn more" outline link below the existing CTAs with `<Link href="#changelog">Learn more</Link>` styled as a `Button variant="outline" size="lg"`. The existing Sign up / Log in / Go to dashboard CTAs are preserved (FR-031 — info density must not regress).
- [x] T017 [US1] Update `components/marketing/feature-grid.tsx`: wrap each card's lucide icon in `<div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">` so the icons read as a coordinated set (research.md R19). The lucide icons themselves are unchanged. Reduce icon size from `h-6 w-6` to `h-5 w-5` to fit inside the tinted square.
- [x] T018 [US1] Update `components/marketing/changelog.tsx`: replace the existing plain `<span className="… rounded-full …">` violet circle with a small inline SVG bead — a short horizontal rod-stub (line) + a filled circle (the bead) — sized to match the existing dot geometry. Document the SVG geometry inline (research.md R17).

**Checkpoint**: US1 fully functional and shippable as a marketing-only increment. `pnpm exec next build` succeeds; `pnpm exec next start` serves `/` with all visual elements in place; `/icon.png`, `/apple-icon.png`, `/opengraph-image.png` all resolve to ImageResponses.

---

## Phase 4: User Story 2 — Coherent authenticated shell (Priority: P1)

**Goal**: An authenticated user navigating between `/dashboard`, `/dashboard/accounts`, and every placeholder route sees the AbacusIcon in the sidebar, the Inter typeface everywhere, the new `<ShellFooter>` at the bottom of every route, and a welcoming `/dashboard` panel that's no longer stale.

**Independent Test**: Sign in as any user. Visit `/dashboard`, `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings` in turn. Confirm at every route: (1) sidebar brand shows the AbacusIcon (not Wallet); (2) Inter is visibly applied; (3) the footer appears at the bottom of the viewport on short pages (sticky-bottom) and at the natural end of content on long pages; (4) `/dashboard` shows the new `<WelcomePanel>` with the AbacusIllustration as the page illustration and a "Manage your accounts" CTA linking to `/dashboard/accounts` (no disabled button, no "future feature" caption).

### Implementation for User Story 2

- [x] T019 [US2] Update `components/shell/brand.tsx`: replace `import { Wallet } from "lucide-react"` and `<Wallet …>` with `import { AbacusIcon } from "@/components/brand/abacus-icon"` and `<AbacusIcon className="h-6 w-6" />`. The wordmark + height/padding stay unchanged. Per FR-006.
- [x] T020 [US2] Create `components/shell/shell-footer.tsx`: the `<ShellFooter>` per `specs/005-branded-ui-polish/contracts/ShellFooter.md`. No props. Renders `<footer>` with: `<AbacusIcon className="h-4 w-4" accent="currentColor" />` + "Abacus" wordmark + short copyright/attribution (e.g., `© 2026 Abacus`). Small muted text; centered or left-aligned (pick by aesthetic match to marketing footer). No links. Sticky-bottom is achieved via flex layout in `app-shell.tsx` (T021), NOT via `position: fixed` (FR-018 + research.md R13).
- [x] T021 [US2] Update `components/shell/app-shell.tsx`: restructure the inner div so the page `<main>` + `<ShellFooter />` form a flex column with `flex: 1` on `<main>` and `<ShellFooter>` at the natural bottom. Pattern: `<div className="flex min-h-screen flex-1 flex-col">` wrapping `<main className="flex-1 …">{children}</main>` and `<ShellFooter />`. On long pages, footer sits below content; on short pages, `flex-1` on `<main>` pushes the footer to the viewport bottom. Mobile drawer stays outside this column (positioned via Sheet primitive), so the drawer does not visually conflict with the footer (FR-018).
- [x] T022 [US2] Create `components/shell/welcome-panel.tsx`: server component. Calls `await auth()` for the user; calls `await listAccounts({ includeArchived: false })` for the account count (per research.md R16). Renders the upgraded `<EmptyState>` with: `illustration={<AbacusIllustration />}`, `title="Welcome to Abacus"` (or `"Welcome back, {emailPrefix}"` if returning user — pick a derivation from `session.user.email`), `description` text naming what's available today (Accounts) and what's coming (Transactions, Budgets, ...) per FR-022, `action={{ label: "Manage your accounts", href: "/dashboard/accounts" }}`. No `preview` slot.
- [x] T023 [US2] Replace `app/(shell)/dashboard/page.tsx` content: remove the existing stale `<EmptyState>` with the disabled "Add your first account" button and the "Account creation lands in a future feature" caption. Render `<WelcomePanel />` instead. Per FR-022 + SC-006.

**Checkpoint**: US2 + US1 together form a usable MVP increment. Every authenticated route now has the footer; `/dashboard` is no longer stale; the brand mark is unified across marketing + shell.

---

## Phase 5: User Story 3 — Money rendering trust at a glance (Priority: P1)

**Goal**: The accounts list balance column reads at a glance — tabular numerals, right-aligned, prominent typography, sign-aware color, currency always adjacent to amount.

**Independent Test**: Sign in as a user with 3+ accounts of mixed sign (positive balance on a CHECKING account, zero on another, negative on a CREDIT account, ideally one in EUR or another currency). Visit `/dashboard/accounts`. Confirm: (1) the balance column is right-aligned; (2) digits in different rows align vertically (tabular numerals); (3) positive balances render in default `foreground`; (4) zero balances render in muted-foreground; (5) negative balances render in desaturated red (`text-money-negative`, NOT `text-destructive`); (6) every balance shows its currency (e.g., `$`, `€`, `¥`) adjacent to the amount; (7) the balance column is more prominent than the Name / Type / Currency columns (heavier font weight or larger size). With zero accounts, the empty state uses the new `<AccountsIllustration>` instead of the lucide `Wallet` icon.

### Implementation for User Story 3

- [x] T024 [US3] Update `app/(shell)/dashboard/accounts/_components/accounts-list.tsx`: in the balance cell of the table row, replace `{formatAmount(account.startingBalance, account.currency)}` with `<Money amount={account.startingBalance} currency={account.currency} prominent align="right" />`. The `<TableCell className="text-right">` wrapper stays. Remove the now-unused `formatAmount` import from this file (it's used inside `<Money>` now, not at the call site). Per FR-014 + FR-015.
- [x] T025 [US3] Update `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` zero-state: change the existing `<EmptyState icon={Wallet} … />` call to `<EmptyState illustration={<AccountsIllustration />} … />`. Remove the now-unused `Wallet` import from this file. Title, description, and action props stay unchanged. Per FR-023.

**Checkpoint**: US3 visibly upgrades the only loaded screen in the app. US1 + US2 + US3 together = the MVP for the chore.

---

## Phase 6: User Story 4 — Rich empty states for placeholder routes (Priority: P2)

**Goal**: Users visiting the three not-yet-shipped routes (`/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`) see a rich, branded, descriptive empty state — illustration + headline + one-line "what the feature will do" + (for transactions/budgets only) a faded decorative preview.

**Independent Test**: Visit each of `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings` in turn. Confirm at each route: (1) the upgraded `<EmptyState>` is in use with the route-specific illustration component (Transactions/Budgets/Settings); (2) the headline matches "Transactions are coming soon" / "Budgets are coming soon" / "Settings are coming soon" or equivalent route-specific copy; (3) the description is one line and describes WHAT the feature will do (not WHEN); (4) `/dashboard/transactions` and `/dashboard/budgets` each render a decorative preview below the description; (5) `/dashboard/settings` does NOT render a preview; (6) NO primary call-to-action button is rendered on any of the three; (7) NO roadmap feature numbers, NO external links anywhere; (8) the preview slots are excluded from the accessibility tree (verify in browser DevTools accessibility panel that `aria-hidden="true"` is set).

### Implementation for User Story 4

- [x] T026 [US4] Update `app/(shell)/dashboard/transactions/page.tsx`: replace the existing placeholder with the upgraded `<EmptyState>`: `illustration={<TransactionsIllustration />}`, `title="Transactions are coming soon"`, `description="Track every dollar in and out of your accounts, categorise them, and see where your money goes."`, no `action`, and `preview` set to a faded two-row mock of a transaction table (use semantic table markup with `<Money>` for the amount column so the preview is typographically truthful). Per FR-024 + Clarifications Q2.
- [x] T027 [US4] Update `app/(shell)/dashboard/budgets/page.tsx`: replace the existing placeholder with the upgraded `<EmptyState>`: `illustration={<BudgetsIllustration />}`, `title="Budgets are coming soon"`, `description="Cap your spending by category and stay on top of the limits you set."`, no `action`, and `preview` set to a faded progress-bar mock (e.g., a labeled bar at ~60% fill plus a `<Money>` total below). Per FR-025 + Clarifications Q2.
- [x] T028 [US4] Update `app/(shell)/dashboard/settings/page.tsx`: replace the existing placeholder with the upgraded `<EmptyState>`: `illustration={<SettingsIllustration />}`, `title="Settings are coming soon"`, `description="Update your profile, change your password, and manage your preferences."`, no `action`, NO `preview` slot (FR-026 explicitly forbids a settings preview). Per FR-026 + Clarifications Q2.

**Checkpoint**: All five dashboard routes now use the upgraded empty-state primitive consistently. Three of the five (Transactions, Budgets, Settings) are pure empty states; one (Accounts) loads when data exists; one (Dashboard) shows a welcome panel.

---

## Phase 7: User Story 5 — Sidebar grouping (Priority: P2)

**Goal**: The shell sidebar (desktop + mobile drawer) is organized into named groups (TRACK / MANAGE) instead of a single flat list of 5 items. The structure scales as more routes land.

**Independent Test**: Open the sidebar on desktop (viewport ≥1024px). Confirm: (1) two groups are visible; (2) "TRACK" label appears above Dashboard / Accounts / Transactions; (3) "MANAGE" label appears above Budgets / Settings; (4) a visible separator sits between the groups; (5) section labels are uppercase, letter-spaced, small, muted-foreground; (6) keyboard tab order goes from one nav-item to the next nav-item without focus landing on the section labels (verify with `Tab` from the brand). Resize to mobile width, open the drawer, confirm the same grouping is reflected. Navigate to a route in each group, confirm the active-route highlight from feature 002 still works.

### Implementation for User Story 5

- [x] T029 [US5] Refactor `components/shell/nav-items.ts`: add a `NavGroup` type (`{ label: string; items: NavItem[] }`) and a `navGroups: NavGroup[]` export with two groups — `{ label: "TRACK", items: [Dashboard, Accounts, Transactions] }` and `{ label: "MANAGE", items: [Budgets, Settings] }`. Retain a back-compat `navItems: NavItem[]` export computed as `navGroups.flatMap(g => g.items)` so any future caller still needing the flat list keeps working. Per research.md R15.
- [x] T030 [US5] Update `components/shell/sidebar.tsx`: consume `navGroups` instead of `navItems`. Render: `<Brand>` → `<Separator>` → for each group: `<span className="px-3 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground" aria-hidden="true">{group.label}</span>` followed by a list of `<NavLink>` for each item in the group → `<Separator>` between groups (NOT after the last). Section labels MUST have `aria-hidden="true"` and MUST NOT receive keyboard focus (FR-030).
- [x] T031 [US5] Update `components/shell/mobile-nav.tsx`: apply the same group rendering pattern as `sidebar.tsx` inside the `<SheetContent>` so the drawer mirrors the desktop structure. Section labels stay `aria-hidden`. The `onNavigate={() => onOpenChange(false)}` prop on `<NavLink>` is preserved from feature 002.

**Checkpoint**: All five stories complete. Sidebar reads as a deliberate structure rather than a flat list.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verification — every existing test stays green, type/lint/format pass, WCAG contrast verified, visual walkthrough per quickstart.md.

- [X] T032 Run `pnpm typecheck` from the repo root — zero errors, zero `any` introduced (FR-035 + SC-013).
- [X] T033 Run `pnpm lint` from the repo root — zero errors.
- [X] T034 Run `pnpm format` to apply Prettier across modified files, then `pnpm format:check` to verify clean.
- [X] T035 Run `pnpm test` from the repo root — all 105 unit tests still green (no test added, no test broken) per FR-040.
- [X] T036 Run `pnpm test:e2e` from the repo root — all 17 e2e tests still green (1 health + 10 auth + 6 accounts; no regression on signup → login → logout, accounts CRUD, archive, multi-currency, validation flows) per FR-040 + SC-007.
- [X] T037 WCAG contrast audit: using the browser DevTools accessibility panel (or `pa11y-ci` if available — observability tool only, NOT a new runtime dep), verify `--money-negative` text passes WCAG AA contrast against `--background` in both light and dark themes; verify the new `--money-positive` token (even though it's not applied by the rendering primitive in this chore) ALSO meets WCAG AA so future features can apply it safely (per FR-037 + SC-008).
- [X] T038 Manual visual walkthrough per `specs/005-branded-ui-polish/quickstart.md`: visit `/`, the favicon, `/icon.png`, `/opengraph-image.png`, sign up + log in, visit all 5 dashboard routes, verify brand mark presence, Inter typeface, footer presence on every shell route, `<Money>` rendering on the accounts list with at least one negative-balance account, sidebar grouping, all 5 empty states. Confirm against the spec's 23 acceptance scenarios + 12 edge cases.

**Final checkpoint**: Branded UI polish chore is mergeable. Plan's Constitution Check post-design re-evaluation still holds; the existing feature 001/002/003/004 surface is untouched in behavior (FR-040); zero new runtime deps (FR-039); zero database changes (FR-038).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup** (T001 Inter + T002 tokens) — must complete first; every later phase consumes the typography variable or the new color tokens.
- **Phase 2 — Foundational** (T003–T010) — depends on Phase 1. Within Phase 2: T003 (AbacusIcon) blocks T006–T010 (illustrations may want to reuse the abacus geometry); T004 (EmptyState upgrade) is independent of T003/T005; T005 (Money primitive) is independent of T003/T004. T006–T010 can parallelize once T003 lands.
- **Phase 3 (US1)** depends on Phase 2 — specifically on T003 (AbacusIcon) for T011/T012/T013/T014/T015. T016/T017/T018 (hero, feature-grid, changelog) depend only on Phase 1's Inter + tokens.
- **Phase 4 (US2)** depends on Phase 2 — T003 for T019/T020, T004 for T022, T006 (AbacusIllustration) for T022. T021 depends on T020.
- **Phase 5 (US3)** depends on Phase 2 — T005 (Money) for T024, T004 (EmptyState upgrade) + T007 (AccountsIllustration) for T025.
- **Phase 6 (US4)** depends on Phase 2 — T004 (EmptyState upgrade) + T005 (Money for preview slots) + T008/T009/T010 (illustrations) for T026/T027/T028. Also independently independent of US1/US2/US3.
- **Phase 7 (US5)** depends on Phase 2 — only on T003 indirectly (the existing `<Brand>` is already updated in US2). Otherwise independent of US1–US4.
- **Phase 8 (Polish)** depends on all earlier phases.

### Within Phase 2

- T003 (AbacusIcon) before T006 (AbacusIllustration) — illustration reuses the abacus geometry concept.
- T003 / T004 / T005 independent of each other → all 3 can run sequentially.
- T006 / T007 / T008 / T009 / T010 (illustrations) all parallelizable after T003.

### Within Phase 3 (US1)

- T011 / T012 / T013 / T014 / T015 all depend on T003 (AbacusIcon).
- T013 / T014 / T015 (favicon, apple-icon, OG image) all parallelizable — different files, no shared state.
- T016 / T017 / T018 (hero / feature-grid / changelog) all parallelizable — different files.

### Within Phase 4 (US2)

- T019 → independent.
- T020 → T021 (footer must exist before app-shell mounts it).
- T022 → T023 (welcome panel must exist before the page renders it).
- T022 depends on T004 (EmptyState) + T006 (AbacusIllustration).

### Within Phase 6 (US4)

- T026 / T027 / T028 all independent (different files).

### Within Phase 7 (US5)

- T029 (data refactor) → T030 (sidebar consumes) AND T031 (mobile-nav consumes). T030 and T031 are independent after T029.

### Parallel opportunities

- **Phase 2**: T006–T010 (5 illustrations) all `[P]` after T003 lands.
- **Phase 3**: T013 + T014 + T015 (favicon + apple-icon + OG image) all `[P]`.
- **Phase 3**: T016 + T017 + T018 (hero + feature-grid + changelog) all parallelizable manually (the tasks markdown doesn't flag them `[P]` because they're sequential in dependency order but they touch different files).

---

## Parallel Example: Phase 2 illustrations

```bash
# After T003 (AbacusIcon) lands:
Task: "Create components/illustrations/abacus-illustration.tsx"
Task: "Create components/illustrations/accounts-illustration.tsx"
Task: "Create components/illustrations/transactions-illustration.tsx"
Task: "Create components/illustrations/budgets-illustration.tsx"
Task: "Create components/illustrations/settings-illustration.tsx"
```

## Parallel Example: Phase 3 favicon + OG

```bash
# After T003 (AbacusIcon) lands:
Task: "Create app/icon.tsx (32x32 favicon ImageResponse)"
Task: "Create app/apple-icon.tsx (180x180 iOS icon)"
Task: "Create app/opengraph-image.tsx (1200x630 social preview)"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 — the three P1 stories)

1. Complete Phase 1: Setup (T001–T002).
2. Complete Phase 2: Foundational (T003–T010).
3. Complete Phase 3: US1 (T011–T018) — marketing surface fully branded.
4. Complete Phase 4: US2 (T019–T023) — authenticated shell coherent.
5. Complete Phase 5: US3 (T024–T025) — money rendering trusted.
6. **STOP and VALIDATE**: run the polish-phase audits (T032–T038). The MVP is shippable here.

### Incremental Delivery

1. MVP (US1 + US2 + US3) ships first.
2. Add US4 — rich empty states on placeholder routes (T026–T028). Re-run polish audits. Ship.
3. Add US5 — sidebar grouping (T029–T031). Re-run polish audits. Ship.

### What can be safely cut under schedule pressure

- T037 WCAG contrast audit — automated; can be deferred 1 cycle if the tokens visually pass.
- T038 manual visual walkthrough — can be deferred if the e2e suite passes (the suite covers behavior; the walkthrough catches visual regressions the suite misses).
- US5 sidebar grouping — pure UX improvement; the flat sidebar from feature 002 still functions.

### What CANNOT be cut

- T032–T036 (typecheck / lint / format / unit-tests / e2e-tests) — these are gating per FR-040. The chore MUST NOT regress behavior.
- The `<Money>` primitive contract (T005) — the only file that violates Principle I if cut.
- The single `<AbacusIcon>` contract surface (T003) — required by FR-009 to prevent visual drift across surfaces.

---

## Traceability: spec FRs → tasks

| FR | Covered by |
|---|---|
| FR-001 (custom Abacus brand mark) | T003 |
| FR-002 (recognizable at favicon size) | T003 (acceptance criteria) + T013 (favicon) |
| FR-003 (favicon convention) | T013, T014 |
| FR-004 (OG image) | T015 |
| FR-005 (Inter typeface, no-flash loading) | T001 |
| FR-006 (wordmark alongside mark, both surfaces) | T011 (marketing), T019 (shell) |
| FR-007 (money-positive token; WCAG AA both themes) | T002, T037 |
| FR-008 (negative = desaturated red) | T002 (money-negative token), T005 (applied by Money primitive) |
| FR-009 (single AbacusIcon contract) | T003 |
| FR-010 (Money primitive, rendering-only, no arithmetic) | T005 |
| FR-011 (tabular numerals) | T005 |
| FR-012 (currency always with amount) | T005 (contract makes "no currency" structurally impossible) |
| FR-013 (sign-aware color, money-positive RESERVED) | T005 |
| FR-014 (accounts list migrates to Money) | T024 |
| FR-015 (Money is single contract for monetary display) | T005, T024 |
| FR-016 (footer on every authenticated route) | T020, T021 |
| FR-017 (content-minimal footer) | T020 |
| FR-018 (footer sticky-bottom; no conflict with mobile drawer) | T021 (flex layout, not position-fixed) |
| FR-019 (theme toggle reachable everywhere) | by-preservation — existing header location unchanged (research.md R14) |
| FR-020 (EmptyState illustration slot + icon back-compat) | T004 |
| FR-021 (EmptyState preview slot, aria-hidden) | T004 |
| FR-022 (dashboard welcome panel) | T022, T023 |
| FR-023 (accounts zero-state migrated) | T025 |
| FR-024 (transactions coming-soon w/ preview) | T026 |
| FR-025 (budgets coming-soon w/ preview) | T027 |
| FR-026 (settings coming-soon NO preview) | T028 |
| FR-027 (static, monochrome+1, stroke-based illustrations) | T006–T010 |
| FR-028 (TRACK/MANAGE sidebar grouping) | T029, T030 |
| FR-029 (mobile drawer same grouping) | T031 |
| FR-030 (active-route preserved, section labels not focusable) | T030, T031 |
| FR-031 (hero re-pass + "Learn more" link) | T016 |
| FR-032 (feature-grid icon treatment) | T017 |
| FR-033 (changelog bead-dots) | T018 |
| FR-034 (marketing footer refresh) | T012 |
| FR-035 (strict TS, no `any`) | all tasks + T032 |
| FR-036 (no rounding in display layer) | T005 (Money primitive delegates to formatAmount which doesn't round) |
| FR-037 (WCAG AA contrast for new tokens) | T002 + T037 |
| FR-038 (no migration, no domain entity) | by-omission across all tasks |
| FR-039 (no new runtime dependency) | by-omission across all tasks |
| FR-040 (all existing E2E tests pass) | T035, T036 |
| SC-001..SC-013 (measurable outcomes) | all have at least one corresponding task or audit |

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps a task to its user story; Setup / Foundational / Polish tasks have no story label.
- The EmptyState upgrade in T004 MUST preserve back-compat — `app/(shell)/error.tsx` still uses the `icon` prop, do NOT remove it.
- The Money primitive (T005) MUST NEVER accept `number` — type signature is `amount: string`, enforced at compile time. Sign detection uses string parsing, not arithmetic.
- Inter loaded via `next/font/google` is NOT a new package.json dependency — it's a built-in Next.js convention that fetches at build time.
- `app/icon.tsx` / `app/apple-icon.tsx` / `app/opengraph-image.tsx` are NOT API routes; they're framework-native conventions producing static-ish image responses at fixed URLs.
- Commit after each task or each tight logical group (e.g., one commit for T013+T014+T015 as "favicon + OG image"; one for T026+T027+T028 as "coming-soon empty states").
- Avoid: vague tasks ("polish the UI"), same-file `[P]` conflicts (we never have two `[P]` tasks editing the same file), cross-story dependencies that break independence (US4 and US5 are component-edit-only on top of foundational; they don't modify each other's files).
