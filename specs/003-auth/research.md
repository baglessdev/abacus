# Feature 003 — Phase 0 Research (Revised)

Non-obvious decisions taken during planning **after the constitution v0.2.0 amendment**. The original (single-user-stance) research file recorded 14 entries covering the Auth.js split, middleware composition, edge-runtime trade-offs, Zod schema shape, server-action choice, Auth.js callbacks, enumeration-safe login, `DUMMY_HASH` provenance, logout action, session-without-`SessionProvider`, the `(auth)/layout.tsx` shape, Argon2 parameters, E2E DB-reset strategy, and shadcn primitives. **Those decisions stand unchanged for the parts of the system that did not move**; this revised research file documents only the new and changed decisions introduced by the v0.2.0 amendment and the spec revision.

Each entry: Decision / Rationale / Alternatives considered.

---

## R1. Three route groups (`(marketing)`, `(auth)`, `(shell)`) vs. a single root or conditional layouts

**Decision.** Add a third sibling route group at `app/(marketing)/` alongside the existing `app/(auth)/` and `app/(shell)/`. Each group owns its own `layout.tsx` and renders its own chrome:

- `(marketing)` — top header (brand + theme toggle) + footer, no sidebar.
- `(auth)` — centered card on muted background, no chrome (existing).
- `(shell)` — full app shell with sidebar + header + user-menu (existing).

The marketing page at `/` lives at `app/(marketing)/page.tsx`; the dashboard pages at `/dashboard/*` live under `app/(shell)/dashboard/*`.

**Rationale.** Three groups give three clean answers to "what chrome does this URL render?" — visible from the directory tree, enforceable at the layout boundary, with no runtime branching. It also matches the symmetry the original feature 003 already established for `(auth)` and `(shell)`. Adding `(marketing)` is one more peer; the cognitive cost is small.

**Alternatives considered.**

- *Conditional rendering inside the root layout (one `app/page.tsx`, branch on `auth()` to choose chrome).* Rejected — collapses three architectural surfaces into one file and forces every page in the app to think about all three. Layout boundaries exist precisely to avoid that.
- *Render the marketing page at `app/page.tsx` directly (no route group), let `(auth)` and `(shell)` continue as before.* Rejected — works mechanically, but the marketing page would have to inline its own header / footer markup because it would inherit only the root layout. The first additional marketing page (e.g., `/pricing` later) would then create asymmetry; better to land the group now.
- *Share the existing `(auth)/layout.tsx` for marketing.* Rejected — the auth layout is a centered card; the marketing page is a wide hero with a footer. Visually incompatible.

---

## R2. Marketing CTA branching: server-side `auth()` vs client-side `useSession`

**Decision.** The marketing page is a **server component**. It calls `auth()` once at the top of `app/(marketing)/page.tsx`, computes `isAuthenticated = !!session?.user`, and passes it down as a prop to a server-component `<Hero />` that renders either the two-CTA anonymous block or the single-CTA authenticated block.

No `SessionProvider`. No `useSession()`. No `"use client"` on any marketing component.

**Rationale.**

- The marketing page has no client state and no interactive widgets (the CTAs are plain `<Link>` elements). Pushing it to the client would buy nothing and cost a hydration round trip.
- Avoids the "flash of anonymous CTAs → snap to authenticated CTAs" that a client-side `useSession` would produce on first paint (when the session has not yet resolved).
- Matches §10 of the original research: the whole app already prefers server-side `auth()` and no `SessionProvider`. The marketing page extends that pattern; it does not invent a new one.
- Keeps the client JS bundle on `/` to the minimum (theme toggle only).

**Alternatives considered.**

- *Wrap the marketing tree in `<SessionProvider>` and use `useSession()`.* Rejected — adds a client provider, a moment of "loading" UI, and either a flash-of-wrong-CTAs or a deliberate skeleton state. The `<SessionProvider>` would also need to live at the root layout (so it covers `/`), which would impose it on the shell too even though the shell already reads `session` server-side. Net-negative.
- *Skip the `auth()` call and always render anonymous CTAs.* Rejected — defeats the point of spec FR-021's "adaptive CTAs" line, locked in the revision clarifications.

---

## R3. Middleware matcher reduction: dropping `/` and the `userExists()` reads

**Decision.** The middleware matcher shrinks from seven entries to four:

```ts
matcher: ["/dashboard", "/dashboard/:path*", "/login", "/signup"]
```

- `/` is removed entirely — the marketing page is public and has no auth-gate decision to make.
- `/accounts/:path*`, `/transactions/:path*`, `/budgets/:path*`, `/settings/:path*` collapse into `/dashboard/:path*` (with an explicit `/dashboard` entry because Next's matcher patterns don't include the bare base path).
- The middleware body drops the `await userExists()` call entirely — no more `prisma.user.count()` from inside middleware. The only remaining state the middleware reads is `await auth()`.

**Rationale.**

