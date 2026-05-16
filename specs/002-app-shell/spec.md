# Feature Specification: App Shell

**Feature Branch**: `002-app-shell`

**Created**: 2026-05-16

**Status**: Draft

**Input**: Promote Abacus from the bare "Abacus is running" placeholder to a real application shell. Introduce a persistent navigation surface (sidebar on desktop, drawer/header on mobile), placeholder routes for the future product surface (Dashboard, Accounts, Transactions, Budgets, Settings), an empty-state dashboard, a tightened theming pass on top of shadcn/ui, baseline accessibility, and Next.js App Router loading/error UI conventions on every route. No authentication, no domain models, no data, no money handling — just the navigable, themable, accessible chrome that future features will live inside. (Note: authentication, originally slated for feature 002, has been deferred to feature 003.)

## Why

Feature 001 produced a runnable scaffold with one bare page. Before product features (auth in 003, then accounts, transactions, budgets) can land cleanly, the app needs a stable navigational and visual frame: a persistent shell with named routes, an empty-state language, an intentional theme, and accessibility wired in from the start. Deferring this work until product features start landing forces every future feature to re-invent layout and theming inline, which produces drift and rework. This feature delivers the chrome so subsequent features can focus purely on their own slices.

## Clarifications

### Session 2026-05-16

- Q: Desktop navigation layout? → A: Fixed left sidebar — always visible at viewport widths ≥1024px, approximately 240–280px wide, labels with leading icons. Not user-collapsible in this feature.
- Q: Mobile navigation pattern (viewport <640px)? → A: Slide-in drawer from the left, opened via a hamburger button in a sticky top header. Implemented with shadcn `Sheet`. Closes on backdrop tap, Escape, or selecting a nav item. The same nav items as the desktop sidebar are rendered inside the drawer — no parallel mobile-only navigation set.
- Q: Brand / accent color? → A: Violet — Tailwind `violet-600` in light mode, `violet-500` in dark mode, mapped to shadcn's `--primary` CSS variable. Slate remains the neutral. Emerald is intentionally reserved (not used in this feature) for future positive-money semantics (income, gains).
- Q: Accessibility target? → A: Reasonable defaults, no named standard (not WCAG-conformant). Concretely: (a) every interactive element keyboard-reachable via Tab/Shift+Tab and activatable via Enter/Space; (b) every focusable element shows a visible focus indicator (shadcn default ring is acceptable); (c) semantic landmarks (`<nav>`, `<main>`, `<header>`) wired up; (d) icon-only controls (hamburger, theme toggle) have accessible names via `aria-label`; (e) the mobile drawer traps focus while open and returns focus to its trigger on dismiss. No automated axe/contrast tooling is mandated by this feature; future features set their own a11y targets independently.
- Q: Top-level routes set? → A: Confirmed 5 routes — Dashboard (`/`), Accounts (`/accounts`), Transactions (`/transactions`), Budgets (`/budgets`), Settings (`/settings`). No additions (Reports, Recurring) in this feature; they can be added when the corresponding product feature lands.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor sees the dashboard shell with navigation (Priority: P1)

As a visitor, when I open the app at the root URL, I see a dashboard surface wrapped in a persistent navigation shell. The shell shows me where I am, what other areas exist, and a clear empty-state message that this is a fresh install with nothing in it yet.

**Why this priority**: The shell is the foundation every future feature renders inside. If the root route does not render the shell cleanly, nothing downstream can be built or tested.

**Independent Test**: Loading the root URL on a fresh install renders a page with: (a) a visible navigation surface listing every top-level area, (b) a content region identified as the dashboard, and (c) an empty-state message indicating no data exists yet. No errors appear in the console.

**Acceptance Scenarios**:

1. **Given** a fresh install with no authentication and no data, **When** the visitor loads the root URL, **Then** the page renders a navigation surface and a dashboard content region with empty-state messaging.
2. **Given** the dashboard shell is rendered, **When** the visitor inspects the navigation, **Then** every top-level route in the shell's navigation set is visible and labeled.
3. **Given** the dashboard shell is rendered, **When** the visitor reads the empty state, **Then** the message explains that no data exists yet and offers a primary call-to-action that points toward the natural next step (e.g., adding an account).

---

### User Story 2 - User navigates between top-level routes (Priority: P1)

As a user, I can click each top-level navigation item and land on that area's page. Even though the feature behind each route is not built yet, the page renders cleanly with the same shell and a placeholder body identifying which area I'm in.

**Why this priority**: The navigation must work end-to-end before any product feature lands, so future features only need to fill in their own page bodies — not the routing or layout around them.

