# Implementation Plan: App Shell

**Branch**: `002-app-shell` | **Date**: 2026-05-16 | **Spec**: [`./spec.md`](./spec.md)

**Input**: Feature specification at `specs/002-app-shell/spec.md`

## Summary

Promote the feature-001 scaffold from a bare "Abacus is running" page into a real, navigable application shell. Add a persistent left sidebar at desktop widths (≥768px, see Phase 0 §3), a sticky header with a hamburger-triggered slide-in drawer (shadcn `Sheet`) at mobile widths (<768px), five placeholder route segments (`/`, `/accounts`, `/transactions`, `/budgets`, `/settings`), per-route `loading.tsx` and `error.tsx`, a root `not-found.tsx`, an empty-state component vocabulary, route-change focus management onto `<main tabindex="-1">`, and a violet primary brand pass over the existing slate neutral palette via shadcn CSS variables. The existing `<ThemeToggle>` is relocated from `app/page.tsx` into the shell header so it is reachable from every route. No domain models are added — Prisma schema stays empty. No API endpoints are added. No money values, charts, CRUD, auth, or seed data appear in this feature. One Playwright E2E walks all five routes and asserts each renders inside the shell with no console error.

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode (inherited from feature 001), Node.js 24 LTS.

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Tailwind CSS 3.x, shadcn/ui (copied components — adding `sheet`, `separator`, `scroll-area` in this feature), `next-themes` (already wired), `lucide-react` (icon set — already a transitive dependency from shadcn). No new npm packages outside the shadcn-CLI-managed peer deps.

**Storage**: PostgreSQL 16 via existing `docker-compose.yml`. **No schema changes in this feature.** `db/schema.prisma` remains datasource + generator only.

**Testing**: Vitest (unit) — no new unit tests required by this feature (no money paths, no Zod boundaries added). Playwright (E2E) — one new test that walks the five routes and asserts shell + route-specific placeholder render.

**Target Platform**: Same as feature 001 — local developer workstation (macOS / Linux), browser viewports from 320px to 1920px+.

**Project Type**: Single-package Next.js web application. Constitution folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) preserved.

**Performance Goals**:
- Client-side route changes (FR-009): no full page reload between any two top-level routes.
- No measurable layout shift on initial paint of any route (the shell renders before content via the layout).
- No FOUC on theme (preserved from feature 001; verified on every new route per FR-012).

**Constraints**:
- TypeScript strict; `any` remains disallowed.
- No `db push`; not exercised here (no schema change), but the prohibition stands.
- All new code lives under the constitution folders (`app/`, `components/`, `lib/`, `tests/`).
- No new API routes — the constitution envelope `{ data } | { error: { code, message } }` is not exercised here.
- Tailwind 3 `md:` breakpoint (≥768px) is the desktop-sidebar boundary; mobile drawer governs <768px (see Phase 0 §3 — deferred clarification 3 resolved).

**Scale/Scope**: Five routes, one shell layout, one drawer component, one header, one sidebar, one route-focus helper, three shadcn additions, plus loading/error/not-found boilerplate. Approximately 25 new files.

## Constitution Check

*GATE: passes before Phase 0 research. Re-checked after Phase 1 design — still passes.*

