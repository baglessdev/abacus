# Phase 0 Research — App Shell

One entry per non-obvious decision. Each entry: **Decision / Rationale / Alternatives considered.**

---

## 1. shadcn components to add (and the CLI flags)

**Decision**: Add exactly three shadcn primitives via the CLI:

```sh
pnpm dlx shadcn@latest add sheet separator scroll-area --yes
```

- **`sheet`** — the mobile drawer (left side). Built on Radix `Dialog`, which gives us focus trap, Escape-to-close, scroll lock, backdrop click, and `aria-modal` without hand-rolling any of it (satisfies FR-008 and FR-018).
- **`separator`** — visual divider between `<Brand>` and nav items in the sidebar, and between sections in the mobile drawer.
- **`scroll-area`** — wraps the sidebar nav list so adding more items later (Reports, Recurring) doesn't break the layout. Optional in spirit, but a sub-50-LOC investment now versus a layout audit later.

The `--yes` flag is non-interactive (auto-confirms the "overwrite?" prompts and assumes the existing `components.json` is the answer to all path questions). This avoids the interactive-prompt pitfall we hit in feature 001 when the shadcn CLI asked about JSX/RSC config.

**Rationale**: These three are the minimum primitives for the spec's requirements. `Sheet` is non-negotiable (FR-008 names it). `Separator` and `ScrollArea` are small quality-of-life adds that fit the budget. We deliberately do NOT add `navigation-menu` (overkill for five flat routes) or `command` (no command-palette in scope) or `tooltip` (icon-only triggers in this feature all have `aria-label`; tooltips are sighted-user UX, not accessibility, and add interaction noise).

**Alternatives considered**:
- Add `navigation-menu`: too heavyweight for flat nav with no submenus.
- Hand-roll the drawer with Headless UI or vanilla CSS: rejected — Radix `Dialog` is already a transitive dep via shadcn primitives and is battle-tested for focus management.
- Add `tooltip` for the hamburger: rejected — `aria-label` is sufficient; sighted users learn the icon in two seconds.

---

## 2. Theme toggle relocation strategy

**Decision**: Move the existing `<ThemeToggle>` import from `app/page.tsx` (feature 001) into `components/shell/header.tsx`. The component itself does not change. The old `app/page.tsx` is **deleted**; the dashboard is reborn at `app/(shell)/page.tsx` and does not own the toggle anymore.

**Rationale**: `next-themes` provider lives in `app/providers.tsx` and wraps everything from `app/layout.tsx` — so `<ThemeToggle>` works identically anywhere inside the tree. Putting it in `<Header>` means it appears once, at a consistent location, on every route (FR-010). `disableTransitionOnChange` from feature 001 still prevents the half-second color animation. FOUC remains prevented by `suppressHydrationWarning` on `<html>` in `app/layout.tsx` (untouched).

**Alternatives considered**:
- Wrap `<ThemeToggle>` in a new "ChromeThemeToggle" with extra styling: rejected — no new behavior justifies a new component. The existing component already uses `aria-label="Toggle theme"`, the `Sun`/`Moon` icon swap, and the three-option dropdown.
- Add the toggle to the sidebar instead of the header: rejected — on mobile the sidebar is hidden behind a drawer, so the toggle would be one extra tap away from every mobile route. Header is the single surface visible on every viewport.

---

## 3. Sidebar implementation — hand-built vs. shadcn `Sidebar`

**Decision**: **Hand-built** sidebar using Tailwind + Lucide icons + the existing shadcn `Button` ghost variant for nav items. Do NOT install shadcn's optional `Sidebar` component.

**Rationale**:
- shadcn's `Sidebar` (a newer addition to the shadcn library) is a substantial component (~600 LOC across multiple files) with built-in collapse states, mobile-trigger logic, keyboard shortcuts, and a context provider. Most of those features are explicitly out of scope here (FR-007 says "not user-collapsible in this feature"; the mobile pattern is the shadcn `Sheet`, not the `Sidebar`'s own mobile mode).
- Pulling in `Sidebar` would also pull in additional Radix peer dependencies (`@radix-ui/react-tooltip`, etc.) we do not use elsewhere.
- A hand-built sidebar for five flat items is approximately 60 LOC of TSX. The shadcn-provided primitives we already use (`Button` for the ghost-variant nav item style, `Separator` for the divider, `ScrollArea` for overflow) cover the visual primitives needed.
- Keeping the sidebar hand-built leaves the door open for a more opinionated future redesign without ripping out a third-party component.

