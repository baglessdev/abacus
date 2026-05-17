# Feature 007 — Data Model

This feature introduces the **third domain entity** in the Prisma schema (the first was `Account` in feature 004; the second was `Category` in feature 006). It is the **first feature to add a `Decimal` column to a domain entity other than `Account`** — the ledger row that turns the `lib/money/` boundary from a single-write surface into a working arithmetic surface.

After this migration lands, the schema contains four models: `User`, `Account`, `Category`, `Transaction`. `Transaction` is the first model to:

- Carry a `Decimal` column whose **sign is load-bearing** (positive = INCOME, negative = EXPENSE, signed pair = TRANSFER per the 2026-05-17 clarification).
- Use a **calendar-day-only `date` column** (`@db.Date`) distinct from the audit `createdAt` / `updatedAt`.
- Carry a **soft pairing key** (`transferGroupId`) that turns two rows into one atomic conceptual unit.
- Carry **denormalized `currency`** that MUST equal its parent `Account.currency` at the boundary on every write (FR-007).
- Carry FKs to **three** parent models (`User`, `Account`, `Category`) with three different on-delete semantics (Cascade, Restrict, Restrict).

## Entities introduced

### `Transaction`

```prisma
model Transaction {
  id              String          @id @default(cuid())
  userId          String
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId       String
  account         Account         @relation(fields: [accountId], references: [id], onDelete: Restrict)
  categoryId      String?
  category        Category?       @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  date            DateTime        @db.Date
  amount          Decimal         @db.Decimal(20, 8)
  currency        String          @db.Char(3)
  type            TransactionType
  payee           String?         @db.VarChar(120)
  notes           String?         @db.VarChar(500)
  transferGroupId String?
  archivedAt      DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([userId, date])
  @@index([userId, accountId, date])
  @@index([userId, categoryId])
  @@index([userId, transferGroupId])
}

enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
}
```

**Fields.**

| Field | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | `String` (cuid) | primary key | Stable opaque identifier. Same cuid choice as `User.id`, `Account.id`, `Category.id`: collision-resistant, URL-safe, no enumerable creation order leak. |
| `userId` | `String` | FK → `User.id`, `ON DELETE CASCADE` | The owning user. Every read/write helper filters by this column (FR-002, FR-003). Cascade deletes a user's transactions when the user-deletion path lands. **Third exercise** of the data-scoping convention. |
| `accountId` | `String` | FK → `Account.id`, `ON DELETE RESTRICT` | The account this transaction belongs to. RESTRICT (not Cascade) because an account with transactions is not hard-deletable (feature 004 FR-008 already prevents this from the UI; the FK is the data-layer belt-and-braces). Archiving an account is the user-facing destructive action and does NOT cascade to transactions (the historical record is preserved). |
| `categoryId` | `String?` | FK → `Category.id`, `ON DELETE RESTRICT`, nullable | Optional categorization for INCOME / EXPENSE; **MUST be null for TRANSFER** (FR-006). RESTRICT because a category referenced by a transaction cannot be hard-deleted; archive is the only destructive UX (feature 005 FR-010). |
| `date` | `DateTime` | `@db.Date` (Postgres `DATE`), non-null | The calendar day this transaction occurred. Normalized to midnight UTC at the Zod boundary (FR-004). `@db.Date` strips any time component at the storage layer — the column literally cannot carry sub-day precision. See R10 in `research.md` for the `@db.Date` vs. timestamp-with-app-normalization trade-off. |
| `amount` | `Decimal` | `NUMERIC(20, 8)`, non-null | **Signed** monetary value in the account's currency. Stored as Postgres `NUMERIC` (never `Float`/`Number`; constitution Principle I). Per the 2026-05-17 clarification: `type=INCOME` → `amount > 0`; `type=EXPENSE` → `amount < 0`; `type=TRANSFER` → one negative leg + one positive leg with equal magnitude (FR-008). Magnitude strictly > 0 on every persisted row. |
| `currency` | `String` | `CHAR(3)`, non-null | ISO 4217 alpha-3 code, uppercase. **Denormalized from `Account.currency`** for aggregation efficiency (FR-007). MUST equal the parent account's currency at the boundary on every write. Same `CHAR(3)` shape as `Account.currency`. |
| `type` | `TransactionType` | enum, non-null | One of three: `INCOME`, `EXPENSE`, `TRANSFER`. The sign of `amount` MUST be consistent with `type` per FR-008 (enforced at the Zod boundary, R5 in `research.md`). |
| `payee` | `String?` | `VARCHAR(120)`, nullable | Optional display label (e.g., "Whole Foods", "Acme Corp"). Trimmed at the boundary; empty-after-trim → `null` (FR-010). Not constrained to a closed set; not unique; not indexed (no payee-search in v1 — feature 009 will add it). |
| `notes` | `String?` | `VARCHAR(500)`, nullable | Optional free-form notes. Same trim/null normalization as `payee` (FR-010). |
| `transferGroupId` | `String?` | nullable | **The pairing key.** `null` for INCOME and EXPENSE rows; **non-null** for TRANSFER rows, where both legs share the same value. Generated server-side via `cuid()` inside the transfer `$transaction` block (R3 in `research.md`); client-supplied values are silently ignored (FR-012). The pairing rule is the canonical mechanism the system uses to reconcile transfer legs on edit, archive, and unarchive (FR-016, FR-018, FR-024). The `(type === "TRANSFER") ↔ (transferGroupId !== null)` invariant is enforced at the Zod boundary AND documented as the structural contract; no DB CHECK constraint enforces it (R4). |
| `archivedAt` | `DateTime?` | nullable | Soft-delete column. `NULL` means active; non-null timestamp means archived (FR-017). Excluded from the default list view AND from the per-account balance computation (FR-019, FR-019a). Reversible an arbitrary number of times. For TRANSFER legs, archive/unarchive cascades atomically to BOTH legs (FR-018, R13 in `research.md`). |
| `createdAt` | `DateTime` | `@default(now())` | Audit timestamp — stored UTC, full precision (distinct from `date`, which is calendar-day). Used as the stable secondary sort after `date` so two transactions on the same day render in deterministic creation order (FR-020). |
| `updatedAt` | `DateTime` | `@updatedAt` | Audit timestamp — stored UTC, full precision. Bumped automatically by Prisma on every update. |

