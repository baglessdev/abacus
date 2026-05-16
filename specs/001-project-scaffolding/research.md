# Phase 0 Research — Project Scaffolding

One entry per non-obvious decision. Each entry: **Decision / Rationale / Alternatives considered.**

---

## 1. Next.js 15 initialization approach

**Decision**: **Manual scaffold.** Hand-author `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, and the Tailwind/PostCSS configs. Do not run `create-next-app`.

**Rationale**:
- The constitution mandates the folder layout `app/ lib/ components/ db/ tests/`. `create-next-app` does not produce `db/` or `tests/` at the root and assumes `prisma/` (not `db/`) for Prisma. A manual scaffold matches the constitution from commit one without a "delete-then-restructure" pass.
- The first PR for this feature stays a clean, readable diff: every file in the scaffold is intentional, not generated boilerplate.
- The `create-next-app` flags that get us closest (`--ts --app --tailwind --src-dir=false --import-alias "@/*" --eslint`) still produce extras (a `src/` debate, `README.md`, default favicon, etc.) that have to be cleaned up.

**Alternatives considered**:
- `create-next-app` + refactor: rejected for the diff-noise reason above.
- `create-next-app` with custom template: rejected — overkill for a single scaffold, and the template would have to be maintained.

---

## 2. Prisma client singleton pattern

**Decision**: `lib/prisma.ts` exports a `PrismaClient` instance cached on `globalThis` in non-production environments to survive Next.js dev hot-reload.

```
// shape only — code lands during /speckit-implement
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

**Rationale**:
- Next.js dev server reloads modules on every change; without a `globalThis` cache, each reload creates a new `PrismaClient`, and connection pools accumulate until Postgres rejects new connections.
- This is the canonical pattern in the Prisma docs and the Next.js + Prisma examples.

**Alternatives considered**:
- Per-request client: correct semantically but wasteful and racy in dev.
- Prisma Accelerate / Data Proxy: out of scope (no production, no edge).

---

## 3. shadcn/ui CLI init

**Decision**: Run `pnpm dlx shadcn@latest init` with:
- `style: default`
- `baseColor: slate`
- `cssVariables: true`
- `tailwindConfig: tailwind.config.ts`
- `components: components/ui` (write target)
- `utils: lib/utils.ts`
- `rsc: true` (React Server Components on)
- `tsx: true`

Then `pnpm dlx shadcn@latest add button dropdown-menu` for the components the theme toggle needs.

**Rationale**:
- `slate` is a neutral baseline that works well in both light and dark modes; it does not paint Abacus into a brand-color corner.
- CSS variables (not class-based theming) compose cleanly with `next-themes` and with future Tailwind-arbitrary-value usage.
- Writing to `components/ui` matches the constitution's `components/` folder convention; `lib/utils.ts` matches the `lib/` convention.

**Alternatives considered**:
- `style: new-york`: nicer-looking density but locks us to a more opinionated visual; defer to product judgment later.
- No CSS variables (Tailwind-class-only theming): poor composition with arbitrary values; rejected.
- Skip shadcn init, copy components by hand: rejected — the CLI keeps `components.json` honest and lets later `add` commands work without manual config.

---

## 4. next-themes integration without FOUC