**Alternatives considered**:
- Adopt shadcn `Sidebar`: rejected for the reasons above. Revisit if a future feature needs sidebar collapsibility, nested groups, or keyboard shortcuts.
- Roll the active-state and styling into raw `<a>` tags: rejected — we want Next `<Link>` for client-side navigation (FR-009), and the shadcn `Button` ghost variant is the established visual primitive in this codebase.

---

## 4. Active-route highlighting

**Decision**: Use Next 15's `usePathname()` from `next/navigation` plus the existing `cn()` helper (`lib/utils.ts`) for conditional class composition. No new helper package, no extra abstraction.

The active-match rule (formalized in `contracts/shell.md`):
- For the dashboard route `/`: active when `pathname === "/"` (exact match — `startsWith("/")` would match every route).
- For any non-root nav item: active when `pathname === item.href` OR `pathname.startsWith(item.href + "/")` (so `/accounts/123/edit` correctly highlights "Accounts" once nested routes exist).

The component `<NavLink>` consumes the `nav-items.ts` entry, runs the rule, and applies the active class plus `aria-current="page"`.

**Rationale**:
- `usePathname()` is the idiomatic App Router pattern for this exact use case.
- The two-rule split (exact-equals for `/`, prefix for others) is the standard convention; any single-rule version (e.g., always `startsWith`) misbehaves on the root.
- `cn()` already exists and is exactly the right tool.
- A separate helper (`isActive(pathname, href)`) is a candidate for `components/shell/nav-link.tsx` private scope, not for `lib/`, because it's UI-specific.

**Alternatives considered**:
- Use the `next/link` `active` prop: doesn't exist in App Router.
- Install `next-active-link` or similar: rejected — three lines of code do not need a dependency.

---

## 5. App Router file conventions (`loading.tsx`, `error.tsx`, `not-found.tsx`)

**Decision**:
- **Group-level loading**: one file at `app/(shell)/loading.tsx`. Applies to all five routes inside the group. Renders a shell-aware skeleton (a few muted-color text-shaped blocks inside the `<main>` region) — explicitly NOT a generic spinner (FR-020).
- **Group-level error**: one file at `app/(shell)/error.tsx`. Client component (`"use client"` directive is required by Next). Receives `{ error, reset }` props; renders a friendly message, a "Try again" button calling `reset()`, and a "Go to dashboard" link. Does NOT render the stack trace in production-equivalent rendering (FR-022 — Next masks this automatically in `process.env.NODE_ENV === "production"`, but we also avoid surfacing `error.message` directly; we display a stable generic copy).
- **Root not-found**: `app/not-found.tsx` at the root (outside the route group) so it catches truly unmatched URLs. It still renders `<AppShell>` directly so the chrome remains visible (FR-023). The body is a friendly "Page not found" message + a "Back to dashboard" link.

How the shell stays present through each:
- Loading/error inside the `(shell)` group inherit `app/(shell)/layout.tsx`, which renders `<AppShell>{children}</AppShell>`. Next.js streaming-router places the loading/error UI inside the layout's content slot, so the chrome stays painted.
- `app/not-found.tsx` is outside the group, so it doesn't inherit `<AppShell>` automatically — we render `<AppShell>` inside the not-found file itself.

**Rationale**:
- Group-level loading/error is the minimum count of files that satisfies FR-020 and FR-021 for all five routes. Each route gets the boundary "for free" via inheritance.
- Putting `not-found.tsx` at the root (not inside `(shell)`) ensures it catches segment misses that the group can't see. Manually wrapping it in `<AppShell>` is a small price for catching truly unknown URLs with chrome.
- The group-level error boundary catches render errors thrown by any of the five page components. Each page can still throw its own error boundary later if it needs route-specific recovery.

