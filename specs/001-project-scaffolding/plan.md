# Implementation Plan: Project Scaffolding

**Branch**: `001-project-scaffolding` | **Date**: 2026-05-16 | **Spec**: [`./spec.md`](./spec.md)

**Input**: Feature specification at `specs/001-project-scaffolding/spec.md`

## Summary

Stand up the Abacus codebase as a runnable Next.js 15 (App Router) + React 19 + TypeScript (strict) application with Prisma wired to the existing docker-compose Postgres 16, Tailwind + shadcn/ui + next-themes for theming, Vitest + Playwright harnesses, ESLint + Prettier, Zod-validated environment variables, and a single public health-check endpoint at `GET /api/health` that probes the DB via raw `SELECT 1` through the Prisma client. The Prisma schema stays empty in this feature (no domain models); Auth.js is installed as a dependency but not configured. The deliverable is the foundation every later feature builds on: a clone-to-running-app loop under 10 minutes, type-safe end-to-end, with both test harnesses green.

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode, Node.js 24 LTS (pinned via `.nvmrc` and `engines.node` in `package.json`).

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Prisma 5.x + `@prisma/client`, Tailwind CSS 3.x + shadcn/ui (copied components, not a versioned package), Zod 3.x, `next-themes` for theming, `next-auth@beta` (installed only — no wiring in this feature), Vitest + `@vitejs/plugin-react` + `jsdom`, Playwright (`@playwright/test`), ESLint with `eslint-config-next`, Prettier (+ `prettier-plugin-tailwindcss`).

**Storage**: PostgreSQL 16 via `docker-compose.yml` already in repo. Connection string read from `DATABASE_URL`. Prisma schema is empty in this feature — no models defined.

**Testing**: Vitest (unit) with `jsdom` environment as default (React-ready for future component tests); Playwright (E2E) configured headless by default with the `list` reporter (CI-friendly when CI lands).

**Target Platform**: Local developer workstation (macOS / Linux). No production deployment target in scope.

**Project Type**: Single-package Next.js web application. Constitution-mandated folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) at the repo root.

**Performance Goals**: Health endpoint responds in under 500 ms locally when DB is healthy (SC-002). Cold dev-server start under typical Next.js bounds (no specific target).

**Constraints**:
- TypeScript strict; `any` disallowed via `eslint` rule (`@typescript-eslint/no-explicit-any: error`).
- No `db push` against committed code (constitution Conventions); all schema changes ship as migrations. N/A in this feature because schema is empty, but the script manifest enforces the policy from day one (`db:migrate`, `db:reset`, no `db:push`).
- No secrets committed; `.env.example` is the manifest, `.env.local` is git-ignored (already in `.gitignore`).

**Scale/Scope**: One developer, one machine, one database. Scaffolding only — no domain volume yet.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passes.*

| Principle | Applicability | How this plan honors it |
|---|---|---|
| **I. Money math is non-negotiable** | **N/A for this feature.** No monetary amounts, no `Decimal`, no ledger entries, no currency. `lib/money/` is explicitly out of scope and lands with the first feature that handles money. | Document the N/A status here so the next feature picks it up cleanly. The folder `lib/money/` is intentionally NOT created. |
| **II. Type safety end-to-end** | **Applies.** Every line of scaffold code must be strict-typed. | `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`. ESLint rule `@typescript-eslint/no-explicit-any: error`. Zod schema validates `process.env` at boundary. Prisma client is the source of truth for the DB type surface (empty schema in this feature but client is generated). |
| **III. Validate at boundaries, trust internally** | **Applies — narrowly.** The only boundary in this feature is process environment variables (`process.env`). | `lib/env.ts` exports a Zod-parsed `env` object; imports of `process.env` outside that file are forbidden by ESLint (`no-restricted-syntax` or `no-process-env`). The health route does not validate any request body (there is no body) but does return the constitution's `{ data } \| { error: { code, message } }` envelope. |
| **IV. Test the money paths** | **No money paths exist yet.** Still required: the harnesses themselves must work. | Vitest ships with at least one meaningful smoke test: `lib/env.ts` Zod schema rejects a config missing `DATABASE_URL`. Playwright ships with at least one meaningful smoke test: `GET /api/health` returns 200 + documented envelope when DB is up. Both commands exit zero on a fresh checkout. |
| **V. Spec-driven development** | **Applies.** | This feature follows `spec.md` → `plan.md` → `tasks.md` → implementation. One feature in flight. No code written before plan is `READY_FOR_BUILD`. |

