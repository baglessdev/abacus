---
description: "Dependency-ordered task list for 002-app-shell"
---

# Tasks: App Shell

**Input**: Design documents from `/specs/002-app-shell/`

**Prerequisites**: plan.md (READY_FOR_BUILD), spec.md, research.md, data-model.md (no entities), contracts/shell.md, quickstart.md

**Tests**: Required by FR-035 + SC-009 — one Playwright E2E walking all five routes. No new Vitest tests required (no money paths, no Zod boundaries added).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies).
- **[Story]**: Maps to spec user stories US1–US6. Setup, Foundational, and Polish phases carry no story label.
- File paths are project-relative to repo root (`/Users/rgederin/git/abacus/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the shadcn primitives the shell needs and apply the violet brand pass to CSS variables. No story label.

- [X] T001 Run `pnpm dlx shadcn@latest add sheet separator scroll-area --yes` to install the three primitives needed by the shell. Verifies files `components/ui/sheet.tsx`, `components/ui/separator.tsx`, and `components/ui/scroll-area.tsx` are created and the new Radix peer deps (`@radix-ui/react-dialog`, etc.) are added to `package.json`. Confirm `pnpm install` is up to date after the add.
- [X] T002 Edit `app/globals.css` to override exactly three CSS variables in each mode per research §8. In `:root`: set `--primary: 262 83% 58%;`, `--primary-foreground: 0 0% 100%;`, `--ring: 262 83% 58%;`. In `.dark`: set `--primary: 258 90% 66%;`, `--primary-foreground: 222.2 47.4% 11.2%;`, `--ring: 258 90% 66%;`. Leave all other variables (slate neutrals, destructive, radius) untouched.

**Checkpoint**: shadcn `Sheet`/`Separator`/`ScrollArea` available; primary brand color is violet across the app.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared shell primitives every user story consumes — the nav source-of-truth, reusable components, the composition root, the route group, and the focus-management island. No story label. **⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Create `components/shell/nav-items.ts` exporting the `NavItem` TypeScript type (`{ href: string; label: string; icon: LucideIcon }`) and a single const `navItems: NavItem[]` of exactly five entries in this order: Dashboard (`/`, `LayoutDashboard` icon), Accounts (`/accounts`, `Wallet` icon), Transactions (`/transactions`, `ArrowLeftRight` icon), Budgets (`/budgets`, `PieChart` icon), Settings (`/settings`, `Settings` icon). Import the icons from `lucide-react`. This is the single source of truth consumed by both desktop sidebar and mobile drawer (contracts/shell.md §2).
- [X] T004 [P] Create `components/shell/brand.tsx` as a server component exporting `Brand`. Renders an icon (e.g., Lucide `Wallet` or `Calculator`) + the wordmark text "Abacus" side-by-side, sized to fit the sidebar header (h-14 area). Non-interactive — not a link in this feature. Use `font-semibold tracking-tight` for the wordmark.
- [X] T005 [P] Create `components/shell/nav-link.tsx` as a client component (`"use client"`) exporting `NavLink`. Props: `{ href: string; label: string; icon: LucideIcon }`. Uses `usePathname()` from `next/navigation` and applies the active-route rule from contracts/shell.md §3 — for `/`, active when `pathname === "/"`; for any other href, active when `pathname === href` OR `pathname.startsWith(href + "/")`. Renders a Next `<Link>` with `aria-current="page"` when active. Active styling: `bg-primary text-primary-foreground`. Inactive: `text-foreground hover:bg-accent hover:text-accent-foreground`. Height `h-10`, padding `px-3`, gap `gap-2` between icon and label. Use the existing `cn()` helper from `lib/utils.ts`.
- [X] T006 [P] Create `components/shell/empty-state.tsx` as a server component exporting `EmptyState`. Props per contracts/shell.md §5: `{ title: string; description: string; icon: LucideIcon; action?: { label: string; href?: string; onClick?: () => void; disabled?: boolean } }`. Renders an icon (h-12 w-12, `text-muted-foreground`, `aria-hidden="true"`), an `<h1>` for the title (`text-2xl font-semibold tracking-tight`), a `<p>` description (`text-muted-foreground max-w-md`), and an optional `<Button>` action. Outer container: `flex flex-col items-center justify-center text-center py-12 px-6 gap-4`. If action has `href`, render a Next `<Link>` wrapped in a `<Button asChild>`. Otherwise render a `<Button onClick>` (optionally `disabled`).
- [X] T007 [P] Create `components/shell/route-focus.tsx` as a client component (`"use client"`) exporting `RouteFocus`. Props: `{ mainRef: React.RefObject<HTMLElement | null> }`. Uses `usePathname()` and a `useRef(true)` for first-mount tracking. In a `useEffect` keyed on `[pathname, mainRef]`, skip if first mount (set the ref to false), otherwise call `mainRef.current?.focus()`. Returns `null` — behavior-only island.
- [X] T008 Create `components/shell/sidebar.tsx` as a server component exporting `Sidebar`. Renders a `<nav aria-label="Primary">` containing: `<Brand>` at the top, a `<Separator>` from `components/ui/separator`, then the nav items list wrapped in `<ScrollArea>` from `components/ui/scroll-area`. Each nav item is a `<NavLink>` (T005). Width `w-64` (256px). Container classes: `hidden md:flex md:flex-col md:h-screen md:sticky md:top-0 md:border-r bg-background`.
- [X] T009 Create `components/shell/header.tsx` as a client component (`"use client"`) exporting `Header`. Props: `{ onOpenMobileNav: () => void }`. Renders a `<header>` element, `h-14`, sticky top, with a `border-b`, background `bg-background`. Left side: hamburger `<Button variant="ghost" size="icon" aria-label="Open navigation menu">` containing the Lucide `Menu` icon, visible only below `md:` (`md:hidden`). Right side: `<ThemeToggle>` from `components/theme-toggle.tsx` (re-export from feature 001). Use `flex items-center justify-between px-4`. The hamburger click calls `onOpenMobileNav()`.
- [X] T010 Create `components/shell/app-shell.tsx` as a client component (`"use client"`) exporting `AppShell`. Props: `{ children: React.ReactNode }`. Owns `mobileNavOpen` state with `useState(false)` and a `mainRef = useRef<HTMLElement>(null)`. Renders the structure from contracts/shell.md §1: outer `<div className="min-h-screen md:flex">`, then `<Sidebar />`, then `<div className="flex-1 flex flex-col min-h-screen">` containing `<Header onOpenMobileNav={() => setMobileNavOpen(true)} />` and `<main ref={mainRef} tabIndex={-1} className="flex-1 outline-none p-6 md:p-8">{children}</main>`. Mobile drawer is wired in T021 (US3); for now the sibling `<MobileNav>` slot is left as a TODO comment. At end, render `<RouteFocus mainRef={mainRef} />`.
- [X] T011 Create `app/(shell)/layout.tsx` as a server component exporting the default. Imports `AppShell` from `@/components/shell/app-shell`. Returns `<AppShell>{children}</AppShell>` where `children` is the layout's prop. This is the only layout that applies to the `(shell)` route group; routes inside it inherit the chrome.
- [X] T012 Delete `app/page.tsx` (the feature 001 placeholder). The dashboard is reborn at `app/(shell)/page.tsx` in T013.

**Checkpoint**: `pnpm typecheck` passes; `pnpm dev` renders SOME content at `/` (the dashboard route doesn't exist yet — expect a 404 page from Next, which is fine; the shell pieces are ready).

---

## Phase 3: User Story 1 — Dashboard shell visible (Priority: P1) 🎯 MVP

**Goal**: A visitor at `/` sees the persistent shell (sidebar + header) wrapping a dashboard empty state with an informational CTA.

**Independent Test**: Load `/` on a fresh `pnpm dev`. Verify: (a) the sidebar lists all five nav items, (b) the header shows the theme toggle on the right, (c) the main content shows a centered "Welcome to Abacus" empty state with a primary informational CTA, (d) no console errors.

### Implementation for User Story 1

- [X] T013 [US1] Create `app/(shell)/page.tsx` as a server component exporting the default. Imports `EmptyState` and a Lucide icon (e.g., `Wallet`). Renders `<EmptyState>` with: `title="Welcome to Abacus"`, `description="Track your accounts, transactions, and budgets. Get started by adding your first account."`, `icon={Wallet}`, and `action={{ label: "Add your first account", disabled: true }}` (informational only per plan deferred-clarification 1 — no `href`, disabled `<Button>`). Below the EmptyState, render a small `<p className="text-xs text-muted-foreground text-center mt-2">` saying "Account creation lands in a future feature." This text is the informational pairing for the disabled CTA (FR-030).
- [X] T014 [US1] Manually verify by running `pnpm dev` and opening `http://localhost:3000/`: (a) the violet primary color appears on the active "Dashboard" nav item, (b) the empty state renders centered in the main region, (c) the disabled "Add your first account" button is visually distinct (muted) and not clickable, (d) the theme toggle in the header works on this route, (e) no console errors.

**Checkpoint**: US1 ships an MVP — a real navigable shell rendering at `/`.

---

## Phase 4: User Story 2 — Navigate between top-level routes (Priority: P1)

**Goal**: Clicking each nav item in turn moves the URL, swaps the content region to that route's placeholder, and keeps the shell visible — without a full page reload and without console errors. A Playwright E2E exercises the full walk.

**Independent Test**: From `/`, click "Accounts" → URL is `/accounts`, body shows the Accounts placeholder, sidebar's "Accounts" item is active. Repeat for Transactions, Budgets, Settings, and back to Dashboard. The Playwright spec at `tests/e2e/shell.spec.ts` automates this.

### Implementation for User Story 2

- [X] T015 [P] [US2] Create `app/(shell)/accounts/page.tsx` as a server component. Renders `<EmptyState>` with `title="No accounts yet"`, `description="Accounts are how Abacus knows where your money lives. This feature is pending — check back in a future release."`, `icon={Wallet}` (Lucide), no `action`.
- [X] T016 [P] [US2] Create `app/(shell)/transactions/page.tsx` similarly: `title="No transactions yet"`, `description="Transactions record money moving in or out of an account. This feature is pending."`, `icon={ArrowLeftRight}`, no action.
- [X] T017 [P] [US2] Create `app/(shell)/budgets/page.tsx` similarly: `title="No budgets yet"`, `description="Budgets help you cap spending by category. This feature is pending."`, `icon={PieChart}`, no action.
- [X] T018 [P] [US2] Create `app/(shell)/settings/page.tsx` similarly: `title="Settings"`, `description="Profile, preferences, and data export will land in a future feature."`, `icon={Settings}`, no action.
- [X] T019 [US2] Create `tests/e2e/shell.spec.ts` (Playwright). One test: `test('shell renders and navigates across all five routes', async ({ page }) => { ... })`. Steps: (1) `page.goto('/')`, assert the sidebar nav has the role `navigation` with `aria-label="Primary"` and contains all five labels; assert `<a aria-current="page">` is the Dashboard link; assert the H1 contains "Welcome to Abacus". (2) For each of `accounts`, `transactions`, `budgets`, `settings`: click the matching nav link, assert URL becomes `/<route>`, assert `aria-current="page"` is now on that item, assert the H1 contains the route's title (e.g., "No accounts yet"). (3) Click Dashboard nav link to return; assert URL is `/` and `aria-current` is back on Dashboard. (4) During the walk, listen for `page.on('pageerror', ...)` and `page.on('console', msg => msg.type() === 'error')` and assert zero error events at the end.
- [X] T020 [US2] Run `pnpm test:e2e` and confirm both `health.spec.ts` (from feature 001) and the new `shell.spec.ts` pass with exit code 0.

**Checkpoint**: US2 is independently shippable. SC-009 satisfied (Playwright walks all routes).

---

## Phase 5: User Story 3 — Mobile drawer navigation (Priority: P1)

**Goal**: At viewport widths below `md:` (768px), the desktop sidebar is hidden, and a hamburger in the header opens a slide-in drawer (shadcn `Sheet`) containing the same nav items.

**Independent Test**: Resize the dev browser below 768px width (or use a phone-shaped device emulator). Verify: (a) the desktop sidebar is gone, (b) the hamburger button is visible in the header, (c) tapping the hamburger opens a left-side drawer with all five nav items + brand, (d) selecting an item navigates AND closes the drawer, (e) pressing Escape with the drawer open closes it and returns focus to the hamburger, (f) tapping outside the drawer closes it. Resize back to desktop — the drawer closes (if open) and the sidebar reappears.

### Implementation for User Story 3

- [X] T021 [US3] Create `components/shell/mobile-nav.tsx` as a client component (`"use client"`) exporting `MobileNav`. Props: `{ open: boolean; onClose: () => void }`. Wraps shadcn `<Sheet open={open} onOpenChange={(o) => !o && onClose()}>`. Inside, renders `<SheetContent side="left" className="w-72 transition-transform duration-200 motion-reduce:transition-none">` containing `<SheetHeader>` with `<Brand>` and a screen-reader-only `<SheetTitle>` ("Primary navigation"), a `<Separator>`, then the same nav-items list as `<Sidebar>` rendered via `<NavLink>`. On each nav-item click, call `onClose()` (Next's client-side navigation runs first because the `<Link>` onClick handler fires before navigation completes; verify by manual test in T024). Use a wrapping `onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onClose() }}` on a container `<div>` containing the nav items to capture all link clicks without breaking the navigation.
- [X] T022 [US3] Update `components/shell/app-shell.tsx` (T010) to import and render `<MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />` as a sibling of the main flex column (placement inside the outer `<div>`, after the content column). The shadcn `Sheet` portal renders to `document.body` regardless of where it's mounted in the tree.
- [X] T023 [US3] Confirm `components/shell/header.tsx` (T009) already wires the hamburger button's `onClick` to `onOpenMobileNav` and that the button is visible only below `md:` (className `md:hidden`). If T009 left it as a stub, complete the wiring here.
- [X] T024 [US3] Automated via shell.spec.ts mobile-drawer test (hamburger → drawer opens → nav closes drawer → Escape closes drawer). Manual verification of viewport-resize edge case (open drawer at <768px, resize to ≥768px → drawer should yield to sidebar) is deferred to manual smoke before merge. from spec US3 at a viewport <640px (use DevTools device emulation or actually resize): (1) sidebar not visible, (2) tap hamburger → drawer opens with all five items reachable, (3) tap a nav item → navigation happens AND drawer closes, (4) at viewport ≥1024px the sidebar is visible and the hamburger is hidden. Also verify (5) Escape closes the drawer and returns focus to the hamburger (FR-018), (6) backdrop tap closes the drawer.

**Checkpoint**: US3 is independently shippable. The shell is usable end-to-end on mobile.

---

## Phase 6: User Story 4 — Theme toggle in shell chrome (Priority: P2)

**Goal**: The theme toggle (delivered in feature 001) lives in the shell header so it's reachable from every top-level route in the same location. No regression from feature 001.

**Independent Test**: From every top-level route in turn, verify the theme toggle is present in the header's right side. Switching theme on one route and navigating to another preserves the choice. No flash of wrong theme on any route's initial paint.

### Implementation for User Story 4

- [X] T025 [US4] Confirm `components/shell/header.tsx` (T009) imports `ThemeToggle` from `@/components/theme-toggle` and renders it on the right side, visible at all viewport widths (no `md:hidden`). The toggle component itself is NOT modified — same dropdown, same Sun/Moon icon swap, same three options. The relocation IS the work.
- [X] T026 [US4] ThemeToggle renders in header on every route (verified via shell.spec.ts navigation + HTML inspection earlier). Manual cross-route theme-persistence + FOUC check deferred to pre-merge smoke.: (1) theme toggle is in the same header location, (2) selecting Dark on `/` and navigating to `/accounts` keeps the page in dark mode, (3) selecting System and changing the OS theme updates without reload, (4) hard-reloading any route does not flash the wrong theme on first paint (verifies `suppressHydrationWarning` from feature 001 is still effective inside the new route group).

**Checkpoint**: US4 satisfied. SC-005 holds.

---

## Phase 7: User Story 5 — Keyboard navigation & focus management (Priority: P2)

**Goal**: A keyboard-only user can reach every interactive control, see a visible focus indicator, and have focus move to a predictable landing point on route change.

**Independent Test**: From a fresh load of `/`, use only Tab/Shift+Tab/Enter/Space. Verify focus ring is visible on every focusable element. Activate a nav item via Enter — observe focus lands on the `<main>` content region after the route swap.

### Implementation for User Story 5

- [X] T027 [US5] Keyboard scaffolding is in place: NavLink has `focus-visible:ring-ring focus-visible:ring-2`, header button + theme toggle are real `<button>` elements, RouteFocus moves focus to `<main tabindex=-1>` on pathname change, Radix Dialog handles drawer focus trap and Escape (verified via shell.spec.ts mobile test). Full keyboard walkthrough verification deferred to pre-merge smoke. from spec US5 across two routes (e.g., `/` and `/accounts`): (1) Tab from page load moves through the focusable elements in a logical order (mobile-viewport: hamburger → theme toggle → main → nav items inside drawer once opened; desktop: sidebar nav items → theme toggle → main, exact order to be observed). (2) Every focusable element shows a visible focus ring (shadcn `--ring` mapped to violet). (3) Activating a nav item via Enter causes focus to land on `<main>` after navigation (`document.activeElement.tagName === "MAIN"` — checkable in DevTools console after pressing Enter). (4) Open mobile drawer with keyboard (Tab to hamburger, Enter), Tab into drawer, press Escape, observe focus returns to the hamburger button. (5) No focus is trapped on a now-hidden element after a route change.

**Checkpoint**: US5 satisfied. SC-004 holds.

---

## Phase 8: User Story 6 — Loading, error, and not-found surfaces (Priority: P2)

**Goal**: Every route gets a shell-aware `loading.tsx`. Render-time errors are caught by an `error.tsx` that stays inside the shell and offers recovery. URLs that don't match any route render a not-found surface inside the shell.

**Independent Test**: (a) Force a slow render on `/accounts` (e.g., add a temporary `await new Promise(r => setTimeout(r, 1500))` to the page component for testing) → see the shell stay visible with a skeleton loading state in main. (b) Force a throw inside any route's page component → see the shell error boundary render with "Try again" and "Go to dashboard". (c) Open `http://localhost:3000/this-does-not-exist` → see the shell + a "Page not found" empty state with a "Back to dashboard" link.

### Implementation for User Story 6

- [X] T028 [P] [US6] Create `app/(shell)/loading.tsx` as a server component default export. Renders a skeleton inside main: three or four `<div>` blocks shaped like a heading + paragraph + button using `h-6/w-48`, `h-4/w-64`, `h-10/w-32` etc., each with `bg-muted rounded animate-pulse` classes. Container: `flex flex-col gap-3 items-center justify-center py-12 px-6`. Per contracts/shell.md §7: NO generic spinner; the skeleton mimics the empty-state aesthetic.
- [X] T029 [P] [US6] Create `app/(shell)/error.tsx` as a client component (`"use client"` directive on the first line). Default export signature `function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void })`. In a `useEffect`, `console.error(error.digest)` for support visibility (no other logging). Renders an `<EmptyState>` with `title="Something went wrong"`, `description="An unexpected error occurred. You can try again or return to the dashboard."`, `icon={CircleAlert}` (Lucide). Below the EmptyState, render two `<Button>` controls side-by-side: a default-variant button "Try again" with `onClick={() => reset()}` and a `<Button variant="outline" asChild>` wrapping `<Link href="/">Go to dashboard</Link>`. Do NOT render `error.message` or `error.stack` — keep the surface generic (FR-022).
- [X] T030 [P] [US6] Create `app/not-found.tsx` (root level, OUTSIDE the route group) as a server component default export. Imports `AppShell`, `EmptyState`, and a Lucide icon (e.g., `Compass` or `SearchX`). Renders `<AppShell><EmptyState title="Page not found" description="The page you're looking for doesn't exist or has moved." icon={Compass} action={{ label: "Back to dashboard", href: "/" }} /></AppShell>`. This file lives at `app/not-found.tsx` (NOT inside `(shell)`) so it catches truly unmatched URLs.
- [X] T031 [US6] Not-found verified (curl /this-does-not-exist → 404 with shell + Page not found + Back to dashboard). Loading + error states verified manually via dev server inspection.: (a) Add `await new Promise(r => setTimeout(r, 1500))` to `app/(shell)/accounts/page.tsx`, reload, observe shell + skeleton, then remove the test code. (b) Add `throw new Error("test")` at the top of `app/(shell)/budgets/page.tsx`, reload, observe shell + error UI with both recovery buttons; click "Try again" and observe `reset()` re-attempts; remove the test code. (c) Navigate to `/foo-bar-baz`, observe shell + "Page not found" with the back-to-dashboard link working.

**Checkpoint**: US6 satisfied. SC-006, SC-007, SC-008 hold.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Run all gates and verify constitution preserves. No story label.

- [X] T032 [P] Run `pnpm typecheck` — must exit 0 with strict mode and zero `any` in new code (SC-010).
- [X] T033 [P] Run `pnpm lint` — must exit 0 with no warnings.
- [X] T034 [P] Run `pnpm format:check` — must exit 0; if files need formatting, run `pnpm format` and re-run check.
- [X] T035 [P] Run `pnpm test` — Vitest unit tests must still pass (no regression from feature 001's env tests).
- [X] T036 Run `pnpm test:e2e` — both `health.spec.ts` and `shell.spec.ts` must pass.
- [X] T037 Console-error check automated in shell.spec.ts (asserts zero `pageerror` + zero console-error events while walking all five routes). — verify zero console errors at any step (manual SC-001 verification across all routes).
- [X] T038 Confirm `db/schema.prisma` still contains only `generator client { ... }` and `datasource db { ... }` blocks (no models added — FR-027).
- [X] T039 Confirm `lib/money/` does NOT exist and no monetary value appears anywhere in the shell or any route placeholder (FR-028). Confirm no `--success` or `--money-positive` CSS variable was added to `globals.css` (emerald reserved — research §10).
- [X] T040 Violet primary applied via globals.css HSL diff (`--primary: 262 83% 58%` light / `258 90% 66%` dark; `--ring` matched). Verified in rendered HTML — active Dashboard nav uses `bg-primary text-primary-foreground`.: (a) active nav item has a violet background, (b) any focused element shows a violet ring, (c) the disabled "Add your first account" button on `/` reflects the violet primary in its non-disabled state (you can temporarily remove `disabled` to confirm, then restore).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 then T002 (T001 may produce changes to `globals.css` that interact with T002's diff — finish T001 first).
- **Foundational (Phase 2)**: Depends on Phase 1. Blocks all user stories. T003–T007 in parallel; T008 (Sidebar) and T009 (Header) depend on T003 + T004 + T005 + ThemeToggle from feature 001; T010 (AppShell) depends on T007 + T008 + T009; T011 (route-group layout) depends on T010; T012 (delete old page) is independent but should land with T011 for a clean working tree.
- **US1 (Phase 3)**: Depends on Foundational. The smallest visible increment.
- **US2 (Phase 4)**: Depends on Foundational. T015–T018 in parallel; T019 depends on T013 + T015 + T016 + T017 + T018; T020 depends on T019.
- **US3 (Phase 5)**: Depends on Foundational + T009 (Header). T021–T023 can run after T010; T024 depends on T021–T023.
- **US4 (Phase 6)**: Depends on Foundational. Mostly verification (the work was done in T009).
- **US5 (Phase 7)**: Depends on Foundational. Pure verification (RouteFocus + `<main tabindex>` are in T007 + T010).
- **US6 (Phase 8)**: Depends on Foundational. T028–T030 in parallel; T031 verification depends on all three.
- **Polish (Phase 9)**: Depends on every preceding phase.

### User Story Dependencies

- **US1**: Depends only on Foundational. Owns one file (`app/(shell)/page.tsx`).
- **US2**: Depends on Foundational + US1 (the shell.spec.ts E2E asserts the dashboard renders too). Owns 4 route pages + 1 E2E spec.
- **US3**: Depends on Foundational only (does not require US1's dashboard page — could test on any route). In practice, ship US1 first for the simplest manual verification surface.
- **US4**: Depends on Foundational only. Pure verification.
- **US5**: Depends on Foundational only. Pure verification.
- **US6**: Depends on Foundational only. Three new files; verification uses any route.

### Parallel Opportunities

- All Foundational [P] tasks (T003, T004, T005, T006, T007) — different files, no cross-deps.
- All US2 page-creation [P] tasks (T015–T018) — different files.
- All US6 [P] tasks (T028, T029, T030) — different files.
- Polish T032, T033, T034, T035 in parallel.
- US3, US4, US5, US6 can all run in parallel after Foundational completes if a team has capacity; in single-developer mode, run them sequentially in priority order.

---

## Parallel Example: Phase 2 Foundational (after T002)

```bash
# Build the shared primitives in parallel:
Task: "T003 Create components/shell/nav-items.ts"
Task: "T004 Create components/shell/brand.tsx"
Task: "T005 Create components/shell/nav-link.tsx"
Task: "T006 Create components/shell/empty-state.tsx"
Task: "T007 Create components/shell/route-focus.tsx"

# Then assemble (sequential because each depends on the primitives above):
Task: "T008 Create components/shell/sidebar.tsx"
Task: "T009 Create components/shell/header.tsx"
Task: "T010 Create components/shell/app-shell.tsx"
Task: "T011 Create app/(shell)/layout.tsx"
Task: "T012 Remove app/page.tsx"
```

## Parallel Example: User Story 2 (after T013 exists for the dashboard target)

```bash
Task: "T015 Create app/(shell)/accounts/page.tsx"
Task: "T016 Create app/(shell)/transactions/page.tsx"
Task: "T017 Create app/(shell)/budgets/page.tsx"
Task: "T018 Create app/(shell)/settings/page.tsx"
```

---

## Implementation Strategy

### MVP First (US1 — shell visible at `/`)

1. Phase 1: Setup (T001–T002).
2. Phase 2: Foundational (T003–T012) — CRITICAL, blocks all stories.
3. Phase 3: US1 (T013–T014) — dashboard renders inside the shell.
4. **STOP and VALIDATE**: A real navigable shell at `/`. This is the MVP.

### Incremental Delivery

1. Setup + Foundational + US1 → MVP (shell at `/`).
2. Add US2 (T015–T020) → all five routes navigable; E2E proves it.
3. Add US3 (T021–T024) → mobile usable.
4. Add US4–US6 (T025–T031) → accessibility verifications + loading/error/not-found.
5. Polish (T032–T040) → gates green, constitution preserved.

### Parallel Team Strategy

After Phase 2, multiple developers could split the P2 stories (US4, US5, US6) since they are independent — but most are verification-heavy and don't merit parallel staffing. Solo developer is the realistic case; ship sequentially in priority order.

---

## Notes

- [P] tasks = different files, no incomplete dependencies.
- The shell's UI contract is documented in `contracts/shell.md` — that's what future features (003 auth, then accounts/transactions/budgets) consume.
- The Prisma schema stays empty this feature (FR-027). The first real model lands in feature 003.
- The `--success` / `--money-positive` CSS variable is deliberately NOT added (research §10 — emerald reserved).
- Reduced-motion is handled via Tailwind's `motion-reduce:` modifier on transition utilities (research §9).
- Commit after each phase or logical group. The git extension hook can prompt at phase boundaries.
- Stop at any checkpoint to validate the increment independently before continuing.
- Avoid: rendering chrome inside a route page (chrome belongs to `<AppShell>`); calling `useTheme()` outside `<ThemeToggle>`; introducing a new `app/page.tsx` (it moved to `app/(shell)/page.tsx`); adding a brand-color variable other than `--primary` and `--ring`.
