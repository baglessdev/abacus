# Data Model — Project Scaffolding

## Domain entities

**None.**

This feature introduces no domain entities. The Prisma schema at `db/schema.prisma` contains only:

- A `datasource db` block pointing at PostgreSQL via `env("DATABASE_URL")`.
- A `generator client` block producing the Prisma JavaScript client.

No `model` declarations exist in this feature. The health endpoint verifies database connectivity by issuing a raw `SELECT 1` query through `prisma.$queryRaw`, not by querying a model.

## Why no placeholder model

Per the spec's locked clarification: introducing a placeholder model just to exercise migrations would commit a throwaway table to the migration history. Feature 002 (authentication) introduces the first real model (`User`) and naturally exercises the migration flow end-to-end at that point.

## Schema (illustrative — not code)

```
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

## Migrations

None in this feature. The `db/migrations/` directory does not exist yet; it is created the first time `pnpm db:migrate` is run in feature 002.

## Indexes and constraints

None — there are no tables.

## What lands next

Feature 002 (authentication) will add:

- `User` model with at least: `id`, `email` (unique), `passwordHash`, `createdAt`, `updatedAt`.
- The first migration in `db/migrations/`.
- Auth.js prisma adapter tables (if the adapter is adopted).

Those are out of scope here and called out only to make the boundary clear.
