# Quickstart — Abacus

From `git clone` to a running app in your browser in **under 10 minutes** (Success Criterion SC-001).

## Prerequisites

Installed and on your `PATH` before starting:

- **Docker** (with `docker compose` v2)
- **Node.js 24 LTS** (use `nvm install` or `fnm install` to read `.nvmrc`)
- **pnpm** (`npm i -g pnpm` or via Corepack)

If any of the above is missing, install it first — these are out of scope for this feature.

## Steps

### 1. Clone and enter the repo

```sh
git clone <repo-url> abacus
cd abacus
```

### 2. Select Node 24

```sh
nvm use   # or: fnm use
```

**Verify**: `node -v` prints a `v24.x` line.

### 3. Start the database

```sh
docker compose up -d
```

**Verify**: `docker compose ps` shows the `abacus-postgres` container as `healthy`. (The healthcheck in `docker-compose.yml` runs `pg_isready` every 5 seconds.)

### 4. Install dependencies

```sh
pnpm install
```

**Verify**: the `node_modules/` directory exists and contains `next`, `@prisma/client`, and `vitest`.

### 5. Create your local env file

```sh
cp .env.example .env.local
```

**Verify**: `.env.local` exists and contains `DATABASE_URL=...`. No edits are required for default local development — the values in `.env.example` already point at the docker-compose Postgres.

### 6. Generate the Prisma client

```sh
pnpm db:generate
```

**Verify**: no errors. (No migrations exist yet in this feature, so there is nothing to apply. `pnpm db:migrate` is for feature 002 onward.)

### 7. Run the dev server

```sh
pnpm dev
```

**Verify**: the terminal prints `Local: http://localhost:3000` within a few seconds.

### 8. Open the app

Open <http://localhost:3000> in a browser.

**Verify**:
- The page renders without console errors.
- The "Abacus is running" headline is visible.

> Note: the theme toggle is added by feature 001 **User Story 3**. Once US3 ships, also verify: a theme toggle is visible, and toggling light/dark/system updates the page immediately and persists across reloads. The US1 acceptance test does not require the toggle to exist.

### 9. Check the health endpoint

```sh
curl -s http://localhost:3000/api/health | jq
```

**Verify**: output is exactly the documented envelope:

```json
{
  "data": {
    "app": "ok",
    "database": "ok"
  }
}
```

HTTP status is `200`. To confirm: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health` → `200`.

### 10. Run the tests

```sh
pnpm test          # Vitest unit tests
pnpm test:e2e      # Playwright E2E tests (dev server must be running)
```

**Verify**: both commands exit zero with at least one passing test each.

---

## Verifying the unhealthy path (optional, takes ~30s)

To prove the 503 envelope is wired correctly:

```sh
docker compose stop postgres
curl -s -o /dev/stdout -w "\nHTTP %{http_code}\n" http://localhost:3000/api/health
```

Expected:

```json
{ "error": { "code": "DATABASE_UNAVAILABLE", "message": "Database is not reachable: ..." } }
HTTP 503
```

Restart the DB:

```sh
docker compose start postgres
```

---

## Common scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check (does not modify files) |
| `pnpm typecheck` | TypeScript strict check |
| `pnpm test` | Vitest unit tests (one-shot) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Create + apply a dev migration (no-op in this feature; lands in feature 002) |
| `pnpm db:reset` | Drop + re-apply migrations + seed |
| `pnpm db:studio` | Open Prisma Studio |

---

## Troubleshooting

- **`error: required environment variable DATABASE_URL is missing`** on `pnpm dev`: you skipped step 5. `cp .env.example .env.local`.
- **`Error: P1001: Can't reach database server`**: the Postgres container isn't running. `docker compose up -d` and wait for `healthy`.
- **`HTTP 503` from `/api/health`** with a healthy DB: check `docker compose ps` — the container may have stopped. Restart it: `docker compose start postgres`.
- **Playwright fails with `connect ECONNREFUSED 127.0.0.1:3000`**: the dev server is not running. Either start `pnpm dev` in a separate terminal or rely on the `webServer` block in `playwright.config.ts` to auto-start it (which it does by default).
- **FOUC (flash of wrong theme) on first paint**: indicates `suppressHydrationWarning` is missing from `<html>` in `app/layout.tsx`, or the `next-themes` provider is not the outermost client wrapper. See `app/layout.tsx` and `app/providers.tsx`.