**No violations. No entries needed in Complexity Tracking.**

## Project Structure

### Documentation (this feature)

```text
specs/001-project-scaffolding/
├── plan.md              # This file
├── research.md          # Phase 0 — non-obvious decisions with rationale
├── data-model.md        # Phase 1 — explicit "no entities" stub for this feature
├── quickstart.md        # Phase 1 — clone-to-running-app in under 10 minutes
├── contracts/
│   └── health.md        # GET /api/health request/response contract
└── spec.md              # (already exists — input to this plan)
```

### Source Code (repository root)

Constitution-mandated layout (`app/`, `lib/`, `components/`, `db/`, `tests/`). This feature creates the following files:

```text
abacus/
├── app/
│   ├── layout.tsx                       # Root layout; wraps children in <ThemeProvider> (next-themes)
│   ├── page.tsx                         # Landing page: app-is-alive surface + theme toggle
│   ├── globals.css                      # Tailwind base/components/utilities + shadcn CSS vars (light/dark)
│   ├── providers.tsx                    # Client-side <ThemeProvider> wrapper for next-themes
│   └── api/
│       └── health/
│           └── route.ts                 # GET handler: probes DB via `SELECT 1`, returns constitution envelope
│
├── components/
│   ├── theme-toggle.tsx                 # Three-option toggle (light/dark/system) using next-themes
│   └── ui/                              # shadcn/ui components copied here (button, dropdown-menu — added by `shadcn add`)
│
├── lib/
│   ├── env.ts                           # Zod schema for process.env; exports typed `env` object; fails fast on import
│   ├── prisma.ts                        # Prisma client singleton (dev hot-reload safe via globalThis cache)
│   └── utils.ts                         # shadcn-required `cn()` helper (clsx + tailwind-merge)
│
├── db/
│   └── schema.prisma                    # Prisma schema: datasource + generator only; NO models in this feature
│
├── tests/
│   ├── unit/
│   │   └── env.test.ts                  # Vitest: env Zod schema rejects missing DATABASE_URL; accepts valid config
│   └── e2e/
│       └── health.spec.ts               # Playwright: GET /api/health returns 200 + { data: { app, database } }
│
├── public/                              # Next.js static assets (favicon, etc.) — created by scaffold
│
├── .nvmrc                               # `24` — pins Node 24 LTS
├── .env.example                         # ALREADY EXISTS; this feature extends it only if a key is added
├── .eslintrc.json                       # extends next/core-web-vitals + prettier; forbids `any` and raw process.env
├── .prettierrc                          # Prettier config + tailwind plugin
├── .prettierignore                      # ignores node_modules, .next, db/migrations, etc.
├── components.json                      # shadcn/ui config (style: default, baseColor: slate, css vars)
├── next.config.ts                       # Next.js config (minimal — no custom webpack)
├── package.json                         # scripts manifest, dependencies, engines.node="24", packageManager pinned
├── pnpm-lock.yaml                       # committed
├── playwright.config.ts                 # baseURL http://localhost:3000, headless, list reporter, webServer auto-start
├── postcss.config.mjs                   # Tailwind + autoprefixer
├── tailwind.config.ts                   # content globs, shadcn theme tokens, dark mode "class"
├── tsconfig.json                        # strict, paths alias @/* → ./, Next.js plugin
└── vitest.config.ts                     # jsdom env, setup files, path aliases match tsconfig
```

**Structure Decision**: Single-package Next.js application at the repo root. The constitution's folder convention (`app/`, `lib/`, `components/`, `db/`, `tests/`) is honored verbatim. Note: the Prisma schema lives at `db/schema.prisma` (not the default `prisma/schema.prisma`); Prisma's `schema` field in `package.json` points to it. Migrations will live at `db/migrations/` when the first migration lands in feature 002.

## Phase 0: Research

See [`./research.md`](./research.md) for non-obvious choices. Decisions captured:

