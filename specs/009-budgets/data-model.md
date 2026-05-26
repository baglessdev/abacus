# Feature 009 — Data Model

This feature introduces the **fifth domain entity** in the Prisma schema (`User`, `Account`, `Category`, `Transaction`, and now `Budget`). It is the **first feature since feature 007 to add a new domain model** AND the **first feature to introduce a uniqueness invariant beyond per-user scope** — a partial unique index on `(userId, categoryId, currency, period) WHERE archivedAt IS NULL`.

After this migration lands, the schema contains five models and four enums (`AccountType`, `CategoryKind`, `TransactionType`, `BudgetPeriod`).

## Entities introduced

### `Budget`

```prisma
model Budget {
  id         String       @id @default(cuid())
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId String
  category   Category     @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  period     BudgetPeriod
  amount     Decimal      @db.Decimal(20, 8)
  currency   String       @db.Char(3)
  startDate  DateTime     @db.Date
  endDate    DateTime?    @db.Date
  archivedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@index([userId, archivedAt])
  @@index([userId, categoryId])
  // Partial unique index (`(userId, categoryId, currency, period) WHERE archivedAt IS NULL`)
  // is added via raw SQL in the migration file (see migrations/<timestamp>_add_budget/migration.sql).
  // Prisma 7's @@unique([...], where: ...) does not express filtered indexes; the migration is the
  // source of truth for the schema. See research.md R1.
}

enum BudgetPeriod {
  MONTHLY
  YEARLY
}
```

**Fields.**

| Field | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | `String` (cuid) | primary key | Stable opaque identifier. Same cuid choice as `User.id`, `Account.id`, `Category.id`, `Transaction.id`. |
| `userId` | `String` | FK → `User.id`, `ON DELETE CASCADE` | The owning user. Every read/write helper filters by this column (FR-022). Cascade deletes a user's budgets when the user-deletion path lands. **Fifth exercise** of the data-scoping convention. |
| `categoryId` | `String` | FK → `Category.id`, `ON DELETE RESTRICT` | The EXPENSE category this budget targets. NOT nullable — a budget without a category is undefined. RESTRICT (not Cascade) because a category referenced by a budget cannot be hard-deleted; archive is the only destructive UX (consistent with features 006 + 007). |
| `period` | `BudgetPeriod` | enum, non-null | One of two: `MONTHLY` / `YEARLY`. Determines the date-window the actuals computation uses (FR-009). Read-only on edit (US3 ac.5) — changing would effectively be a different budget. |
| `amount` | `Decimal` | `NUMERIC(20, 8)`, non-null | **Positive** monetary value in the budget's currency. Stored as Postgres `NUMERIC`. Strictly > 0 on every persisted row (FR-005). The progress + status computation is downstream from this. |
| `currency` | `String` | `CHAR(3)`, non-null | ISO 4217 alpha-3 code, uppercase. The currency this budget tracks. **Single-currency only per budget** (FR-019, no implicit FX). Read-only on edit (US3 ac.5). |
| `startDate` | `DateTime` | `@db.Date` (Postgres `DATE`), non-null | The first calendar day the budget is active. For MONTHLY, normalized to the 1st of its containing month at the Zod boundary (FR-006). For YEARLY, normalized to January 1st of its containing year. The boundary uses `normalizeToUtcDay` from `lib/transactions/dates.ts` — no duplication. |
| `endDate` | `DateTime?` | `@db.Date`, nullable | The last calendar day the budget is active (inclusive). When `null`, the budget is open-ended. When set, MUST be `>= startDate` (enforced at the Zod boundary, FR-007). |
| `archivedAt` | `DateTime?` | nullable | Soft-delete column. `null` means active; non-null timestamp means archived (FR-008). Excluded from the default list view AND from the partial unique index. Reversible. |
| `createdAt` | `DateTime` | `@default(now())` | Audit timestamp — stored UTC. |
| `updatedAt` | `DateTime` | `@updatedAt` | Audit timestamp — stored UTC. Bumped automatically by Prisma on every update. |

**Indexes.**

| Index | Purpose |
|---|---|
| `@@index([userId, archivedAt])` | The default list query: `WHERE userId = ? AND archivedAt IS NULL ORDER BY createdAt DESC` (or equivalent). Also supports the dashboard widget's top-5 query (limit, sort, filter by archive state). |
| `@@index([userId, categoryId])` | The uniqueness pre-check + "what budgets reference this category?" lookup. |
| **Partial unique index (raw SQL)** `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` | The uniqueness invariant from FR-002 + Clarification. Schema-level enforcement against duplicate active budgets for the same four-tuple. |