| Principle | Applicability | How this plan honors it |
|---|---|---|
| **I. Money math is non-negotiable** | **N/A for this feature.** FR-028 explicitly forbids any monetary value display, monetary input, or `lib/money/` helpers. No `Decimal` field is added because no model is added. The `--success` / `--money-positive` CSS variable is deliberately NOT defined; emerald remains reserved for the first feature that displays positive money. | The folder `lib/money/` continues to not exist. No currency code, no `Decimal`, no FX consideration anywhere in this feature. Documented in research §10. |
| **II. Type safety end-to-end** | **Applies.** All new files are strict-typed React/TS. Nav-item shape, empty-state props, and AppShell props are explicit interfaces. No `any`. `usePathname()` returns `string | null` — narrowed before use. | `tsconfig.json` already enforces strict mode; ESLint rule against `any` already in place. Each new component declares its props with a named TypeScript interface. No casting except where React DOM types demand `as`. |
| **III. Validate at boundaries, trust internally** | **No new boundaries in this feature.** No API routes are added. No external request handling. The single existing boundary (`lib/env.ts` Zod schema, feature 001) is untouched. | Nothing to add. If during build an unexpected boundary surfaces (e.g., reading from URL query params), Zod validates at that point. Not anticipated for shell scope. |
| **IV. Test the money paths** | **No money paths exist.** Required by FR-035 and SC-009: at least one Playwright E2E walks the shell across all five routes. This is the shell smoke, not a money-path mandate. No new Vitest unit tests are required (no money math, no schema). | `tests/e2e/shell.spec.ts` walks `/` → `/accounts` → `/transactions` → `/budgets` → `/settings`, asserts each renders inside the shell (sidebar landmark visible, route-specific placeholder text present), and confirms no console errors at any step. |
| **V. Spec-driven development** | **Applies.** `specs/002-app-shell/spec.md` is approved (5 locked clarifications, 4 deferred items resolved here). `tasks.md` and implementation follow. | One feature in flight. No code lands before this `plan.md` is `READY_FOR_BUILD`. |

**No violations. Complexity Tracking section is empty.**

## Deferred Clarifications — resolved here

The spec's "Deferred Clarifications" section listed four planning-level questions. Each is resolved below and baked into the design.

1. **Empty-state CTAs behavior** → **Informational only this feature.** The dashboard empty state shows a primary CTA labeled "Add your first account" that is **not** a hyperlink — it is a `<Button>` that opens a small inline note ("Account creation lands in a future feature"), or alternatively a disabled button with `aria-describedby` pointing at that note. Rationale: FR-030 forbids any create/edit/delete flow, and the spec is explicit that CTAs are "navigational at most." Adding `/accounts/new` placeholder routes now adds three more route files (`page.tsx`, `loading.tsx`, `error.tsx`) per area for no user value — and they'd need to be deleted when the real feature lands. Informational is the minimum that satisfies FR-004 without inventing throwaway routes.

2. **Visual density** → **Comfortable (Notion-like).** Concrete defaults baked into the design:
   - Base body font: `text-sm` (14px) for chrome, `text-base` (16px) for content — Tailwind defaults.
   - Sidebar item height: `h-10` (40px), `px-3` horizontal padding.
   - Sidebar item gap: `gap-1` between items, `gap-2` between icon and label.
   - Header height: `h-14` (56px).
   - Content padding: `p-6` (24px) on mobile, `p-8` (32px) on desktop.
   - Empty-state card: generous `py-12 px-6` (48px vertical / 24px horizontal).
   - Rationale: This is a personal-finance app, not a high-density operator console. The user reads one or two numbers per glance, not 200 rows; comfortable spacing reduces cognitive load. Dense (Linear) defaults can be retrofit per-feature if a transaction-list page demands it; comfortable everywhere is the safer global default to retreat from than the inverse.

3. **Tablet range (640–1023px)** → **Desktop sidebar starts at the Tailwind `md:` breakpoint (≥768px).** Mobile drawer governs all viewports <768px. The 640–767px range, which the spec called "permitted to render either layout," renders the mobile drawer. Rationale: the natural Tailwind 3 breakpoints are `sm: 640`, `md: 768`, `lg: 1024`, `xl: 1280`. Picking `md:` for the sidebar means standard Tailwind variants (`md:flex`, `md:w-64`) compose cleanly with no custom breakpoint config. The spec's locked clarification said "≥1024px" as the minimum desktop sidebar viewport; `≥768px` is a superset (sidebar appears earlier, which serves the user better). No conflict with the spec's locked clarification — the spec set the **minimum** desktop width, not the maximum mobile width.