1. Next.js 15 init via **manual scaffold** (not `create-next-app`) so the folder layout matches the constitution from the first commit.
2. Prisma client singleton via `globalThis` cache to survive Next dev hot-reload.
3. shadcn/ui CLI init with `style: default`, `baseColor: slate`, CSS variables, components write target `components/ui`.
4. `next-themes` with `attribute="class"` and `<ThemeProvider>` in a client `providers.tsx`; `suppressHydrationWarning` on `<html>` to eliminate FOUC.
5. Zod env schema as a **single server-only `lib/env.ts`** (no t3-env split); imports of `process.env` outside this file are linted against. The single `NEXT_PUBLIC_*` need does not exist in this feature.
6. Playwright config: headless default, `list` reporter, single `chromium` project, `webServer` block that starts `pnpm dev` automatically — CI-friendly without requiring CI yet.
7. Vitest config: `environment: "jsdom"` as default (React-component-ready), even though no React tests ship in this feature — avoids re-config churn when the first component test lands.
8. Argon2id vs bcrypt — **deferred to feature 002** (auth). Not installed here.

## Phase 1: Design Artifacts

### Data Model

See [`./data-model.md`](./data-model.md). Summary: **no domain entities in this feature.** The Prisma schema contains only the `datasource` and `generator` blocks. The first model (User) lands in feature 002.

### Contracts

See [`./contracts/health.md`](./contracts/health.md). One public endpoint:

| Method | Path | Auth | Healthy response | Unhealthy response |
|---|---|---|---|---|
| `GET` | `/api/health` | **None** (public for this feature; future gating is feature-002+) | `200 { "data": { "app": "ok", "database": "ok" } }` | `503 { "error": { "code": "DATABASE_UNAVAILABLE", "message": "<human-readable>" } }` |

### Quickstart

See [`./quickstart.md`](./quickstart.md). The numbered path a new developer follows to satisfy SC-001 (under 10 minutes from clone to running app).

## Package Scripts (manifest)

The `package.json` `scripts` field must expose, at minimum, these named commands (per FR-012):

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local dev server with hot reload |
| `build` | `next build` | Production build |
| `start` | `next start` | Serve the production build |
| `lint` | `next lint` | ESLint via Next.js CLI |
| `format` | `prettier --write .` | Prettier in write mode |
| `format:check` | `prettier --check .` | Prettier in check mode (CI-shaped) |
| `typecheck` | `tsc --noEmit` | Strict TypeScript check |
| `test` | `vitest run` | Unit tests, one-shot |
| `test:watch` | `vitest` | Unit tests, watch mode |
| `test:e2e` | `playwright test` | E2E tests against running dev server |
| `db:generate` | `prisma generate --schema db/schema.prisma` | Generate Prisma client |
| `db:migrate` | `prisma migrate dev --schema db/schema.prisma` | Create/apply migration in dev |
| `db:reset` | `prisma migrate reset --schema db/schema.prisma` | Drop + re-apply migrations + seed |
| `db:studio` | `prisma studio --schema db/schema.prisma` | Prisma Studio UI |

**Deliberately NOT included**: any `prisma db push` script (constitution Conventions forbid `db push` against committed code).

## File-Level Layout (new files in this feature)

