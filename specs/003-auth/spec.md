# Feature Specification: Authentication

**Feature Branch**: `003-auth`

**Created**: 2026-05-16

**Last Revised**: 2026-05-16

**Status**: Revised Draft (multi-user + public marketing home)

**Input**: Wire up email + password authentication so Abacus knows which user is making each request, in line with the constitution's revised "multi-user from day one; no first-user gating" stance. Any visitor may create an account; duplicate emails are rejected only by the database's unique constraint with a clear, friendly error. Introduce the first real domain model (`User`), expose `/login` and `/signup` routes rendered outside the shell chrome, place a logout control inside the shell, and reshuffle the application surface: the application root `/` becomes a PUBLIC marketing/landing page (hero + CTAs, no shell chrome) and the authenticated app moves under `/dashboard/*` (dashboard, accounts, transactions, budgets, settings). Redirect unauthenticated visitors away from every authenticated route to the login screen, validate every authentication request at the boundary, and ship the constitution-mandated `signup → login → logout` end-to-end test. Establish the data-scoping convention every subsequent feature will inherit: every domain row is owned by a `userId`, and every query MUST filter by the session's user.

## Why

Feature 001 stood up the scaffold and installed Auth.js as a dependency only. Feature 002 delivered the application shell but explicitly left it public. The first draft of this feature was written against the constitution's earlier "single-user-first" stance and built a four-layer single-user gate around `/signup`, blocking any second account from ever being created. The constitution has since been amended to "multi-user from day one; no first-user gating" and has added a new convention that every domain row carries a `userId` and every query filters by the current session's user.

This revision aligns the auth feature with that stance. The single-user gate is removed entirely; any visitor may sign up; duplicate emails surface a friendly, actionable error rather than a "the app is already claimed" wall. At the same time, with multiple users a real possibility, the application root `/` no longer makes sense as a private dashboard — it becomes a public marketing page that introduces Abacus to visitors and offers "Log in" and "Sign up" as primary CTAs, and the authenticated application moves under `/dashboard/*` so the two surfaces (public site vs. signed-in app) cleanly separate. The constitution-mandated `signup → login → logout` E2E remains the load-bearing test for this feature. This feature also formalizes the data-scoping convention so the next feature (likely Accounts) inherits a clear rule on how to attribute every row to its owner.

Most of the code for this feature is already implemented (Auth.js wired with the Credentials provider, the `User` model, Argon2id hashing, server actions, middleware, `/login` and `/signup` outside the shell). The deltas captured here are: drop the single-user gate, drop US5, add a public marketing home, move the authenticated app under `/dashboard/*`, and pick up the new data-scoping FR. Locked decisions from the prior session are preserved.

## Clarifications

### Session 2026-05-16