**Alternatives considered**:
- Per-route `loading.tsx` × 5 + `error.tsx` × 5 + global `not-found.tsx`: rejected — every route would render identical skeletons in this feature; that's ten duplicate files. Override per-route in the future when a route's UX demands it.
- Put `not-found.tsx` inside `(shell)`: rejected — App Router's not-found resolution is segment-aware; placing it inside the group narrows its scope. The root-level not-found catches the broadest set of misses.

---

## 6. Focus management on route change

**Decision**: A small client component `<RouteFocus mainRef={mainRef} />` mounted inside `<AppShell>`. It uses `usePathname()` and a React `useEffect` to call `mainRef.current?.focus()` whenever the pathname changes — but **not** on the initial mount (we don't want to steal focus on first paint). The `<main>` element receives `tabindex="-1"` and the ref so it is programmatically focusable without being part of the natural tab order.

```tsx
// shape only — code lands during /speckit-implement
"use client"
const pathname = usePathname()
const isFirstMount = useRef(true)
useEffect(() => {
  if (isFirstMount.current) {
    isFirstMount.current = false
    return
  }
  mainRef.current?.focus()
}, [pathname, mainRef])
return null
```

**Rationale**:
- This is the conventional pattern in App Router projects for accessibility-conscious focus management.
- Skipping the initial mount means a user landing fresh on `/` does NOT have focus yanked to `<main>` (which would be jarring and interferes with browser focus restoration).
- Calling `.focus()` on a `tabindex="-1"` element does not insert it into the tab order — subsequent Tab presses still walk the page normally.
- Screen readers announce the new region on focus, which is the desired behavior on route change.
- The component renders `null` — it's a behavior-only client island, not a DOM node.

**Alternatives considered**:
- Focus the page heading (`<h1>`) instead: rejected (see deferred-clarification 4 resolution in plan.md). Ties focus to a specific DOM shape.
- Use a layout-level mechanism via `next/navigation` events: rejected — App Router does not expose a router-events API equivalent to Pages Router's; a `useEffect` on `usePathname()` is the supported pattern.
- Skip route-focus management entirely: rejected — FR-017 mandates a predictable focus landing on route change.

---

## 7. Tailwind violet primary — exact HSL values

**Decision**: Map shadcn's `--primary` CSS variable to violet, choosing values from the Tailwind 3 palette and converting to HSL (the format shadcn variables use):

**Light mode** (Tailwind `violet-600` = `#7c3aed`):
- `--primary: 262 83% 58%;`
- `--primary-foreground: 0 0% 100%;` (pure white — high contrast on violet-600)
- `--ring: 262 83% 58%;` (focus ring matches primary)

**Dark mode** (Tailwind `violet-500` = `#8b5cf6`):
- `--primary: 258 90% 66%;`
- `--primary-foreground: 222.2 47.4% 11.2%;` (dark slate — readable on violet-500 in dark mode)
- `--ring: 258 90% 66%;`

**Rationale**:
- The spec's locked clarification fixes the brand colors at `violet-600` (light) and `violet-500` (dark). Converting to HSL using Tailwind's published values (or any reliable HEX→HSL converter, e.g., culori) gives the values above. `262 83% 58%` is the HSL of `#7c3aed`; `258 90% 66%` is the HSL of `#8b5cf6`.
- `--primary-foreground` exists because primary buttons need a contrasting label color. On violet-600 (a saturated mid-tone), pure white at 100% lightness reads cleanly. On violet-500 (lighter in dark mode), white is still acceptable but dark slate (the existing dark-mode `--primary-foreground` value, `222.2 47.4% 11.2%`) gives a more deliberate contrast and matches feature 001's pattern of swapping the foreground on theme. Either is acceptable per the spec's "reasonable defaults" a11y target; we pick dark slate in dark mode for visual consistency with the rest of the slate-neutral chrome.
- `--ring` matching `--primary` means the focus ring inherits the brand color — a subtle but consistent piece of brand application (FR-024 explicitly names focus rings as one of the brand-color surfaces).

**Alternatives considered**:
- Use `violet-500` in both modes: rejected — `violet-500` is too light on the white background of light mode; contrast drops.
- Make `--ring` a desaturated neutral: rejected — FR-024 says focus rings use the brand color.
- Use OKLCH instead of HSL: rejected — shadcn's existing CSS variables are HSL; mixing color spaces in `globals.css` is messier than the marginal perceptual gain in this scope.

---

## 8. shadcn theme variables — exact diff to `globals.css`

**Decision**: Edit `app/globals.css` to override exactly three variables in each mode (`:root` and `.dark`). All other shadcn defaults from feature 001 (slate neutrals, the destructive red, the radius) remain untouched.

**Light mode diff (`:root`):**
```css
/* before */
--primary: 222.2 47.4% 11.2%;
--primary-foreground: 210 40% 98%;
--ring: 222.2 84% 4.9%;

/* after */
--primary: 262 83% 58%;          /* violet-600 */
--primary-foreground: 0 0% 100%;
--ring: 262 83% 58%;
```

**Dark mode diff (`.dark`):**
```css
/* before */
--primary: 210 40% 98%;
--primary-foreground: 222.2 47.4% 11.2%;
--ring: 212.7 26.8% 83.9%;

/* after */
--primary: 258 90% 66%;          /* violet-500 */
--primary-foreground: 222.2 47.4% 11.2%;
--ring: 258 90% 66%;
```

Variables NOT touched: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--radius`. The slate neutral palette stays intact (FR-024: "Slate remains the neutral palette").

**Rationale**: Minimal diff. Override only what FR-024 names (primary, ring). Touching the neutrals would force a contrast audit; preserving them keeps the audit scope to the violet additions only.

**Alternatives considered**:
- Bump `--accent` to a desaturated violet: rejected — the active-nav-item indicator uses `--primary`, not `--accent`. Leave `--accent` slate.
- Add a `--brand` variable alongside `--primary`: rejected — shadcn convention uses `--primary` for the brand surface; adding a parallel variable adds maintenance burden with no concrete consumer in this feature.

---

## 9. Reduced-motion handling

**Decision**: Use Tailwind's `motion-reduce:` modifier on any transition class applied to the drawer and sidebar surfaces. shadcn's `Sheet` already wraps Radix `Dialog`, which respects `prefers-reduced-motion` in its default animation utilities; we add `motion-reduce:transition-none` (and equivalents) defensively on our own transitions, e.g., the hamburger icon morph.

```tsx
// shape only
<Sheet>
  <SheetContent
    side="left"
    className="transition-transform duration-200 motion-reduce:transition-none"
  >
    ...
  </SheetContent>
</Sheet>
```

**Rationale**:
- The spec (Edge Cases) and FR-019 require respecting OS reduced-motion preferences.
- Tailwind's `motion-reduce:` modifier targets `@media (prefers-reduced-motion: reduce)` directly. It's the cheapest, most readable way to honor the preference.
- shadcn `Sheet` already inherits this from Radix in its current versions; we add the modifier on our custom transitions only.

**Alternatives considered**:
- Add a `<MotionProvider>` and conditionally render animations: rejected — overkill for two or three transition classes.
- Disable all transitions when the user prefers reduced motion via a JS check: rejected — CSS `@media` is simpler, no JS hydration concerns.

---

## 10. Reserved emerald — explicit non-action

**Decision**: **Do not define `--success`, `--money-positive`, or any emerald-keyed CSS variable in this feature.** Tailwind's `emerald-*` palette is available out of the box (no config change needed), but no component in this feature uses it. The first feature that displays positive money (income, gains) defines the semantic variable then, picks the exact emerald shade, and applies it.

**Rationale**:
- FR-024 (locked clarification): "Emerald is intentionally reserved (not used in this feature) for future positive-money semantics."
- Defining `--success` now, before any consumer exists, would commit a semantic CSS variable to the design system that subsequent features then have to decide whether to honor or override. Better to introduce it together with its first consumer so the semantics are concrete on day one.
- Documented here so the next architect doesn't assume "emerald is wired up — just use `text-success-600`."

**Alternatives considered**:
- Pre-define `--success` as emerald-600 / emerald-500 to "save work later": rejected — premature commitment. The first money-color feature might want emerald-500 in both modes, or a different shade entirely. Wait for the use case.
- Pick an emerald and apply it to nothing as a "reserved" placeholder: rejected — same reason; pollutes the variable namespace.