| Path | Purpose |
|---|---|
| `package.json` | Scripts, deps, `engines.node="24"`, `packageManager="pnpm@<pinned>"`, `prisma.schema` field |
| `pnpm-lock.yaml` | Locked dependency tree |
| `.nvmrc` | `24` — single line |
| `tsconfig.json` | Strict TS, `@/*` path alias to `./*`, Next.js plugin |
| `next.config.ts` | Minimal Next config |
| `tailwind.config.ts` | Tailwind theme + content globs + `darkMode: "class"` |
| `postcss.config.mjs` | Tailwind + autoprefixer |
| `components.json` | shadcn/ui config |
| `.eslintrc.json` | Extends `next/core-web-vitals`, `prettier`; bans `any`, bans direct `process.env` outside `lib/env.ts` |
| `.npmrc` | `engine-strict=true` — pnpm enforces `engines.node` from `package.json` (fulfills FR-019 refusal clause) |
| `.prettierrc` | Prettier + tailwind plugin |
| `.prettierignore` | Standard ignore list |
| `playwright.config.ts` | Headless, `list` reporter, chromium, `webServer` block |
| `vitest.config.ts` | jsdom env, path aliases |
| `app/layout.tsx` | Root layout, html lang, theme provider wrapper, `suppressHydrationWarning` |
| `app/page.tsx` | Landing page: "Abacus is running" headline + theme toggle |
| `app/globals.css` | Tailwind layers + shadcn CSS variables (light + dark) |
| `app/providers.tsx` | Client component wrapping `next-themes` ThemeProvider |
| `app/api/health/route.ts` | `GET` handler: `SELECT 1` via Prisma `$queryRaw`; constitution envelope; 200 or 503 |
| `components/theme-toggle.tsx` | Dropdown with three options (light/dark/system) via `next-themes` |
| `components/ui/button.tsx` | shadcn-added button (via `pnpm dlx shadcn add button`) |
| `components/ui/dropdown-menu.tsx` | shadcn-added dropdown-menu (used by theme toggle) |
| `lib/env.ts` | Zod schema for env; exports `env` object; throws actionable error on import if invalid |
| `lib/prisma.ts` | Prisma client singleton with `globalThis` cache for dev hot-reload |
| `lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) |
| `db/schema.prisma` | Prisma datasource (PostgreSQL) + generator (prisma-client-js); NO models |
| `tests/unit/env.test.ts` | Vitest: env Zod schema rejects missing `DATABASE_URL` |
| `tests/e2e/health.spec.ts` | Playwright: `GET /api/health` returns 200 + correct envelope |

### Modified files

| Path | Change |
|---|---|
| `.gitignore` | (Already covers `.next/`, `node_modules/`, `.env.local`, `playwright-report/`, `test-results/`, etc. — no edits expected unless a gap is found during implementation.) |
| `.env.example` | (Already covers `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NODE_ENV` — only edit if this feature's Zod schema requires an additional key, which it should not.) |
| `CLAUDE.md` | Update `<!-- SPECKIT START --> ... <!-- SPECKIT END -->` block to reference this plan path. |

## API Surface

### `GET /api/health`

- **Auth**: None. Public endpoint. (Future gating is a feature-002+ concern; documented intent below.)
- **Request**: No body, no query, no headers required.
- **Response (healthy, 200)**:
  ```json
  { "data": { "app": "ok", "database": "ok" } }
  ```
- **Response (DB unhealthy, 503)**:
  ```json
  { "error": { "code": "DATABASE_UNAVAILABLE", "message": "Database is not reachable: <reason>" } }
  ```
- **Implementation contract**: Calls `prisma.$queryRaw\`SELECT 1\`` inside a try/catch. Success → 200 envelope. Caught error → 503 envelope. No retries, no caching. The route is rendered dynamically (`export const dynamic = "force-dynamic"`) so the probe runs on every request.
- **Future auth posture**: Once feature 002 lands auth, the endpoint may be split into `/api/health/live` (public, app-only, used by container orchestrators) and `/api/health/ready` (gated by a shared secret header or admin session, includes DB). For this feature it stays public and unified — single endpoint, no header.

## UI Surface

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Server component: renders a heading "Abacus is running" and includes the client `<ThemeToggle />`. Confirms the app is alive (User Story 1 acceptance scenario 2). |

### Key components

| Component | Path | Props | Notes |
|---|---|---|---|
| `<ThemeProvider>` | re-exported in `app/providers.tsx` | passes through to `next-themes` ThemeProvider | `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange` |
| `<ThemeToggle>` | `components/theme-toggle.tsx` | none | Uses `useTheme()` from `next-themes`. Renders a shadcn `<DropdownMenu>` with three items: Light, Dark, System. |

### shadcn/ui components to add

- `button` — used by the theme toggle trigger
- `dropdown-menu` — used by the theme toggle

Added via `pnpm dlx shadcn@latest add button dropdown-menu` after init. No other shadcn components in this feature.

### Charts

**N/A.** Recharts is not installed in this feature — it lands with the first feature that displays charts.

## Money & Currency Notes

**N/A — this feature touches no monetary amounts.** No `Decimal` fields, no currency codes, no FX, no `lib/money/`. The constitution's Principle I is preserved for the next feature that introduces money. The Prisma schema deliberately stays empty so no temptation to add a money-shaped field exists.

## Auth & Validation Boundaries

- **Auth**: Auth.js (`next-auth@beta`) is installed as a dependency so the lockfile and node_modules are ready, but **no routes, middleware, providers, callbacks, session handling, or UI are wired up**. Importing `next-auth` must not break the build (edge-case from spec). No `[...nextauth]` route, no `middleware.ts` for auth, no session check anywhere. The `AUTH_SECRET` and `AUTH_URL` env vars exist in `.env.example` already; the Zod schema in `lib/env.ts` treats them as **optional** in this feature (since they are unused) and tightens them to required in feature 002.
- **Validation boundaries in this feature**:
  - **Process env** → `lib/env.ts` (Zod schema, parsed exactly once at import time, throws with a list of failures naming each offending key). This is the ONLY boundary in this feature.
  - **API request bodies** → none in this feature (health is `GET` with no body).
  - **External API responses** → none in this feature.