- Performance: the marketing page is the most visited URL in the app (every inbound link lands there). Cutting middleware out of the `/` path removes one JWT decode per request to the most-trafficked surface. The `auth()` call still happens inside the page for CTA branching, but that's a single in-process read; the middleware version is wrapped in additional Next infrastructure.
- Clarity: the middleware now has exactly two responsibilities — gate `/dashboard/*` and redirect authenticated visitors away from `/login` / `/signup`. The old version had four (those two plus first-user redirect and single-user gate). Halving the decision table is a clarity win.
- The Prisma read in the middleware is no longer needed at all (no `userExists()` call), so we could in principle move the middleware back to the edge runtime. Decision: **keep `runtime = "nodejs"`** for this revision because Auth.js v5's `auth()` is documented as Node-friendly and the win from edge would be marginal at local-dev scale. A future feature can flip to edge if cold-start ever matters.

**Alternatives considered.**

- *Keep `/` in the matcher and add a no-op pass-through entry for it.* Rejected — adds a useless dispatch entry. The matcher's job is to declare what we care about.
- *Move `userExists()` to a layout-level guard on `(shell)/`.* Already there in spirit (the shell layout's `auth()` defense-in-depth); no need to retain `userExists()` anywhere else.

---

## R4. `app/not-found.tsx` strategy: chrome-free vs chrome-aware

**Decision.** Render a **chrome-free** "Page not found" surface from `app/not-found.tsx`. A centered card with the message and a single "Back to home" link to `/`. No shell sidebar/header. No marketing header/footer either. Just the typography + a button.

**Rationale.**

- The shell layout (`app/(shell)/layout.tsx`) asserts a session exists (it does `throw new Error("Shell rendered without session — middleware misconfigured")` if not). If `not-found.tsx` rendered `<AppShell>` and an unauthenticated user hit a non-existent URL, the layout would throw. That was the original implementation's latent bug, harmless under the single-user stance because every visitor was either signed in or redirected to `/signup` before they could ever reach a 404. Multi-user changes that.
- A chrome-free 404 works for everyone — anon, authenticated, anywhere. One file, one rendering path, no surprises.
- The "Back to home" link points at `/` which is the new marketing page, so unauthenticated visitors are taken to a useful destination; authenticated visitors can click into `/dashboard` from there. Both audiences land somewhere sensible.

**Alternatives considered.**

- *Chrome-aware 404 (render marketing chrome for anon, shell chrome for authenticated, branching on `auth()` inside `not-found.tsx`).* Rejected — doubles the test surface for a low-value page; multiplies code without product benefit.
- *Two `not-found.tsx` files (one per route group).* Possible in Next.js App Router, but again duplicates code. A single root-level chrome-free 404 wins on simplicity.
- *Redirect `not-found` to `/`.* Rejected — destroys the URL the user was trying to reach (no way to tell them what was wrong) and pretends the 404 didn't happen. Bad UX.

---

## R5. `nav-link` active-route rule under the new `/dashboard/*` prefix

**Decision.** Update `components/shell/nav-link.tsx`'s `isActive` predicate to exact-match `/dashboard` (the new dashboard root) instead of `/` (the old dashboard root). Prefix-match logic for the other items stays unchanged.

```ts
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}
```

**Rationale.**

- Without the exact-match special case for the dashboard root, the rule `pathname === href || pathname.startsWith(href + "/")` would mark the "Dashboard" nav item as active on `/dashboard/accounts` (because `/dashboard/accounts`.startsWith(`/dashboard/`) is true). That would show two active links (Dashboard + Accounts) simultaneously.
- The previous rule had the same shape for `/` (the old dashboard root) for the same reason. Translating it to `/dashboard` is mechanical.

**Alternatives considered.**

- *Use exact-match for every nav item.* Rejected — would break future deep links like `/dashboard/accounts/<id>`, where we'd still want the "Accounts" nav item lit. Prefix-match is the right rule for non-root items.
- *Use Next.js's `usePathname()` segments to determine the active item.* Possible but overkill; the existing rule is sufficient with the one special case.

---

## R6. Marketing page content: bold-but-honest 3-feature grid

**Decision.** The marketing page asserts three features Abacus *will* have on the roadmap:

1. **Track accounts** — Connect every account in one place.
2. **Set budgets** — Cap spending by category.
3. **See where your money goes** — Transactions and categories at a glance.

Each line lives on a card with a single Lucide icon (`Wallet`, `PieChart`, `ArrowLeftRight`). The hero copy is a single confident headline ("Personal finance, finally clear" or equivalent) + a one-line subheadline. No screenshots, no testimonials, no Lorem ipsum, no pricing teaser.

**Rationale.**

- The features asserted are the actual upcoming roadmap (features 004 Accounts, 005-ish Budgets, 006-ish Transactions). They are not vaporware claims — they are commitments. Stating them on the public surface anchors the product.
- Lorem ipsum or "your trusted partner for…" boilerplate copy makes the marketing page look like a half-finished template. Bold, honest copy reads as confident even when the underlying product is small.
- Three features is the standard hero-grid rhythm; fewer feels thin, more feels padded.
- No screenshots → no asset work, no "we shipped a marketing page without product UI to show" mismatch. We can add screenshots in a follow-up once the product surfaces exist.

**Alternatives considered.**

- *Skip the feature grid; hero + CTAs only.* Rejected — gives the marketing page no real reason to exist beyond a sign-in funnel. The grid is what makes it a marketing page, not a glorified login redirect.
- *Pricing teaser.* Out of scope per the spec; the app has no pricing model in the foreseeable future.
- *Testimonials.* No real users yet. A fabricated testimonial would damage trust if anyone noticed.

---

## R7. Marketing layout primitives: reuse vs new

**Decision.** Build four small, dedicated server components under `components/marketing/` rather than inlining everything into `app/(marketing)/page.tsx`:

- `marketing-header.tsx` — top bar (Brand component reused from `components/shell/brand.tsx` + ThemeToggle reused from `components/theme-toggle.tsx`).
- `marketing-footer.tsx` — copyright line + small "Made with Abacus" mark.
- `hero.tsx` — headline + subheadline + adaptive CTA block. Props: `{ isAuthenticated: boolean }`.
- `feature-grid.tsx` — 3-card responsive grid.

**Rationale.**

- The marketing page is server-rendered and these components have no state, so the split costs nothing at runtime.
- The split keeps `app/(marketing)/page.tsx` short and readable (it becomes mostly composition).
- Each component is independently testable (the Playwright assertions can target stable selectors inside each).
- Reusing `Brand` and `ThemeToggle` avoids duplicating the violet brand mark and the theme-toggle dropdown shape.

**Alternatives considered.**

- *Inline everything into `page.tsx`.* Cheaper now but harder to evolve when the next marketing page lands.
- *Build a `<Marketing>` mega-component that takes the whole page as props.* Over-engineered; the four small components are the right granularity.

---

## R8. `userExists()` helper: delete vs keep

**Decision.** **Delete** the `userExists()` export from `lib/auth/user.ts`. The function becomes unused after the middleware and signup-page gates are removed.

**Rationale.**

- YAGNI: no caller remains. The function would be dead code.
- Re-adding it is a one-liner: `(await prisma.user.count()) > 0`. The cost of deleting now and re-adding later (if an admin UI ever needs it) is negligible.
- Keeping unused exports invites confused PR comments ("why is this here?") and increases the import surface that has to stay correct on every refactor.

**Alternatives considered.**

- *Keep it, mark deprecated.* Worse — TypeScript doesn't enforce deprecation comments, and the file becomes more confusing, not less.
- *Move it to a "scratch" file.* Same problem at a different address.

---

## R9. E2E test reset strategy under multi-user

**Decision.** The Playwright `tests/e2e/auth.spec.ts` keeps its `test.beforeAll` hook that calls `prisma.user.deleteMany({})` to start each run from a clean `User` table. This works under multi-user because there is still no cascade (no domain rows reference `User` yet — feature 004 will add the first one).

**Rationale.**

- The E2E flows create their own ephemeral test users on the fly (`e2e-${Date.now()}@example.com`). A clean table at start avoids collisions between test runs.
- Single source of truth for the test database: whatever `DATABASE_URL` points at (loaded from `.env.local`). Same as the original strategy.

**Alternatives considered.**

- *Per-test transaction rollback.* Out of scope for the current Playwright harness; would require wrapping each test in a DB transaction the dev server can see, which Next.js's connection pool makes awkward.
- *Spin up a per-test ephemeral database.* Overkill while there is only one model. Worth revisiting when feature 004+ adds cascades.

---

## R10. Inherited (unchanged) decisions

The following decisions from the original research file stand without modification under the revision:

| § (orig) | Topic | Status |
|---|---|---|
| 1 | Auth.js v5 split (`config.ts` vs `index.ts`) | unchanged |
| 4 | Zod schema shape (lowercased email, 12-char password min on signup, presence on login, `.refine` for confirm-password) | unchanged |
| 5 | Server actions over route handlers | unchanged |
| 6 | Auth.js `jwt` + `session` callbacks; module augmentation | unchanged |
| 7 | Account-enumeration-safe login (`INVALID_CREDENTIALS` single message; Argon2 verify against `DUMMY_HASH` for unknown emails) | unchanged |
| 8 | `DUMMY_HASH` provenance and rotation note | unchanged |
| 9 | Logout server action | unchanged |
| 10 | Session consumption without `SessionProvider` | unchanged (extended to the marketing page in R2) |
| 11 | `(auth)/layout.tsx` shape | unchanged |
| 12 | Argon2id parameters (OWASP defaults) | unchanged |
| 13 | E2E DB-reset strategy | unchanged (clarified in R9) |
| 14 | shadcn primitives (`input`, `label`, `card`, `alert`) | unchanged; no new primitives needed for marketing (the Hero uses `Button` which is already present) |

The original §2 (middleware composition) and §3 (Node-runtime constraint) are **superseded** by R3 — the middleware shrinks to two concerns and no longer needs the Prisma read.