**Independent Test**: Starting at the root URL, clicking each navigation item in turn moves the URL to that route, keeps the shell visible, swaps the content region to that route's placeholder, and produces no console errors at any step. Returning to the root via the navigation also works.

**Acceptance Scenarios**:

1. **Given** the user is on the dashboard, **When** they click a top-level navigation item, **Then** the URL changes to that area's route, the shell remains visible, and the content region shows that area's placeholder.
2. **Given** the user is on any top-level route, **When** they click another top-level navigation item, **Then** navigation completes without a full page reload and without losing shell state (e.g., sidebar collapse state on desktop).
3. **Given** the user is on any top-level route, **When** they look at the navigation, **Then** the current route is visually distinguished from the others (active state).
4. **Given** the user manually enters a top-level route URL, **When** the page loads, **Then** the shell renders and the matching navigation item is shown as active.

---

### User Story 3 - Mobile user navigates via a collapsing nav surface (Priority: P1)

As a mobile user (viewport under 640px wide), I can still reach every top-level area. The desktop sidebar gives way to a mobile-appropriate navigation pattern that does not consume permanent screen real estate but is reachable in one obvious tap.

**Why this priority**: A shell that is unusable on mobile blocks half the realistic use cases for a personal finance app, and retrofitting responsive layout later is more expensive than designing it in.

**Independent Test**: At a viewport under 640px, the persistent desktop sidebar is not visible by default. A clearly labeled control opens the navigation. Tapping a navigation item closes the nav surface and navigates to the chosen route. The chrome remains readable and usable across the target mobile viewport.

**Acceptance Scenarios**:

1. **Given** the viewport is under 640px wide, **When** the page loads, **Then** the desktop sidebar is not occupying permanent screen space.
2. **Given** the viewport is under 640px wide, **When** the user activates the mobile nav control, **Then** the navigation surface appears with every top-level route reachable.
3. **Given** the mobile navigation surface is open, **When** the user selects a route, **Then** navigation completes and the mobile nav surface closes.
4. **Given** the viewport is at or above 1024px wide, **When** the page loads, **Then** the desktop sidebar is visible and the mobile-only controls are not shown.

---

### User Story 4 - User toggles theme from the shell chrome (Priority: P2)

As a user, the theme toggle lives in a sensible, consistent location in the shell chrome (not floating on a bare page). It still offers light, dark, and system, and the choice persists across navigations within the shell.

**Why this priority**: Feature 001 delivered the toggle; this feature relocates it into the shell. The behavior is inherited, not reinvented, so it does not block P1 stories. But every page in the shell needs to expose the toggle consistently or the UX feels broken.

**Independent Test**: From any top-level route, the theme toggle is reachable in the same spot in the shell chrome. Switching theme on one route and then navigating to another route preserves the chosen theme. No flash of the wrong theme appears on any route's initial paint.

**Acceptance Scenarios**:

1. **Given** the user is on any top-level route, **When** they look at the shell chrome, **Then** the theme toggle is present in the same location across all routes.
2. **Given** the user selects a theme on one route, **When** they navigate to another route, **Then** the chosen theme remains active.
3. **Given** any route, **When** the page first paints, **Then** there is no visible flash of the wrong theme.

---

### User Story 5 - Keyboard-only user navigates the shell (Priority: P2)

As a keyboard-only user, I can tab through the shell's interactive controls in a sensible order, see a visible focus indicator on every focusable element, and activate any nav item, the theme toggle, or any in-page CTA using only the keyboard.

**Why this priority**: Accessibility regressions compound. Wiring keyboard support and focus management into the shell now is dramatically cheaper than retrofitting after multiple features have layered their own focus traps and interactive widgets on top.

**Independent Test**: Starting from a fresh page load, the user can reach every interactive element in the shell using only Tab/Shift+Tab and activate it using Enter/Space. Focus is always visibly indicated. Opening the mobile nav surface and closing it via keyboard works. Route changes do not leave focus stranded on a now-hidden element.

**Acceptance Scenarios**:

1. **Given** any top-level route, **When** the user presses Tab from page load, **Then** focus moves through interactive elements in a logical order (e.g., nav, then main content, then theme toggle — exact order to be confirmed in plan).
2. **Given** the user is focused on any interactive element, **When** the element has focus, **Then** a visible focus indicator is shown that meets the contrast target chosen for this feature.
3. **Given** the user activates a navigation item via the keyboard, **When** the route changes, **Then** focus moves to a predictable, named landing point on the new route (e.g., the main content region) and does not remain on a now-stale element.
4. **Given** a mobile-viewport user has opened the mobile nav surface via keyboard, **When** they press Escape, **Then** the nav surface closes and focus returns to the control that opened it.

