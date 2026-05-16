# Feature 003 — Data Model (Revised)

This feature introduces the **first real domain model** in the Prisma schema. Prior features (001 scaffolding, 002 shell) deliberately kept `db/schema.prisma` empty of models.

**Revision note (constitution v0.2.0).** The schema is unchanged from the original feature 003 plan. The only meaningful update on this document is the new "Forward-looking data-scoping rule" section at the bottom, which records the binding contract every feature from 004 onward inherits.

## Entities introduced

### `User`

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Fields.**

| Field | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | `String` (cuid) | primary key | Stable identifier carried on the JWT as the `sub` claim and exposed to downstream features as `session.user.id`. The foreign-key target for every domain row created in feature 004+. |
| `email` | `String` | `@unique` | Login identifier. Normalized to lowercase at the Zod boundary (`lib/auth/schemas.ts`) before any DB write or read. The `UNIQUE` constraint is the **sole** defense against duplicate accounts after the revision; the single-user gate is removed (FR-012). |
| `passwordHash` | `String` | non-null | Full Argon2id-encoded string (`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`). The parameters are embedded in the string so future parameter tuning is backward-compatible with previously-stored hashes. |
| `createdAt` | `DateTime` | `@default(now())` | Stored UTC per constitution convention. Not surfaced in UI in this feature. |
| `updatedAt` | `DateTime` | `@updatedAt` | Stored UTC. Bumped on any update (in this feature there are no update paths; the column exists for future password-change / email-change features). |

**No other fields.** Resolved deferred item — minimum-only schema. Future features may land `name`, `lastLoginAt`, `image`, etc. via their own migrations rather than carrying dead columns from day one.

## Identifier choice — why `cuid()`

| Option | Pro | Con | Verdict |
|---|---|---|---|
| `cuid()` | Collision-resistant, URL-safe, sortable by creation time, shorter than UUID v4, no extension required. | Not a standard. | **Chosen.** The Prisma defaults make this trivial; the value never needs to be human-typed in this feature. |
| `uuid()` | Standardized (RFC 4122). | Slightly longer; not natively sortable. | Rejected — no interop need with external systems in this feature. |
| `Int @id @default(autoincrement())` | Compact; trivially sortable. | Leaks creation order; trivially enumerable in URLs (future features may put `userId` in paths). | Rejected — opacity is cheap insurance. |

## Email handling

- **Normalization.** Lowercased at the Zod boundary, not in the database. Postgres's collation handles the `@unique` lookup correctly because both signup and login write/read the already-lowercased form. We considered adding a Postgres `CITEXT` extension or a functional index on `LOWER(email)` and rejected both — normalization at the application boundary is the simpler invariant and keeps the schema portable.
- **Validation.** `z.string().email().toLowerCase()` at both signup and login. No additional regex.
- **No verification.** Email is purely an identifier in this feature (FR-021). No `emailVerified`, no `VerificationToken` table, no transactional email.

## No `PrismaAdapter` tables

Locked clarification: **JWT-only session strategy**. Auth.js's `PrismaAdapter` is **not** wired up. The schema after this feature contains exactly one new model (`User`) — no `Session`, no `Account`, no `VerificationToken`.

The constitution's data-scoping convention (see below) does not require the adapter to be added later; the `User.id` is the canonical handle on every JWT, and that is the only handle every future row needs to reference.

## JWT payload contract

The JWT cookie minted by Auth.js v5 with `session: { strategy: "jwt" }` carries (after our `jwt` callback runs):

| Claim | Source | Type | Purpose |
|---|---|---|---|
| `sub` | `User.id` | `string` (cuid) | OIDC-standard subject claim; the canonical user-id handle. |
| `email` | `User.email` | `string` (lowercased) | Convenience claim so the shell header's user-menu trigger can show the email without a DB read. |
| `iat`, `exp`, `jti` | Auth.js defaults | — | Standard JWT lifecycle claims; not consumed by application code. |

The `session` callback projects `sub` to `session.user.id` and `email` to `session.user.email`. Module augmentation in `lib/auth/index.ts` types both as non-optional `string`, so downstream features that have already passed the middleware gate can read them without narrowing.

## Migrations

This feature lands the **first real migration** in `db/migrations/`:

```text
db/migrations/<timestamp>_add_user/
└── migration.sql
```

Generated via `pnpm db:migrate -- --name add_user`. The constitution forbids `db push` against committed code (Conventions). The migration creates the `User` table with the columns above plus the unique index on `email`. **The migration is already generated and applied on branch `003-auth`** — the revision does not modify it.

## Relationships

**None** in this feature. `User` has no foreign keys outbound, and no other table has a foreign key inbound. Future features (Accounts, Transactions, Budgets, Categories) will add `userId` foreign keys referencing `User.id` per the rule below.

## Data lifecycle

- **Create.** On any signup that survives Zod validation and the Postgres `@unique` constraint. Any visitor can create an account; there is no first-user gate, no single-user gate, no admin onboarding.
- **Read.** Two paths: (a) `getUserByEmail(email)` during login's `authorize()` callback; (b) `auth()` decodes the JWT for downstream features.
- **Update.** None in this feature. Future password-change / email-change features will own update paths.
- **Delete.** None in this feature. No account-deletion UI (FR-026). Direct database truncation is supported for local development.

---

## Forward-looking data-scoping rule (constitution v0.2.0)

> Every domain row is owned by a `userId`. Every query MUST filter by the session's user.

This rule binds every feature from 004 onward. This feature introduces no domain row besides `User`, so there is no scoping work to do *here* — but the contract is documented here because the next architect needs it to be unambiguous.

### What the rule means in schema

Every future model that represents user-owned data (accounts, transactions, budgets, categories, recurring transactions, etc.) MUST:

1. Carry a `userId String` field.
2. Declare the relation `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` (or another delete behavior chosen with explicit justification).
3. Include `userId` in any index that the row is most often queried by — e.g., `@@index([userId, createdAt])` for transactions, `@@index([userId, name])` for accounts, etc.

The matching back-relation on `User` is added in the same migration: `accounts Account[]`, `transactions Transaction[]`, etc.

### What the rule means in queries

Every query against a user-owned table MUST filter by `userId: session.user.id`. There is no shared/global product data; there is no admin escape hatch in product code (any future admin tooling lives behind its own role-gated surface that does not exist in this codebase yet).

In practice this means every query of the shape `prisma.<entity>.findMany(...)` or `prisma.<entity>.findUnique(...)` includes `where: { userId, ...rest }`. Aggregations (`groupBy`, `count`, `aggregate`) include the same scope.

A future helper (likely `lib/auth/session-user.ts` or similar) may centralize the `await auth()` → `session.user.id` extraction so that every query receives the user-id from a single source of truth. This feature does not ship that helper because there are no queries to scope yet; it lands with feature 004.

### What the rule does NOT mean

- No team / organization / workspace model. Multi-user means many independent single-tenant users, NOT shared workspaces. There is no plan to add a `Team`, `Organization`, `Workspace`, or `Membership` model.
- No row-level security (RLS) inside Postgres for now. The constitution requires application-level enforcement at the query layer; database-level RLS is a future hardening step, not a feature 003 deliverable.
- No "system" user that owns shared data. Every row has exactly one owner — a real user.
- No user-to-user data sharing. No "share transaction X with user Y" surface anywhere on the roadmap.

### Reference for the next architect

When designing feature 004 (Accounts), the schema additions look approximately like:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  accounts Account[]   // back-relation added when feature 004 lands
}

model Account {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // … domain fields …
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

And every server-side query for an Account starts with `where: { userId: session.user.id }`. No exceptions; no global catalog.
