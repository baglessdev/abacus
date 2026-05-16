---
description: "Dependency-ordered task list for 003-auth (REVISED for multi-user + public marketing home)"
---

# Tasks: Authentication (Revised)

**Input**: Design documents from `/specs/003-auth/` (revised post-constitution v0.2.0)

**Prerequisites**: plan.md (READY_FOR_BUILD, revised), spec.md (revised), research.md, data-model.md, contracts/auth.md, quickstart.md.

**Revision note**: This is a DELTA pass. Most of feature 003 is already implemented from the prior single-user pass. The tasks here:
- DELETE the four-layer single-user gate (keep only the Postgres `@unique` race-safe layer).
- ADD a public marketing route group `app/(marketing)/` at `/`.
- MOVE the authenticated app under `/dashboard/*`.
- REWRITE `tests/e2e/auth.spec.ts` for the new route shape and drop the "second signup blocked" test.

**Tests**: Required by constitution Principle IV — `signup → login → logout → login` E2E (FR-019) plus unauthenticated-redirect smoke (FR-020). Existing Vitest unit tests for schemas + password stay green and need no edits.

**Organization**: Tasks are grouped by user story. US1, US2, US3, US4, US8 are P1; US6, US7 are P2 (no story numbered 5 — US5 was dropped in the revision). The MVP scope is **US8 + US1 + US3** (public landing reachable, signup works, unauthenticated `/dashboard/*` redirects) — all three are required for a coherent first-touch experience.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies).
- **[Story]**: Maps to spec user stories US1–US4, US6–US8. Setup/Foundational/Polish phases carry no story label.
- File paths are project-relative to repo root (`/Users/rgederin/git/abacus/`).

---

## Phase 1: Setup

**Purpose**: No new dependencies. Confirm in-flight state before applying revision deltas. No story label.

- [X] T001 Confirm the working tree on branch `003-auth` still has the in-flight implementation intact (run `git status` — expect modified files from the prior single-user pass that have NOT yet been committed). If the user-cleared the User table during the prior session, no action needed; if not, the new auth E2E in T030 will truncate it. Confirm `pnpm install` is up to date (no diff in `pnpm-lock.yaml`).

---

## Phase 2: Foundational (Revision Deltas — Blocking All Stories)

**Purpose**: Tear out the single-user gate, reshape routes to `/dashboard/*`, update the middleware matcher. These edits cross several stories; everything else depends on them. No story label.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Edit `lib/auth/actions.ts` — remove the pre-`hashPassword` call to `userExists()` from `signUp`. Keep the `try/catch` around `createUser` that catches Prisma error code `P2002` and returns `{ error: { code: "USER_ALREADY_EXISTS", message: "An account with this email already exists. Please log in." } }`. Update the default redirect fallback in both `signUp` and `signInAction` from `"/"` to `"/dashboard"`.
- [X] T003 Edit `lib/auth/user.ts` — remove the `userExists()` export and its implementation entirely. Keep `getUserByEmail` and `createUser`.
- [X] T004 Edit `app/(auth)/signup/page.tsx` — remove the `userExists()` call and the entire "account already exists" `<Card>` branch. The page always renders `<SignupForm />` now. Drop the unused import of `userExists`.
- [X] T005 Edit `middleware.ts` — simplify per `contracts/auth.md` §5:
  - Update the `config.matcher` array to `["/dashboard", "/dashboard/:path*", "/login", "/signup"]`. Remove `/`, `/accounts`, `/transactions`, `/budgets`, `/settings` from the matcher.
  - Delete the entire branch that calls `userExists()` to decide between `/signup` and `/login` (the first-user redirect for `/` → `/signup` is gone; the gate that sent `/signup` → `/login` when a user exists is gone).
  - Authenticated users on `/login` or `/signup` redirect to `/dashboard` (was `/`).
  - Unauthenticated users on any matched `/dashboard/*` path redirect to `/login?from=<original-pathname>`.
  - Anything else → `NextResponse.next()`. The matcher no longer covers `/` — the marketing page is public and exempt from auth checks.
  - Drop the import of `userExists` (and any `prisma`/Prisma-imports that were only used for the count check; the middleware can stay on Node runtime via the existing `export const runtime = "nodejs"` because it still calls `auth()`).
