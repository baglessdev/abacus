# Feature 003 — Auth Contracts (Revised)

This document is the source of truth for the server-action signatures, the session shape downstream features depend on, the middleware routing policy, and the marketing surface's contract. All shapes here are stable contracts; changing any of them is a breaking change for downstream features.

**Revision note.** This contract was updated to reflect the constitution v0.2.0 amendment (multi-user from day one; no first-user gating) and the spec revision (public marketing home at `/`; authenticated app under `/dashboard/*`). The server-action signatures are unchanged. The middleware decision table is simplified (fewer cases, no Prisma read). A new section "7. Marketing surface contract" is added.

---

## 1. Server actions

All three server actions live in `lib/auth/actions.ts` and are `"use server"`. They are invoked via `<form action={...}>` on the auth pages and within the shell header's user menu.

**Naming note**: Auth.js v5 already exports `signIn` and `signOut` from the `NextAuth(config)` factory. To avoid name clash, this feature's server actions are `signInAction` and `signOutAction` (the `signUp` action keeps its short name because Auth.js does not export `signUp`). Inside the action bodies, the Auth.js framework functions are referenced as `signIn` and `signOut` after `import { signIn, signOut } from "@/lib/auth"`.

### `signUp(formData: FormData): Promise<SignUpResult>`

```ts
type SignUpResult =
  | { data: { userId: string } }
  | ValidationError
  | { error: { code: Exclude<SignUpErrorCode, "VALIDATION_FAILED">; message: string } }

type SignUpErrorCode =
  | "VALIDATION_FAILED"
  | "USER_ALREADY_EXISTS"
  | "AUTO_SIGN_IN_FAILED"

type ValidationError = {
  error: {
    code: "VALIDATION_FAILED"
    message: string // top-level summary, e.g. "Please fix the highlighted fields"
    fieldErrors: Partial<Record<"email" | "password" | "confirmPassword", string[]>>
  }
}
```

**Behavior (revised).**