---

### User Story 6 - User encounters loading or error states (Priority: P2)

As a user, when a route is still loading or fails to render, I see a state-appropriate placeholder rather than a blank page, a generic spinner, or a raw stack trace. The loading state matches the shell's visual language; the error state is informative without leaking internals.

**Why this priority**: Next.js App Router conventions expect `loading.tsx` and `error.tsx` per route. Wiring these in once at the shell level means every future feature inherits them rather than re-deriving them. Skipping this now leads to inconsistent UX and ad-hoc error pages.

**Independent Test**: Forcing a route into a loading state shows a shell-consistent loading placeholder, not a default browser spinner or blank page. Forcing a route into an error shows a friendly error page within the shell with no stack trace visible in production-equivalent rendering.

**Acceptance Scenarios**:

1. **Given** a top-level route is loading, **When** the loading state is shown, **Then** the shell chrome remains visible and the content region shows a placeholder consistent with the shell's empty-state aesthetic (not a generic spinner).
2. **Given** a top-level route throws an error during render, **When** the error boundary catches it, **Then** the shell remains visible and the content region shows an error message with a recovery action (e.g., retry, return to dashboard).
3. **Given** an error has been caught, **When** the error message is shown in a production-equivalent build, **Then** no stack trace or internal path is exposed to the user.

---

### Edge Cases