- [X] T006 Move shell route pages from the flat layout under `(shell)` to the `/dashboard` prefix. Use `git mv` to preserve history. Five moves:
  - `app/(shell)/page.tsx` → `app/(shell)/dashboard/page.tsx`
  - `app/(shell)/accounts/page.tsx` → `app/(shell)/dashboard/accounts/page.tsx`
  - `app/(shell)/transactions/page.tsx` → `app/(shell)/dashboard/transactions/page.tsx`
  - `app/(shell)/budgets/page.tsx` → `app/(shell)/dashboard/budgets/page.tsx`
  - `app/(shell)/settings/page.tsx` → `app/(shell)/dashboard/settings/page.tsx`
  
  Also move `app/(shell)/loading.tsx`, `app/(shell)/error.tsx` if you want them to apply to all `/dashboard/*` routes — keep them at the group level (`app/(shell)/loading.tsx`, `app/(shell)/error.tsx`) since they still apply to every page rendered inside the shell layout. No edit needed inside the moved files; they don't reference their own path.
- [X] T007 Edit `components/shell/nav-items.ts` — update every `href` value:
  - `/` → `/dashboard`
  - `/accounts` → `/dashboard/accounts`
  - `/transactions` → `/dashboard/transactions`
  - `/budgets` → `/dashboard/budgets`
  - `/settings` → `/dashboard/settings`
  
  Labels and icons unchanged.
