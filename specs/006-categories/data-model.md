# Feature 006 — Data Model

This feature introduces the **second domain entity** in the Prisma schema (the first was `Account` from feature 004). After this feature lands, the schema contains three models: `User`, `Account`, `Category`. `Category` is the first **non-money-touching** domain model and the first to use a **self-referential foreign key**.

## Entities introduced

### `Category`

```prisma
model Category {
  id         String       @id @default(cuid())
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  parentId   String?
  parent     Category?    @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children   Category[]   @relation("CategoryHierarchy")
  name       String       @db.VarChar(80)
  kind       CategoryKind
  color      String       @db.VarChar(32)
  icon       String       @db.VarChar(64)
  archivedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@index([userId])
  @@index([userId, archivedAt])
  @@index([userId, parentId])
}

enum CategoryKind {
  INCOME
  EXPENSE
}
```

**Fields.**

| Field | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | `String` (cuid) | primary key | Stable opaque identifier. Returned to clients as `categoryId`; future features 006 (Transactions) and 008 (Budgets) reference this. Cuid for the same reasons as `User.id` and `Account.id`: collision-resistant, URL-safe, no enumerable creation order leak. |
| `userId` | `String` | FK → `User.id`, `ON DELETE CASCADE` | The owning user. Every read/write helper filters by this column (FR-002, FR-003). Cascade ensures that deleting a user removes their categories in one referential step. **Second exercise** of the data-scoping convention (first was `Account.userId`). |
| `parentId` | `String?` | FK → `Category.id`, `ON DELETE RESTRICT`, self-referential, nullable | If null, this is a top-level category. If non-null, this is a child of another category owned by the same user. RESTRICT (not Cascade) so a future hard-delete path on a parent cannot silently destroy its children. The single-level depth rule (FR-006) is enforced at the **Zod boundary**, not by the DB — see research.md R5. |
| `name` | `String` | `VARCHAR(80)`, non-null | Display label. Trimmed at the Zod boundary; rejected if empty or whitespace-only after trim (FR-004). Not unique per user (intentional — duplicate names allowed per spec edge case). Upper-bound matches `Account.name` from feature 004. |
| `kind` | `CategoryKind` | enum, non-null | One of two values: `INCOME`, `EXPENSE`. Editable on a category with no children; **immutable on a category with children** (FR-005, error code `kind_change_blocked`). Forced to match the parent's kind on every create or edit that sets a `parentId` (FR-009, error code `kind_mismatch`). |
| `color` | `String` | `VARCHAR(32)`, non-null | A token from `CATEGORY_COLORS` (e.g., `"violet"`, `"blue"`, …). The column does not enforce membership in the allow-list; that's the Zod boundary's job (research.md R1, R2). |
| `icon` | `String` | `VARCHAR(64)`, non-null | An icon name from `CATEGORY_ICONS` (e.g., `"utensils"`, `"home"`, …). Same allow-list-at-boundary pattern (research.md R1, R3). |
| `archivedAt` | `DateTime?` | nullable | Soft-delete column. `NULL` means active; non-null timestamp means archived (FR-010). Reversible an arbitrary number of times. No hard delete is ever exposed by this feature. Archiving a parent does NOT cascade to its children (research.md R7). |
| `createdAt` | `DateTime` | `@default(now())` | Stored UTC. Not surfaced in v1 UI. |
| `updatedAt` | `DateTime` | `@updatedAt` | Stored UTC. Bumped automatically by Prisma on every update. |

**Indexes.**

| Index | Reason |
|---|---|
| `@@index([userId])` | The hot path: every read filters by `userId`. List, find-by-id, archive, unarchive, the picker — all start here. Without this index, every query degrades to a sequential scan. |
| `@@index([userId, archivedAt])` | The default list query is `where: { userId, archivedAt: null }` (or `where: { userId }` when "Show archived" is on). The composite index lets PG satisfy both shapes with one B-tree. Same shape as `Account_userId_archivedAt_idx`. |
| `@@index([userId, parentId])` | Supports two queries: (a) the picker / list "find all children of X for this user" lookup, used both at render time and inside the `kind_change_blocked` pre-flight (`SELECT COUNT(*) FROM "Category" WHERE userId = ? AND parentId = ?`); (b) the seed integrity check (verifying the two child seed rows reference the same top-level "Food" id). Without this index, the child-count check on every update would degrade to a partial scan of all the user's categories. |

**No additional uniqueness constraint.** Names are not unique per user (spec edge case). The only natural-key uniqueness is the implicit `(id)` primary key.

### `CategoryKind` enum

```prisma
enum CategoryKind {
  INCOME
  EXPENSE
}
```