- A user manually enters a URL that does not match any top-level route — the app must render a not-found surface that remains inside the shell, not a bare browser default.
- A user resizes the browser from desktop to mobile width (or vice versa) while the app is open — the navigation surface must adapt without requiring a full page reload and without trapping focus or hiding content.
- A user opens the mobile nav surface and then rotates or resizes the device into desktop width — the mobile surface must close cleanly so the desktop sidebar can take over.
- A user with reduced-motion preferences set at the OS level navigates the shell — any nav surface transitions (drawer open/close, sidebar collapse) must respect the reduced-motion preference.
- A user with a very narrow viewport (smaller than the mobile minimum being targeted, e.g., legacy 320px) — the shell should still be readable and the nav surface still reachable, even if the layout is not pixel-tuned for that width.
- A route placeholder is reached but the route does not yet exist as a real feature — the placeholder must clearly communicate "feature pending" rather than implying a broken link.
- A CTA in an empty state points toward a sub-route that itself does not yet exist (e.g., "Add account" → `/accounts/new`) — the behavior of such CTAs in this feature is a Clarifications Needed item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST render every top-level route inside a persistent application shell composed of a navigation surface and a content region.
- **FR-002**: The application shell MUST expose navigation to exactly these five top-level routes in this order: Dashboard (`/`), Accounts (`/accounts`), Transactions (`/transactions`), Budgets (`/budgets`), Settings (`/settings`). Reports and Recurring are deferred to future features and are NOT added in this feature.
- **FR-003**: Each top-level route in the navigation set MUST render a real page that includes the shell chrome and a route-specific placeholder body. No top-level route may produce a 404 or a missing-page error.
- **FR-004**: The root route (`/`) MUST present a dashboard-style placeholder with an empty-state message and at least one primary call-to-action that points toward an obvious next step.
- **FR-005**: Every non-root top-level route placeholder MUST identify which area the user is in and communicate that the feature is not yet available.
- **FR-006**: The navigation surface MUST visually indicate which top-level route is currently active.
- **FR-007**: At viewport widths of 1024px and above, the navigation surface MUST be a fixed left sidebar approximately 240–280px wide, always visible, with each nav item shown as a leading icon + label. The sidebar is NOT user-collapsible in this feature.
- **FR-008**: At viewport widths below 640px, the desktop sidebar MUST be hidden. A sticky top header MUST display a hamburger button that opens a slide-in drawer (shadcn `Sheet`) from the left containing the same nav items as the desktop sidebar. The drawer MUST close on backdrop tap, Escape press, or selection of a nav item.
- **FR-009**: Navigation between top-level routes MUST occur without a full page reload (App Router client-side navigation).
- **FR-010**: The theme toggle delivered in feature 001 MUST be relocated into the shell chrome and MUST be reachable from every top-level route in the same location.
- **FR-011**: The theme toggle MUST continue to offer light, dark, and system options and MUST preserve the user's choice across route changes and reloads. No regression from feature 001's behavior is permitted.
- **FR-012**: The application MUST avoid a flash of the wrong theme on initial paint, on every top-level route, not just the root.
- **FR-013**: The shell MUST use semantic landmark elements (e.g., a navigation landmark, a main content landmark, an appropriate header/banner if used) so assistive technology users can reach each region directly.
- **FR-014**: Every interactive element in the shell (navigation items, theme toggle, mobile nav control, empty-state CTAs) MUST be reachable and activatable using a keyboard alone.
- **FR-015**: Every focusable element MUST display a visible focus indicator. The shadcn default focus ring (using the `--ring` CSS variable) is acceptable. No specific contrast ratio is mandated by this feature; "reasonable defaults" applies per the Clarifications section.
- **FR-016**: Every interactive non-text control in the shell (theme toggle, mobile nav control, icon-only navigation triggers) MUST have an accessible name suitable for assistive technology.
- **FR-017**: On route change via the navigation, focus MUST move to a predictable landing point on the new route (e.g., the main content region) rather than remaining on a now-unrelated element. The exact landing point convention is a plan-level detail.
- **FR-018**: When the mobile navigation surface is opened, it MUST be dismissible via the keyboard (Escape) and the standard interaction for that pattern, and focus MUST return to the opening control on dismissal.
- **FR-019**: The shell MUST respect operating-system reduced-motion preferences for any nav surface transitions.
- **FR-020**: Every top-level route MUST provide a loading state that renders inside the shell. The loading state MUST follow the shell's empty-state aesthetic rather than a generic spinner.
- **FR-021**: Every top-level route MUST provide an error boundary that renders inside the shell when a render-time error occurs. The error state MUST present a friendly message and at least one recovery action (retry, go to dashboard, or equivalent).
- **FR-022**: In a production-equivalent build, the error state MUST NOT expose stack traces, internal file paths, or other implementation details to the user.
- **FR-023**: A URL that does not match any defined route MUST render a not-found surface inside the shell, with a way to return to a known route. A bare browser default 404 page is not acceptable.
- **FR-024**: The shell MUST adopt a coherent theming pass on top of shadcn/ui. The primary/brand color MUST be violet — `violet-600` (light mode) / `violet-500` (dark mode), mapped to shadcn's `--primary` CSS variable — used for primary buttons, the active nav item indicator, focus rings, and link hovers. Slate remains the neutral palette. Emerald is intentionally reserved (not used in this feature) for future positive-money semantics. The shell MUST verify chrome contrast across light and dark modes and style navigation surface, focus rings, and separators intentionally rather than accepting shadcn defaults verbatim.
- **FR-025**: The shell's visual density (spacing, font sizing, control sizing) MUST be deliberately chosen and applied consistently across routes. The density target is in Clarifications Needed.
- **FR-026**: The feature MUST NOT introduce authentication, sessions, login or logout UI, user profile UI, or protected routes. The shell renders for any visitor. Authentication is deferred to feature 003.
- **FR-027**: The feature MUST NOT introduce any domain data models. The Prisma schema MUST remain empty of domain models. The first real model arrives with feature 003.
- **FR-028**: The feature MUST NOT introduce any monetary amount display, monetary input, or `lib/money/` helpers. No route placeholder may show a currency value.
- **FR-029**: The feature MUST NOT introduce real charts or chart libraries. Chart-shaped placeholders that communicate "chart goes here" are permitted; functional charts are deferred.
- **FR-030**: The feature MUST NOT introduce any create, edit, or delete flows that persist data. Empty-state CTAs are navigational at most; they do not write anything. Whether a CTA navigates to a `/new`-style placeholder route or is purely informational this feature is in Clarifications Needed.
- **FR-031**: The feature MUST NOT introduce any external integrations (Plaid, email, notifications) or seed/fixture data.
- **FR-032**: Any new API endpoints (if any) MUST conform to the constitution's `{ data } | { error: { code, message } }` response shape. This feature is not expected to introduce new endpoints; if planning surfaces a need, the shape applies.
- **FR-033**: The shell and all route placeholders MUST be implemented under the App Router only — no Pages Router code.
- **FR-034**: All new code MUST satisfy TypeScript strict mode with no use of `any`, consistent with constitution Principle II.
- **FR-035**: At minimum one Playwright E2E test MUST walk the shell across every top-level route, asserting that each renders inside the shell without error. Per the constitution, this E2E is a smoke for the shell, not a money-path mandate.

### Key Entities

