# Implementation Plan: Authentication (Revised)

**Branch**: `003-auth` | **Date**: 2026-05-16 (revision) | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0 (multi-user from day one; no first-user gating; data-scoping convention)

> **This is a revision, not a from-scratch build.** Most of feature 003 is already implemented on branch `003-auth`. This plan captures the **deltas** required to align the in-flight code with the constitution amendment (v0.2.0) and the revised spec. Sections below distinguish *already-built* from *to-change* and *to-add*.

---

## Summary

The original feature 003 wired Auth.js v5 + Credentials, the `User` Prisma model with the `add_user` migration, server actions (`signUp`, `signInAction`, `signOutAction`), a Node-runtime middleware, the `(auth)/` route group with `/login` and `/signup`, and the shell's user-menu logout — all against the constitution's earlier "single-user-first" stance with a four-layer gate against second signups.

The constitution has since been amended to **multi-user from day one; no first-user gating** and adds a new convention: **every domain row is owned by a `userId`; every query filters by the session's user.** The spec was revised to match.

This revision:

1. **Removes the single-user gate** entirely. Drop the `userExists()`-based pre-checks in `signUp`, in `signup/page.tsx`, and in `middleware.ts`. The only remaining defense against duplicate accounts is the Postgres `User.email` `@unique` constraint, surfaced via `P2002`-catch → `USER_ALREADY_EXISTS` envelope.
2. **Adds a public marketing home at `/`** via a new `(marketing)/` route group. Server component, calls `auth()` once, adapts CTAs (anonymous: Log in + Sign up; authenticated: Go to dashboard). Hero + 3-feature grid + footer. No shell chrome.
3. **Moves the authenticated app under `/dashboard/*`**. The `(shell)/` group's pages relocate from `/`, `/accounts`, … to `/dashboard`, `/dashboard/accounts`, …. The shell layout itself does not move. `nav-items.ts` hrefs update. Middleware matcher and `nav-link` active-route rule update accordingly.
4. **Updates `app/not-found.tsx`** to render chrome-free (so it works for both anonymous and authenticated visitors without crashing the shell layout's session assertion).
5. **Documents the forward data-scoping rule** so feature 004+ inherits it.

No new dependencies. No new Prisma migration. The `User` model is unchanged.

---

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19, Node 20.x |
| **Framework** | Next.js 16 (App Router), Auth.js v5 (NextAuth), Prisma 7 |
| **Storage** | PostgreSQL 16 (docker-compose, local only) |
| **Auth** | Auth.js Credentials + JWT-only sessions (no PrismaAdapter tables) |
| **Password hashing** | Argon2id via `@node-rs/argon2` (already installed) |
| **UI** | Tailwind CSS + shadcn/ui (`card`, `input`, `label`, `alert`, `button`, `dropdown-menu`, `sheet`, `scroll-area`, `separator` already in place) |
| **Testing** | Vitest (unit), Playwright (E2E) |
| **Validation** | Zod at every boundary |
| **Target platform** | Local dev only (no production deployment in scope) |
| **Performance goals** | Argon2 verify ~50–100 ms per login; SSR for marketing root; middleware runs `runtime = "nodejs"` for Prisma access (kept; `userExists` count is the only thing we drop from Node-runtime needs, so we could revisit edge later) |
| **Constraints** | No money UI in this feature. No new domain model besides `User`. No new dependencies. |
| **Scale / scope** | Local single-machine. Multiple users supported but no concurrency targets. |

---

## Constitution Check

*Re-evaluated against `.specify/memory/constitution.md` v0.2.0.*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | N/A | PASS by exclusion | FR-028. Auth surfaces no monetary value; no `lib/money/` work. |
| **II — Type safety end-to-end** | Yes | PASS | All new code is TS strict, no `any`. Module augmentation of `next-auth` already makes `session.user.{id,email}` non-optional. Marketing page reads `auth()` and branches on a typed boolean. |
| **III — Validate at boundaries, trust internally** | Yes | PASS | Existing Zod boundary on both server actions stays unchanged. No new request surface. Middleware reads session; marketing reads session — both at boundary. |
| **IV — Test the money paths** | Yes | PASS (with update) | The constitution-mandated `signup → login → logout` E2E remains; `tests/e2e/auth.spec.ts` is rewritten to the new route shape, the "second-signup blocked" test is dropped (US5 retired), and a marketing-page smoke test (anonymous + authenticated CTAs) is added. Unit tests for schemas + password helpers are unchanged. |
| **V — Spec-driven development** | Yes | PASS | This revision flows spec → plan → tasks per the workflow. Single feature in flight (`003-auth`). |

**Conventions check.**

| Convention | Status |
|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS — additions stay within these. |
| Money helpers | N/A this feature. |
| Migrations (no `db push`) | PASS — no schema change. |
| Secrets (`.env.local` only) | PASS — no env change. |
| API response envelope `{ data } \| { error: { code, message } }` | PASS — unchanged. |
| Dates UTC | PASS — unchanged. |
| **Data scoping (NEW v0.2.0)**: every domain row owned by `userId`, queries filter by session | PASS — this feature introduces no domain row besides `User`; the rule is documented in `data-model.md` as a binding contract for feature 004+. |

**No violations.** No justification required in Complexity Tracking.

---

## What's already built (do not redo)

These are in place on branch `003-auth` and require no functional change beyond the deltas captured below:

- `lib/auth/{config,index,actions,password,schemas}.ts` — Auth.js v5 wiring, JWT-only, Argon2id hashing, Zod boundary, `DUMMY_HASH` timing-parity, module augmentation of `next-auth` types.
- `lib/auth/user.ts` — `getUserByEmail`, `createUser` (kept). `userExists` becomes unused after the gate is removed — see "Files to delete or trim" below.
- `lib/env.ts` — `AUTH_SECRET` (min 32) and `AUTH_URL` (URL) are required. No change.
- `db/schema.prisma` + `db/migrations/<timestamp>_add_user/` — `User` model with the 5 minimal fields. No change.
- `app/(auth)/{layout,login/{page,login-form},signup/{page,signup-form}}.tsx` — auth screens live in their own route group with a centered-card layout. The `signup/page.tsx` page-level guard is the only piece changing.
- `components/shell/{app-shell,brand,empty-state,header,mobile-nav,nav-items,nav-link,route-focus,sidebar,user-menu}.tsx` — shell chrome including the user-menu dropdown with logout. `nav-items.ts` href values are the only change.
- `app/api/auth/[...nextauth]/route.ts` — Auth.js handler. No change.
- `app/(shell)/{layout,error,loading}.tsx` — shell layout asserts a session and renders `<AppShell user={…}>`. No change (the layout stays at the route-group root; only its child pages move).
- `tests/unit/auth-schemas.test.ts`, `tests/unit/auth-password.test.ts` — unit suites. No change.

---

## Data Model Changes

**None.** The `User` model in `db/schema.prisma` is correct as-is (5 minimum fields). The single migration `db/migrations/<timestamp>_add_user/migration.sql` is unchanged. No new fields, no new tables, no new indexes.

See `data-model.md` for the field-level reference plus the new "Forward-looking data-scoping rule" section documenting the constitution v0.2.0 convention for feature 004+.

---

## API Surface

**Unchanged.** No new endpoints, no new server actions, no new contract shapes. The three existing server actions (`signUp`, `signInAction`, `signOutAction`) in `lib/auth/actions.ts` keep their signatures.

**One internal behavior change** inside `signUp`:

- **Before**: Two pre-checks against duplicate signup: (1) `userExists()` count check before hashing; (2) `P2002` try/catch on `createUser`.
- **After**: Drop pre-check (1). Keep (2). The `USER_ALREADY_EXISTS` error code is still returned, but now only triggered by the race-safe Postgres `@unique` violation. This makes the path single-pass-per-email (faster) and structurally equivalent for concurrent submissions (the `@unique` constraint is the single source of truth).

The `USER_ALREADY_EXISTS` envelope is unchanged. The UI surface (signup form's error display) is unchanged.

`signInAction` is unchanged. `signOutAction` is unchanged — still redirects to `/login`.

The Auth.js catch-all handler at `app/api/auth/[...nextauth]/route.ts` is unchanged.

---

## UI Surface

### Routes table (after this revision)

| URL | Auth requirement | Renders | File | Layout group |
|---|---|---|---|---|
| `/` | **Public** (renders for everyone) | Marketing home (hero + 3-feature grid + adaptive CTAs + footer) | `app/(marketing)/page.tsx` *(new)* | `(marketing)` |
| `/login` | Public for anon; redirect to `/dashboard` for auth | Login form | `app/(auth)/login/page.tsx` | `(auth)` |
| `/signup` | Public for anon; redirect to `/dashboard` for auth | Signup form (always; no gate) | `app/(auth)/signup/page.tsx` | `(auth)` |
| `/dashboard` | Required | Dashboard landing | `app/(shell)/dashboard/page.tsx` *(moved from `app/(shell)/page.tsx`)* | `(shell)` |
| `/dashboard/accounts` | Required | Accounts placeholder | `app/(shell)/dashboard/accounts/page.tsx` *(moved)* | `(shell)` |
| `/dashboard/transactions` | Required | Transactions placeholder | `app/(shell)/dashboard/transactions/page.tsx` *(moved)* | `(shell)` |
| `/dashboard/budgets` | Required | Budgets placeholder | `app/(shell)/dashboard/budgets/page.tsx` *(moved)* | `(shell)` |
| `/dashboard/settings` | Required | Settings placeholder | `app/(shell)/dashboard/settings/page.tsx` *(moved)* | `(shell)` |
| any 404 | Public | "Page not found" (chrome-free) | `app/not-found.tsx` *(modified)* | none |

### Marketing surface (new)

- `app/(marketing)/layout.tsx` — server component. Returns a minimal page chrome: a top header (Abacus brand on the left, theme toggle on the right) and a footer slot below the page content. No sidebar. No `SessionProvider`. Inherits the violet primary brand and dark/light theme via `next-themes` from the root.
- `app/(marketing)/page.tsx` — server component. Calls `auth()` once at the top, derives `isAuthenticated: boolean`, renders:
  - `<Hero isAuthenticated={…} />` — confident headline ("Personal finance, finally clear" or equivalent), one-line subheadline, adaptive CTA block:
    - Anonymous: two buttons — `<Link href="/login">Log in</Link>` (variant: outline) + `<Link href="/signup">Sign up</Link>` (variant: default/primary).
    - Authenticated: one button — `<Link href="/dashboard">Go to dashboard</Link>` (variant: default).
  - `<FeatureGrid />` — 3-column grid (responsive: 1 col on mobile). Each card: a Lucide icon (`Wallet`, `PieChart`, `ArrowLeftRight`), a one-line label, a one-line copy. Examples:
    - **Track accounts** — Connect every account in one place.
    - **Set budgets** — Cap spending by category.
    - **See where your money goes** — Transactions and categories at a glance.
- `components/marketing/{marketing-header,marketing-footer,hero,feature-grid}.tsx` — small server components, no `"use client"`, no client state. Theme toggle is reused from `components/theme-toggle.tsx`.

### Shell surface (modified)

- `components/shell/nav-items.ts` — all `href` values updated:
  - `/` → `/dashboard`
  - `/accounts` → `/dashboard/accounts`
  - `/transactions` → `/dashboard/transactions`
  - `/budgets` → `/dashboard/budgets`
  - `/settings` → `/dashboard/settings`
- `components/shell/nav-link.tsx` — `isActive` rule update: the previous exact-match was for `/` (the old dashboard); the new exact-match is for `/dashboard` (the new dashboard). Prefix-match for the rest works unchanged. Implementation: `if (href === "/dashboard") return pathname === "/dashboard"; return pathname === href || pathname.startsWith(href + "/")`.
- `components/shell/user-menu.tsx` — the "Settings" link inside the dropdown updates from `/settings` to `/dashboard/settings`.
- `app/(shell)/layout.tsx` — no change.
- `app/(shell)/error.tsx`, `loading.tsx` — no change.

### Auth surface (trimmed)

- `app/(auth)/signup/page.tsx` — remove the `userExists()` branch and the "Abacus is a single-user app" Card. Always render `<SignupForm from={searchParams.from} />` inside the standard title + description. The wording in the description that says "Set the single user for this Abacus install" updates to a multi-user-appropriate line (e.g., "Create your Abacus account").
- `app/(auth)/login/page.tsx` — no change to logic. The post-login redirect is honored by `signInAction` based on `safeFrom` which accepts any in-app `/...` path; `/dashboard/*` is already accepted.
- `app/(auth)/login/login-form.tsx`, `app/(auth)/signup/signup-form.tsx` — no functional change. If either form references `/` as a fallback redirect target in client code, update to `/dashboard` (audit during implementation; the actual redirect is server-side in the action, so this is likely a no-op).
- `app/(auth)/layout.tsx` — no change.

### Not-found surface (modified)

- `app/not-found.tsx` — replace the current `<AppShell>` wrapper with a chrome-free surface (centered "Page not found" message + "Back to home" link to `/`). Rationale: the shell layout now asserts a session; rendering `<AppShell>` on a 404 hit by an unauthenticated user would throw. A chrome-free 404 is simpler and works for everyone. See `research.md` §4 for the trade-off discussion.

---

## File-Level Layout

### Files to ADD (new)

| Path | Purpose |
|---|---|
| `app/(marketing)/layout.tsx` | Marketing route-group layout: top header (brand + theme toggle) + content + footer. Server component. |
| `app/(marketing)/page.tsx` | Public marketing home. Server component, calls `auth()`, branches CTAs. |
| `components/marketing/marketing-header.tsx` | Top header used by the marketing layout (brand on left, theme toggle on right). |
| `components/marketing/marketing-footer.tsx` | Simple footer (copyright + small Abacus mark). |
| `components/marketing/hero.tsx` | Headline + subheadline + adaptive CTA block. Props: `{ isAuthenticated: boolean }`. |
| `components/marketing/feature-grid.tsx` | 3-card responsive grid with icon + label + one-liner per card. |

### Files to MOVE (old path → new path; same content)

| Old path | New path |
|---|---|
| `app/(shell)/page.tsx` | `app/(shell)/dashboard/page.tsx` |
| `app/(shell)/accounts/page.tsx` | `app/(shell)/dashboard/accounts/page.tsx` |
| `app/(shell)/transactions/page.tsx` | `app/(shell)/dashboard/transactions/page.tsx` |
| `app/(shell)/budgets/page.tsx` | `app/(shell)/dashboard/budgets/page.tsx` |
| `app/(shell)/settings/page.tsx` | `app/(shell)/dashboard/settings/page.tsx` |

Note: the old top-level directories (`app/(shell)/accounts/`, etc.) are deleted after their `page.tsx` moves. The `app/(shell)/dashboard/` directory is the new home for all five pages. The shell layout (`app/(shell)/layout.tsx`) does NOT move — it stays at the route-group root and continues to wrap whatever lives under `(shell)/`.

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `middleware.ts` | Drop `userExists()` import and all count-based branches. Drop the `/signup` + user-exists → `/login` case. Drop the `/` + no-user → `/signup` case. Update matcher: drop `/`; replace `/accounts/:path*`, `/transactions/:path*`, `/budgets/:path*`, `/settings/:path*` with `/dashboard/:path*` (covers `/dashboard` exactly too, in combination with an explicit `/dashboard` entry). Final matcher: `["/dashboard", "/dashboard/:path*", "/login", "/signup"]`. Update `isShellPath` / `SHELL_PATHS` constants to operate over `/dashboard*`. Update the unauthenticated-shell branch to build the `from=` query parameter from the original `/dashboard/*` path. Update the authenticated-on-auth-route redirect target from `/` to `/dashboard`. |
| `lib/auth/actions.ts` | In `signUp`: delete the `if (await userExists())` block before hashing. Keep the `P2002` try/catch in the `createUser` call — it now solely owns the duplicate-rejection envelope. Update the default `redirect(from)` fallback target from `/` to `/dashboard` (when no `from` is provided). |
| `lib/auth/user.ts` | Delete the unused `userExists()` function (YAGNI; cheap to re-add later if an admin UI ever needs it). |
| `app/(auth)/signup/page.tsx` | Delete the `userExists()` import + the `if (exists) return …` block. Always render `<SignupForm />`. Adjust the description copy to a multi-user line ("Create your Abacus account."). |
| `app/(auth)/login/page.tsx` | Audit only — verify no `/` fallback redirect in JSX. If present, change to `/dashboard`. |
| `app/(shell)/page.tsx` → `app/(shell)/dashboard/page.tsx` | File is **moved** (see above). Content unchanged. |
| `app/(shell)/accounts/page.tsx` → `app/(shell)/dashboard/accounts/page.tsx` | Moved; content unchanged. |
| `app/(shell)/transactions/page.tsx` → `app/(shell)/dashboard/transactions/page.tsx` | Moved; content unchanged. |
| `app/(shell)/budgets/page.tsx` → `app/(shell)/dashboard/budgets/page.tsx` | Moved; content unchanged. |
| `app/(shell)/settings/page.tsx` → `app/(shell)/dashboard/settings/page.tsx` | Moved; content unchanged. |
| `components/shell/nav-items.ts` | Update all five `href` values to the `/dashboard*` paths. |
| `components/shell/nav-link.tsx` | Update the `isActive` exact-match from `/` to `/dashboard`. |
| `components/shell/user-menu.tsx` | Update the "Settings" link `href` from `/settings` to `/dashboard/settings`. |
| `app/not-found.tsx` | Replace the `<AppShell>` wrapper with a chrome-free surface (centered "Page not found" card + "Back to home" link to `/`). Remove the `AppShell` import. |
| `tests/e2e/auth.spec.ts` | Significant rewrite (see Testing Strategy). |

### Files to DELETE (or trim)

| Path | Reason |
|---|---|
| `app/(shell)/accounts/` (empty directory after move) | Cleanup; the `page.tsx` is the only file inside. |
| `app/(shell)/transactions/` | Same. |
| `app/(shell)/budgets/` | Same. |
| `app/(shell)/settings/` | Same. |
| `userExists` export inside `lib/auth/user.ts` | YAGNI — no consumer remains after middleware and signup-page guards are removed. The file stays; only the function is deleted. |

No file in `app/api/`, no file in `lib/auth/` (other than `user.ts`), and no Prisma file is deleted.

---

## Middleware (revised decision table)

`middleware.ts` keeps `export const runtime = "nodejs"` (Auth.js v5 `auth()` is Node-friendly; nothing forces edge). The matcher and decision table simplify substantially.

### Matcher

```ts
export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/login",
    "/signup",
  ],
}
```

- `/` is intentionally **not** in the matcher. The marketing page is public for everyone and has no auth-gate work to do.
- The static `/dashboard` entry is needed alongside `/dashboard/:path*` because Next.js matcher patterns don't include the bare path.

### Decision table

| Path | Session present? | Action |
|---|---|---|
| `/dashboard` or `/dashboard/*` | yes | `NextResponse.next()` (allow) |
| `/dashboard` or `/dashboard/*` | no | `redirect("/login?from=<original>")` (FR-008) |
| `/login` | yes | `redirect("/dashboard")` (FR-022) |
| `/login` | no | `NextResponse.next()` |
| `/signup` | yes | `redirect("/dashboard")` (FR-022) |
| `/signup` | no | `NextResponse.next()` |

**Differences vs. the original middleware:**

- No `userExists()` call. The Prisma read disappears from the middleware entirely.
- No `/signup` + user-exists → `/login` branch.
- No `/` + no-user → `/signup` branch.
- The authenticated-on-`/login`-or-`/signup` redirect target changes from `/` to `/dashboard`.
- `/` is dropped from the matcher entirely.

### Redirect-hint safety (unchanged)

`safeFromOrRoot(pathname)` in the middleware and `safeFrom(rawFrom)` in `signInAction` / `signUp` both reject hints that are not in-app paths. After this revision, `safeFrom` accepts any `/dashboard/*` (because the same `startsWith("/")` rule covers it) and the fallback target becomes `/dashboard`. Off-site URLs, `//` prefixes, and `:` schemes still fall back.

---

## Money & Currency Notes

**N/A — single currency only this feature.** Auth has no money UI, no monetary input, no `Decimal` field. `lib/money/` is **not** created (FR-027). Constitution Principle I is preserved by exclusion.

---

## Auth & Validation Boundaries

### Auth required at

- Every `app/(shell)/dashboard/*` route. Enforced by `middleware.ts` (redirect at the boundary) AND by `app/(shell)/layout.tsx` (defense-in-depth `auth()` call that throws if missing).

### Auth NOT required at

- `/` (marketing page) — public for everyone. The server component calls `auth()` to *read* the session for CTA branching but does not gate access on it.
- `/login`, `/signup` — public for anonymous visitors. Authenticated visitors are redirected to `/dashboard` by the middleware.
- `/api/auth/[...nextauth]` — managed by Auth.js, not gated.

### Zod validation at

- `signUp` server action: `signupSchema.safeParse({ email, password, confirmPassword })` before any hash/DB operation. Unchanged.
- `signInAction` server action: `loginSchema.safeParse({ email, password })` before `signIn("credentials", …)`. Unchanged.
- Credentials provider `authorize()` callback: defensive re-parse with `loginSchema.safeParse(credentials)`. Unchanged.

No new validation surface. The marketing page accepts no user input.

---

## Testing Strategy

### Unit (Vitest) — unchanged

- `tests/unit/auth-schemas.test.ts` — Zod invariants. No change required.
- `tests/unit/auth-password.test.ts` — Argon2 hash/verify round-trip. No change required.

### E2E (Playwright) — significant updates to `tests/e2e/auth.spec.ts`

**Drop:**

- The `"second signup is blocked"` test (US5 retired; the gate no longer exists at the page level — only the `@unique` race-closure remains and that's covered indirectly by the `USER_ALREADY_EXISTS` envelope shape, which a unit test could pick up later).

**Update (all assertions on the new route shape):**

- `"first-user signup → dashboard → reload still authenticated"` → rename and rework: `"signup lands on /dashboard and survives reload"`. Sequence: `goto("/signup")` (no longer redirected from `/`), fill form, submit, expect URL `/dashboard`, expect "Welcome to Abacus" heading, reload, still on `/dashboard`.
- `"shell navigates across all 5 routes when authenticated"` → update route paths: `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`. Initial expected URL after login: `/dashboard`. The `primaryNav.getByRole("link", …)` selectors find the same labels; only the URL assertions change.
- `"mobile drawer opens via hamburger and Escape closes it"` → update post-login URL to `/dashboard` and the in-drawer click target to land on `/dashboard/accounts`.
- `"logout via user menu redirects to /login and resists back-navigation"` → after logout, `goto("/dashboard")` (not `/`) and expect redirect to `/login`.
- `"unauthenticated shell route redirects to /login with from preserved"` → `goto("/dashboard/transactions")`, expect URL `/login?from=%2Fdashboard%2Ftransactions`.
- `"invalid credentials shows the locked error message"` → no path change, but the post-success redirect target (referenced in setup steps elsewhere) is `/dashboard`.
- `"unknown email shows the same locked error message (no enumeration)"` → no change.

**Add (new tests for the marketing surface):**

- `"marketing home renders for anonymous visitor with Log in + Sign up CTAs"` — fresh context (no cookies), `goto("/")`, expect both CTA links to be visible and to point at `/login` and `/signup` respectively. Assert that the sidebar (`role="navigation"`, `name="Primary"`) is NOT present (marketing layout, not shell).
- `"marketing home renders for authenticated visitor with Go-to-dashboard CTA"` — sign in first (reuse the signup setup), `goto("/")`, expect the single "Go to dashboard" CTA visible and pointing at `/dashboard`. Assert the "Log in" / "Sign up" CTAs are NOT visible.

### What can skip tests

- The 3-feature grid copy is content, not behavior — no test required.
- The marketing footer is content — no test required.
- The `not-found.tsx` chrome-free surface gets a thin assertion at most (visit a non-existent path, expect the "Page not found" text); this is optional and not constitution-mandated.

### Constitution coverage

The constitution-mandated `signup → login → logout` flow (Principle IV) is preserved by the updated `tests/e2e/auth.spec.ts`. SC-010 and SC-011 continue to hold against the new route shape.

---

## Risks & Trade-offs

1. **Route-shape change breaks bookmarks.** Anyone with a `/accounts` bookmark would 404 after this lands. Decision: **acceptable** — the app has not been deployed and there are no real-world users to migrate. We do not add legacy redirects; YAGNI.
2. **Three route groups (`(marketing)`, `(auth)`, `(shell)`) increases file count.** Decision: **accepted trade-off** — the architectural separation makes "what chrome does this route render?" obvious from the directory tree alone, and matches the symmetry the original spec set up for `(auth)` and `(shell)`. The cost is a few extra layout files; the win is long-term clarity.
3. **Marketing page is a server component that calls `auth()`.** Every render of `/` does a JWT decode. Decision: **accepted** — JWT decode is in-memory (no DB hit), and the marketing page is small. The alternative (`SessionProvider` + client-side `useSession`) would add a hydration round trip and a moment of "loading" UI. The server-side branch is simpler and faster.
4. **`not-found.tsx` loses the shell chrome.** A 404 inside the authenticated app no longer shows the sidebar. Decision: **accepted** — a chrome-aware 404 (sidebar for auth, no sidebar for anon) doubles the surface area for a low-value page. A single chrome-free 404 with a "Back to home" link is the simpler, correct shape.
5. **The `userExists()` helper is deleted rather than kept.** A future admin UI might want it. Decision: **delete now (YAGNI)** — `prisma.user.count() > 0` is a one-liner to re-add. Keeping dead code invites confusion ("why is this here?").

---

## Project Structure

### Documentation (this feature)

```text
specs/003-auth/
├── plan.md              # This file (overwritten by /speckit-plan)
├── research.md          # Phase 0 — overwritten with revision-era decisions
├── data-model.md        # Phase 1 — unchanged User model + new data-scoping forward rule
├── quickstart.md        # Phase 1 — rewritten for the new route shape
├── contracts/
│   └── auth.md          # Phase 1 — simplified middleware table + new marketing contract
├── spec.md              # REVISED — multi-user + marketing home + dashboard relocation
└── tasks.md             # Phase 2 (regenerated by /speckit-tasks against this plan)
```

### Source code (after this revision)

```text
abacus/
├── app/
│   ├── (marketing)/                        # NEW route group — public surface
│   │   ├── layout.tsx                      # NEW — marketing header + footer chrome
│   │   └── page.tsx                        # NEW — hero + features + adaptive CTAs
│   ├── (auth)/                             # unchanged group (page-level guard trimmed)
│   │   ├── layout.tsx
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── login-form.tsx
│   │   └── signup/
│   │       ├── page.tsx                    # MODIFIED — drop userExists branch
│   │       └── signup-form.tsx
│   ├── (shell)/                            # unchanged group; children relocate
│   │   ├── layout.tsx                      # unchanged
│   │   ├── error.tsx                       # unchanged
│   │   ├── loading.tsx                     # unchanged
│   │   └── dashboard/                      # NEW directory under the group
│   │       ├── page.tsx                    # MOVED from (shell)/page.tsx
│   │       ├── accounts/page.tsx           # MOVED from (shell)/accounts/page.tsx
│   │       ├── transactions/page.tsx       # MOVED
│   │       ├── budgets/page.tsx            # MOVED
│   │       └── settings/page.tsx           # MOVED
│   ├── api/
│   │   └── auth/[...nextauth]/route.ts     # unchanged
│   ├── layout.tsx                          # unchanged (root)
│   ├── providers.tsx                       # unchanged
│   ├── globals.css                         # unchanged
│   └── not-found.tsx                       # MODIFIED — chrome-free
├── components/
│   ├── marketing/                          # NEW directory
│   │   ├── marketing-header.tsx            # NEW
│   │   ├── marketing-footer.tsx            # NEW
│   │   ├── hero.tsx                        # NEW
│   │   └── feature-grid.tsx                # NEW
│   ├── shell/                              # unchanged files; two MODIFIED
│   │   ├── nav-items.ts                    # MODIFIED — hrefs → /dashboard*
│   │   ├── nav-link.tsx                    # MODIFIED — isActive exact-match
│   │   ├── user-menu.tsx                   # MODIFIED — Settings link
│   │   └── …                               # rest unchanged
│   ├── theme-toggle.tsx                    # unchanged (reused by marketing)
│   └── ui/                                 # unchanged
├── lib/
│   ├── auth/
│   │   ├── actions.ts                      # MODIFIED — drop userExists pre-check
│   │   ├── config.ts                       # unchanged
│   │   ├── index.ts                        # unchanged
│   │   ├── password.ts                     # unchanged
│   │   ├── schemas.ts                      # unchanged
│   │   └── user.ts                         # MODIFIED — delete userExists export
│   ├── env.ts                              # unchanged
│   ├── prisma.ts                           # unchanged
│   └── utils.ts                            # unchanged
├── db/
│   ├── schema.prisma                       # unchanged
│   └── migrations/                         # unchanged (single add_user migration)
├── middleware.ts                           # MODIFIED — matcher + decision table
└── tests/
    ├── unit/
    │   ├── auth-schemas.test.ts            # unchanged
    │   └── auth-password.test.ts           # unchanged
    └── e2e/
        └── auth.spec.ts                    # MODIFIED — new route shape + marketing tests
```

**Structure Decision:** Three sibling Next.js route groups (`(marketing)`, `(auth)`, `(shell)`) under `app/`. Each owns its chrome via its own `layout.tsx`. Authenticated app routes live under `/dashboard/*` inside the `(shell)` group. Public marketing lives at `/` inside the `(marketing)` group. The `(shell)` group's layout asserts a session for defense-in-depth. The middleware enforces the gate at the boundary.

---

## Complexity Tracking

No constitution violations. No justification entries required.

---

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, deltas captured against in-flight implementation
File: /Users/rgederin/git/abacus/specs/003-auth/plan.md
```