**No additional uniqueness constraints.** A user can have multiple archived budgets for the same `(categoryId, currency, period)` tuple (each archive-then-recreate cycle leaves a previous archived row); the partial-index `WHERE archivedAt IS NULL` clause excludes those from uniqueness.

### `BudgetPeriod` enum

```prisma
enum BudgetPeriod {
  MONTHLY
  YEARLY
}
```

Closed two-value enum. Maps to a Postgres enum at the DB level. Generated as a TypeScript literal union by Prisma; re-exported from `lib/budgets/schemas.ts` for use in Zod and in the DTO. Same allow-list-as-Prisma-enum pattern as `AccountType` (feature 004), `CategoryKind` (feature 006), `TransactionType` (feature 007).

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
  transactions Transaction[] // existing (feature 007)
  budgets      Budget[]      // NEW — back-relation from feature 009
}
```

### Update to `Category`

```prisma
model Category {
  // … unchanged fields …
  transactions Transaction[] // existing (feature 007)
  budgets      Budget[]      // NEW — back-relation from feature 009
}
```

Both back-relations are schema-only changes. Prisma does not emit SQL for back-relations; the relation table is `Budget` itself.

## In-memory aggregate shape (not persisted)

`BudgetWithActuals` is the canonical rendering shape returned by the query layer for both the budgets-page list and the dashboard widget. It is NOT persisted; it is computed at request time from a `Budget` row + the per-period actuals sum + the joined category.

```ts
type BudgetWithActuals = {
  budget: Budget               // the Prisma row (or its DTO; both shapes are used in different layers)
  category: Category           // joined via include; UI uses category.name + category.archivedAt for the "(archived category)" label
  actuals: Money               // absolute sum of non-archived EXPENSE transactions for this budget's (categoryId, currency) in this period; always >= 0
  remaining: Money             // budget.amount - actuals; negative when over budget
  progressRatio: number        // actuals / amount as a float; used only for UI fill % and as a sort tie-breaker. NOT used for status classification.
  status: "under" | "near" | "over"  // computed Decimal-precision-correctly via Money.comparedTo (R12)
  periodStart: Date            // inclusive — first of current month or year (UTC midnight)
  periodEnd: Date              // exclusive — first of next month or year (UTC midnight)
}
```

Produced by `attachActualsToBudgets(budgets, actualsMap)` from `lib/budgets/aggregations.ts`.

## DTO shapes (over the RSC boundary)

### `BudgetDTO`

```ts
type BudgetDTO = {
  id: string
  userId: string
  categoryId: string
  period: "MONTHLY" | "YEARLY"
  amount: string                 // canonical decimal string (always > 0; e.g., "400.00")
  currency: string               // ISO 4217 alpha-3, uppercase
  startDate: string              // ISO 8601 date-only ("2026-05-01")
  endDate: string | null         // ISO 8601 date-only or null
  archivedAt: string | null      // ISO 8601 UTC or null
  createdAt: string              // ISO 8601 UTC
  updatedAt: string              // ISO 8601 UTC
}
```

Produced by `serializeBudget(row: Budget): BudgetDTO` in `lib/budgets/serialize.ts`. Decimal → canonical decimal string via `.toString()`; Date → ISO string. Same wire-shape convention as `AccountDTO`, `CategoryDTO`, `TransactionDTO`.

### `BudgetWithActualsDTO`

```ts
type BudgetWithActualsDTO = {
  budget: BudgetDTO
  category: CategoryDTO
  actuals: string                // canonical decimal string (always >= 0)
  remaining: string              // canonical signed decimal string
  progressRatio: number          // float, 0..N (uncapped — for the UI to clip at 100%)
  status: "under" | "near" | "over"
  periodStart: string            // ISO 8601 date-only
  periodEnd: string              // ISO 8601 date-only (exclusive)
}
```

Produced by `serializeBudgetWithActuals(budgetWithActuals, category)` in `lib/budgets/serialize.ts`.

## Data-scoping enforcement

Every read MUST scope by `userId` from `session.user.id`. **No cross-user vector exists in this feature.** Specifically:

1. The `/dashboard/budgets` page server component calls `await auth()` and reads `userId = session.user.id`.
2. Every server action in `lib/budgets/actions.ts` calls `await auth()` at the top and uses `session.user.id`.
3. Every helper in `lib/budgets/queries.ts` takes `userId: string` as its FIRST positional argument.
4. Every Prisma `where:` clause includes `userId` — for `budget.*` reads/writes AND for the `category.*` lookups that happen via `lib/categories/queries.ts.getCategoryForUser(userId, id)`.
5. **No code path** in this feature reads `userId` from request input (no `searchParams`, no `FormData.userId`, no route parameter).

A cross-user attempt (URL manipulation, hand-crafted FormData asserting another user's budget id) resolves to `not_found` (FR-022, SC-005). The "no cross-user vector exists" assertion is verifiable by inspection.

This is the **fifth feature** to exercise the data-scoping convention (after Accounts, Categories, Transactions, Dashboard); the boilerplate is unchanged and re-used verbatim.

## Currency invariant

**No FX. No implicit conversion. Every aggregate ships with its ISO 4217 code attached. No monetary number rendered without its currency code.**

Specifically:

- **`Budget.currency`** is `CHAR(3)`, stored alongside `amount`. The wire shape (`BudgetDTO.currency`) carries the same string.
- **Actuals** sum only transactions whose `currency === budget.currency` (per FR-019). A USD budget never includes EUR transactions in its actuals, and vice versa.
- **`BudgetWithActualsDTO`** carries `currency` (via `budget.currency`) adjacent to `actuals`, `remaining`, `amount`. The reducer NEVER combines two different currencies.
- **`<Money>`** is the single rendering primitive. Its `currency` prop is REQUIRED (TypeScript blocks any consumer that forgets it). Every `<Money>` element on `/dashboard/budgets` AND on the dashboard widget carries the currency code into the rendered output.
- **Audit grep** `rg "<Money " 'app/(shell)/dashboard/budgets/_components/' 'app/(shell)/dashboard/_components/budgets-widget.tsx'` returns ≥ 9 matches per the row composition + widget.

The constitution Principle I rule "currency stored alongside every monetary value" is upheld both at the database level (the `currency` column) AND at the in-memory level (every aggregate carries it).

## Uniqueness invariant

**At most one non-archived `Budget` per `(userId, categoryId, currency, period)` tuple.**

Enforced at TWO layers (R7):

1. **App-level pre-check** in `createBudgetForUser`: `findExistingActiveBudgetForUser` queries the four-tuple before insert. If a match exists, the action returns `{ error: { code: "budget_exists", … } }` with a friendly message naming the conflicting budget.

2. **Schema-level partial unique index** `(userId, categoryId, currency, period) WHERE archivedAt IS NULL`. Catches the race condition where two near-simultaneous requests both pass the pre-check. The second insert fails with Prisma error `P2002`; the action catches and returns the SAME `budget_exists` envelope.

Same dual-layer pattern applies to `unarchiveBudgetForUser` (unarchive may collide with an active budget for the same tuple if one was created while this row was archived).

**Race semantics.** Two parallel `createBudget` requests for the same tuple resolve to ONE success + ONE `budget_exists` envelope, never two duplicates. The UI handles the race by re-fetching the list (the other concurrent caller's just-created budget will now be visible).

## Archived-category interaction

Per Clarification Q3 (and FR + Edge Cases):

- Archiving a Category does NOT auto-archive its budgets. The budget keeps its `categoryId`.
- `listBudgetsForUser` joins the category via `include: { category: true }`. The UI renders the category name with an "(archived category)" suffix when `category.archivedAt !== null`.
- The actuals computation continues to work (transactions still reference the archived category; `sumExpenseByCategoryForBudgetsForUser` queries by `categoryId` regardless of category-archive state).
- The user MAY archive the budget themselves to clean up.

## Future-feature data-model touchpoints

This feature does NOT pre-position the schema for future features. Noted for awareness:

- **Feature 015 (Charts)** will run `SUM(amount) GROUP BY date_trunc('month', date), categoryId` for spending-over-time visualizations + may want a per-budget time-series (actuals over the last N periods). The `@@index([userId, categoryId])` and `@@index([userId, date])` (from feature 007) support this; no schema change needed.
- **Feature 016 (Reports)** will surface budget vs. actuals by arbitrary date range — requires a generalization of `sumExpenseByCategoryForBudgetsForUser` to accept a range argument. Add-only extension; no schema change.
- **Feature 017 (Settings — primary currency)** does NOT affect this schema; budgets stay per-currency.
- **Feature 019 (Savings goals)** is the income-side mirror of budgets. May reuse the partial-unique-index pattern but on `INCOME` categories. Separate model.
- **Feature 020 (Multi-currency FX)** does NOT affect this schema. Budgets stay per-currency; FX conversions live elsewhere.

None of the above require schema changes in feature 009.
