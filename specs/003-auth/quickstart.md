# Feature 003 — Quickstart (Revised, delta over features 001 + 002)

Local-run delta for a developer who has features 001 and 002 already working. If you do not, run the feature 001 quickstart first, then the feature 002 quickstart, then return here.

**Revision note.** The original quickstart was written against the single-user stance and the old route shape (`/` was the dashboard; first visit redirected to `/signup`; second signup was blocked). The constitution v0.2.0 amendment changed both: `/` is now a public marketing page; any visitor can sign up; the authenticated app lives under `/dashboard/*`. This quickstart reflects the revised flows.

## 1. Pull dependencies

No new dependencies in the revision. The original `@node-rs/argon2` is already in `package.json`.

```bash
pnpm install
```

`@node-rs/argon2` ships a prebuilt N-API binding — no Python, no `node-gyp`, no C compiler required.

## 2. Set required environment variables (unchanged)

`AUTH_SECRET` and `AUTH_URL` are required. Edit your `.env.local`:

```bash
# Generate a strong secret:
openssl rand -base64 32
# Paste the output as the value of AUTH_SECRET (must be ≥32 chars).

AUTH_SECRET="<paste-the-generated-secret-here>"
AUTH_URL="http://localhost:3000"
```

`pnpm dev` will fail fast with a human-readable Zod error if either key is missing or `AUTH_SECRET` is shorter than 32 characters.

## 3. Migration status

The single `add_user` migration is already generated and applied in branch `003-auth`. No new migration is needed for the revision.

If you are coming to this branch fresh (you did not run the original feature 003 quickstart), apply the existing migration:

```bash
pnpm db:migrate
```

The `User` table is the only domain table in the schema after this feature.

## 4. Start the dev server

```bash
pnpm dev
```

## 5. Verify the flows (revised)

### Public marketing home

1. Open a fresh private/incognito window (so no session cookie is present).
2. Visit `http://localhost:3000/`.
3. **Expected**: a public marketing page renders with the violet brand mark and the theme toggle in the top header. The hero shows a headline + subheadline. Below the hero, three feature cards. Two CTAs are visible: **"Log in"** (links to `/login`) and **"Sign up"** (links to `/signup`).
4. **No redirect happens.** The marketing page is public; the visitor is not pushed toward `/login` or `/signup` automatically.

### Signup

1. From the marketing page, click **"Sign up"**. You land at `/signup`.
2. Enter an email (e.g., `you@example.com`), a password ≥12 characters (e.g., `correcthorsebattery`), and the same value in the confirm field.
3. Submit. You should land on `/dashboard` (the authenticated dashboard), with the shell chrome (sidebar + header with user-menu) rendered.
4. The header's right side shows the user-menu trigger labeled with your email.

### Logout

1. Click the user-menu trigger in the header. The dropdown shows two items: **"Settings"** and **"Log out"**.
2. Click **"Log out"**. You should be redirected to `/login`.

### Returning login

1. From `/login`, enter the same credentials.
2. Submit. You should land back on `/dashboard`.

### Marketing page for an authenticated visitor

1. While signed in, visit `http://localhost:3000/`.
2. **Expected**: the same marketing page renders. The CTA block adapts — instead of "Log in" + "Sign up", you see a single **"Go to dashboard"** button that links to `/dashboard`.
3. The hero copy and the feature grid are identical to the anonymous view.

### Unauthenticated-redirect smoke

1. Open a new private/incognito window (so no session cookie is present).
2. Visit `http://localhost:3000/dashboard/transactions`. You should be redirected to `/login?from=%2Fdashboard%2Ftransactions`.
3. Submit valid credentials. You should land on `/dashboard/transactions` (the redirect-hint is honored).

### Multi-user signup

1. Sign in as the first user (you@example.com) via the steps above, then log out.
2. Open another private window. Visit `/signup`.
3. Enter a **different** email (e.g., `friend@example.com`) and a valid password.
4. Submit. You land on `/dashboard` as the second user. Both accounts coexist; each user's session is independent.

### Duplicate-email rejection

1. From a fresh private window, visit `/signup`.
2. Enter the email of an existing user (e.g., `you@example.com`) and any valid password.
3. Submit. You should see the locked error message: **"An account with this email already exists. Please log in."** with a link to `/login`. No second account is created.

### Login error shape

1. From `/login`, submit a known-bad email/password combination.
2. The form should show **"Invalid email or password"** — the same message regardless of whether the email exists. This is intentional (FR-014).

### Authenticated visitor opens `/login` or `/signup`

1. While signed in, visit `/login` directly. You should be redirected to `/dashboard`.
2. Same for `/signup` — redirected to `/dashboard`.
3. Important: `/` is the **only** route that does not redirect authenticated visitors away. The marketing surface renders for everyone.

## 6. Run the test suites

### Unit (Vitest)

```bash
pnpm test
```

Unchanged from the original feature 003 set:

- `tests/unit/auth-schemas.test.ts` — Zod schema invariants.
- `tests/unit/auth-password.test.ts` — Argon2 hash/verify round-trip.

### E2E (Playwright)

```bash
pnpm test:e2e
```

`tests/e2e/auth.spec.ts` has been **rewritten** to the new route shape. Highlights:

- Signup test asserts the post-signup URL is `/dashboard`.
- Shell-nav test exercises `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`.
- Unauthenticated-redirect test asserts `/dashboard/transactions` → `/login?from=%2Fdashboard%2Ftransactions`.
- Two new tests cover the marketing home: one for the anonymous CTA block, one for the authenticated CTA block.
- The "second signup is blocked" test from the original spec is removed (the gate no longer exists).

The E2E truncates the `User` table in a `beforeAll` hook so it can run against a clean state. **Be aware**: if you have a developer account in your local DB, running the E2E will delete it. To preserve a local account, run the E2E against a separate DB (override `DATABASE_URL` for the Playwright run).

## 7. Resetting the database

If you want to start over from a clean state at any point:

```bash
pnpm db:reset
```

This re-applies the `add_user` migration and leaves the `User` table empty. Unlike the original quickstart, this does **not** trigger any first-user onboarding — visiting `/` still shows the marketing page. To create the first user, visit `/signup`.

## What changed since the original feature 003 quickstart

| Aspect | Original (single-user) | Revised (multi-user) |
|---|---|---|
| `/` (root) | Authenticated dashboard; first visit → `/signup` | Public marketing page; no redirect |
| Dashboard URL | `/` | `/dashboard` |
| Accounts URL | `/accounts` | `/dashboard/accounts` |
| Transactions URL | `/transactions` | `/dashboard/transactions` |
| Budgets URL | `/budgets` | `/dashboard/budgets` |
| Settings URL | `/settings` | `/dashboard/settings` |
| First-user signup | Forced via `/` → `/signup` redirect when DB is empty | Visitor clicks the "Sign up" CTA on `/` |
| Second-user signup | Blocked (four-layer gate; second `/signup` → `/login`) | Allowed; duplicates fail only on Postgres `@unique` (per-email) |
| Authenticated `/login` or `/signup` | Redirect to `/` | Redirect to `/dashboard` |
| Marketing surface | (none) | `/` — hero + 3-feature grid + adaptive CTAs + footer |
| Migration | First-time `pnpm db:migrate -- --name add_user` | Already applied; no new migration |
| `tests/e2e/auth.spec.ts` | Asserts old route shape; includes "second signup blocked" | Asserts new route shape; drops "second signup"; adds two marketing-home tests |