## Testing Strategy

Per Principle IV: money paths require tests; no money paths exist yet. But the harnesses must be provably working.

### Unit (Vitest) — required

| Test file | Coverage | Rationale |
|---|---|---|
| `tests/unit/env.test.ts` | `lib/env.ts` Zod schema: (a) rejects an object missing `DATABASE_URL` with a clear error; (b) accepts a valid object | Boundary validation (Principle III) is the most consequential surface in this feature. Testing the env schema doubles as proof Vitest is wired and as protection against a silent regression that would let the app boot with bad config. |

### E2E (Playwright) — required

| Test file | Coverage | Rationale |
|---|---|---|
| `tests/e2e/health.spec.ts` | `GET /api/health` against the running dev server: status is 200, body matches `{ data: { app: "ok", database: "ok" } }` | The health endpoint is the canary for the whole scaffold (app boot + DB connectivity). One Playwright test exercising it proves both the harness and the contract from `contracts/health.md`. |

### What skips tests and why

- The theme toggle (User Story 3) — UX-only, no money path. Manual acceptance per spec is sufficient. A future component test is welcome but not required by Principle IV.
- The landing page (`app/page.tsx`) — static surface, no logic. The E2E health test indirectly proves the server is up.
- The Prisma singleton (`lib/prisma.ts`) — pure plumbing, exercised transitively by the health E2E.

## Risks & Trade-offs

- **Manual Next.js scaffold vs `create-next-app`**: chose manual so the folder layout matches the constitution (`db/` instead of `prisma/`, `tests/` at root) from commit one. Trade-off: slightly more boilerplate to write by hand. Considered: run `create-next-app` then refactor — rejected because the refactor noise pollutes the first task PR.
- **Prisma schema lives at `db/schema.prisma`** (non-default): honors constitution Conventions. Trade-off: every `prisma` CLI invocation needs `--schema db/schema.prisma` (or the `prisma.schema` field in `package.json`, which we use). Considered: keep default `prisma/schema.prisma` and amend constitution — rejected because constitution Convention is intentional and stable.
- **Optional `AUTH_*` env vars in Zod**: lets the app boot without auth fully configured this feature. Trade-off: a developer could forget to tighten them in feature 002. Mitigation: feature 002's plan will explicitly call out the tightening as a required edit.
- **Single unified `/api/health` (not split live/ready)**: simpler for now; split is a deployment concern, not a scaffolding concern. Trade-off: when a real deployment target lands, the route will be refactored. Acceptable — premature optimization rejected.
- **Vitest `jsdom` default (no React tests yet)**: pays a small startup cost on every run for an environment we don't yet use. Trade-off: avoids re-config churn the first time a component test lands. Considered: `node` default — rejected for the same churn-avoidance reason.

## Constitution Compliance

Re-check after design (Phase 1) — **still passes, no violations**.

- **I. Money math**: N/A this feature; explicitly preserved by not creating `lib/money/` and not adding any money-shaped Prisma field.
- **II. Type safety**: `tsconfig.json` strict, `noUncheckedIndexedAccess`, ESLint bans `any`. Zod typed env. Prisma client typed.
- **III. Validate at boundaries**: `lib/env.ts` is the single boundary in this feature. Health endpoint has no body to validate.
- **IV. Test the money paths**: no money paths; harnesses are working and ship meaningful smoke tests (env schema + health envelope).
- **V. Spec-driven**: `spec.md` approved → this `plan.md` → next is `tasks.md` → then code. One feature in flight (`001-project-scaffolding`).
- **Conventions honored**: `app/ lib/ components/ db/ tests/` layout, `{ data } | { error: { code, message } }` envelope, `.env.example` is the manifest, no `db push` script, ISO/UTC defaults inherited from Next/Node (no overrides).

## Complexity Tracking

*No constitution violations — table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (none) | (none) | (none) |

---

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution compliant, all deferred clarifications resolved
File: specs/001-project-scaffolding/plan.md
```