4. **Focus landing on route change** → **`<main tabindex="-1">` content region.** A small client component `<RouteFocus>` mounted inside the shell calls `mainRef.current.focus()` after `usePathname()` changes. Rationale: this is the conventional choice for keyboard and screen-reader users (it puts focus on the new page's primary region without forcing them through the nav again), it's testable (Playwright can assert `document.activeElement.tagName === "MAIN"`), and `tabindex="-1"` makes `<main>` programmatically focusable without inserting it into the natural tab order. The page heading was considered but rejected — it ties focus management to a specific DOM shape (every route must have an `<h1>` first), and screen readers will announce the heading on focus-into-`<main>` anyway because the heading is the first child.

## Project Structure

### Documentation (this feature)

```text
specs/002-app-shell/
├── plan.md              # This file
├── research.md          # Phase 0 — non-obvious decisions
├── data-model.md        # Phase 1 — "no entities" stub
├── quickstart.md        # Phase 1 — feature 002 local-run delta over feature 001
├── contracts/
│   └── shell.md         # UI contract: AppShell, nav-item shape, empty-state, error boundary
└── spec.md              # (already exists — input to this plan)
```

### Source Code (repository root)

```text
abacus/
├── app/
│   ├── (shell)/                              # Route group — wraps every top-level route in the shell layout
│   │   ├── layout.tsx                        # Renders <AppShell>{children}</AppShell>; one layout for all five routes
│   │   ├── loading.tsx                       # Shell-aware loading skeleton at the (shell)-group level
│   │   ├── error.tsx                         # Shell-aware error boundary at the (shell)-group level ("use client")
│   │   ├── page.tsx                          # Dashboard: empty-state with informational CTA
│   │   ├── accounts/
│   │   │   └── page.tsx                      # Accounts placeholder + empty state
│   │   ├── transactions/
│   │   │   └── page.tsx                      # Transactions placeholder + empty state
│   │   ├── budgets/
│   │   │   └── page.tsx                      # Budgets placeholder + empty state
│   │   └── settings/
│   │       └── page.tsx                      # Settings placeholder + empty state
│   ├── not-found.tsx                         # Root-level not-found that opts into the shell visually (renders <AppShell>)
│   ├── globals.css                           # MODIFIED: override --primary (violet) + --ring; preserve slate neutrals
│   ├── layout.tsx                            # UNCHANGED structurally; HomePage's old <ThemeToggle> is moved out
│   ├── page.tsx                              # REMOVED — dashboard now lives at app/(shell)/page.tsx via the route group
│   └── providers.tsx                         # UNCHANGED — next-themes still wraps the tree from the root
│
├── components/
│   ├── shell/
│   │   ├── app-shell.tsx                     # The shell composition: sidebar (desktop) + header + drawer (mobile) + <main>
│   │   ├── sidebar.tsx                       # Fixed-width desktop sidebar; renders nav items, brand mark
│   │   ├── header.tsx                        # Sticky top header; hamburger on mobile, theme toggle right side
│   │   ├── mobile-nav.tsx                    # Drawer-bound mobile nav (renders inside <Sheet>); same items as sidebar
│   │   ├── nav-items.ts                      # The single source of truth array: [{ href, label, icon }] for all 5 routes
│   │   ├── nav-link.tsx                      # Active-state-aware nav link (consumes usePathname); used by sidebar + mobile-nav
│   │   ├── route-focus.tsx                   # Client-only: focuses <main> on pathname change
│   │   ├── empty-state.tsx                   # <EmptyState title icon description action? /> — used by every route page
│   │   └── brand.tsx                         # "Abacus" wordmark + small icon for the sidebar top
│   ├── theme-toggle.tsx                      # UNCHANGED — same component, just imported from header.tsx instead of page.tsx
│   └── ui/
│       ├── button.tsx                        # EXISTING
│       ├── dropdown-menu.tsx                 # EXISTING
│       ├── sheet.tsx                         # ADDED via `pnpm dlx shadcn add sheet`
│       ├── separator.tsx                     # ADDED via `pnpm dlx shadcn add separator`
│       └── scroll-area.tsx                   # ADDED via `pnpm dlx shadcn add scroll-area`
│
├── lib/
│   ├── env.ts                                # UNCHANGED
│   ├── prisma.ts                             # UNCHANGED
│   └── utils.ts                              # UNCHANGED (cn() still serves)
│
├── db/
│   └── schema.prisma                         # UNCHANGED — empty of models
│
├── tests/
│   ├── unit/
│   │   └── env.test.ts                       # UNCHANGED — no new unit tests required this feature
│   └── e2e/
│       ├── health.spec.ts                    # UNCHANGED
│       └── shell.spec.ts                     # NEW — walks all five routes; asserts shell present + route placeholder text
│
└── CLAUDE.md                                 # MODIFIED — speckit block points at specs/002-app-shell/plan.md
```

**Structure Decision**: Use a Next.js App Router **route group** `(shell)` to give all five top-level routes a single shared layout (the `<AppShell>` chrome) without changing their URLs (route groups do not appear in the URL — `app/(shell)/page.tsx` is still served at `/`). The root `app/layout.tsx` continues to hold `<html>`, `<body>`, and `<Providers>` (next-themes); the `(shell)` group's `layout.tsx` adds the chrome inside that. `app/page.tsx` is **removed** — the dashboard moves to `app/(shell)/page.tsx`. The root-level `app/not-found.tsx` lives outside the route group so it catches truly unmatched URLs, but it renders `<AppShell>` directly to keep the chrome visible on 404 surfaces (FR-023). Per-route `loading.tsx` and `error.tsx` are intentionally placed at the **group** level (`app/(shell)/loading.tsx`, `app/(shell)/error.tsx`) rather than per-route — they apply uniformly to all five routes. If a single route ever needs a bespoke loading or error, that route can override by adding a sibling file; for now, the group-level pair satisfies FR-020 and FR-021 with the minimum file count.

## API Surface

**No new API endpoints in this feature.** FR-032 acknowledges the constitution envelope if any are added; none are. The existing `GET /api/health` from feature 001 is unchanged.

## UI Surface

### Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `app/(shell)/page.tsx` | Dashboard. Empty-state card titled "Welcome to Abacus" with a primary informational CTA ("Add your first account" — informational only per deferred-clarification 1). |
| `/accounts` | `app/(shell)/accounts/page.tsx` | Accounts placeholder. Empty-state card titled "No accounts yet" with descriptive copy that the feature is pending. |
| `/transactions` | `app/(shell)/transactions/page.tsx` | Transactions placeholder. Same shape. |
| `/budgets` | `app/(shell)/budgets/page.tsx` | Budgets placeholder. Same shape. |
| `/settings` | `app/(shell)/settings/page.tsx` | Settings placeholder. Same shape, "Settings will land in a future feature." |
| `(any 404)` | `app/not-found.tsx` | Renders the shell + a not-found body with a primary action linking back to `/`. |

### Key components

| Component | Path | Props / Slots | Notes |
|---|---|---|---|
| `<AppShell>` | `components/shell/app-shell.tsx` | `children: ReactNode` | Composition root. Renders `<Sidebar>` (hidden below `md`), `<Header>` (visible everywhere; hamburger visible below `md`), `<MobileNav>` (drawer, rendered always but only opened by header on mobile), `<main tabindex="-1" ref={mainRef}>{children}</main>`, and `<RouteFocus mainRef={mainRef} />`. |
| `<Sidebar>` | `components/shell/sidebar.tsx` | none | Fixed `md:w-64` (256px — middle of the 240–280 range). Renders `<Brand>`, separator, and the nav-items list via `<NavLink>`. Semantic `<nav aria-label="Primary">`. |
| `<Header>` | `components/shell/header.tsx` | `onOpenMobileNav: () => void` | Sticky top, `h-14`. Renders the hamburger button (visible below `md` only) and `<ThemeToggle>` (always visible, right-aligned). Semantic `<header>`. |
| `<MobileNav>` | `components/shell/mobile-nav.tsx` | `open: boolean; onClose: () => void` | Wraps shadcn `<Sheet>` with `side="left"`. Renders the same nav items as `<Sidebar>` via `<NavLink>` and `<Brand>`. Selecting an item calls `onClose()` (FR-008). Sheet handles backdrop tap, Escape, and focus trap with focus return out of the box (verified in research §1). |
| `<NavLink>` | `components/shell/nav-link.tsx` | `href: string; label: string; icon: LucideIcon` | Renders a Next `<Link>` styled as a ghost button. Uses `usePathname()` and the active-route rule from `contracts/shell.md` to apply the active class (violet primary background + foreground). `aria-current="page"` when active. |
| `<RouteFocus>` | `components/shell/route-focus.tsx` | `mainRef: RefObject<HTMLElement>` | `"use client"`. On `usePathname()` change after first mount, calls `mainRef.current?.focus()`. No-op on initial mount (the user has not navigated yet). |
| `<EmptyState>` | `components/shell/empty-state.tsx` | `title: string; description: string; icon: LucideIcon; action?: { label: string; href?: string; onClick?: () => void; disabled?: boolean }` | Vertical-centered card with the icon, title, description, and an optional action `<Button>`. If `href` is provided, the action is a Next `<Link>` styled as a button; if `onClick` or `disabled`, it's a `<Button>`. Used by every route page. |
| `<Brand>` | `components/shell/brand.tsx` | none | The "Abacus" wordmark + the Lucide `Wallet` (or similar) icon, sized for both sidebar (full) and mobile drawer (full). Not a link — a non-interactive label in this feature (linking to `/` would conflict with the dashboard nav item's active state). |
| `<ThemeToggle>` | `components/theme-toggle.tsx` | none | **UNCHANGED from feature 001.** It is imported by `<Header>` instead of `app/page.tsx`. |

### shadcn/ui components to add

- **`sheet`** — the mobile drawer. Provides `<Sheet>`, `<SheetContent>`, `<SheetTrigger>`, `<SheetClose>`. Built on Radix `Dialog`, which handles focus trap, Escape, backdrop, scroll lock, and `aria-modal` (satisfies FR-008 and FR-018 without hand-rolling).
- **`separator`** — visual divider between `<Brand>` and nav items in the sidebar; between sections in the mobile drawer.
- **`scroll-area`** — wraps the sidebar nav list so it scrolls cleanly if the future feature adds many nav items, without breaking the layout in this feature.

Added via `pnpm dlx shadcn@latest add sheet separator scroll-area`. Non-interactive flags (`--yes`) covered in research §1.

### Charts

**N/A.** FR-029 forbids real charts. Empty-state placeholders do not include chart-shaped mocks in this feature.

## File-Level Layout (new files in this feature)

| Path | Purpose |
|---|---|
| `app/(shell)/layout.tsx` | Wraps the route-group children in `<AppShell>`. Server component. |
| `app/(shell)/loading.tsx` | Shell-consistent loading skeleton (text-only placeholder, no spinner per FR-020). |
| `app/(shell)/error.tsx` | Error boundary client component. Renders friendly message + "Try again" (`reset()`) + "Go to dashboard" (`<Link href="/">`). |
| `app/(shell)/page.tsx` | Dashboard route; renders `<EmptyState>` with the dashboard's welcome content. |
| `app/(shell)/accounts/page.tsx` | Accounts placeholder with `<EmptyState>`. |
| `app/(shell)/transactions/page.tsx` | Transactions placeholder with `<EmptyState>`. |
| `app/(shell)/budgets/page.tsx` | Budgets placeholder with `<EmptyState>`. |
| `app/(shell)/settings/page.tsx` | Settings placeholder with `<EmptyState>`. |
| `app/not-found.tsx` | Root not-found. Renders `<AppShell>` and a not-found message + "Back to dashboard" link. |
| `components/shell/app-shell.tsx` | Composition root: sidebar + header + main + drawer + RouteFocus. |
| `components/shell/sidebar.tsx` | Desktop sidebar (`hidden md:flex`). |
| `components/shell/header.tsx` | Sticky top header with hamburger and theme toggle. |
| `components/shell/mobile-nav.tsx` | Drawer that mirrors the sidebar's nav items. |
| `components/shell/nav-items.ts` | Single-source-of-truth array of `{ href, label, icon }` for all five routes. |
| `components/shell/nav-link.tsx` | Active-aware nav link used by both sidebar and mobile nav. |
| `components/shell/route-focus.tsx` | Focuses `<main>` on pathname change. |
| `components/shell/empty-state.tsx` | Reusable empty-state component used by every route page. |
| `components/shell/brand.tsx` | "Abacus" wordmark + small icon. |
| `components/ui/sheet.tsx` | shadcn-added drawer primitive. |
| `components/ui/separator.tsx` | shadcn-added divider primitive. |
| `components/ui/scroll-area.tsx` | shadcn-added scroll-area primitive. |
| `tests/e2e/shell.spec.ts` | Playwright E2E walking all five routes; asserts shell + route-specific placeholder text. |

### Modified files

| Path | Change |
|---|---|
| `app/page.tsx` | **Removed.** Dashboard now lives at `app/(shell)/page.tsx`. |
| `app/globals.css` | Override `--primary`, `--primary-foreground`, and `--ring` (light + dark) with violet HSL values. Slate neutrals unchanged. See research §7 and §8 for exact HSL values. |
| `CLAUDE.md` | Update `<!-- SPECKIT START --> ... <!-- SPECKIT END -->` block to point at `specs/002-app-shell/plan.md`. |

### Files **NOT** touched

- `app/layout.tsx` — root html/body/Providers structure stays as feature 001 left it.
- `app/providers.tsx` — `next-themes` configuration is unchanged.
- `components/theme-toggle.tsx` — same component; only its import location moves.
- `components/ui/button.tsx`, `components/ui/dropdown-menu.tsx` — untouched.
- `lib/*` — no changes.
- `db/schema.prisma` — remains empty of models (FR-027).
- `tailwind.config.ts` — the violet primary maps via existing `--primary` CSS variable; no Tailwind theme edits needed.
- `tests/unit/env.test.ts` — unchanged.

## Money & Currency Notes

**N/A — this feature displays no monetary values.** FR-028 forbids any monetary amount display, monetary input, or `lib/money/` helpers. The folder `lib/money/` is intentionally not created. No `Decimal`, no currency code, no FX. Emerald (the future positive-money brand color) is documented in research §10 as **reserved**: no `--success` or `--money-positive` CSS variable is added in this feature, even though Tailwind's emerald palette is available — wiring it up now would create confusion when the first money-displaying feature defines its semantics.

## Auth & Validation Boundaries

**Auth**: None. FR-026 forbids it. The shell is fully public and no route is gated. Auth.js stays installed (feature 001) but un-wired. No `middleware.ts` for auth in this feature.

**Validation boundaries**:
- **Process env** — `lib/env.ts` (feature 001) — unchanged. No new keys.
- **API request bodies** — none added.
- **External API responses** — none consumed.
- **URL params / query** — the `usePathname()` hook returns a string read-only; nothing is parsed from the URL beyond pathname-matching, which is structural (string `startsWith` / exact equality) not data-bearing. Zod validation is not warranted at this surface.

## Testing Strategy

Per Principle IV: money paths require tests; no money paths exist. FR-035 / SC-009 still mandate a Playwright walk-through.

### Unit (Vitest) — none required

No money math, no schema, no Zod boundary added. Existing `tests/unit/env.test.ts` remains green; no new unit tests in this feature.

### E2E (Playwright) — one required test

| Test file | Coverage | Rationale |
|---|---|---|
| `tests/e2e/shell.spec.ts` | Starting at `/`, click each of the four other top-level routes in order and back to `/`. At each step assert: (a) the sidebar nav landmark is visible at desktop viewport (or the header hamburger is visible at mobile viewport — one test runs at each), (b) the URL matches the expected route, (c) the active nav item has `aria-current="page"`, (d) the route-specific placeholder text is present, (e) no console errors were emitted during navigation. | Satisfies FR-035 and SC-009. Single Playwright spec exercising all five routes is the minimum "this scaffold actually navigates" smoke test that future features can rely on. |

### What skips tests and why

- **The drawer's focus trap and Escape behavior** — Radix `Dialog` (under shadcn `Sheet`) is the source of those behaviors; testing them is testing Radix, not Abacus. Manual acceptance per FR-018.
- **The theme toggle** — unchanged from feature 001; covered by manual acceptance in that feature's plan.
- **Reduced-motion respect** — verified manually by enabling the OS setting; no automated test in this feature.
- **`error.tsx` rendering** — error boundaries are notoriously fiddly to E2E test without instrumented routes; manual acceptance ("throw inside a route page, see the boundary"). The implementer can add a query-param-triggered throw helper for manual verification.
- **`loading.tsx` rendering** — same reason; manual acceptance (slow the route artificially during implementation review).
- **Per-component tests** (sidebar, nav-link, empty-state) — UI presentation, no domain logic. Welcome but not required by Principle IV.

## Risks & Trade-offs

- **Route group `(shell)` vs. layout in `app/layout.tsx`**: chose the route group so the root layout stays minimal (`<html>` / `<body>` / `<Providers>`) and the shell chrome lives in its own scope. Trade-off: one more directory level and a small mental model ("the group does not appear in the URL"). Considered: put `<AppShell>` directly in `app/layout.tsx` — rejected because `app/not-found.tsx` and any future un-shelled route (e.g., the future `/login`) would have to opt out of the shell rather than opt in, which is harder to reason about.
- **Group-level `loading.tsx` and `error.tsx` vs. per-route**: chose group-level. Trade-off: a per-route bespoke loading state requires adding a sibling file later. Considered: per-route from the start — rejected because every route would render the same skeleton in this feature; five identical files is duplicate scaffolding.
- **Desktop sidebar boundary at `md:` (768px) vs. spec's `lg:` (1024px)**: chose `md:` (deferred clarification 3). Trade-off: the locked clarification said sidebar "always visible at viewport widths ≥1024px" — it set the minimum, not the maximum mobile width. Picking `md:` shows the sidebar earlier (768–1023px range) which serves more users, and the natural Tailwind variant is `md:`. Considered: introduce a custom breakpoint at 1024px and use `lg:` — rejected because the gain (matching the locked clarification's exact number) does not justify a custom breakpoint config.
- **Brand component is non-interactive (not a `/` link)**: chose non-interactive. Trade-off: a user can't click the wordmark to go home. Considered: make it a `<Link>` to `/` — rejected because the dashboard nav item already provides that path, and having two active-state surfaces ("dashboard" link active + "Abacus" link active) creates a fiddly visual conflict. Future feature can revisit if user testing shows the wordmark is a missed affordance.
- **Comfortable density (deferred clarification 2)**: chose comfortable. Trade-off: a future high-density transactions list might want denser defaults. Considered: dense from the start — rejected because retreating from comfortable to dense per-feature is cheaper than the reverse (you can always tighten, but loosening looks like padding bloat). Dense can be applied to a specific table later via Tailwind class overrides.

## Constitution Compliance

Re-check after Phase 1 design — **still passes, no violations.**

- **I. Money math**: N/A; no monetary value introduced. Emerald reserved (research §10). `lib/money/` continues to not exist.
- **II. Type safety**: every new component declares a typed props interface. `usePathname()` narrowed before use. No `any`.
- **III. Validate at boundaries**: no new boundary; existing `lib/env.ts` boundary preserved.
- **IV. Test money paths**: no money paths. FR-035 E2E ships (one `shell.spec.ts`).
- **V. Spec-driven**: `spec.md` → this `plan.md` → next `tasks.md`. One feature in flight (`002-app-shell`). No code written before `READY_FOR_BUILD`.
- **Conventions honored**: `app/` for routes, `components/` for UI, `lib/` untouched, `db/` untouched, `tests/` for E2E. No `db push`. shadcn primitives in `components/ui/`. shell-specific composition in `components/shell/`.

## Complexity Tracking

*No constitution violations — table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (none) | (none) | (none) |

---

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution compliant, all four deferred clarifications resolved
File: specs/002-app-shell/plan.md
```