**Indexes.**

| Index | Reason |
|---|---|
| `@@index([userId, date])` | The default list query: `WHERE userId = ? AND date >= dateFrom AND date <= dateTo ORDER BY date DESC`. The composite supports both the equality on `userId` and the range on `date` plus the descending sort with no separate sort step. Hot path for every render of the transactions page. |
| `@@index([userId, accountId, date])` | The per-account view: same shape with an additional `accountId` filter. Also the index Prisma's `aggregate({_sum: amount, where: {userId, accountId, archivedAt: null}})` uses for the balance computation (R7 in `research.md`). |
| `@@index([userId, categoryId])` | Supports the category-filter list shape and the future feature-008 budget / feature-015 chart / feature-016 report query path (`SUM(amount) WHERE userId = ? AND categoryId = ? AND date BETWEEN …`). Without this index, the category-filter list degrades to a sequential scan once a user has a few hundred transactions. |
| `@@index([userId, transferGroupId])` | The transfer-pair reconciliation lookup: on edit, archive, and unarchive of a TRANSFER, the queries layer fetches both legs by `WHERE userId = ? AND transferGroupId = ?`. Two-row result on the hot path; the index keeps it O(log n) instead of O(n). |

**No additional uniqueness constraint.** No natural-key uniqueness on `(userId, accountId, date, amount)` etc. — duplicate transactions on the same day with the same amount are legitimate (two $4.50 coffee shop visits in one day).

### `TransactionType` enum

```prisma
enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
}
```

Closed three-value enum. Maps to a Postgres enum at the DB level. Generated as a TypeScript literal union by Prisma; that union is re-exported from `lib/transactions/schemas.ts` for use in the Zod schemas and in the DTO. Same allow-list-as-Prisma-enum pattern as `AccountType` (feature 004) and `CategoryKind` (feature 006).

### Update to `User`

The same migration adds the inbound back-relation:

