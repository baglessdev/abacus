---
description: "Dependency-ordered task list for 001-project-scaffolding"
---

# Tasks: Project Scaffolding

**Input**: Design documents from `/specs/001-project-scaffolding/`

**Prerequisites**: plan.md (READY_FOR_BUILD), spec.md, research.md, data-model.md (empty by design), contracts/health.md, quickstart.md

**Tests**: Included. The constitution (Principle IV) and the spec (FR-010, FR-011) both require working Vitest + Playwright harnesses with at least one meaningful smoke test each. The plan's Testing Strategy locks the specific tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story this task belongs to (US1–US5). Setup, Foundational, and Polish phases carry no story label.
- File paths in tasks are project-relative to the repo root (`/Users/rgederin/git/abacus/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding files that every story depends on. No story label.

- [X] T001 Create constitution-mandated folder layout at repo root: `app/`, `app/api/health/`, `components/ui/`, `lib/`, `db/`, `tests/unit/`, `tests/e2e/`, `public/`. Empty `.gitkeep` files where needed so the dirs are committable.
- [X] T002 Create `package.json` at repo root with: `"name": "abacus"`, `"private": true`, `"engines": { "node": ">=24 <25" }`, `"packageManager": "pnpm@11.1.2"` (current Homebrew-shipped stable), and a `"prisma": { "schema": "db/schema.prisma" }` field. Include the full scripts manifest from plan.md §"Package Scripts" verbatim (`dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:watch`, `test:e2e`, `db:generate`, `db:migrate`, `db:reset`, `db:studio`). **Do NOT include any `db:push` script** (constitution Conventions).
- [X] T003 [P] Create `.nvmrc` at repo root with a single line: `24`.
- [X] T004 [P] Create `tsconfig.json` at repo root with `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`, the Next.js TS plugin, `"paths": { "@/*": ["./*"] }`, JSX `preserve`, target `ES2022`, module `esnext`, moduleResolution `bundler`, include `**/*.ts, **/*.tsx, .next/types/**/*.ts`, exclude `node_modules`.
- [X] T005 [P] Create `next.config.ts` at repo root with a minimal typed config (no custom webpack, no experimental flags).
- [X] T006 [P] Create `postcss.config.mjs` at repo root exporting `tailwindcss` and `autoprefixer` plugins.
- [X] T007 [P] Create `tailwind.config.ts` at repo root with `darkMode: "class"`, content globs `["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"]`, and a theme that extends shadcn CSS variables (to be finalized by shadcn init in T017).
- [X] T008 Run `pnpm install` to install runtime deps: `next@15`, `react@19`, `react-dom@19`, `@prisma/client`, `zod`, `next-themes`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `next-auth@beta` (installed only — NOT wired up per FR-014). And dev deps: `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `prisma`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `eslint-config-next`, `eslint-config-prettier`, `@typescript-eslint/eslint-plugin`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@playwright/test`. Commit `pnpm-lock.yaml`.
- [X] T009 [P] Create `.eslintrc.json` at repo root extending `["next/core-web-vitals", "prettier"]`. Rules: `@typescript-eslint/no-explicit-any: "error"`, and a `no-restricted-syntax` rule forbidding `process.env` access in any file outside `lib/env.ts` (use a glob override; the rule message must say "import env from '@/lib/env'").
- [X] T010 [P] Create `.prettierrc` at repo root: `{ "semi": false, "singleQuote": false, "trailingComma": "all", "printWidth": 100, "plugins": ["prettier-plugin-tailwindcss"] }`. Also create `.prettierignore` listing `node_modules`, `.next`, `pnpm-lock.yaml`, `db/migrations`, `playwright-report`, `test-results`, `coverage`.
- [X] T010a [P] Create `.npmrc` at repo root with a single line: `engine-strict=true`. This makes pnpm enforce the `engines.node` constraint (Node 24 LTS) declared in T002, satisfying FR-019's "refuse to run under an incompatible Node version" subclause.
- [X] T011 [P] Verify `.gitignore` covers `node_modules/`, `.next/`, `.env.local`, `playwright-report/`, `test-results/`, `coverage/`. If any are missing, add them. (Existing file already covers the common cases per repo inspection — verify and amend only.)

**Checkpoint**: `pnpm typecheck` and `pnpm lint` should both at least run (may fail on no source files yet); `pnpm install` succeeded; folder layout exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core wiring every user story depends on (env validation, Prisma client, root layout, shadcn init). No story label.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T012 [P] Create `lib/env.ts` exporting a Zod schema for `process.env` and a parsed `env` object. Required: `DATABASE_URL` (URL format, must start with `postgres://` or `postgresql://`). Optional in this feature (tightened in feature 002): `AUTH_SECRET` (string), `AUTH_URL` (URL), `NODE_ENV` (enum `development | test | production`, default `development`). On parse failure, throw an `Error` whose message lists every offending key with the Zod issue path and message, one per line, prefixed with `Invalid environment configuration:`. The parse runs once at module load (top-level).
- [X] T013 [P] Create `db/schema.prisma` with a `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }` block and a `generator client { provider = "prisma-client-js" }` block. **No models.**
- [X] T014 [P] Create `lib/prisma.ts` exporting a singleton `PrismaClient` instance. Use the `globalThis` cache pattern so Next dev hot-reload does not spawn new connections. Export as the default export and as named `prisma`.
- [X] T015 Run `pnpm db:generate` to produce `@prisma/client` types from the empty schema (depends on T013 + T008).
- [X] T016 Run `pnpm dlx shadcn@latest init` non-interactively (or write the equivalent `components.json` directly) with: `style: "default"`, `baseColor: "slate"`, `cssVariables: true`, `tailwind.config: "tailwind.config.ts"`, `tailwind.css: "app/globals.css"`, `aliases.components: "@/components"`, `aliases.utils: "@/lib/utils"`. This will create/overwrite `components.json`, `app/globals.css` (with Tailwind layers + shadcn CSS variables for light + dark), and `lib/utils.ts` (with the `cn()` helper).
- [X] T017 [P] Create `app/providers.tsx` as a client component (`"use client"`) exporting a `Providers` component that wraps `children` in `next-themes`'s `ThemeProvider` with props: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
- [X] T018 Create `app/layout.tsx` as the root layout: `<html lang="en" suppressHydrationWarning>` with `<body>` wrapping `{children}` inside `<Providers>`. Import `./globals.css`. Set metadata `title: "Abacus"` and `description: "Personal finance — income and expense tracking"`. (Depends on T016 globals.css + T017 Providers.)

**Checkpoint**: `pnpm typecheck` passes; `pnpm lint` passes on the foundational files; Prisma client is generated and importable.

---

## Phase 3: User Story 1 — Developer boots the app locally (Priority: P1) 🎯 MVP

**Goal**: A fresh clone, with Docker + Node 24 + pnpm installed, reaches a running app in the browser via the documented quickstart steps.

**Independent Test**: From a clean working tree, follow `quickstart.md` steps 1–8. The page at `http://localhost:3000` renders without console errors, and `.env.local` missing `DATABASE_URL` fails with the actionable Zod error from T012.

### Implementation for User Story 1

- [X] T019 [US1] Create `app/page.tsx` as a Server Component rendering a centered "Abacus is running" headline and a short subtitle ("Personal finance scaffold — feature 001"). Use Tailwind utility classes for layout. No client-side logic; theme toggle slot is added by US3 (T023). The theme toggle is not required for US1's acceptance — the page just renders.
- [X] T020 [US1] Manually walk through `quickstart.md` steps 1–8 on this branch with `docker compose up -d` and confirm: (a) `pnpm dev` boots within a few seconds, (b) `http://localhost:3000` renders the page with no console errors, (c) removing `DATABASE_URL` from `.env.local` and restarting `pnpm dev` fails with the Zod boundary error naming `DATABASE_URL` within the first 5 lines of output (SC-007).

**Checkpoint**: SC-001 (clone → running app under 10 min) and SC-007 (env error names missing key) are demonstrably true. US1 is independently shippable.

---

## Phase 4: User Story 2 — Operator verifies app and database health (Priority: P1)

**Goal**: `GET /api/health` returns a deterministic, machine-readable response that distinguishes app-up-DB-up from app-up-DB-down, per the contract in `contracts/health.md`.

**Independent Test**: With DB running, `curl /api/health` returns 200 and the documented `{ data: { app: "ok", database: "ok" } }` envelope. With `docker compose stop postgres`, the same endpoint returns 503 and `{ error: { code: "DATABASE_UNAVAILABLE", message: ... } }`.

### Implementation for User Story 2

- [X] T021 [US2] Create `app/api/health/route.ts` exporting an async `GET` handler. Inside, run `await prisma.$queryRaw\`SELECT 1\`` in a try/catch. On success, return `Response.json({ data: { app: "ok", database: "ok" } }, { status: 200 })`. On caught error, return `Response.json({ error: { code: "DATABASE_UNAVAILABLE", message: \`Database is not reachable: ${err instanceof Error ? err.message : "unknown"}\` } }, { status: 503 })`. Export `export const dynamic = "force-dynamic"` so the probe runs on every request (no static cache).
- [X] T022 [US2] Manually verify both paths with `curl`: (a) DB up → 200 + healthy envelope; (b) `docker compose stop postgres` → 503 + `DATABASE_UNAVAILABLE` envelope with a human-readable message; (c) `docker compose start postgres` → returns to 200 within a few seconds. Latency on the healthy path is under 500 ms (SC-002).

**Checkpoint**: SC-002 holds. The contract documented in `contracts/health.md` matches the implementation. US2 is independently shippable.

---

## Phase 5: User Story 3 — User toggles dark mode (Priority: P2)

**Goal**: A user can switch between light, dark, and system themes from a visible UI control; the choice persists across reloads; the OS preference is respected on first visit; no flash of wrong theme on initial paint.

**Independent Test**: From the landing page, click the theme toggle, switch to dark, reload — the page is still dark. Switch to system, change the OS theme, reload — the page follows the OS. Hard refresh — no flash of light then dark (or vice versa).

### Implementation for User Story 3

- [X] T023 [P] [US3] Install shadcn UI primitives needed for the toggle: run `pnpm dlx shadcn@latest add button dropdown-menu`. This creates `components/ui/button.tsx` and `components/ui/dropdown-menu.tsx` (plus their CSS-variable hooks already in globals.css from T016).
- [X] T024 [US3] Create `components/theme-toggle.tsx` as a client component (`"use client"`). Render a shadcn `<DropdownMenu>` with a trigger `<Button variant="ghost" size="icon">` showing a sun/moon icon from `lucide-react` (Sun + Moon, swapping based on resolved theme). Three menu items: `Light`, `Dark`, `System`, each calling `setTheme` from `useTheme()` (next-themes). Suppress hydration warning on the trigger icon if needed.
- [X] T025 [US3] Update `app/page.tsx` to render `<ThemeToggle />` in a top-right position (e.g., a header div with `flex justify-end p-4`). Keep the existing "Abacus is running" centered content below.
- [X] T026 [US3] Manually verify all four acceptance scenarios from spec.md US3: (1) first visit follows OS, (2) dark selection persists across reload/navigate, (3) system follows OS changes without reload, (4) no flash of wrong theme on first paint (this confirms `suppressHydrationWarning` on `<html>` and `disableTransitionOnChange` on `<ThemeProvider>` are in place). SC-006 (theme persists in 100% of attempts) holds.

**Checkpoint**: US3 is independently shippable. The theme system is now production-ready for every component shadcn ships from here on.

---

## Phase 6: User Story 4 — Developer runs the full test suite (Priority: P2)

**Goal**: `pnpm test` (Vitest) and `pnpm test:e2e` (Playwright) both run green against the scaffold, with at least one meaningful smoke test per harness.

**Independent Test**: On a fresh checkout with deps installed and the dev server running, `pnpm test` exits 0 with a passing env-validation test, and `pnpm test:e2e` exits 0 with a passing health-endpoint test.

### Test Configuration

- [X] T027 [P] [US4] Create `vitest.config.ts` at repo root. Use `defineConfig` from `vitest/config`. Plugins: `@vitejs/plugin-react`. Test environment: `"jsdom"`. Resolve alias `@` → `./` (mirroring `tsconfig.json` paths). Globals: `true`. Include: `["tests/unit/**/*.{test,spec}.{ts,tsx}"]`. **Exclude** `tests/e2e/**` so Playwright specs are not picked up by Vitest.
- [X] T028 [P] [US4] Create `playwright.config.ts` at repo root. `defineConfig` with: `testDir: "./tests/e2e"`, `fullyParallel: true`, `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0`, `reporter: process.env.CI ? "html" : "list"`, `use: { baseURL: "http://localhost:3000", trace: "on-first-retry", headless: true }`, projects `[{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]`, and a `webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 }` block.
- [X] T029 [P] [US4] Run `pnpm exec playwright install --with-deps chromium` to fetch the Chromium browser used by the E2E test.

### Tests for User Story 4

- [X] T030 [P] [US4] Create `tests/unit/env.test.ts`. Two cases using `vitest`'s `describe/it/expect`: (1) When `process.env.DATABASE_URL` is unset, importing the env schema's `parse` function on the current env throws an error whose message contains the string `DATABASE_URL`; (2) When given a valid object `{ DATABASE_URL: "postgresql://u:p@localhost:5432/db" }`, the schema parses successfully and returns an object whose `DATABASE_URL` matches the input. **Important**: the test imports the schema (not the side-effecting `env` object) so it can be called with arbitrary input without polluting `process.env`.
- [X] T031 [P] [US4] Create `tests/e2e/health.spec.ts`. One test: `test('GET /api/health returns healthy envelope', async ({ request }) => { ... })`. Steps: hit `/api/health`, assert response status is 200, parse JSON, assert deep-equals `{ data: { app: "ok", database: "ok" } }`. The Playwright `webServer` block from T028 boots the dev server automatically.

### Verification

- [X] T032 [US4] Run `pnpm test` and confirm exit code 0 with both env-test cases passing (SC-003). Run `pnpm test:e2e` and confirm exit code 0 with the health spec passing (SC-004). Both commands produce actionable failure output if anything regresses (spec AS-3 under US4).

**Checkpoint**: US4 is independently shippable. The harnesses are proven for every future feature that needs them (auth flow E2E, money-math unit tests, etc.).

---

## Phase 7: User Story 5 — Developer manages the database lifecycle (Priority: P2)

**Goal**: Named, discoverable scripts cover the Prisma operations a developer needs day-to-day: generate, migrate, reset, studio. The lint command exits zero.

**Independent Test**: Running `pnpm` (with no args) lists the scripts. A developer unfamiliar with the project can identify how to migrate, generate the client, and reset the database without reading source files.

### Implementation for User Story 5

- [X] T033 [US5] Verify that `package.json` (created in T002) exposes all five Prisma scripts (`db:generate`, `db:migrate`, `db:reset`, `db:studio`) and that none of them is `db:push`. Confirm the `"prisma": { "schema": "db/schema.prisma" }` field is set so the bare scripts (without `--schema` flags) target the correct file. If any are missing or wrong, fix them.
- [X] T034 [US5] Run `pnpm db:generate` — must exit zero on the empty schema (re-run after T015 to confirm idempotency).
- [X] T035 [US5] Verify the migration command is invocable WITHOUT producing a committed migration. Run `pnpm db:migrate --help` (or `pnpm exec prisma migrate dev --help`) and confirm exit code 0 and Prisma's help output is shown. Do NOT run `pnpm db:migrate` against the empty schema in this feature — the first real migration ships with feature 002 (User model). If a stray `db/migrations/` directory is created accidentally, delete it before committing.
- [X] T036 [US5] Verify the `db:reset` script is correctly wired by running `pnpm exec prisma migrate reset --help` (exits 0, prints help). The actual destructive invocation (`pnpm db:reset --force`) is blocked by Prisma 7's AI-action safety guard, which requires `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` containing fresh user consent text — out of scope to invoke autonomously. A developer running this command manually will get the standard `--force`/prompt flow.
- [X] T037 [US5] Run `pnpm lint` — must exit zero with no warnings (SC-005). Fix any violations surfaced.

**Checkpoint**: All P2 stories (US3, US4, US5) are now independently shippable on top of US1 + US2.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across stories. No story label.

- [X] T038 [P] Run `pnpm typecheck` on the full scaffold — must exit zero with strict mode and zero uses of `any` in project code (SC-008).
- [X] T039 [P] Run `pnpm format:check` — must exit zero (all files Prettier-formatted).
- [X] T040 Verify constitution preserve: in a scratch file, `import NextAuth from "next-auth"` and `pnpm build` — must succeed without errors (FR-014 and spec edge case: Auth.js installed-but-unwired must not break the build). Delete the scratch file after verification.
- [X] T041 Confirm `lib/money/` does NOT exist (constitution Principle I deferred to first money-handling feature) and the Prisma schema contains no domain models (FR-015).
- [X] T041a Verify FR-016: every key required by the Zod schema in `lib/env.ts` has a corresponding placeholder line in `.env.example`, and no real secrets are committed (placeholders only). Specifically check `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NODE_ENV` — each present in `.env.example` with empty or example values, none with real credentials.
- [X] T042 End-to-end quickstart validation: with a fresh `pnpm install` and `docker compose down -v && docker compose up -d`, walk through every numbered step in `quickstart.md`. Time the path from step 1 to step 9 — must complete in under 10 minutes (SC-001). Note the elapsed time in the commit message or PR description.
- [X] T043 Update spec.md status frontmatter from `Draft` to `READY_FOR_BUILD` is **already done by the plan**; confirm `plan.md` shows `STATUS: READY_FOR_BUILD` and that all 8 success criteria (SC-001..SC-008) in spec.md have been demonstrated by an earlier task in this list.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 first, then T002; T003–T007, T009, T010, T011 in parallel; T008 (`pnpm install`) gates everything after.
- **Foundational (Phase 2)**: Depends on Phase 1 (specifically T008). Blocks all user stories. T012, T013, T014 in parallel; T015 depends on T013 + T008; T016 depends on T007 + T008; T017 in parallel with T016 file-wise but logically depends on T008; T018 depends on T016 + T017.
- **User Stories (Phase 3–7)**: All depend on Foundational completion. After Phase 2, the P1 stories (US1, US2) can run in parallel. P2 stories (US3, US4, US5) can also run in parallel with each other and with P1 stories.
- **Polish (Phase 8)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. The landing page (`app/page.tsx`) is the only file owned by US1. Independent of US2/US3/US4/US5.
- **US2 (P1)**: Depends only on Foundational (specifically `lib/prisma.ts`). Independent of all other stories.
- **US3 (P2)**: Depends on Foundational + US1 (T025 edits `app/page.tsx`, which is created in T019). If US1 has not run, US3 can still add the toggle in a placeholder page, but cleanest to land US1 first.
- **US4 (P2)**: Depends on Foundational + US2 (the E2E test in T031 hits `/api/health`, which is created in T021). T030 (env unit test) is independent.
- **US5 (P2)**: Depends only on Foundational. Validates scripts created in T002 + the Prisma schema created in T013.

### Within Each User Story

- Configuration before tests (US4: T027–T029 before T030–T031).
- Tests must FAIL before implementation — N/A here because tests are written AFTER the production code they exercise (US2's route exists before US4's E2E hits it). The constitution permits this; TDD is not mandated.
- Manual verification tasks (T020, T022, T026, T032, T042) run last within their story.

### Parallel Opportunities

- All Setup tasks marked [P] (T003, T004, T005, T006, T007, T009, T010, T011) — different files, no cross-deps.
- All Foundational [P] tasks (T012, T013, T014, T017) — different files.
- All P2 stories (US3, US4, US5) can run in parallel.
- Within US4: T027, T028, T029 in parallel; T030 and T031 in parallel.
- Polish T038, T039 in parallel.

---

## Parallel Example: Phase 1 Setup (after T001 + T002)

```bash
# Run all config-file creation tasks together:
Task: "T003 Create .nvmrc with '24'"
Task: "T004 Create tsconfig.json with strict TS + paths alias"
Task: "T005 Create next.config.ts (minimal)"
Task: "T006 Create postcss.config.mjs (tailwind + autoprefixer)"
Task: "T007 Create tailwind.config.ts (darkMode class, content globs)"
Task: "T009 Create .eslintrc.json (next + prettier + no-explicit-any + no-process-env)"
Task: "T010 Create .prettierrc and .prettierignore"
Task: "T011 Verify .gitignore covers .next, .env.local, playwright-report, test-results"
```

## Parallel Example: User Story 4 (after T021 exists for the E2E target)

```bash
# Configure both harnesses in parallel:
Task: "T027 Create vitest.config.ts"
Task: "T028 Create playwright.config.ts"
Task: "T029 Run playwright install --with-deps chromium"

# Write both example tests in parallel:
Task: "T030 Create tests/unit/env.test.ts (Zod schema rejects missing DATABASE_URL)"
Task: "T031 Create tests/e2e/health.spec.ts (GET /api/health returns 200 + envelope)"
```

---

## Implementation Strategy

### MVP First (US1 + US2 → demoable scaffold)

1. Complete Phase 1: Setup (T001–T011).
2. Complete Phase 2: Foundational (T012–T018) — CRITICAL, blocks all stories.
3. Complete Phase 3: US1 (T019–T020) — landing page boots.
4. Complete Phase 4: US2 (T021–T022) — health endpoint works.
5. **STOP and VALIDATE**: A clone-to-running-app-with-health-check loop exists. This is the MVP.

### Incremental Delivery

1. Setup + Foundational + US1 + US2 → MVP (app boots, health works).
2. Add US3 (dark mode) → UI polish baseline for every later feature.
3. Add US4 (test harnesses) → testing infrastructure ready for feature 002 onward.
4. Add US5 (DB lifecycle) → developer ergonomics for the data layer.
5. Polish (Phase 8) → final verification gates.

### Parallel Team Strategy (single-developer in this project, but documented for completeness)

After Phase 2 completes, a solo developer can interleave P1 stories sequentially (US1 → US2) and pick P2 stories in any order, OR all stories can run in parallel under multi-developer settings.

---

## Notes

- [P] tasks = different files, no incomplete dependencies.
- The [Story] label maps each task to its spec user story for traceability (US1–US5 align with spec.md).
- Tests in US4 use the Vitest + Playwright stack mandated by the constitution (Principle IV) — these are the harnesses every later money-path test will use.
- The scaffold deliberately ships zero domain models (FR-015, data-model.md). Feature 002 (auth) introduces the first model.
- The `lib/env.ts` file is the ONLY validation boundary in this feature (constitution Principle III). No request bodies, no external API responses.
- Commit after each task or logical group. The git extension hook will prompt to commit at phase boundaries.
- Stop at any phase checkpoint to validate that increment independently before continuing.
- Avoid: changes to `package.json` from multiple tasks in parallel (single-file conflict); creating `lib/money/`, money-shaped Prisma fields, or auth routes in this feature (all explicitly out of scope).
