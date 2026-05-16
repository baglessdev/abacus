# Feature 004 — Data Model

This feature introduces the **first money-touching domain model** in the Prisma schema. After feature 003 (`User`), the schema contained exactly one model. This feature adds `Account` + `AccountType` and the back-relation `User.accounts`.

## Entities introduced

### `Account`

```prisma
model Account {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String      @db.VarChar(80)
  type            AccountType
  currency        String      @db.Char(3)
  startingBalance Decimal     @db.Decimal(20, 8)
  archivedAt      DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([userId])
  @@index([userId, archivedAt])
}

enum AccountType {
  CHECKING
  SAVINGS
  CREDIT
  CASH
  INVESTMENT
  OTHER
}
```

**Fields.**

| Field | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | `String` (cuid) | primary key | Stable opaque identifier. Used in URLs only as a query parameter target on the same accounts page (no per-account detail route in v1). Cuid for the same reasons as `User.id`: collision-resistant, URL-safe, no enumerable creation order leak. |
| `userId` | `String` | foreign key → `User.id`, `ON DELETE CASCADE` | The owning user. Every read/write helper filters by this column (FR-002, FR-003). Cascade ensures that deleting a user (when that path ever exists) removes their accounts in one referential step. |
| `name` | `String` | `VARCHAR(80)`, non-null | Display label. Trimmed at the Zod boundary; rejected if empty or whitespace-only after trim (FR-004). Not unique per user (intentional — duplicate names are allowed; the spec edge case explicitly covers this). |
| `type` | `AccountType` | enum, non-null | One of six values: `CHECKING`, `SAVINGS`, `CREDIT`, `CASH`, `INVESTMENT`, `OTHER`. Editable at any time on an active account; read-only on archived rows (FR-009a). |
| `currency` | `String` | `CHAR(3)`, non-null | ISO 4217 alpha-3 code, uppercase. Set at creation; **immutable** thereafter (FR-007). Validated against the bundled allow-list at the Zod boundary (FR-005). |
| `startingBalance` | `Decimal` | `NUMERIC(20, 8)`, non-null | The balance at the moment tracking begins. Stored as Postgres `NUMERIC` (never `Float`/`Number`; constitution Principle I). Currency-aware decimal-place rule enforced at the Zod boundary (FR-006). May be negative for `CREDIT` and `OTHER`; rejected when negative for `CHECKING`, `SAVINGS`, `CASH`, `INVESTMENT`. Zero is always valid and is the create form's default. Read-only on archived rows (FR-009a). |
| `archivedAt` | `DateTime?` | nullable | Soft-delete column. `NULL` means active; non-null timestamp means archived (FR-008). Toggling it via `archiveAccount` / `unarchiveAccount` is reversible an arbitrary number of times. No hard delete is ever exposed by this feature. |
| `createdAt` | `DateTime` | `@default(now())` | Stored UTC. Not surfaced in the v1 UI (the secondary-line "created on…" hint mentioned in the spec is optional). |
| `updatedAt` | `DateTime` | `@updatedAt` | Stored UTC. Bumped automatically by Prisma on every update. |

**Indexes.**

| Index | Reason |
|---|---|
| `@@index([userId])` | The hot path: every read filters by `userId`. List, find-by-id, archive, unarchive all start here. Without this index, every query degrades to a sequential scan. |
| `@@index([userId, archivedAt])` | The list query is `where: { userId, archivedAt: null }` (or `where: { userId }` when "Show archived" is on). The composite index lets PG satisfy both shapes with one B-tree. |

**No additional uniqueness constraint.** Names are not unique per user (spec edge case). The only natural-key uniqueness is the implicit `(id)` primary key.

### Update to `User`