```prisma
model User {
  id           String        @id @default(cuid())
  email        String        @unique
  passwordHash String
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  accounts     Account[]     // existing (feature 004)
  categories   Category[]    // existing (feature 006)
  transactions Transaction[] // NEW — back-relation from feature 007
}
```

### Update to `Account`

```prisma
model Account {
  // … unchanged fields …
  transactions Transaction[] // NEW — back-relation from feature 007
}
```

### Update to `Category`

```prisma
model Category {
  // … unchanged fields …
  transactions Transaction[] // NEW — back-relation from feature 007
}
```

All three back-relations are schema-only changes. Prisma does not emit SQL for back-relations; the relation table is `Transaction` itself.

## Identifier choice — why `cuid()`

Same trade-off matrix as `User.id`, `Account.id`, `Category.id`. Cuid wins for the same reasons: opaque, sortable, URL-safe, no `uuid-ossp` extension, no leakage of creation order. Documented in feature 003 / 004 / 006; not re-litigated.

## `transferGroupId` choice — `cuid()` generated server-side

The same `cuid()` generator used for primary keys is used for the pairing key. Decided in `research.md` R3:

- **Why cuid (not uuid v4):** matches the existing identifier shape across the schema, no new dependency, opaque, no enumerable creation order leak. The pairing-key role does not require crypto-strength uniqueness (collision risk in a per-user cuid space is effectively zero; cuid's collision rate at personal-finance volumes is well under one in a quadrillion).
- **Why server-side only:** prevents client tampering. Any `transferGroupId` value in the client-supplied payload is silently dropped at the Zod-schema layer (`.omit({ transferGroupId: true })` or schema-shape omission); the server-action body generates a fresh cuid inside the `prisma.$transaction` callback and assigns it to both legs (FR-012, FR-018).

## Date handling — `@db.Date` vs. `DateTime` with app normalization

**Decision: `@db.Date`** (Postgres `DATE` column). Storage cost: 4 bytes (vs. 8 for `TIMESTAMPTZ`). The column literally cannot carry sub-day precision; the storage layer enforces the calendar-day invariant. The Zod boundary still normalizes input to midnight UTC (`new Date(Date.UTC(y, m, d))`) so the application-layer round-trip is symmetric.

Trade-off vs. `DateTime` (full `TIMESTAMPTZ` with application-layer normalization): the `@db.Date` form gives us a stronger storage-level invariant at zero cost. The risk is Prisma 7's serialization of `@db.Date` — it deserializes as a `Date` object with `00:00:00` in the local server timezone, which is acceptable because the application has already normalized to UTC midnight on the way in, and the date-formatter at the UI edge prints only the calendar-day component. Documented in `research.md` R8 with a fallback to plain `DateTime` if Prisma 7 surfaces a serialization quirk during implementation.

## Amount handling — signed Decimal, stored as `NUMERIC(20, 8)`

- **Storage shape.** `NUMERIC(20, 8)`. Same precision/scale as `Account.startingBalance` from feature 004 — wide enough for every active ISO 4217 currency (BHD is the largest at 3 decimals; we keep 8 for safety) and well beyond personal-finance reality.
- **Wire shape.** Always a `string` over the React-server-component boundary (the canonical decimal string, e.g., `"-87.43"`, `"3200.00"`, `"-500.00"`). Same rule established by `AccountDTO.startingBalance` in feature 004.
- **Sign convention.** The 2026-05-17 clarification locks the sign as load-bearing: stored `amount` carries the sign, `type` is informational. The Zod boundary enforces sign-must-match-type via the new `validateTransactionAmount` helper in `lib/money/validate.ts` (research.md R6).
- **Magnitude.** Strictly > 0 on every persisted row. A zero amount has no economic meaning and would corrupt the list with empty rows; rejected at the boundary with `zero_amount` (subcase of `validation_failed`).
- **Currency-aware decimal places.** Inherited from feature 004's `validateStartingBalance` shape — reused under the new `validateTransactionAmount` helper to keep the rule in one place.

## Currency handling — denormalized, equality-with-account enforced at boundary

- **Storage shape.** `CHAR(3)` (fixed-width three characters, always uppercase). Same shape as `Account.currency`.
- **Denormalization rationale.** Storing `currency` on the transaction row (in addition to on its parent account) means the per-account `SUM(amount)` query does not need to join `Account` to render every list row's `<Money>` element. The denormalization is intentional and is the canonical strategy for transactional-money systems.
- **Equality invariant.** `transaction.currency === transaction.account.currency` at all times. Enforced at the Zod boundary by reading the account's currency from `getAccountForUser(userId, accountId)` and rejecting any payload whose declared currency disagrees (FR-007). In practice the form does not let the user choose a currency directly — the chosen account's currency is auto-populated; the boundary check defends against tampering.
- **Immutability via reassign.** Changing a transaction's `accountId` is allowed only across accounts of the **same currency** (FR-007). Changing `accountId` across currencies is rejected at the boundary with `currency_mismatch`.

## Transfer atomicity — the two-leg invariant

A TRANSFER is two `Transaction` rows that share five invariants:

1. **Same `transferGroupId`** — the pairing key.
2. **Same `userId`** — both owned by the same user.
3. **Same `currency`** — cross-currency transfers are out of scope in v1 (FR-015).
4. **Same `date`** — the user picks one date for the whole transfer.
5. **Same `notes`** — both legs carry the same optional notes (or both `null`).
6. **Inverse `amount` values** — source leg `amount < 0`, destination leg `amount > 0`, `abs(source.amount) === abs(destination.amount)`.
7. **Both `type === "TRANSFER"`**.

These invariants are enforced **structurally** by every transfer-touching code path running inside `prisma.$transaction(async (tx) => { ... })`:

- **Create transfer** (`createTransfer`): generate `transferGroupId` once, insert source leg, insert destination leg, commit. Either both rows persist or neither does. Documented in `contracts/createTransfer.md`.
- **Update transfer** (`updateTransfer`): fetch both legs by `transferGroupId`, recompute the new `(accountId, amount)` pair for each leg, update both inside one transaction. Either both updates persist or neither does. Documented in `contracts/updateTransfer.md`.
- **Archive transfer leg** (`archiveTransaction` when `row.type === "TRANSFER"`): fetch both legs by `transferGroupId`, set `archivedAt = now()` on both inside one transaction. Either both archives persist or neither does. Documented in `contracts/archiveTransaction.md`.
- **Unarchive transfer leg** (`unarchiveTransaction` when `row.type === "TRANSFER"`): symmetric.

The single-leg archive/update paths reject any row whose `transferGroupId` is non-null with `transfer_leg_isolated` (a subcase of `validation_failed`) — a tampered payload that targets a TRANSFER leg via `updateTransaction` instead of `updateTransfer` cannot bypass the two-leg invariant. Documented in research.md R12, R13.

## Balance computation formula

```text
account.balance = account.startingBalance + Σ(transaction.amount for that account where archivedAt IS NULL)
```

Implementation lives in `lib/transactions/queries.ts` via a Prisma `aggregate` — the helper exported is `sumAmountsForAccount(userId, accountId): Promise<Money>` (R7 in `research.md`). The balance is computed at render time by `lib/accounts/queries.ts`, which calls `sumAmountsForAccount` and returns `startingBalance.plus(sum)` from `lib/money/decimal.ts`. The accounts-list page is updated to render the computed balance instead of `startingBalance` (FR-019a; supersedes feature 004 FR-017's deferred promise).

A single `groupBy` query batches the sums for all of a user's accounts in one round-trip — the N+1 mitigation documented in R7.

## Relationships

- `User` 1 — N `Transaction`. `ON DELETE CASCADE` from user side.
- `Account` 1 — N `Transaction`. `ON DELETE RESTRICT` (account with transactions is not hard-deletable; archive is the only destructive UX).
- `Category` 1 — N `Transaction` (nullable on transaction side). `ON DELETE RESTRICT` (category referenced by transactions is not hard-deletable).
- `Transaction` — `Transaction` pairing via `transferGroupId` is application-level, not a Prisma relation. Two rows share a non-null `transferGroupId`; there is no `@relation` declaration for this — pairing is a query-time concern.

## Data lifecycle

| Operation | Path | Atomicity |
|---|---|---|
| Create INCOME / EXPENSE | `createTransaction` | Single `INSERT`; atomic by default. |
| Create TRANSFER | `createTransfer` | Wrapped in `prisma.$transaction` — both legs persist or neither does (FR-014). |
| Update INCOME / EXPENSE | `updateTransaction` | Single `UPDATE`; atomic by default. Rejects if row's `type === "TRANSFER"`. |
| Update TRANSFER | `updateTransfer` | Wrapped in `prisma.$transaction` — both legs update or neither does (FR-016). |
| Archive INCOME / EXPENSE | `archiveTransaction` (single-leg path) | Single `UPDATE archivedAt = now()`. |
| Archive TRANSFER leg | `archiveTransaction` (transfer path, auto-detected via `type`) | Wrapped in `prisma.$transaction` — both legs' `archivedAt` set or neither (FR-018). |
| Unarchive (any) | `unarchiveTransaction` | Symmetric to archive — single or both, depending on `type`. |
| List | `listTransactions` | Read-only; no transaction needed. |
| Balance read | `lib/accounts/queries.ts` → `sumAmountsForAccount` | Read-only Prisma `aggregate`; no transaction needed. |
| Hard delete | not exposed | No product surface. The clarification session locked soft-archive only (FR-017). |

## Migration

Generated via:

```bash
pnpm db:migrate -- --name add_transaction
```

Lands at:

```text
db/migrations/<timestamp>_add_transaction/
└── migration.sql
```

The SQL creates (in order):

1. `TransactionType` enum.
2. `Transaction` table with all columns and PK on `id`.
3. Four indexes: `Transaction_userId_date_idx`, `Transaction_userId_accountId_date_idx`, `Transaction_userId_categoryId_idx`, `Transaction_userId_transferGroupId_idx`.
4. Three FK constraints: `Transaction.userId → User.id` (CASCADE), `Transaction.accountId → Account.id` (RESTRICT), `Transaction.categoryId → Category.id` (RESTRICT).

Prisma emits this as a single SQL file containing the DDL statements. The committed file is the audit trail; `db push` is forbidden against committed code (constitution Conventions).

**Migration data hazard: none.** Existing `main` has zero `Transaction` rows. The migration is purely additive — no backfill, no data-modifying SQL. Documented in `research.md` R24.

## Data-scoping enforcement (constitution v0.2.0)

This is the **third feature** to exercise the data-scoping convention (after Accounts and Categories). The rules:

1. Every Prisma call against `transaction` goes through `lib/transactions/queries.ts`. No `prisma.transaction.*` reference exists anywhere else in the codebase. **One documented exception**: `lib/accounts/queries.ts` calls **into** `lib/transactions/queries.ts`'s `sumAmountsForAccount` helper for the balance computation — it does not touch `prisma.transaction.*` directly; it consumes a function from the canonical-owner module. Documented in `research.md` R6.
2. Every helper in `lib/transactions/queries.ts` takes `userId: string` as the first parameter.
3. Every server action calls `await auth()` first and passes `session.user.id` (NEVER a value from request input) to the helper.
4. The query `where:` clause is **always** `{ id, userId }` for find-by-id and `{ userId, …rest }` for finds and aggregates. No escape hatch.

Cross-user attempts ("read transaction 'X' belonging to user 'Y' while signed in as user 'Z'") are indistinguishable from "transaction 'X' does not exist" because the same `where: { id, userId }` returns `null` in both cases. The action then returns the same `not_found` envelope. SC-010, SC-011 are met by construction.

## Future references (NOT created here)

- **Feature 008 (Budgets)** will aggregate `Transaction.amount` over `(userId, categoryId, date BETWEEN ...)`. The `@@index([userId, categoryId])` index lands here so feature 008's queries are fast from day one.
- **Feature 015 (Charts)** will run `SUM(amount) GROUP BY date_trunc('month', date), categoryId` for spending-over-time visualizations. Same index.
- **Feature 016 (Reports)** will run similar aggregations grouped by `payee`. A payee-search index is NOT added here — feature 009 (Search & filter) will introduce it under its own design.
- **Feature 020 (Multi-currency / FX transfers)** will lift the same-currency constraint on transfers. The schema is forward-compatible: the two-leg model already allows different `amount` magnitudes per leg (the boundary just rejects them today); adding an FX rate column on `Transaction` is additive.