1. Parse `formData` with `signupSchema` (Zod). On failure → `{ error: { code: "VALIDATION_FAILED", message, fieldErrors } }`.
2. ~~Check `userExists()`. If `true` → `{ error: { code: "USER_ALREADY_EXISTS", … } }`.~~ **REMOVED** (revision). The `userExists()` pre-check is gone; the race-safe Postgres `@unique` constraint is the sole defense against duplicates.
3. `hashPassword(password)` via `@node-rs/argon2`.
4. `createUser({ email, passwordHash })` inside a try/catch. If the Prisma client throws with `code === "P2002"` (unique-constraint violation on `email`), return `{ error: { code: "USER_ALREADY_EXISTS", message: "An account with this email already exists. Please log in." } }`. This is now the **only** path that produces the `USER_ALREADY_EXISTS` envelope.
5. Establish a session via Auth.js `signIn("credentials", { email, password, redirect: false })`.
6. If `signIn` succeeds → `redirect(safeFrom(formData.get("from")))`. Default fallback when no `from` is provided: **`/dashboard`** (was `/`).
7. If `signIn` fails (shouldn't happen, but defensively) → redirect to `/login?message=account_created`.

**Note.** Because `signUp` ends in a redirect on the success path, the `SignUpResult` is only observed on error paths. The form treats "no return value" as success.

### `signInAction(formData: FormData): Promise<SignInResult>`

```ts
type SignInResult =
  | { data: { ok: true } }
  | {
      error: {
        code: "VALIDATION_FAILED"
        message: string
        fieldErrors: Partial<Record<"email" | "password", string[]>>
      }
    }
  | { error: { code: "INVALID_CREDENTIALS"; message: string } }
```

**Behavior (unchanged).**

1. Parse `formData` with `loginSchema` (Zod). On failure → `{ error: { code: "VALIDATION_FAILED", … } }`.
2. Call Auth.js `signIn("credentials", { email, password, redirect: false })`.
3. The Credentials provider's `authorize()` callback:
   - Re-parses with `loginSchema` defensively.
   - Calls `getUserByEmail(email)`.
   - If the user exists, runs `verifyPassword(password, user.passwordHash)`.
   - If the user does **not** exist, runs `verifyPassword(password, DUMMY_HASH)` for timing parity (the result is discarded).
   - Returns `{ id, email }` on success or `null` otherwise.
4. On `authorize` returning `null` → `{ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }`. **The message is identical for unknown email and wrong password (FR-014).**
5. On success → `redirect(safeFrom(formData.get("from")))`. Default fallback when no `from` is provided: **`/dashboard`** (was `/`).

### `signOutAction(): Promise<void>`

```ts
async function signOutAction(): Promise<void>
```

**Behavior (unchanged).**

1. Calls Auth.js v5 `signOut({ redirectTo: "/login" })` (the `signOut` here is the framework export from `@/lib/auth`, not this action).
2. The function returns control via redirect — callers never observe a return value on the success path.

The user-menu dropdown's "Log out" item is rendered as `<form action={signOutAction}>…</form>` so it works without JavaScript.

---

## 2. Error codes — canonical list (revised)

| Code | Surface | User-facing message | HTTP-equivalent | Source of trigger |
|---|---|---|---|---|
| `VALIDATION_FAILED` | signUp, signInAction | top-level: `"Please fix the highlighted fields"`; field-scoped Zod messages in `fieldErrors` | 400 | Zod boundary |
| `USER_ALREADY_EXISTS` | signUp | `"An account with this email already exists. Please log in."` | 409 | Postgres `P2002` on `User.email @unique` (race-safe; no pre-check) |
| `INVALID_CREDENTIALS` | signInAction | `"Invalid email or password"` | 401 | Auth.js `authorize()` returns `null` |
| `AUTO_SIGN_IN_FAILED` | signUp (recovery path) | `"Your account was created. Please log in."` | 200 (recoverable) | Auth.js `signIn` throws after a successful `createUser` |

**Change.** The "four-layer gate" framing from the original document is retired. `USER_ALREADY_EXISTS` now has exactly one source of truth (the Postgres `@unique` violation, caught in the `signUp` try/catch). The previous description had four layers; this is correct: middleware count-check (removed), page-level count-check (removed), action-level count-check (removed), Postgres unique violation (kept).

---

## 3. Zod schemas (boundary) — unchanged

```ts
// lib/auth/schemas.ts — shape only

const emailField = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase())

export const signupSchema = z
  .object({
    email: emailField,
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
```

**Locked decisions (unchanged from original).**

- Email normalized to lowercase at the boundary on **both** signup and login (FR-017).
- Password minimum length **12** on signup. Login does not re-enforce min(12); presence only.
- Confirm-password match enforced inside the schema via `.refine`; field-scoped under `confirmPassword`.

---

## 4. Session shape exposed to downstream features — unchanged

After this feature lands, every server component, server action, and route handler downstream of the middleware can call `auth()` and rely on this shape:

```ts
type Session = {
  user: {
    id: string       // cuid; the User.id; OIDC sub claim
    email: string    // lowercased
  }
  expires: string    // ISO 8601 timestamp
}
```

**Module augmentation** (lives in `lib/auth/index.ts`):

```ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    email: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub: string
    email: string
  }
}
```

**Contract guarantee.** When a request reaches a `(shell)/dashboard/*` route, the middleware has already redirected unauthenticated visitors. Code under `(shell)/` can call `auth()` and treat `session.user.id` and `session.user.email` as definitely-defined `string`. No defensive narrowing required (Principle III).

**Stability.** The `session.user.id` field is a load-bearing contract for every future feature (accounts, transactions, budgets, settings). Per constitution v0.2.0's data-scoping rule, every domain row created in feature 004+ references this id as its `userId` foreign key.

---

## 5. Middleware behavior contract (revised)

`middleware.ts` at the repo root, `runtime = "nodejs"`. The middleware matches:

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

For each matched request, the middleware computes:

- `session` ← `await auth()` (decodes the JWT cookie; `null` if absent/invalid).

**That is the only state read.** No `prisma.user.count()` is performed. No DB read happens inside middleware.

### Decision table (simplified)

| Path | Session present? | Action |
|---|---|---|
| `/dashboard` or `/dashboard/*` | yes | `NextResponse.next()` (allow) |
| `/dashboard` or `/dashboard/*` | no | `redirect("/login?from=<original>")` (FR-008) |
| `/login` | yes | `redirect("/dashboard")` (FR-022) |
| `/login` | no | `NextResponse.next()` (login form is usable) |
| `/signup` | yes | `redirect("/dashboard")` (FR-022) |
| `/signup` | no | `NextResponse.next()` (signup form is usable; no gate) |

**Differences vs. the original middleware:**

| Aspect | Original (single-user) | Revised (multi-user) |
|---|---|---|
| Matcher entries | 7 (`/`, `/accounts/:path*`, `/transactions/:path*`, `/budgets/:path*`, `/settings/:path*`, `/login`, `/signup`) | 4 (`/dashboard`, `/dashboard/:path*`, `/login`, `/signup`) |
| `/` in matcher | yes (auth-gated) | no (marketing page is public) |
| `userExists()` call | yes (in 3 branches) | **no** — removed entirely |
| `/signup` with user-exists redirect | `→ /login` | **removed** — `/signup` is always reachable |
| `/` with no-user redirect | `→ /signup` | **removed** — `/` is now the marketing page, not a gate |
| Authenticated-on-`/login`-or-`/signup` redirect target | `/` | `/dashboard` |

### Redirect-hint safety (unchanged)

When the middleware appends `?from=<original-path>`, the original path is **only** preserved if it is an in-app path (starts with `/` and does not start with `//` or contain a protocol after the first character). External URLs and path-traversal attempts are dropped; the post-login redirect then falls back to `/dashboard` (FR-009).

A path of `/dashboard/accounts` round-trips correctly: the middleware encodes it as `?from=%2Fdashboard%2Faccounts`, `signInAction`'s `safeFrom` accepts it (`startsWith("/")`, no `//`, no `:`), and the post-login redirect lands the user on `/dashboard/accounts`.

---

## 6. Auth.js handler — unchanged

```ts
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@/lib/auth"
```

Auth.js v5 emits `handlers.GET` and `handlers.POST` from the `NextAuth(config)` factory. These cover the framework's internal callback URLs (`/api/auth/callback/credentials`, `/api/auth/session`, `/api/auth/csrf`, etc.). These URLs are **exempt** from the constitution's response envelope (FR-018) — the framework owns their shape.

---

## 7. Marketing surface contract (new)

The application root `/` is a **public** server-rendered page. It is not gated by middleware. It is reachable by any visitor — anonymous or authenticated — and renders the same chrome for both.

### Route

- **URL**: `/`
- **File**: `app/(marketing)/page.tsx`
- **Layout**: `app/(marketing)/layout.tsx`
- **Component type**: server component (no `"use client"`)
- **Auth requirement**: none
- **Middleware involvement**: none (path is not in the matcher)

### Session reading (server-side)

The marketing page calls `auth()` once at the top to compute `isAuthenticated: boolean`. This is a read-only branch; there is no redirect based on the session. Both branches render the same hero copy and the same feature grid — only the CTA block differs.

```ts
// shape only — implementation lands in tasks
export default async function MarketingHome() {
  const session = await auth()
  const isAuthenticated = !!session?.user
  return (
    <>
      <Hero isAuthenticated={isAuthenticated} />
      <FeatureGrid />
    </>
  )
}
```

### CTA contract

| Audience | CTA(s) shown | Destination(s) | Visual |
|---|---|---|---|
| Anonymous (`!session`) | Two: "Log in", "Sign up" | `/login`, `/signup` | "Log in" outline variant; "Sign up" primary (violet) |
| Authenticated (`!!session`) | One: "Go to dashboard" | `/dashboard` | Primary (violet) |

The "Log in" / "Sign up" CTAs are **not rendered** when the visitor is authenticated. The "Go to dashboard" CTA is **not rendered** for anonymous visitors. The hero text + subheadline are identical in both branches.

### Layout contract

The marketing layout renders:

1. `<MarketingHeader />` — Brand mark (left) + theme toggle (right). No nav links in the header for this feature. No user-menu (the marketing surface is intentionally session-agnostic in chrome).
2. `{children}` — the page content slot.
3. `<MarketingFooter />` — small copyright line + "Made with Abacus" mark.

The marketing layout does NOT include `<SessionProvider>`, `<AppShell>`, `<Sidebar>`, or any auth-gated component. It inherits the violet primary brand and the light/dark theme via `next-themes` from the root layout.

### Stability

The marketing page's URL (`/`), its public visibility, and the adaptive-CTA shape are stable contracts. Adding new marketing pages (e.g., `/pricing`, `/about`) is non-breaking and would land in the same `(marketing)/` route group. Removing or renaming `/` is a breaking change for every inbound link.

---

## 8. Environment variables — unchanged

`lib/env.ts` requires `AUTH_SECRET` (min 32 chars) and `AUTH_URL` (URL). Both must be set in `.env.local` for `pnpm dev` to boot. Application startup fails fast with a human-readable Zod error if either is missing or malformed (FR-005, SC-009).