This feature introduces no domain entities. The Prisma schema remains empty of domain models. All real domain modeling is deferred. The "entities" of this feature, if it helps planning, are purely UI concepts (the navigation set, the empty-state CTAs, the shell regions) — they are not persisted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the root URL, a user can reach every top-level route via the shell's navigation in at most one interaction (one click/tap), with no console errors at any step.
- **SC-002**: At desktop viewport (≥1024px), the navigation surface is visible at all times on every top-level route, with no horizontal scrolling required to use it.
- **SC-003**: At mobile viewport (<640px), the navigation surface is not occupying permanent screen space, and is reachable in exactly one interaction from any top-level route.
- **SC-004**: A keyboard-only user can reach every interactive control in the shell from a fresh page load using only Tab/Shift+Tab and activate it using Enter/Space, with a visible focus indicator at every step.
- **SC-005**: Switching theme on any top-level route and then navigating to any other top-level route preserves the chosen theme in 100% of attempts. No route shows a flash of the wrong theme on initial paint.
- **SC-006**: Every top-level route renders a route-specific loading state that uses the shell chrome, in place of a blank page or a generic browser spinner.
- **SC-007**: Every top-level route renders a route-specific error state inside the shell when a render-time error is thrown, with no stack trace visible in production-equivalent output.
- **SC-008**: A URL that does not match any defined route renders a not-found surface inside the shell with a working link back to the dashboard, in 100% of attempts.
- **SC-009**: At least one Playwright E2E test walks all top-level routes (dashboard → each other top-level route) on a clean dev server and exits zero.
- **SC-010**: A type-check of the shell and all route placeholders passes with strict mode enabled and zero uses of `any` in the new code introduced by this feature.

## Assumptions

- Feature 001's scaffold is in place: Next.js App Router, React 19, TypeScript strict, Tailwind CSS, shadcn/ui with `Button` and `DropdownMenu` already wired, `next-themes` with light/dark/system support, and the existing `ThemeToggle` component.
- shadcn/ui remains the source of UI primitives. Additional shadcn components (e.g., sheet/drawer for mobile nav, separator, scroll area, navigation menu) may be added via shadcn's standard "copy into repo" pattern as needed during planning; this is not a new dependency model.
- No authentication exists in this feature. The shell is fully public. Routes are not protected. Auth lands in feature 003.
- The Prisma schema remains empty of domain models. No migration is generated by this feature.
- "Desktop" means viewport width ≥1024px. "Mobile" means viewport width <640px. The 640–1023px range (tablet) is permitted to render either layout and is not pixel-tuned in this feature.
- The constitution's "money math is non-negotiable" principle is not exercised here because no monetary value is displayed.
- The 5 starting routes (Dashboard, Accounts, Transactions, Budgets, Settings) are assumed to be the right shape but are subject to confirmation in Clarifications Needed before planning begins.
- Empty-state CTAs in placeholder pages may either be purely informational or navigate to further placeholder routes; the exact behavior is in Clarifications Needed.

## Out of Scope

- **Authentication, sessions, login/logout, user profile, protected routes** — deferred to feature 003.
- **Domain models (accounts, transactions, budgets, categories, recurring transactions)** — each lands with its own feature.
- **Money helpers (`lib/money/`)** — no monetary value is displayed in this feature.
- **Real data of any kind** — no seed data, no fixtures, no charts with real numbers.
- **CRUD flows** — no create, edit, or delete operations persist anything in this feature.
- **External integrations** — no Plaid, no email, no notifications, no third-party data fetches.
- **Charts** — Recharts is not installed; chart-shaped placeholders are acceptable but no real charts.
- **Internationalization / localization** — copy is English-only; no locale switching.
- **Production deployment and CI/CD** — still local-only.
- **Observability beyond what feature 001 delivered** — no new logging, metrics, or tracing.
- **Settings-page functionality** — the `/settings` route is a placeholder; actual settings (profile, preferences, data export) are deferred.

## Deferred Clarifications

The following questions were raised during specification but deferred. They are planning-level details and can be decided during `/speckit-plan`.

1. **Empty-state CTAs behavior** — should empty-state CTAs (e.g., "Add your first account") navigate to a `/accounts/new` placeholder route or be purely informational with no destination this feature? Affects FR-030 and edge cases.
2. **Visual density** — dense (Linear / finance dashboards) or comfortable (Notion / generic SaaS). Affects FR-025 and component sizing.
3. **Tablet range (640–1023px) behavior** — render the desktop sidebar, the mobile drawer, or a compact-sidebar variant. The current spec permits either desktop or mobile layout in this range.
4. **Focus landing on route change** — confirm focus moves to the `<main>` content region on navigation, or specify a different target (e.g., the page heading). FR-017 currently suggests the main content region.