**Decision**: Use `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. Wrap children in a client `app/providers.tsx` (so the provider is a Client Component) but render it from the Server Component `app/layout.tsx`. Add `suppressHydrationWarning` to the `<html>` tag in `layout.tsx`.

**Rationale**:
- `attribute="class"` lets Tailwind's `dark:` variant work via `<html class="dark">` — no JS gymnastics, no inline-style flicker.
- `next-themes` injects a tiny pre-hydration script that reads `localStorage` (or `prefers-color-scheme`) and sets the class BEFORE first paint. This eliminates FOUC (FR-009).
- `suppressHydrationWarning` on `<html>` silences React's hydration mismatch warning that is expected when the pre-paint script changes the class before React hydrates.
- `disableTransitionOnChange` prevents a half-second color animation when the user toggles, which feels like a bug.

**Alternatives considered**:
- Roll-our-own theme provider with a cookie: more code, easy to get FOUC wrong, no obvious upside.
- `data-theme` attribute instead of `class`: requires Tailwind plugin gymnastics; rejected.

---

## 5. Zod env validation strategy

**Decision**: Single server-only `lib/env.ts` exporting a typed `env` object parsed from `process.env` at import time. ESLint rule forbids `process.env` references outside that file. **Not** using `@t3-oss/env-nextjs` (no client/server split needed in this feature).

```
// shape only
const schema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_SECRET: z.string().optional(),  // tightened to required in feature 002
  AUTH_URL: z.string().url().optional(),
})
const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // throw with a multi-line message that names every failing key
}
export const env = parsed.data
```

**Rationale**:
- This feature has zero `NEXT_PUBLIC_*` keys. The t3-env split exists to keep server secrets out of the client bundle; with no public keys, the split adds dependencies and ceremony without value.
- A single module with a single Zod parse is the smallest correct boundary.
- Importing `lib/env.ts` from server code is allowed everywhere. The lint rule against raw `process.env` outside `lib/env.ts` enforces Principle III mechanically.
- Failing fast at import time means a missing key produces a clear error in the first 5 lines of output (SC-007).

**Alternatives considered**:
- `@t3-oss/env-nextjs`: solves a problem we don't have yet; revisit when a `NEXT_PUBLIC_*` key first lands.
- Validate per-route: defeats the "boundary" concept; rejected.

---

## 6. Playwright config — CI-readiness defaults

**Decision**:
- `headless: true`
- Reporter: `list` (plus `html` written to `playwright-report/` only on failure via the default behavior)
- Single project: `chromium`
- `webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 }`
- `baseURL: "http://localhost:3000"`
- `retries: 0` locally, `2` if `process.env.CI` is set

**Rationale**:
- Headless is the only sane default in a future CI environment; running headed locally is a per-developer override (`--headed`), not a project default.
- `list` reporter is human-readable in a terminal and works fine in CI logs. `html` is the gold-standard for failure inspection; keeping it default-on-failure costs nothing.
- A single `chromium` project keeps the example test fast and CI-cheap. Multi-browser matrix is a future feature.
- The `webServer` block lets `pnpm test:e2e` work without a separate "start the dev server" step, which is one of the spec's edge cases (test fails clearly if server unreachable).
- `reuseExistingServer: !process.env.CI` is the standard pattern: locally you keep your dev server warm; in CI you spin a fresh one.
- `retries: 0` locally encourages tests to be deterministic; the `2` retries in CI is the conventional escape hatch for flakes.

**Alternatives considered**:
- Default headed: rejected — would break the moment CI lands.
- `dot` reporter: too terse for the example test phase.
- `firefox` and `webkit` projects: useful eventually, premature now.

---

## 7. Vitest config — environment default

**Decision**: `environment: "jsdom"` as the project default. Setup file at `tests/setup.ts` (kept empty for now, ready for future React Testing Library wiring). Path aliases mirror `tsconfig.json` (`@/*` → `./*`).

**Rationale**:
- The first test that ships is a pure Node test (env Zod schema) — `node` env would suffice. But the moment a component test lands (which will happen in an early product feature), the default flips. Flipping defaults is more disruptive than paying the small jsdom startup cost from day one.
- Path aliases must match `tsconfig.json` exactly or `lib/env.ts` imports break in tests.

**Alternatives considered**:
- `environment: "node"` default + per-file `// @vitest-environment jsdom` overrides: works, but creates a footgun where new contributors forget the comment and tests pass for the wrong reason.
- Two Vitest projects (unit-node + unit-jsdom): too much config for one feature.

---

## 8. Argon2id vs bcrypt for password hashing

**Decision**: **Deferred to feature 002 (authentication).** Neither library is installed in this feature.

**Rationale**:
- The constitution allows either Argon2id or bcrypt (min 12 rounds). The choice is auth-feature-scoped.
- Installing it now adds a dep (and likely a native build dependency for `argon2`) for no current consumer.

**Alternatives considered**:
- Install bcrypt now "just in case": rejected — YAGNI, and the wrong default could be locked in by inertia.