- [X] T008 Edit `components/shell/nav-link.tsx` — update the `isActive` rule's exact-match branch from `if (href === "/")` to `if (href === "/dashboard")` so the Dashboard nav item only highlights on exact `/dashboard`, not on every `/dashboard/*` sub-route. The prefix-match for the other items still works because `/dashboard/accounts` is itself a `startsWith` against `/dashboard/accounts/`.
- [X] T009 Edit `components/shell/user-menu.tsx` — update the Settings menu item's `<Link href>` from `/settings` to `/dashboard/settings`.
- [X] T010 Edit `app/not-found.tsx` — replace the `<AppShell>` wrapper with a chrome-free 404 surface (the shell layout now throws when there's no session, so rendering `<AppShell>` on a 404 hit by an anonymous visitor would crash). Render a centered "Page not found" message + a `<Link href="/">Back to home</Link>` button. Use shadcn primitives (`Card`, `Button`) for consistency with the marketing/auth aesthetic. No imports of `@/components/shell/*`.

**Checkpoint**: `pnpm typecheck` passes; `pnpm dev` boots; `curl /` 404s for now (the marketing page lands in Phase 3); `curl /dashboard` redirects to `/login?from=%2Fdashboard`; `curl /login` returns 200.

---

## Phase 3: User Story 8 — Public marketing home (Priority: P1) 🎯 MVP

**Goal**: A new public route group `app/(marketing)/` with a hero, a 3-feature grid, an adaptive CTA block (anonymous = Log in + Sign up; authenticated = Go to dashboard), and a simple footer renders at `/` for any visitor.

**Independent Test**: From an anonymous browser context, `curl /` returns HTML containing the headline and the two anonymous CTAs (`/login`, `/signup`). From an authenticated context (cookie set), `curl /` returns HTML containing the headline and a single authenticated CTA pointing at `/dashboard`. The shell sidebar and header are NOT present in either case.

### Implementation for User Story 8

- [X] T011 [P] [US8] Create `app/(marketing)/layout.tsx` as a server component default export. Renders a top-of-document marketing chrome: `<div className="flex min-h-screen flex-col"><MarketingHeader /><main className="flex-1">{children}</main><MarketingFooter /></div>`. No shell sidebar. Theme classes from `next-themes` are inherited from the root layout. Imports from `@/components/marketing/{marketing-header,marketing-footer}`.
- [X] T012 [P] [US8] Create `components/marketing/marketing-header.tsx` as a server component (or client if it needs the theme toggle — your call). Renders a slim header: left side is the "Abacus" wordmark + a small Lucide icon (e.g., `Wallet`); right side is `<ThemeToggle />` (same component used by the shell header) and two small text links — "Log in" → `/login` and "Sign up" → `/signup`. On md+ viewports show both CTAs; on mobile show just "Log in" as a text link (or a hamburger if you prefer — but keep this minimal: hamburger isn't required for marketing).
- [X] T013 [P] [US8] Create `components/marketing/marketing-footer.tsx` as a server component. Renders a one-row footer at the bottom of the marketing layout: `<footer className="border-t py-6 text-center text-sm text-muted-foreground">© {year} Abacus · Personal finance tracking</footer>`. Compute the year inline.
- [X] T014 [P] [US8] Create `components/marketing/hero.tsx` as a server component. Props: `{ isAuthenticated: boolean }`. Renders a centered column with: `<h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Personal finance, finally clear</h1>`, a one-line subheadline (`<p className="mt-4 text-lg text-muted-foreground">Track accounts, set budgets, and see where your money goes — without the spreadsheets.</p>`), then the adaptive CTA block: when `isAuthenticated`, render a single `<Button asChild size="lg"><Link href="/dashboard">Go to dashboard</Link></Button>`; otherwise render two side-by-side buttons — `<Button asChild size="lg"><Link href="/signup">Sign up</Link></Button>` and `<Button asChild variant="outline" size="lg"><Link href="/login">Log in</Link></Button>`. Outer container `py-24 md:py-32 px-6` with `max-w-3xl mx-auto text-center`.
- [X] T015 [P] [US8] Create `components/marketing/feature-grid.tsx` as a server component. Renders a 3-column grid (`grid grid-cols-1 md:grid-cols-3 gap-6`) of feature cards. Each card has: a Lucide icon at the top (`<Wallet>` for "Track accounts", `<PieChart>` for "Set budgets", `<ArrowLeftRight>` for "See where your money goes"), a card title, and a one-line description. Card chrome: `<Card className="p-6"><CardHeader>...</CardHeader><CardContent>...</CardContent></Card>` from shadcn. Outer container: `py-16 px-6 max-w-5xl mx-auto`.
- [X] T016 [US8] Create `app/(marketing)/page.tsx` as an async server component. Calls `const session = await auth()` once. Computes `const isAuthenticated = !!session?.user`. Renders `<><Hero isAuthenticated={isAuthenticated} /><FeatureGrid /></>` — no extra wrapper, the layout owns the chrome. Imports from `@/components/marketing/{hero,feature-grid}`. Exports `metadata` with `title: "Abacus — Personal finance, finally clear"` and a one-line description.
- [X] T017 [US8] Manual smoke: with `pnpm dev` running, visit `/` in a fresh browser context. Confirm: (a) the hero headline renders, (b) the two anonymous CTAs are visible and link to `/signup` and `/login`, (c) the 3-feature grid renders below, (d) no shell sidebar appears, (e) light/dark theme works. Then sign in (or set a session cookie via `/login`), visit `/` again, confirm the CTA block now shows a single "Go to dashboard" button linking to `/dashboard`.

**Checkpoint**: SC for US8 holds. The public marketing home is the first thing every visitor sees.

---

## Phase 4: User Story 1 — Signup (Priority: P1)

**Goal**: Verify the signup form (now always rendered, no gate) creates an account, auto-signs-in, and lands at `/dashboard`. Duplicate-email submissions surface `USER_ALREADY_EXISTS` via the Postgres unique constraint.

**Independent Test**: From a fresh context, navigate to `/signup`, fill in a new email + valid password + matching confirm, submit. Land at `/dashboard`. Submit signup again with the same email from a different context: see "An account with this email already exists. Please log in." inline; no second user created.

### Implementation for User Story 1

- [X] T018 [US1] No code changes — the deltas were applied in T002, T003, T004. Run a manual smoke: from a fresh context, visit `/signup`, sign up with a new email, confirm redirect to `/dashboard` and the shell renders. Try the same email a second time from another context, confirm the inline error "An account with this email already exists. Please log in." and no second row created (`pnpm exec prisma studio` or a `psql` query).

**Checkpoint**: US1 acceptance scenarios hold under the new route shape.

---

## Phase 5: User Story 2 — Login (Priority: P1)

**Goal**: Verify login with valid credentials redirects to `/dashboard` (or to `?from=<authenticated-route>` if present). Invalid credentials still surface the locked "Invalid email or password" message.

**Independent Test**: From a fresh context, `/login` with the user just created in Phase 4 → land on `/dashboard`. From a fresh context, navigate to `/login?from=%2Fdashboard%2Faccounts`, sign in, land on `/dashboard/accounts`. Submit wrong password → locked error, no session.

### Implementation for User Story 2

- [X] T019 [US2] No code changes — the redirect fallback was updated in T002. Run a manual smoke: sign out (or use an incognito window), visit `/login`, submit valid credentials → land on `/dashboard`. Then visit `/login?from=%2Fdashboard%2Faccounts`, submit valid credentials, confirm landing on `/dashboard/accounts` (not `/dashboard`). Submit wrong password and confirm the inline "Invalid email or password" message.

**Checkpoint**: US2 holds under the new route shape; the `safeFrom` helper still rejects external URLs.

---

## Phase 6: User Story 3 — Unauthenticated redirect (Priority: P1)

**Goal**: Requesting any of the five `/dashboard/*` routes without a session redirects to `/login?from=<path>`. The marketing root `/` does NOT redirect.

**Independent Test**: From a fresh context, `curl -I /dashboard` returns 307 with `Location: /login?from=%2Fdashboard`. Same for `/dashboard/accounts`, `/dashboard/transactions`, etc. `curl / ` returns 200 (public marketing). `curl /login` returns 200.

### Implementation for User Story 3

- [X] T020 [US3] No code changes — the matcher was updated in T005. Run a manual smoke: from a fresh anonymous context, hit each of `/dashboard`, `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`. Each must redirect to `/login?from=<path>`. Hit `/` and confirm it returns the marketing page (no redirect). Hit `/login?from=https://evil.example`, sign in, confirm landing on `/dashboard` (the external `from` is rejected by `safeFrom`).

**Checkpoint**: US3 holds. The middleware decision table from `contracts/auth.md` §5 is faithfully implemented.

---

## Phase 7: User Story 4 — Logout (Priority: P1)

**Goal**: Activating the user-menu's "Log out" item ends the session and lands on `/login`. Re-requesting any `/dashboard/*` route redirects back to login.

**Independent Test**: Signed in, on any `/dashboard/*` page. Open the user-menu, click "Log out". Land on `/login`. Hit `/dashboard` directly → redirect to `/login?from=%2Fdashboard`. Browser back from `/login` → still `/login`.

### Implementation for User Story 4

- [X] T021 [US4] No code changes — `signOutAction` is unchanged (still redirects to `/login`), and `nav-items.ts` + `user-menu.tsx` updates from T007 + T009 covered the new URL shape. Run a manual smoke: signed-in, open the user menu (button labeled with email), click "Log out", confirm landing on `/login`. Visit `/dashboard` directly, confirm redirect to `/login?from=%2Fdashboard`. Press browser back, confirm staying on `/login` (no shell flash).

**Checkpoint**: US4 holds.

---

## Phase 8: User Story 6 — Form validation (Priority: P2)

**Goal**: Invalid signup/login submissions surface per-field errors and never reach the DB or password verification.

**Independent Test**: Submit signup with each invalid combination from the spec's US6 acceptance scenarios; confirm field-scoped Zod errors render inline. Submit login with bad inputs; confirm same.

### Implementation for User Story 6

- [X] T022 [US6] No code changes — the validation is implemented in `lib/auth/schemas.ts` and surfaced in `signup-form.tsx` + `login-form.tsx` from the prior pass. Run a manual smoke: at `/signup`, submit each invalid case (empty email, malformed email, password < 12 chars, mismatched confirm). At `/login`, submit empty email / malformed email / empty password. Confirm per-field errors and that no `getUserByEmail` log fires (set a `console.log` inside `getUserByEmail` temporarily if needed; remove after).

**Checkpoint**: US6 holds.

---

## Phase 9: User Story 7 — Auth screens match brand (Priority: P2)

**Goal**: `/login` and `/signup` render the violet primary brand and respect light/dark themes.

**Independent Test**: Load `/login` in light mode; primary button is violet. Switch OS theme to dark, reload; card adapts; button is violet-500. No shell chrome present on either route.

### Implementation for User Story 7

- [X] T023 [US7] No code changes — auth screens AND the marketing page use shadcn primitives that consume `--primary` (already mapped to violet in feature 002's globals.css). Run a manual smoke across both surfaces:
  - (a) **Auth screens**: load `/login` and `/signup` in light + dark, confirm violet primary on the submit button, no FOUC, no shell chrome.
  - (b) **Marketing page** (FR-030): load `/` (anonymous) in light + dark — confirm violet primary on the "Sign up" button + violet outline on "Log in", muted `text-foreground` / `background` follow the theme, no FOUC, no shell chrome present. Then load `/` (authenticated) in both themes — confirm violet primary on the "Go to dashboard" button.

**Checkpoint**: US7 holds.

---

## Phase 10: Test rewrite (Constitution Principle IV)

**Purpose**: Rewrite `tests/e2e/auth.spec.ts` to assert the new route shape; drop the "second signup blocked" test; add public-marketing tests. Vitest tests (`tests/unit/auth-schemas.test.ts`, `tests/unit/auth-password.test.ts`, `tests/unit/env.test.ts`) remain unchanged. No story label.

- [X] T024 [P] Edit `tests/e2e/auth.spec.ts` — update the existing "first-user signup → dashboard → reload still authenticated" test: change the URL assertions from `"/"` to `"/dashboard"` and the heading assertion from `"Welcome to Abacus"` (the old shell dashboard) to whatever the new `/dashboard/page.tsx` renders (likely the same EmptyState).
- [X] T025 [P] Edit `tests/e2e/auth.spec.ts` — update the "shell navigates across all 5 routes" test: change every route path to its `/dashboard/*` form; navigate from `/dashboard` to `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`, and back to `/dashboard`. The sidebar's primary-nav assertions remain the same.
- [X] T026 [P] Edit `tests/e2e/auth.spec.ts` — update the "mobile drawer" test: same URL changes.
- [X] T027 [P] Edit `tests/e2e/auth.spec.ts` — update the "logout via user menu redirects to /login" test: signed-in starts at `/dashboard`; after logout, hitting `/dashboard` redirects to `/login?from=%2Fdashboard`.
- [X] T028 [P] Edit `tests/e2e/auth.spec.ts` — update the "unauthenticated shell route redirects" test: replace `/transactions` with `/dashboard/transactions`; assert `Location: /login?from=%2Fdashboard%2Ftransactions`.
- [X] T029 [P] Edit `tests/e2e/auth.spec.ts` — **DELETE** the "second signup is blocked" test. The behavior is gone.
- [X] T030 [P] Add a NEW test to `tests/e2e/auth.spec.ts` — "marketing home renders for anonymous visitor with two CTAs": fresh context, `goto("/")`, assert heading "Personal finance, finally clear" (or the headline T014 produces) is visible, assert two links named "Sign up" and "Log in" are visible (anchors), assert no `getByRole("navigation", { name: "Primary" })` is present (no shell sidebar).
- [X] T031 [P] Add a NEW test to `tests/e2e/auth.spec.ts` — "marketing home shows 'Go to dashboard' for authenticated visitor": signed-in context (re-use the serial-mode user from the signup test), `goto("/")`, assert headline is visible, assert a single link named "Go to dashboard" is visible, assert "Sign up" and "Log in" are NOT visible.
- [X] T032 Run `pnpm test` (Vitest) — must remain green (18 tests pass: env + auth-schemas + auth-password). Run `pnpm test:e2e` — must include the updated auth.spec.ts (10 tests after the changes: signup, navigate, mobile drawer, logout, unauth-redirect, invalid creds, unknown email, marketing anon, marketing authed; health.spec.ts unchanged at 1 test = 11 total). All green.

**Checkpoint**: Constitution Principle IV satisfied. SC-010 + SC-011 hold under the new route shape.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final gates and constitution preserves. No story label.

- [X] T033 [P] Run `pnpm typecheck` — must exit 0 with strict mode and zero `any`.
- [X] T034 [P] Run `pnpm lint` — must exit 0 with no warnings.
- [X] T035 [P] Run `pnpm format:check` — must exit 0; if formatting drift, run `pnpm format` and re-check.
- [X] T036 [P] Confirm `lib/money/` does NOT exist (FR-023, constitution Principle I preserved). Confirm `db/schema.prisma` contains only the `User` model.
- [X] T037 Confirm:
  - (a) **Single-user gate fully gone**: `grep -r "userExists" lib/ app/ middleware.ts` returns no matches (after T003 removed the export). `grep -r "single-user" lib/ app/ components/` returns no matches in implementation code (spec docs may still reference history).
  - (b) **Schema invariant (FR-027)**: `grep -c "^model " db/schema.prisma` returns exactly `1`. The only model is `User`. No `Account`, `Transaction`, `Budget`, `Category`, or auxiliary Auth.js adapter table snuck in.
  - (c) **No `Decimal` field anywhere** (FR-028 / constitution Principle I): `grep -r "Decimal" db/ lib/` returns no matches. `lib/money/` does not exist (already covered by T036).
- [X] T038 End-to-end quickstart validation from `specs/003-auth/quickstart.md`: with a fresh DB (truncate User), visit `/` (marketing), sign up, land on `/dashboard`, log out, sign back in. Time the path from `/signup` submit to `/dashboard` first paint — must be under 5 seconds on local dev.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 only — no real work, just state confirmation.
- **Foundational (Phase 2)**: T002–T010. Strict sequence on shared files but several independent files can be touched in any order: T002, T003, T004, T005 each touch a different file. T006 is a batch of `git mv` operations. T007, T008, T009 touch different files. T010 is independent.
- **US8 (Phase 3)**: depends on Foundational completing (specifically T005 so middleware doesn't redirect `/`). T011–T015 can run in parallel ([P], different files). T016 depends on T012–T015. T017 manual verification.
- **US1, US2, US3, US4, US6, US7 (Phases 4–9)**: depend on Foundational completing. They are all verification-only (no code changes in this revision). Independent of each other.
- **Tests (Phase 10)**: depends on Foundational + US8. T024–T031 in parallel (all edit the same file but different test blocks — easier to do them sequentially in one editor pass). T032 depends on all of T024–T031.
- **Polish (Phase 11)**: depends on every preceding phase.

### Parallel Opportunities

- **Foundational**: T002, T003, T004 in parallel (different files, no shared imports). T007, T008, T009 in parallel. T010 independent.
- **US8**: T011, T012, T013, T014, T015 all [P] (different files). T016 depends on T012–T015. T017 manual verification only.
- **Test rewrite**: T024–T031 are all edits to the same file (`auth.spec.ts`), so they cannot be parallel in practice — do them in one pass. T032 (running) depends on all of them.
- **Polish**: T033, T034, T035, T036 in parallel.

---

## Parallel Example: Phase 3 US8 Marketing home

```bash
# After T011 layout in place:
Task: "T012 Create components/marketing/marketing-header.tsx"
Task: "T013 Create components/marketing/marketing-footer.tsx"
Task: "T014 Create components/marketing/hero.tsx"
Task: "T015 Create components/marketing/feature-grid.tsx"

# Then sequential (depends on the 4 above):
Task: "T016 Create app/(marketing)/page.tsx"
Task: "T017 Manual smoke verify anonymous + authenticated CTAs"
```

---

## Implementation Strategy

### MVP First (US8 + US1 + US3 — the minimum coherent shape)

1. Phase 1: Setup (trivial).
2. Phase 2: Foundational (T002–T010) — CRITICAL, blocks every story.
3. Phase 3: US8 Marketing home (T011–T017) — the new public surface.
4. Phase 4: US1 Signup verify (T018) — new users can sign up from the marketing page.
5. Phase 6: US3 Redirect verify (T020) — old route bookmarks redirect appropriately.
6. **STOP and VALIDATE**: A new visitor lands at `/`, clicks "Sign up", creates an account, lands on `/dashboard`. This is the new MVP.

### Incremental Delivery

1. MVP cut (Phases 1–4 + 6) → public-marketing + multi-user signup + redirect.
2. Add Phase 5 (US2 Login verify) + Phase 7 (US4 Logout verify) → returning-user loop works.
3. Add Phases 8–9 (US6 + US7) → polish stories verified.
4. Phase 10 (Test rewrite) → constitution Principle IV satisfied with the new shape.
5. Phase 11 (Polish) → gates green, constitution preserved.

---

## Notes

- This is a REVISION pass against in-flight code. Most of the auth scaffold (Auth.js wiring, User model, Argon2, server actions, login/signup forms) is unchanged. The deltas are concentrated in the middleware, the signup action's gate removal, the new marketing route group, and the route reshuffle.
- The `User` migration from the prior pass is correct and does NOT need a new migration in this revision.
- The Postgres `User.email` `@unique` constraint is the SOLE defense against duplicate accounts now (race-safe). All four previous gate layers (middleware count check, page-level count check, action-level count check, DB unique) have been reduced to the one layer that matters.
- `userExists()` is being deleted as dead code. The race-safety angle no longer needs it (Postgres handles it).
- The marketing page is a SERVER component. It calls `auth()` once at the top and branches the CTA block on the result. No `SessionProvider`, no `useSession`.
- The active-route rule in `<NavLink>` exact-matches `/dashboard` (not `/`) after T008. All other nav items still use the prefix-match rule.
- Avoid: leaving `userExists` references in code (T037 catches this); rendering `<AppShell>` on the marketing page (it's a different route group); introducing a `SessionProvider` for the marketing page (the server-side `auth()` call is sufficient).
