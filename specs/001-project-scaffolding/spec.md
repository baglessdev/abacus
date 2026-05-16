# Feature Specification: Project Scaffolding

**Feature Branch**: `001-project-scaffolding`

**Created**: 2026-05-16

**Status**: Draft

**Input**: Initialize the Abacus codebase so subsequent features (auth, accounts, transactions) have a working foundation: Next.js + Prisma + shadcn/ui + Vitest + Playwright per the constitution, a base folder structure, a health check endpoint that verifies app + DB connectivity, a dark-mode toggle, dev scripts, and the Auth.js dependency installed (configuration deferred to feature 002).

## Why

Abacus has a constitution and infrastructure scaffolding (docker-compose, .env template) but no application code. Before any product feature can be built, the project needs a runnable baseline: a Next.js app that boots, a typed connection to PostgreSQL through Prisma, the UI primitive system (shadcn/ui + Tailwind + dark mode) in place, and the testing harnesses (Vitest + Playwright) wired up. This feature delivers that baseline so future features (starting with authentication in 002) can land as isolated, testable slices instead of dragging tooling decisions along with them.

## Clarifications

### Session 2026-05-16

- Q: When the database is unreachable, which response envelope should the health endpoint return? → A: Strict constitution alignment — healthy responses return `{ data }` with HTTP 200; unhealthy responses return `{ error: { code, message } }` with a non-success HTTP status (e.g., 503). Component identification is carried in `error.code` (e.g., `DATABASE_UNAVAILABLE`).
- Q: Should this feature ship a placeholder Prisma model to exercise migrations end-to-end, or an empty schema with a raw connectivity probe? → A: Empty schema. The health check verifies the database via a raw `SELECT 1` query through the Prisma client. Feature 002 (auth) will introduce the first real model and exercise the migration flow naturally.
- Q: What lint and format tooling should this feature install? → A: ESLint with the Next.js default configuration plus Prettier. (Biome and other alternatives are not adopted in this feature.)
- Q: What is the default theme on a user's first visit? → A: System (follow the operating system preference). Light and dark remain explicit options in the toggle.
- Q: Should the project pin a Node.js version? → A: Yes. Pin Node 24 LTS (Active LTS as of 2026-05-16) via both `.nvmrc` and the `engines` field in the package manifest. (Corrected from initial Node 22 recommendation — Node 24 is the current Active LTS; Node 22 is Maintenance LTS.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer boots the app locally (Priority: P1)

As a developer, I can clone the repo, follow a small set of documented steps (start the database container, install dependencies, copy the env template, run the dev command), and reach a working app in the browser. The default landing surface confirms the app is alive and connected to the database.

**Why this priority**: Without a runnable app, no other work can proceed. Every subsequent feature depends on this loop working.

**Independent Test**: Fresh clone on a clean machine: starting the database, installing dependencies, copying the env template, and running the dev command results in a reachable app in the browser within a few minutes, with no manual code edits required.

**Acceptance Scenarios**:

1. **Given** a fresh clone with Docker running, **When** the developer starts the database container, installs dependencies, copies `.env.example` to `.env.local`, and runs the dev command, **Then** the app is reachable in the browser without error.
2. **Given** the app is running, **When** the developer opens the root URL, **Then** the page renders without console errors and confirms the app is alive.
3. **Given** the `.env.local` file is missing required keys, **When** the app starts, **Then** startup fails with a clear, human-readable message naming the missing key(s) rather than a stack trace deep in the framework.

---

### User Story 2 - Operator verifies app and database health (Priority: P1)

As a developer or operator, I can hit a single health-check endpoint and get back a deterministic, machine-readable answer about whether the app is up AND whether the database is reachable. This is the canary that tells me the scaffold is intact.

**Why this priority**: A health endpoint is required to verify the scaffold works end-to-end (app + DB) and becomes the foundation for future readiness/liveness checks in deployment.

**Independent Test**: With the database container running, the health endpoint returns a healthy response. With the database container stopped, the same endpoint returns an unhealthy response that distinguishes "DB down" from "app down" — both observable without reading logs.

**Acceptance Scenarios**:

1. **Given** the app and database are both up, **When** the health endpoint is called, **Then** the response status indicates success and the body reports both the app and the database as healthy.
2. **Given** the app is up but the database is unreachable, **When** the health endpoint is called, **Then** the response status indicates failure and the body identifies the database as the unhealthy component.
3. **Given** the health endpoint is called repeatedly, **When** the database is healthy, **Then** each response returns within a small, predictable time budget (sub-second on local dev) and does not depend on caching to do so.

---

### User Story 3 - User toggles dark mode (Priority: P2)

As a user, I can switch between light, dark, and system-default themes from a visible control in the UI, and my choice persists across page reloads and navigations.

**Why this priority**: Dark mode is a baseline UX expectation and exercises the shadcn/ui theming pipeline end-to-end. Landing it during scaffolding means every future component is built against a working theme system rather than retrofitted.

**Independent Test**: A user can find the theme toggle, switch modes, reload the page, and see the chosen mode persist. The system-default option follows the OS preference when changed.

**Acceptance Scenarios**:

1. **Given** the app is loaded for the first time, **When** the user opens the page, **Then** the theme respects the operating system preference by default.
2. **Given** the user selects "dark" from the theme toggle, **When** the user navigates to another route or reloads, **Then** the dark theme remains active.
3. **Given** the user selects "system", **When** the operating system theme changes, **Then** the app theme follows the change without a manual reload.
4. **Given** any theme is active, **When** the page first paints, **Then** there is no visible flash of the wrong theme.

---

### User Story 4 - Developer runs the full test suite (Priority: P2)

As a developer, I can run a single command for unit tests (Vitest) and another for end-to-end tests (Playwright), and both run green against the scaffold out of the box. The scaffold ships with at least one example test per harness so the wiring is provably correct.

**Why this priority**: Tests for the money paths are a constitutional requirement (Principle IV). The harnesses must be working before there's anything to test, otherwise testing gets deferred indefinitely.

**Independent Test**: Running the unit test command and the e2e test command on a fresh checkout (with the dev server up for e2e) both exit zero and report passing example tests.

**Acceptance Scenarios**:

1. **Given** dependencies are installed, **When** the developer runs the unit test command, **Then** Vitest executes and reports at least one passing example test.
2. **Given** the app is running locally, **When** the developer runs the e2e test command, **Then** Playwright executes and reports at least one passing example test (e.g., the health endpoint responds, or the home page loads).
3. **Given** any test fails, **When** the developer reads the output, **Then** the failure message is actionable (file, line, expected vs. actual) without extra configuration.

---

### User Story 5 - Developer manages the database lifecycle (Priority: P2)

As a developer, I have short, named commands for the common Prisma operations needed during development: generating the client, creating/applying migrations, and resetting the dev database. The commands are discoverable from a single place (the project's script manifest).

**Why this priority**: Prisma is the single source of truth for the data model (Principle II). Standardizing these commands now prevents drift and prevents accidental `db push` against committed code, which the constitution forbids.

**Independent Test**: A developer unfamiliar with the project can list the available scripts and identify how to apply migrations, generate the client, and reset the local database, without reading source files.

**Acceptance Scenarios**:

1. **Given** a fresh database, **When** the developer runs the migrate command, **Then** the schema (even if empty/minimal at this stage) is applied successfully.
2. **Given** the developer runs the script listing command, **When** the output is shown, **Then** dev, build, lint, unit test, e2e test, and database commands are all named and visible.
3. **Given** the developer runs the lint command, **When** the codebase has no violations, **Then** the command exits zero.

---

### Edge Cases

- The health endpoint is called before the database container has finished initializing (cold start race) — the response must report DB unhealthy, not hang or 500 with a cryptic stack trace.
- A required environment variable is malformed (e.g., `DATABASE_URL` present but unparseable) — startup must fail with a message naming the offending variable, not silently fall back to defaults.
- The user has JavaScript disabled — the dark-mode toggle is interactive only with JS, but the initial render must still be readable (no broken layout, theme defaults to a sensible value).
- A developer runs Playwright without the dev server running — the failure mode must be a clear "server not reachable" message, not a timeout with no context.
- Auth.js is installed as a dependency but unconfigured — importing it must not break the build, and no auth-related routes/middleware are wired up yet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST be initialized as a Next.js application using the App Router with React 19 and TypeScript in strict mode, per the constitution's stack.
- **FR-002**: The project MUST use pnpm as its package manager and commit a lockfile.
- **FR-003**: The project MUST include Prisma configured to target a PostgreSQL database whose connection string is read from an environment variable validated at startup.
- **FR-004**: The project MUST establish the constitution's prescribed folder layout: routes folder, business-logic folder, components folder, database/schema folder, and tests folder.
- **FR-005**: The project MUST expose a single health-check endpoint that, when the app and database are both healthy, returns HTTP 200 with a `{ data }` envelope reporting per-component status (at minimum `app` and `database`), per the constitution's API response shape.
- **FR-006**: When the database is unreachable, the health-check endpoint MUST return a non-success HTTP status (503) with an `{ error: { code, message } }` envelope. The `code` MUST identify the failing component (e.g., `DATABASE_UNAVAILABLE`) and the `message` MUST be human-readable.
- **FR-006a**: The health-check endpoint MUST verify database connectivity by issuing a raw `SELECT 1` query through the Prisma client; no domain model is introduced for this check.
- **FR-007**: The project MUST integrate Tailwind CSS and shadcn/ui such that shadcn components can be added and themed without further configuration.
- **FR-008**: The project MUST provide a user-facing dark-mode toggle offering exactly three options (light, dark, system) with the user's choice persisting across reloads and navigations. On a first visit (no prior selection), the default theme MUST be `system`.
- **FR-009**: The application MUST avoid a flash of unstyled or wrong-theme content on initial paint.
- **FR-010**: The project MUST configure Vitest for unit testing and ship at least one passing example test.
- **FR-011**: The project MUST configure Playwright for end-to-end testing and ship at least one passing example test that exercises the running app.
- **FR-012**: The project MUST expose, in its script manifest, named commands for at minimum: starting the dev server, producing a production build, running unit tests, running e2e tests, linting, and the common Prisma operations (generate, migrate, reset).
- **FR-013**: The project MUST validate required environment variables at startup using Zod and fail fast with a human-readable error when any required key is missing or malformed, per the constitution's boundary-validation principle.
- **FR-014**: The project MUST install Auth.js (NextAuth) as a dependency but MUST NOT wire up any authentication routes, middleware, providers, session handling, or UI in this feature. Configuration is feature 002.
- **FR-015**: The project MUST NOT introduce any monetary amount handling, transaction logic, or domain data models in this feature. The Prisma schema MUST be empty of domain models; database connectivity is proven by the health endpoint's raw `SELECT 1` probe rather than by introducing a placeholder model.
- **FR-016**: The project MUST document, in the env template, every required environment variable with placeholders only — no secrets committed.
- **FR-017**: The project MUST configure TypeScript such that `any` is disallowed and strict mode is on, consistent with constitution Principle II.
- **FR-018**: The project MUST configure ESLint using the Next.js default configuration and MUST configure Prettier for formatting. Lint and format both MUST be runnable via named scripts in the package manifest and MUST exit zero on the scaffold.
- **FR-019**: The project MUST pin a Node.js runtime version. Node 24 LTS MUST be declared via both an `.nvmrc` file and the `engines.node` field in the package manifest. The dev and build scripts MUST refuse to run under an incompatible Node version (either via `engines` enforcement or an equivalent startup check).

### Key Entities

This feature introduces no domain entities. The Prisma schema is empty in this feature; database connectivity is verified by the health endpoint's raw `SELECT 1` probe. All real domain modeling (users, accounts, transactions, categories) is deferred to later features, starting with the User model in feature 002.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with Docker, Node.js, and pnpm installed can go from `git clone` to a running app in the browser in under 10 minutes, following only the documented setup steps.
- **SC-002**: The health-check endpoint responds in under 500ms on local dev when the database is healthy.
- **SC-003**: Running the unit test command on a fresh checkout exits zero with at least one passing test.
- **SC-004**: Running the e2e test command against the running dev server exits zero with at least one passing test.
- **SC-005**: Running the lint command on the scaffold exits zero with no warnings.
- **SC-006**: Toggling between light, dark, and system themes and reloading the page preserves the chosen theme in 100% of attempts.
- **SC-007**: Starting the app with a required environment variable missing produces an error message that names the missing variable within the first 5 lines of output.
- **SC-008**: A type-check of the scaffold passes with strict mode enabled and zero uses of `any` in project code.

## Assumptions

- The developer's local environment has Docker, Node.js (version compatible with Next.js 15 / React 19), and pnpm installed before starting setup. Installing these prerequisites is out of scope.
- PostgreSQL 16 is provisioned via the existing `docker-compose.yml` for local development.
- The existing `.env.example` is the canonical source of required environment variables and will be extended as needed by this feature.
- No production deployment target is being configured in this feature; everything is optimized for local development first.
- The "single user first, multi-user ready" stance from the constitution does not require any user model in this feature — that arrives with auth in feature 002.
- shadcn/ui is consumed via its standard "copy components into the repo" pattern, not as a versioned npm package.

## Out of Scope

- **Authentication configuration** — Auth.js is installed but unconfigured; signup, login, sessions, password hashing, and protected routes are feature 002.
- **Domain models** — no accounts, transactions, categories, budgets, or recurring transactions in this feature.
- **Money helpers** — `lib/money/` is not created here; it lands with the first feature that handles monetary values.
- **CI/CD pipelines** — no GitHub Actions, no deploy configuration. Local dev only.
- **Production database, hosting, or domain setup** — local docker-compose Postgres only.
- **Internationalization, localization, timezone handling beyond UTC defaults** — deferred.
- **Email, notifications, background jobs, CSV export** — deferred.
- **Observability stack (logs, metrics, traces)** — beyond the health endpoint, no telemetry tooling here.

## Deferred Clarifications

The following questions were raised during specification but deferred. They are planning-level details that do not block this spec from advancing and can be decided during `/speckit-plan`.

1. **Health endpoint authentication posture for the future** — the endpoint is public in this feature (auth does not exist yet). Whether to gate it behind a header, allowlist, or rate limit once auth lands is a feature-002+ decision.
2. **Playwright CI-readiness** — out-of-scope explicitly excludes CI in this feature, but plan-level choices (headless mode default, reporter selection, projects/browsers matrix) should be made during planning.
3. **Example test depth** — whether the Vitest and Playwright example tests are trivial assertions or meaningful smoke tests (env-validation boundary, health endpoint contract) is a plan-level decision; the spec only requires "at least one passing example test per harness".
