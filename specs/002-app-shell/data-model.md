# Data Model — App Shell

## Domain entities

**None.**

This feature introduces no domain entities. The Prisma schema at `db/schema.prisma` remains untouched — it still contains only the `datasource db` block (PostgreSQL via `env("DATABASE_URL")`) and the `generator client` block (Prisma JavaScript client) that feature 001 left in place. No `model` declarations are added.

## Why no model lands here

Per FR-027 (locked clarification in `spec.md`): "The feature MUST NOT introduce any domain data models. The Prisma schema MUST remain empty of domain models. The first real model arrives with feature 003."

The shell is pure UI chrome. It renders for any visitor (FR-026), persists no user choice that requires a database, and reads no data. The empty-state messages are static copy. Theme preference is persisted by `next-themes` in `localStorage` — not in Postgres.

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

(Identical to feature 001. No diff.)

## Migrations

**None in this feature.** No `db/migrations/` directory is created. `pnpm db:migrate` remains a no-op (the script is wired but has nothing to apply).

## Indexes and constraints

None — there are no tables.

## What lands next

Feature 003 (authentication, deferred from the original feature 002 slot) will add:

- A `User` model with at least: `id`, `email` (unique), `passwordHash`, `createdAt`, `updatedAt`.
- The first migration in `db/migrations/`.
- Auth.js adapter tables if the Prisma adapter is selected.

Those are out of scope here and called out only to make the boundary clear.

## Money & currency

**N/A.** No `Decimal` field is introduced (FR-028). The `lib/money/` folder continues to not exist. The first feature that displays a monetary amount will introduce both `lib/money/` helpers and the first `Decimal`-typed Prisma field with a paired ISO 4217 currency code, per the constitution's Principle I.