- Q: Session strategy? → A: JWT-only. Auth.js's default v5 strategy with no PrismaAdapter. The first migration creates only the `User` table — no `Session`, `Account`, or `VerificationToken` adapter tables. The user identity is carried in the signed JWT payload (id at minimum, optionally email). The User table is managed directly via the Credentials provider's `authorize()` callback.
- Q: Password hashing algorithm + package? → A: Argon2id via the `@node-rs/argon2` npm package (prebuilt Rust/N-API binding — no native build chain required). Default OWASP-recommended parameters: memory cost 19 MiB, iterations 2, parallelism 1. The `passwordHash` field stores the full Argon2-encoded string (algorithm + parameters + salt + hash) so future parameter changes can coexist with old hashes. bcrypt is explicitly not used.
- Q: Post-signup session behavior? → A: Auto-sign-in. After a successful signup, the server action immediately establishes a session for the just-created user (e.g., by invoking Auth.js's `signIn("credentials", ...)` with the just-validated email + password) and the response redirects to the authenticated dashboard (or to the `from` path if one was carried through signup). The user does not retype their password.
- Q: Auth screens layout strategy? → A: Dedicated `app/(auth)/` route group with its own minimal `layout.tsx` (centered card, no shell chrome). Symmetrical with feature 002's `app/(shell)/` group. `/login` lives at `app/(auth)/login/page.tsx`; `/signup` lives at `app/(auth)/signup/page.tsx`.
- Q: Password minimum length? → A: 12 characters, enforced at the Zod boundary.
- Q: Email case-handling? → A: Normalize to lowercase at the Zod boundary on both signup and login.
- Q: Logout control placement? → A: User-menu dropdown in the shell header, showing the user's email as the trigger label.
- Q: Login error message granularity? → A: Single, non-distinguishing message ("invalid email or password"). Argon2 verify runs against a fixed `DUMMY_HASH` for unknown emails so timing is indistinguishable from a wrong-password attempt.

### Session 2026-05-16 (revision)

- Q: Stance on signup — single-user gate or open multi-user? → A: Open multi-user. The constitution was amended to "multi-user from day one; no first-user gating." Any visitor can create an account. The signup form is always reachable at `/signup` (subject to the "already-authenticated visitors are redirected" rule). The only enforcement against duplicate accounts is the `User.email` Postgres `@unique` constraint; a collision returns `{ error: { code: "USER_ALREADY_EXISTS", message: "An account with this email already exists. Please log in." } }` with a link to `/login`. The previous "four-layer single-user gate" is removed. US5 from the original spec ("Second signup attempt is blocked") is dropped.
- Q: Where does the application root `/` live now? → A: `/` becomes a PUBLIC marketing/landing page. It renders without authentication for any visitor — including authenticated users, who can click into `/dashboard` from there. The page has no shell chrome (no sidebar, no header from feature 002). It shows a hero / value-prop and primary CTAs: "Log in" → `/login`, "Sign up" → `/signup`.
- Q: Where does the authenticated app live now? → A: Under `/dashboard/*`. Specifically: `/dashboard` (the dashboard landing inside the shell, replacing the old `/`), `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`. The shell chrome (sidebar, header) renders for every `/dashboard/*` route. An unauthenticated request to any `/dashboard/*` route redirects to `/login?from=<original-path>`. An authenticated user requesting `/login` or `/signup` is redirected to `/dashboard`.
- Q: Data scoping convention for future features? → A: Locked. Every domain entity introduced after this feature MUST carry a `userId` foreign key to `User.id`, and every query MUST filter by the session's `userId`. There is no shared/global product data surface. This feature does not introduce any domain entities besides `User`, but documents the convention so feature 004 (Accounts) inherits it.
- Q: Authenticated user opening `/` — render marketing or redirect to `/dashboard`? → A: Render the marketing page for everyone. The marketing page at `/` is a public surface for both anonymous and authenticated visitors. No middleware redirect on `/` based on session. Matches Stripe, Vercel, Linear's pattern of "marketing site stays public regardless of session."
- Q: Should `/`'s CTAs adapt for signed-in visitors? → A: Yes — adaptive CTAs. Anonymous visitors see two primary CTAs ("Log in" → `/login`, "Sign up" → `/signup`). Authenticated visitors see a single primary CTA ("Go to dashboard" → `/dashboard`). The marketing page is a server component that calls `auth()` once and branches the CTA block on the result. The hero/value-prop copy is identical for both audiences.
- Q: Public home layout strategy? → A: Dedicated `app/(marketing)/` route group with its own `layout.tsx` (marketing-shaped chrome — no sidebar, no auth card; light/dark theme via root `next-themes`). Symmetrical with `app/(auth)/` and `app/(shell)/`. `/` lives at `app/(marketing)/page.tsx`. Future marketing pages (`/pricing`, `/about`, `/changelog`) land in the same group with shared chrome.
- Q: Marketing page content depth? → A: Hero + 3-feature bullet block + adaptive CTAs + simple footer. Hero: a single confident headline ("Personal finance, finally clear" or equivalent), a one-line subheadline, the adaptive CTA block. Below the hero: a 3-feature grid with one line per feature (e.g., "Track accounts — Connect every account in one place", "Set budgets — Cap spending by category", "See where your money goes — Transactions and categories at a glance"). Footer: copyright + a small "Made with Abacus" mark. No screenshots, no testimonials, no pricing teaser in this feature. Approximate scope: ~80 LOC of Tailwind + a couple of Lucide icons.
- Q: `User` model fields beyond the minimum? → A: Minimum only. The `User` model has exactly `id`, `email`, `passwordHash`, `createdAt`, `updatedAt`. No `name`, no `lastLoginAt`, no `emailVerified`, no `image`. Each future field lands with its first consumer in a separate migration. The current in-flight migration is correct and does not need revision.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time visitor signs up and lands authenticated (Priority: P1)

As a new visitor to Abacus, I can reach a signup screen, enter an email and password (with a confirm field), submit the form, and arrive at the authenticated dashboard with a session that survives a reload.

**Why this priority**: Signup is the entry point for any user without an account. Until it works, no authenticated surface in the app is usable for newcomers.

**Independent Test**: From a fresh browser context with no session cookie, the signup route renders a form. Submitting valid credentials creates an account, establishes a session, redirects to the authenticated dashboard, and a subsequent page reload keeps the user authenticated.

**Acceptance Scenarios**:

1. **Given** no session and an unused email, **When** the visitor opens the signup route and submits a valid email, password, and matching confirm-password, **Then** an account is created, a session is established, and the visitor lands on the authenticated dashboard.
2. **Given** the signup just succeeded, **When** the user reloads the dashboard, **Then** the dashboard renders without redirecting back to the login screen.
3. **Given** the user has just signed up, **When** they navigate to any other authenticated route, **Then** the route renders normally with no re-authentication prompt.
4. **Given** an account with the submitted email already exists, **When** the visitor submits the signup form, **Then** the form shows a clear "an account with this email already exists" message with a link to the login route, no new account is created, and no session is established for the existing account.

---

### User Story 2 - Returning user signs in (Priority: P1)

As a returning user, I can reach the login screen, enter my email and password, submit, and arrive at the authenticated dashboard. If I tried to reach a specific authenticated route before logging in, I land on that route after successful login instead of the default dashboard.

**Why this priority**: Login is the everyday entry point once an account exists. It must work before any session-bearing feature is usable.

**Independent Test**: With a user account in the database, the login route renders a form. Submitting correct credentials redirects to the authenticated dashboard (or to a previously-attempted authenticated route if that path was preserved during the redirect). A wrong password is rejected with an actionable error and does not establish a session.

**Acceptance Scenarios**:

1. **Given** a user exists in the system, **When** the visitor submits valid credentials at the login route, **Then** a session is established and the visitor lands on the authenticated dashboard.
2. **Given** an unauthenticated visitor was redirected to login from a specific authenticated route, **When** they submit valid credentials, **Then** they land on that originally-requested route rather than the default dashboard.
3. **Given** a user exists, **When** the visitor submits an unknown email or wrong password, **Then** the form rejects the attempt, shows a single non-distinguishing error message ("invalid email or password" or equivalent), and does not establish a session.
4. **Given** a visitor with no session, **When** they reload the login route, **Then** the form renders without redirecting them away.

---

### User Story 3 - Unauthenticated visitor is redirected to login (Priority: P1)

As an unauthenticated visitor requesting any authenticated route (the dashboard, accounts, transactions, budgets, settings), I am redirected to the login screen, and the route I tried to reach is preserved so I can land on it after a successful login.

**Why this priority**: Without route protection, the authenticated app remains public and the entire feature loses its meaning. This is the gate.

**Independent Test**: With no session cookie, requesting any of the five authenticated routes results in a redirect to the login screen, and the URL on the login screen carries a hint of the originally-requested path. Submitting valid credentials then lands the visitor on that originally-requested path.

**Acceptance Scenarios**:

1. **Given** no session exists, **When** an unauthenticated visitor requests the authenticated dashboard route, **Then** they are redirected to the login route with the originally-requested path preserved as a redirect hint.
2. **Given** no session exists, **When** an unauthenticated visitor requests any non-root authenticated route (accounts, transactions, budgets, settings), **Then** they are redirected to the login route with that path preserved as a redirect hint.
3. **Given** an unauthenticated visitor was redirected to login from an authenticated route, **When** they sign in successfully, **Then** they land on the originally-requested route.
4. **Given** no session exists, **When** an unauthenticated visitor requests the login or signup route directly, **Then** they reach that route without a redirect.

---

### User Story 4 - Authenticated user logs out from the shell (Priority: P1)

As an authenticated user, I can activate a logout control inside the shell chrome (a user-menu dropdown in the header), end my session, and land on the login screen. Subsequent requests to any authenticated route again require re-authentication.

**Why this priority**: A session that cannot be ended is a security and UX defect. Logout is the third leg of the constitution-mandated `signup → login → logout` test.

**Independent Test**: From any authenticated route, the logout control is reachable through the user-menu dropdown in the header. Activating it ends the session, redirects the user to the login screen, and a subsequent request to any authenticated route redirects back to login rather than rendering the shell.

**Acceptance Scenarios**:

1. **Given** the user is authenticated and on any authenticated route, **When** they open the user-menu dropdown in the shell header, **Then** a logout control is visible and reachable.
2. **Given** the user activates the logout control, **When** the action completes, **Then** the session ends and the user lands on the login route.
3. **Given** the user has just logged out, **When** they request any authenticated route, **Then** they are redirected back to the login route.
4. **Given** the user has just logged out, **When** they press the browser back button into a previously-rendered authenticated route, **Then** the route does not render its authenticated content — the visitor is redirected to login.

---

### User Story 6 - Form validation surfaces actionable errors (Priority: P2)

As a user filling out the signup or login form, when I submit invalid input, the form shows me actionable, field-specific error messages so I can correct my input without guessing.

**Why this priority**: Without per-field errors, the auth screens become opaque and frustrating during the very first interaction with the app. P2 because US1 / US2 functionally pass without it, but UX quality matters.

**Independent Test**: Submitting the signup form with each of (missing email, malformed email, empty password, password shorter than 12 characters, mismatched confirm-password) produces a clear, field-scoped error message and does not create a user. Submitting the login form with (missing email, malformed email, empty password) produces equivalent feedback and does not establish a session.

**Acceptance Scenarios**:

1. **Given** the signup form is shown, **When** the user submits with an empty or malformed email, **Then** the form shows an actionable email-field error and does not create a user.
2. **Given** the signup form is shown, **When** the user submits with a password shorter than 12 characters, **Then** the form shows an actionable password-field error explaining the minimum.
3. **Given** the signup form is shown, **When** the user submits with a confirm-password that does not match the password, **Then** the form shows an actionable confirm-field error.
4. **Given** the login form is shown, **When** the user submits with an empty or malformed email or empty password, **Then** the form shows an actionable field-scoped error and does not establish a session.
5. **Given** any auth form is shown, **When** the server rejects the submission, **Then** the form remains usable (entered values preserved where appropriate, focus on the offending field where possible).

---

### User Story 7 - Auth screens match the established brand and theme (Priority: P2)

As a user on the login or signup screen, I see the same violet primary brand and the same light/dark theme behavior that the rest of the app uses. The auth screens do not render the shell chrome (no sidebar, no header), but they share the visual language.

**Why this priority**: Visual consistency builds trust. Auth screens that look like a generic boilerplate template after a polished shell feel broken. P2 because functional auth works without polish, but the gap is jarring.

**Independent Test**: Loading the login route in light mode shows the violet primary brand on primary buttons/links. Toggling the theme (via OS preference change) re-renders the auth screen with dark-mode colors. The shell's sidebar and header are not present on either auth route.

**Acceptance Scenarios**:

1. **Given** the user reaches the login or signup route, **When** the page renders, **Then** the shell's sidebar and header are not visible (the auth screen is its own layout).
2. **Given** any auth route is shown, **When** the user inspects primary controls (submit button, primary links), **Then** the violet brand color from feature 002 is in use.
3. **Given** any auth route is shown, **When** the OS theme switches between light and dark, **Then** the auth screen re-renders in the chosen theme without a flash of the wrong theme.

---

### User Story 8 - Visitor lands on the public marketing home (Priority: P1)

As any visitor — signed in or not — I can open the application root `/` and see a public marketing page that explains what Abacus is and offers obvious ways to sign in or sign up. The page renders for everyone, without authentication, without the shell chrome.

**Why this priority**: With multi-user signup open to any visitor, the application needs a public surface to introduce itself. Without a public root, every newcomer would be dropped directly onto a login form they have no context for. The public root is also the canonical inbound link for anyone sharing Abacus.

**Independent Test**: From a fresh browser context with no session, requesting `/` renders a page containing a hero / value-prop and two primary CTAs ("Log in" → `/login`, "Sign up" → `/signup`). The shell sidebar and header from feature 002 are NOT present. From a separate browser context with an active session, requesting `/` also renders the same page (the marketing page is public for everyone); the visitor can click into `/dashboard` from there.

**Acceptance Scenarios**:

1. **Given** no session exists, **When** the visitor opens the application root `/`, **Then** the page renders a hero / value-prop and two primary CTAs ("Log in" → `/login`, "Sign up" → `/signup`) without redirecting to any other route.
2. **Given** an authenticated session exists, **When** the user opens the application root `/`, **Then** the same public marketing page renders. The user is not forcibly redirected to `/dashboard`; they may click into the authenticated app via the marketing page's navigation.
3. **Given** the marketing page is rendered, **When** the visitor inspects the page chrome, **Then** the shell sidebar and header from feature 002 are NOT present (the marketing page has its own minimal layout).
4. **Given** the marketing page is rendered, **When** the visitor activates the "Log in" CTA, **Then** they reach `/login`. **When** they activate the "Sign up" CTA, **Then** they reach `/signup`.

---

### Edge Cases

- A visitor submits the signup form, the user is created, but the auto-sign-in step fails — the system MUST redirect to `/login` with a clear "your account was created, please sign in" message rather than leaving the visitor stranded.
- Two visitors submit signup at nearly the same time with the same email — the Postgres `User.email` `@unique` constraint guarantees only one row is created. The losing insert is caught and surfaced to the second visitor as the same `USER_ALREADY_EXISTS` error envelope they would see if they had simply collided with an existing account. No partial or corrupt state is left behind.
- A visitor submits the signup form with an email that already belongs to another account — the system MUST NOT distinguish "this email belongs to you" from "this email belongs to someone else"; it MUST surface the single `USER_ALREADY_EXISTS` message and a link to `/login`. No information about the existing account (other than that one exists) leaks.
- A visitor reaches the login route with a stale or tampered redirect hint pointing at an external URL or a path outside the app — the redirect after successful login must not honor an off-site or otherwise unsafe destination; it must fall back to the authenticated dashboard.
- A user's session expires while they are sitting on an authenticated route — the next interaction that requires the session must redirect them to login with the current path preserved, not produce an opaque error.
- A user submits the login or signup form, the network drops mid-request, and the user retries — the system must not double-create a user, double-establish a session, or leave the form in an unresponsive state.
- An attacker enumerates accounts by submitting many emails to the login form and watching for different error messages — the login error message is a single non-distinguishing string and the login response runs an Argon2 verify against a fixed `DUMMY_HASH` for unknown emails so request timing does not leak account existence either.
- An authenticated user opens `/login` or `/signup` directly — they are redirected to `/dashboard`. An authenticated user opening the marketing root `/` is NOT redirected; the public page renders for everyone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST introduce a `User` domain model as the first real entity in the Prisma schema. At minimum the model MUST include a unique identifier, a unique email, a stored password hash (never a plaintext password), a creation timestamp, and an updated-at timestamp.
- **FR-002**: The system MUST ship a generated Prisma migration that creates the `User` table. This is the first real migration in the project; the `db push` shortcut is forbidden by the constitution and MUST NOT be used.
- **FR-003**: Passwords MUST be hashed using Argon2id via the `@node-rs/argon2` npm package. OWASP-recommended default parameters apply: memory cost 19 MiB, iterations 2, parallelism 1. The `User.passwordHash` field MUST store the full Argon2-encoded string so future parameter migrations remain forward-compatible with previously-stored hashes. Plaintext passwords MUST NOT be stored, logged, or returned in any response.
- **FR-004**: The system MUST configure Auth.js (NextAuth v5) with the Credentials provider (email + password). OAuth providers MUST NOT be added (constitution: "OAuth deferred").
- **FR-005**: The environment validation schema introduced in feature 001 MUST be tightened so that `AUTH_SECRET` and `AUTH_URL` are required (not optional). Application startup MUST fail with a clear, human-readable error if either is missing or malformed, consistent with feature 001's environment-validation behavior.
- **FR-006**: The system MUST expose a `/signup` route that renders a signup form (email, password, confirm-password) to any visitor. The route MUST render under a minimal layout (centered card, no shell chrome — no sidebar, no header). The signup form is ALWAYS reachable to unauthenticated visitors; there is NO first-user gate or single-user gate.
- **FR-007**: The system MUST expose a `/login` route that renders a login form (email, password) for any unauthenticated visitor. The route MUST render under the same minimal layout as `/signup`.
- **FR-008**: All five authenticated routes (`/dashboard`, `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`) MUST require an authenticated session. An unauthenticated request to any of these routes MUST result in a redirect to the login route, with the originally-requested path preserved as a redirect hint (e.g., `?from=<path>`).
- **FR-009**: After a successful login, the system MUST redirect the user to the path captured in the redirect hint if one is present and points at an in-app authenticated route, or to `/dashboard` otherwise. The system MUST NOT honor a redirect hint that points to an off-site URL or otherwise unsafe destination — such hints MUST fall back to `/dashboard`.
- **FR-010**: The application shell MUST expose a logout control reachable from every authenticated route via a user-menu dropdown in the shell header. The trigger MUST display the current user's email (truncated on small viewports). Activating the logout item MUST end the active session and redirect the user to the login route.
- **FR-011**: After logout, any subsequent request to an authenticated route MUST again trigger the unauthenticated-redirect behavior described in FR-008. Browser back-navigation MUST NOT bypass this — re-entering an authenticated route after logout MUST redirect to login.
- **FR-012**: Duplicate signup attempts MUST be rejected by the `User.email` Postgres `@unique` constraint alone. When a signup submission collides with an existing account, the system MUST return `{ error: { code: "USER_ALREADY_EXISTS", message: "An account with this email already exists. Please log in." } }` and the UI MUST surface the message with a link to `/login`. The system MUST NOT distinguish "this email is yours" from "this email is someone else's" — only one canonical message is shown. There is no first-user gate, no single-user gate, no `user.count()` check before signup, and no middleware-level signup interception based on user count.
- **FR-013**: All authentication request payloads (signup submission, login submission) MUST be validated with Zod at the boundary before any business logic, persistence, or password verification runs. Validation MUST cover: email presence and format (lowercased), password presence, password minimum length (12 characters, signup only), and confirm-password match (signup only). Invalid payloads MUST be rejected with actionable, field-scoped error feedback and MUST NOT proceed to the database or to password verification.
- **FR-014**: The login form's error message for unknown email or wrong password MUST be a single, non-distinguishing message ("invalid email or password" or equivalent) to prevent account enumeration. The login flow MUST also run an Argon2 verify against a fixed `DUMMY_HASH` constant in the unknown-email branch so request timing does not leak account existence.
- **FR-015**: The authenticated session MUST expose the user's identifier (and optionally email) to downstream feature code as the canonical "who is this request for" surface. Downstream features MUST NOT have to re-query the user table to learn the current user's identity.
- **FR-016**: The session strategy MUST be JWT (stateless). Auth.js's `PrismaAdapter` MUST NOT be wired up; the User table is managed directly through the Credentials provider's `authorize()` callback. No `Session`, `Account`, or `VerificationToken` adapter tables are added. FR-015's "session exposes user identifier" requirement is satisfied by the JWT payload and the Auth.js `session` callback.
- **FR-017**: Emails MUST be normalized to lowercase at the Zod boundary on both signup and login. The lowercased value is what is persisted (signup) and what is used to look up an existing account (login), so case differences in user input do not cause spurious "no such account" responses.
- **FR-018**: API endpoints introduced by this feature (server actions or any custom route handlers) MUST conform to the constitution's response envelope: success returns `{ data }`, failure returns `{ error: { code, message } }`. Auth.js's own internal callback URLs are managed by the library and are exempt from this shape.
- **FR-019**: A Playwright end-to-end test MUST cover the full constitution-mandated path: signup (from a clean database) → reaches the authenticated dashboard → logout → arrives at login → login with the same credentials → reaches the dashboard again. This test is non-negotiable per constitution Principle IV.
- **FR-020**: A Playwright end-to-end test (or test step) MUST cover the unauthenticated-redirect smoke: requesting an authenticated route with no session redirects to the login route and preserves the originally-requested path.
- **FR-021**: The application root `/` MUST render a PUBLIC marketing/landing page. The page renders for any visitor (authenticated or not) without requiring a session. It MUST include a hero / value-prop section and an adaptive CTA block (per the locked clarification, "Session 2026-05-16 (revision)"):
  - **Anonymous visitors** see TWO primary CTAs: "Log in" → `/login` and "Sign up" → `/signup`.
  - **Authenticated visitors** see ONE primary CTA: "Go to dashboard" → `/dashboard`.

  The hero / value-prop copy is identical for both audiences; only the CTA block changes. The page MUST NOT render the shell chrome (no sidebar, no header from feature 002). An authenticated user requesting `/` MUST see the same page (no forced redirect to `/dashboard`); they can navigate into the authenticated app via the adaptive CTA or by visiting a `/dashboard/*` route directly.
- **FR-022**: An authenticated user requesting `/login` or `/signup` MUST be redirected to `/dashboard`. The application root `/` is exempt from this redirect — authenticated users see the public marketing page when they request `/`.
- **FR-023**: The authenticated application MUST live under `/dashboard/*`. Specifically: `/dashboard` (the dashboard landing inside the shell), `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`. The shell chrome from feature 002 (sidebar, header with user-menu) MUST render for every `/dashboard/*` route. The old top-level routes from feature 002 (`/accounts`, `/transactions`, `/budgets`, `/settings`) MUST be replaced by their `/dashboard/*` equivalents and MUST NOT continue to render at their old paths.
- **FR-024**: After successful signup, the auto-sign-in step MUST redirect the user to `/dashboard` (or to the `from` path if one was carried through signup and is a safe in-app authenticated route). The visitor MUST NOT be left on `/` or on the signup form after a successful signup.
- **FR-025**: Every domain entity introduced in subsequent features (starting with feature 004) MUST carry a `userId` foreign key to `User.id`, and every query against such entities MUST filter by the current session's `userId`. There is no shared/global product data surface; there is no admin role, no team or organization model, and no user-to-user data sharing. This feature does not itself introduce any domain entity besides `User`, but the convention is recorded here as the binding rule for every feature that follows.
- **FR-026**: This feature MUST NOT introduce password reset, "forgot password," email verification, two-factor authentication, OAuth providers, "remember me" toggles, session-length controls, account-deletion UI, password-change UI, admin or impersonation tooling, team/organization models, user-to-user data sharing, or any transactional email integration. Each is explicitly deferred to a future feature.
- **FR-027**: This feature MUST NOT introduce any domain model other than `User`. No `Account`, `Transaction`, `Budget`, `Category`, or other domain entity is added. No `lib/money/` helper is created.
- **FR-028**: This feature MUST NOT display any monetary value, accept any monetary input, or otherwise exercise constitution Principle I. Auth itself is money-free.
- **FR-029**: All new code MUST satisfy TypeScript strict mode with no use of `any`, consistent with constitution Principle II.
- **FR-030**: The auth screens and the public marketing page MUST adopt the same visual language as feature 002's shell (violet primary brand, slate neutral, light/dark theme support). They MUST NOT render the shell chrome itself (no sidebar, no header).

### Key Entities

- **User** — a person with an Abacus account. Identified by a unique email address (treated as the login credential, normalized to lowercase). Authenticates via a password whose Argon2id hash is the only password-shaped value the system persists. Carries creation and last-update timestamps. Exposed to downstream features through the active session as a stable identifier (`userId`) that every domain row from feature 004 onward will reference. Multiple users may exist simultaneously; each user's data is fully isolated from every other user's data per FR-025 — there is no shared, global, or admin-visible product data.
- **Auxiliary auth-adapter entities** — none. The chosen session strategy is JWT-only without the PrismaAdapter, so no `Session`, `Account`, or `VerificationToken` tables are added. The schema contains exactly one new model (`User`) after this feature lands.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh browser context, a visitor can reach the signup route, submit a valid email and password, and arrive at the authenticated dashboard in under 60 seconds of interaction time.
- **SC-002**: After a user account exists, signing out and signing back in via the login route reaches the authenticated dashboard in 100% of attempts using correct credentials.
- **SC-003**: Requesting any of the five authenticated routes (`/dashboard`, `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`) without a session redirects to the login route and preserves the originally-requested path in 100% of attempts.
- **SC-004**: After successful login from a redirected route, the user lands on the originally-requested route in 100% of attempts (for in-app authenticated paths; off-site or unsafe redirect hints fall back to `/dashboard`).
- **SC-005**: After logout, requesting any authenticated route redirects back to login in 100% of attempts, including via browser back-navigation.
- **SC-006**: Submitting the signup form with an email that already exists in the system returns the `USER_ALREADY_EXISTS` error envelope and surfaces a clear, actionable UI message with a link to `/login` in 100% of attempts. No second account is created.
- **SC-007**: The login form's response to an unknown email and to a wrong password is indistinguishable to the end user (same error message, same response timing within a small tolerance) in 100% of attempts.
- **SC-008**: Submitting an invalid signup or login payload (missing fields, malformed email, password under 12 characters, mismatched confirm) does not reach the database or the password-verification path in 100% of attempts. Zod validation rejects it at the boundary.
- **SC-009**: Application startup fails fast with a clear, human-readable error naming the missing key when `AUTH_SECRET` or `AUTH_URL` is absent, equivalent in shape to feature 001's `DATABASE_URL` failure mode.
- **SC-010**: The Playwright `signup → login → logout → login` end-to-end test passes on a clean database, exits zero, and is referenced as the constitution Principle IV deliverable for this feature.
- **SC-011**: The Playwright unauthenticated-redirect smoke test asserts that requesting at least one authenticated route without a session lands on the login route with the originally-requested path preserved, and exits zero.
- **SC-012**: No plaintext password appears in the database, in any application log, or in any HTTP response across all acceptance scenarios in this feature.
- **SC-013**: A type-check of all new code passes with strict mode enabled and zero uses of `any`.
- **SC-014**: A visitor with no session can reach the application root `/` and see the public marketing page (hero + "Log in" + "Sign up" CTAs) in 100% of attempts. The shell sidebar and header are NOT present on this page.
- **SC-015**: After a successful signup, the visitor lands on `/dashboard` (or on the `from` path if one was carried through, when that path is a safe in-app authenticated route) in 100% of attempts. The visitor is not left on the marketing root `/` or on the signup form.
- **SC-016**: Two concurrent signup submissions for the same email result in exactly one user row in the `User` table; the losing submission surfaces the same `USER_ALREADY_EXISTS` error envelope that an after-the-fact collision would surface.

## Assumptions

- Feature 001's scaffold is in place: Next.js App Router, React 19, TypeScript strict, Prisma wired to PostgreSQL, Auth.js installed as a dependency, `lib/env.ts` validating environment variables, Vitest and Playwright harnesses.
- Feature 002's shell components (sidebar, header, mobile drawer, theme toggle, route placeholders) are in place and continue to be the shell rendered around the authenticated routes — after this feature reshuffles them under `/dashboard/*`.
- The `.env.example` file already documents `AUTH_SECRET` and `AUTH_URL`; the developer is expected to populate them in `.env.local` before running auth-protected paths.
- The Prisma schema in `db/schema.prisma` is currently empty of domain models; this feature owns the first real migration in the project. The `User` table created here is the foreign-key target every subsequent feature's `userId` will reference per FR-025.
- The constitution's "multi-user from day one; no first-user gating" stance means the schema and session shape are multi-user-capable from the very first migration. The `User.email` `@unique` constraint is the sole enforcement against duplicate accounts; it is enforced by Postgres, not by application-level pre-checks.
- The "data scoping" convention (FR-025) is forward-looking: this feature does not introduce any entity besides `User` that needs scoping, so there is no `userId` scoping work to do here beyond establishing the rule. The first feature that adds a domain entity (likely feature 004 — Accounts) is the first that must implement it.
- No production deployment target is in scope; auth behavior is verified on the local dev server only.
- Email is used purely as an identifier in this feature — it is not verified, no transactional email is sent at any point in this feature, and the user can change it only by direct database modification until a future feature provides a UI.
- "Outside the shell" for the auth routes and the marketing root means the sidebar and header from feature 002 do not render; the visual language (brand color, neutrals, theme support) still applies.

## Out of Scope

- **Password reset / forgot password** — future feature.
- **Email verification** — email is an identifier, not a verified contact.
- **OAuth providers (Google, GitHub, etc.)** — explicitly deferred by the constitution.
- **Team / organization model** — multi-user means many independent single-tenant users, NOT shared workspaces. No "workspace," "tenant," "organization," or "invitation" entity is added.
- **User-to-user data sharing** — every user's data is fully isolated per FR-025. No shared accounts, no shared budgets, no "share this transaction" surface.
- **Admin role / "log in as user" / impersonation tooling** — no admin, no super-user, no support-console surface.
- **Password-strength enforcement beyond the 12-character minimum** — no haveibeenpwned check, no zxcvbn scoring, no symbol/number/case requirements in this feature.
- **Two-factor authentication / TOTP / WebAuthn / passkeys** — deferred.
- **"Remember me" toggles or session-length controls** — Auth.js defaults govern; no UI for it.
- **Password-change UI, account-deletion UI, profile-edit UI** — deferred to a future settings feature.
- **Rate limiting beyond what Auth.js provides out of the box** — proper request rate limiting is a future feature.
- **Transactional email** — no email service, no SMTP integration, no email-sending dependency added.
- **Domain models other than `User`** — no `Account`, `Transaction`, `Budget`, `Category`, `RecurringTransaction`. They land in 004+.
- **`lib/money/`** — auth handles no money. It lands with the first money-displaying feature.
- **Charts, dashboards data, real seed data** — unrelated to authentication.
- **Marketing-page CMS, blog, pricing page, "about" page** — the public root `/` is a single static page with hero + CTAs only. Future marketing surfaces (`/pricing`, `/about`, etc.) land in their own feature(s).
- **Marketing-page SEO surface (sitemap, robots, structured data, OG tags beyond the default)** — out of scope for this feature; can be tightened in a follow-up if the marketing surface grows.

## Deferred Clarifications

The following questions were raised during specification but deferred. They are planning-level details that can be decided during `/speckit-plan` without further spec edits.

1. **Authenticated user opening `/` — render the marketing page or redirect to `/dashboard`?** This spec locks "render the marketing page for everyone" (FR-021) as the recommended default, mirroring the way many SaaS products keep their marketing root public even for signed-in users (Stripe-style, with the authenticated app on a distinct path). The architect may revisit this if there is a strong product reason to force authenticated users into `/dashboard` on every `/` visit.
2. **Public marketing page layout strategy** — three plausible shapes: (a) a dedicated `(marketing)` route group at `app/(marketing)/page.tsx` with its own `layout.tsx`, symmetrical with `(auth)` and `(shell)`; (b) share the existing `(auth)` layout (centered card style) — cheap but visually constraining for a hero; (c) render the marketing page at `app/page.tsx` directly (no route group), pulling layout primitives inline. Recommended: option (a) for symmetry and future extensibility, but the architect picks the exact shape.
3. **Marketing page content depth** — single hero + two CTAs (recommended for this feature), or also a feature-bullet section, a screenshot/illustration, a footer with legal links, etc. The spec locks "hero + two CTAs minimum" (FR-021). Anything beyond that is plan-level.
4. **Header CTA on the marketing page for signed-in users** — when an authenticated user visits the public marketing page, the page's primary CTAs are still "Log in" / "Sign up", which is awkward. Should the marketing page surface a "Go to dashboard" CTA when a session is detected, or keep one set of CTAs for everyone? Plan-level UX call.
5. **`User` model fields beyond the minimum** — should the schema also include `name`, `lastLoginAt`, or other ergonomic fields now? Trade-off between avoiding a follow-up migration and adding maintenance surface for unused fields. Plan-level data-model.
