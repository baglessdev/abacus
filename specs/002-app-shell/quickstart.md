# Quickstart — App Shell

The delta over `specs/001-project-scaffolding/quickstart.md`. Assumes feature 001 is implemented on `main` and the developer has a working scaffold (Postgres up, `.env.local` set, `pnpm dev` runs, `/api/health` is green).

---

## Prerequisites

Already satisfied if you completed feature 001's quickstart:

- Docker (with `docker compose` v2) and the `abacus-postgres` container available
- Node.js 24 LTS (`nvm use` reads `.nvmrc`)
- pnpm

If you have not run feature 001 locally, do that first; the steps below assume the scaffold is in place.

---

## Steps

### 1. Pull the feature 002 branch

```sh
git fetch origin
git checkout 002-app-shell
```

**Verify**: `git status` reports a clean working tree on `002-app-shell`.

### 2. Install dependencies

```sh
pnpm install
```

**Why**: this feature adds three shadcn primitives (`sheet`, `separator`, `scroll-area`) via the shadcn CLI. The CLI may install Radix peer deps (e.g., `@radix-ui/react-dialog`, `@radix-ui/react-separator`, `@radix-ui/react-scroll-area`) into `package.json` and `pnpm-lock.yaml`. `pnpm install` ensures `node_modules/` matches the lockfile.

**Verify**: no install errors. `node_modules/@radix-ui/react-dialog` exists.

### 3. Confirm the database is up

```sh
docker compose ps
```

**Verify**: the `abacus-postgres` container shows `healthy`. (No new migrations in this feature — the schema is still empty. If it isn't healthy: `docker compose up -d`.)

### 4. Run the dev server

```sh
pnpm dev
```

**Verify**: the terminal prints `Local: http://localhost:3000` and there are no errors about missing modules.

### 5. Walk all five routes at desktop width

Open <http://localhost:3000> in a browser at a desktop viewport (≥768px wide).

**Verify**:
- The page renders the shell: a left sidebar with the brand mark, five nav items (Dashboard, Accounts, Transactions, Budgets, Settings — in that order), and a sticky top header with the theme toggle on the right.
- The Dashboard nav item is visually distinguished (violet background, white text, `aria-current="page"` if you inspect).
- The main content region shows the dashboard empty state: an icon, a "Welcome to Abacus" headline, descriptive copy, and a primary CTA button labeled "Add your first account" (informational; clicking it does not navigate).
- Click each of "Accounts", "Transactions", "Budgets", "Settings" in turn. Each time:
  - The URL updates (`/accounts`, `/transactions`, etc.) without a full page reload.
  - The active nav item indicator moves to the clicked item.
  - The main region shows that route's placeholder empty state.
  - Browser console shows no errors.
- Click "Dashboard" to return to `/`.

### 6. Toggle the theme

From any route, click the theme toggle in the top-right corner.

**Verify**:
- Three options appear: Light, Dark, System.
- Selecting "Dark" inverts the palette; the violet primary brightens to `violet-500`-equivalent in dark mode.
- Navigating to another route preserves the chosen theme — no flash of light/dark on initial paint.

### 7. Resize to mobile and verify the drawer

Use the browser's dev-tools responsive mode (or simply narrow the window) to a width below 768px.

**Verify**:
- The left sidebar disappears.
- A hamburger button appears in the top header (left side).
- Clicking the hamburger slides a drawer in from the left containing the same five nav items + the brand mark.
- Selecting any nav item navigates to that route AND closes the drawer.
- The drawer also closes on:
  - Clicking the backdrop (outside the drawer).
  - Pressing Escape.
- After closing via Escape, keyboard focus returns to the hamburger button (not lost on the page).

### 8. Test keyboard-only navigation

Reload to a fresh page. Use only Tab/Shift+Tab and Enter/Space.

**Verify**:
- Tab order is logical: nav items → main content → theme toggle (or a similar sensible order — exact order is plan-level; the requirement is "logical").
- Every focused element shows a visible focus ring (violet, per the brand pass).
- Activating any nav item via Enter moves focus to `<main>` on the new route.
- Opening the mobile drawer via keyboard (Tab to hamburger, Enter) traps focus inside the drawer; pressing Escape returns focus to the hamburger.

### 9. Trigger the not-found surface

Navigate manually to a URL that doesn't exist:

```
http://localhost:3000/this-route-does-not-exist
```

**Verify**: the page renders the shell (sidebar visible at desktop, header visible everywhere) AND a "Page not found" empty state with a link back to the dashboard. No bare browser 404.

### 10. Run the tests

```sh
pnpm test         # Vitest unit tests — should pass with the same env.test.ts from feature 001
pnpm test:e2e     # Playwright — runs both health.spec.ts (feature 001) and shell.spec.ts (this feature)
```

**Verify**: both commands exit zero. `shell.spec.ts` walks all five routes and asserts each renders inside the shell.

---

## Manual acceptance — optional but recommended

These match scenarios in the spec that are not automated:

### Reduced motion

Enable "Reduce motion" in your OS accessibility settings, reload, and re-open the mobile drawer. **Verify**: the drawer's slide-in animation is replaced by a near-instant appearance (or no animation at all). The functionality is identical; only the motion is suppressed.

### Theme persistence across reloads

Select a theme, reload the browser. **Verify**: the chosen theme is restored without a flash of the opposite theme on first paint.

### Resize from desktop to mobile while open

Open the page at desktop width with the sidebar visible. Drag the window narrower past 768px. **Verify**: the sidebar disappears, the hamburger appears, and no console error fires. (If you happen to have the drawer open and then expand past 768px, the drawer is hidden and the sidebar reappears — neither traps focus.)

### Error boundary (developer-only)

Temporarily throw inside one of the route pages:

```tsx
// in app/(shell)/accounts/page.tsx
throw new Error("boundary smoke test")
```

Hit `/accounts`. **Verify**: the shell remains visible. The main region shows a generic "Something went wrong" message with a "Try again" button and a "Go to dashboard" link. The browser does NOT display a stack trace in the rendered output (it may log one to the console — that's fine). Remove the throw before committing.

---

## Common scripts (unchanged from feature 001)

All scripts from feature 001's quickstart still apply: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm test:watch`, `pnpm test:e2e`, `pnpm db:generate`, `pnpm db:migrate` (still a no-op — schema is empty), `pnpm db:reset`, `pnpm db:studio`.

---

## Troubleshooting

- **`Module not found: Can't resolve "@/components/ui/sheet"`** on `pnpm dev`: the shadcn `sheet` component was not added. Run `pnpm dlx shadcn@latest add sheet separator scroll-area --yes` and re-run `pnpm install`.
- **The drawer doesn't close when I select a nav item**: `<MobileNav>` is missing the `onClose` call inside each `<NavLink>`'s click handler. Check `components/shell/mobile-nav.tsx`.
- **Focus does not move to `<main>` on route change**: `<RouteFocus>` is not mounted inside `<AppShell>`, or its `mainRef` is not the same ref attached to `<main>`. Check `components/shell/app-shell.tsx`.
- **Active nav item highlights "Dashboard" on every route**: the `isActive` rule is using `startsWith` for `/` instead of exact-equals. See `contracts/shell.md` §3.
- **Violet doesn't appear in dark mode**: the `.dark` selector in `app/globals.css` is missing the `--primary` override. See `research.md` §8 for the exact HSL values.
- **Sidebar appears at 700px viewport**: the breakpoint is wrong — `md:` is the correct Tailwind 3 variant (≥768px). If a custom breakpoint was introduced, remove it.