The same migration adds the inbound back-relation:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  accounts     Account[]  // NEW — back-relation from feature 004
}
```

This is a schema-only change. Prisma does not emit SQL for back-relations; the relation table is `Account` itself (with the `userId` FK declared on `Account` above).

## Identifier choice — why `cuid()`

Same trade-off matrix as `User.id`. Cuid wins for the same reasons: opaque, sortable, URL-safe, no `uuid-ossp` extension, no leakage of creation order. Auto-increment is rejected for the same enumerable-IDs reason.

## Currency handling

- **Storage shape.** `CHAR(3)` (fixed-width three characters, always uppercase). PG's CHAR pads to width on read, which costs nothing here because every value is exactly 3 chars by construction.
- **Validation.** `currency.toUpperCase()` at the Zod boundary, then membership check against `CURRENCY_CODES` (the Set built from `lib/money/currencies.ts`'s `CURRENCIES` array). See `research.md` R3 / R4.
- **Immutability.** The `updateAccount` Zod schema does not include a `currency` field. Any payload that includes a `currency` key is silently dropped at parse time (`.strip()` semantics on the Zod object). The pre-existing `currency` value is preserved by the Prisma update. FR-007 is therefore enforced at the schema shape, not at the action body.

## Starting balance handling

- **Storage shape.** `NUMERIC(20, 8)`. See `research.md` R18 for the precision/scale rationale.
- **Wire shape.** Always a `string` over the React-server-component boundary (research.md R2). Server actions accept `startingBalance: string` from `FormData.get("startingBalance")` and pass it to Zod, which uses `Money` (`Prisma.Decimal`) to parse + validate.
- **Default at creation.** `"0"` is the create form's pre-filled default; valid for every account type.
- **Validation order.** (1) Zod parses to a `Money`; (2) `validateStartingBalance` checks decimal-place count against the currency record AND the sign against the type. Both failures attach to the `startingBalance` field path. See contracts/`createAccount.md` for the exact path.

## Archive semantics

- **Set archived.** `archiveAccount(accountId)` updates `archivedAt: new Date()` for the row owned by the current session's user. The DB write is a single UPDATE; no other column changes.
- **Clear archived.** `unarchiveAccount(accountId)` updates `archivedAt: null` for the row owned by the current session's user. Same shape.
- **List filter.** The default list query is `where: { userId, archivedAt: null }`. With "Show archived" enabled, the filter becomes `where: { userId }`.
- **Edit while archived.** The `updateAccount` Zod schema branches on the row's current `archivedAt` value (fetched by the action before the Zod parse). When `archivedAt` is non-null, the schema accepts ONLY `name`; any other field present in the payload triggers `archived_field_locked` (FR-009a). When `archivedAt` is null, the schema accepts `name`, `type`, `startingBalance`.

## Relationships

- `User` 1 — N `Account`. Cascade-on-delete from user side (when a user-deletion path lands, every owned account row is deleted with the user).
- `Account` has no outbound relations in this feature. Future features will add:
  - `Transaction` (feature 006) → `accountId` FK referencing `Account.id`.
  - `Budget` (later) → may reference accounts; deferred design.

## Data lifecycle

| Operation | Path | Notes |
|---|---|---|
| Create | `createAccount` server action | Session-scoped (`userId` from `await auth()`). Validates at Zod boundary. Inserts one row with `archivedAt = NULL`. |
| Read (list) | `listAccounts` server action | Session-scoped. `where: { userId, archivedAt: null }` by default; relaxes the `archivedAt` filter when "Show archived" is on. |
| Read (one) | `getAccountForUser` (internal helper, not a public action) | Session-scoped. `where: { id, userId }`. Returns `null` on miss; the action surfaces this as `not_found` (FR-013). |
| Update | `updateAccount` server action | Session-scoped. Pre-fetches the row to determine `archivedAt` (drives schema branch); rejects `archived_field_locked` if the payload attempts to mutate `type` or `startingBalance` on an archived row. |
| Archive | `archiveAccount` server action | Session-scoped. Sets `archivedAt = now()`. Idempotent (no-op if already archived; still returns success). |
| Unarchive | `unarchiveAccount` server action | Session-scoped. Sets `archivedAt = null`. Idempotent. |
| Hard delete | not exposed | No product surface. Direct DB DELETE is technically possible but not part of this feature (FR-008, FR-023). |

## Migration

The migration is generated via:

```bash
pnpm db:migrate -- --name add_account
```

Lands at:

```text
db/migrations/<timestamp>_add_account/
└── migration.sql
```

The SQL creates:

1. `AccountType` enum.
2. `Account` table with all columns and PK on `id`.
3. Two indexes: `Account_userId_idx`, `Account_userId_archivedAt_idx`.
4. Foreign-key constraint on `Account.userId` → `User.id` with `ON DELETE CASCADE`.

Prisma emits this as a single SQL file containing the four DDL statements. The committed file is the audit trail; `db push` is forbidden against committed code (constitution Conventions).

## Data-scoping enforcement (constitution v0.2.0)

This feature is the **first to actually exercise** the forward-looking data-scoping rule documented in feature 003's `data-model.md`. The implementation rules:

1. Every Prisma call against `account` goes through `lib/accounts/queries.ts`. No `prisma.account.*` reference exists anywhere else in the codebase.
2. Every helper in `lib/accounts/queries.ts` takes `userId: string` as the first parameter.
3. Every server action calls `await auth()` first and passes `session.user.id` (NEVER a value from request input) to the helper.
4. The query `where:` clause is **always** `{ id, userId }` for find-by-id and `{ userId, …rest }` for finds. There is no escape hatch — no admin path, no aggregation surface that crosses users, no `findFirst` without `userId`.

Cross-user attempts ("read account 'X' belonging to user 'Y' while signed in as user 'Z'") are indistinguishable from "account 'X' does not exist" because the same `where: { id, userId }` returns `null` in both cases. The action then returns the same `not_found` envelope. SC-008 is met by construction.