Closed two-value enum. Maps to a Postgres enum at the DB level. Generated as a TypeScript literal union by Prisma; that union is re-exported from `lib/categories/schemas.ts` for use in the Zod schemas and in the DTO.

### Update to `User`

The same migration adds the inbound back-relation:

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  accounts   Account[]    // existing (feature 004)
  categories Category[]   // NEW — back-relation from feature 006
}
```

This is a schema-only change. Prisma does not emit SQL for back-relations; the relation table is `Category` itself (with the `userId` FK declared on `Category` above).

## Identifier choice — why `cuid()`

Same trade-off matrix as `User.id` and `Account.id`. Cuid wins for the same reasons: opaque, sortable, URL-safe, no `uuid-ossp` extension, no leakage of creation order. Auto-increment is rejected for the same enumerable-IDs reason.

## Migration

Generated via:

```bash
pnpm db:migrate -- --name add_category
```

Lands at:

```text
db/migrations/<timestamp>_add_category/migration.sql
```

The SQL creates (in order):

1. The `CategoryKind` enum (`CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');`).
2. The `Category` table.
3. Three indexes (`Category_userId_idx`, `Category_userId_archivedAt_idx`, `Category_userId_parentId_idx`).
4. Two FK constraints: `Category_userId_fkey` (with `ON DELETE CASCADE`) and `Category_parentId_fkey` (with `ON DELETE RESTRICT`).

No `db push` (FR-001). The implementer reviews the generated SQL before commit.

## Data-scoping rule (binding)

Every helper in `lib/categories/queries.ts` takes `userId: string` as its **first positional argument**, supplied by the calling server action from `session.user.id`. Every Prisma `where:` clause for `prisma.category.*` includes `userId`. The action layer never accepts a `userId` from request input. This is the same rule feature 004 established for `Account`; this is the **second exercise** of the convention. See plan.md §Auth & Validation Boundaries / Cross-user isolation pattern for the full five-step rule.

Cross-user reads, updates, archives, and unarchives collapse to `null` (and surface as the `not_found` error envelope) by structure — there's no separate "is this category yours?" check anywhere in the codebase; the `where: { id, userId }` query shape does it implicitly. Cross-user `parentId` references on create/update collapse the same way: `getCategoryForUser(userId, parentId)` returns `null`, which the schema treats indistinguishably from a non-existent id, and the action surfaces `not_found` (FR-013).

## Forward references (NOT created in this feature)

**`Transaction.categoryId`** (feature 006 in the roadmap; spec slot 007 will be the directory). The transaction's `categoryId` will be `String?` (nullable — feature 006's spec will decide whether uncategorized transactions are allowed; this plan does not pre-empt that decision). The FK shape will be:

```prisma
model Transaction {
  // ...
  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  // ...
}
```

The `SetNull` cascade is the proposed default — when a category is hard-deleted (a path that does NOT exist in v1; feature 010 may add it with safeguards), transactions that referenced it become uncategorized rather than vanishing. Feature 006's plan will revisit and lock the actual cascade.

**`Budget.categoryId`** (feature 008 in the roadmap). The budget's `categoryId` will be `String` (non-null — a budget MUST target a category). The FK shape will be:

```prisma
model Budget {
  // ...
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  // ...
}
```

The `Restrict` cascade is the proposed default — a category that is targeted by a budget cannot be hard-deleted (forcing the user to either archive the category or delete the budget first). Feature 008's plan will revisit and lock.

**This feature does NOT create either of those FKs.** It locks the `Category` schema (id shape, fields, indexes, scoping rule) so that features 006 and 008 can attach their respective transaction / budget FKs without re-migrating `Category` (SC-010).

## Schema diff summary

```diff
 model User {
   id           String    @id @default(cuid())
   email        String    @unique
   passwordHash String
   createdAt    DateTime  @default(now())
   updatedAt    DateTime  @updatedAt

   accounts     Account[]
+  categories   Category[]
 }

+model Category {
+  id         String       @id @default(cuid())
+  userId     String
+  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
+  parentId   String?
+  parent     Category?    @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
+  children   Category[]   @relation("CategoryHierarchy")
+  name       String       @db.VarChar(80)
+  kind       CategoryKind
+  color      String       @db.VarChar(32)
+  icon       String       @db.VarChar(64)
+  archivedAt DateTime?
+  createdAt  DateTime     @default(now())
+  updatedAt  DateTime     @updatedAt
+
+  @@index([userId])
+  @@index([userId, archivedAt])
+  @@index([userId, parentId])
+}
+
+enum CategoryKind {
+  INCOME
+  EXPENSE
+}
```
