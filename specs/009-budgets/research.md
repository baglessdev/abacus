# Feature 009 — Phase 0 Research

Non-obvious decisions taken during planning. Each entry: **Decision / Rationale / Alternatives considered**. Inputs locked by the spec's Clarifications section (calendar-UTC periods, recurring rule, archived-category-stays, 80%/100% thresholds, most-used-by-EXPENSE-count default currency) are NOT re-litigated here; the entries below cover only the choices the spec deliberately left to the plan.

This is the **first feature since 007 to add a new domain model** (Budget — the fifth domain entity in the schema) AND the **first feature to introduce a uniqueness invariant beyond per-user scope** (the partial unique index on `(userId, categoryId, currency, period) WHERE archivedAt IS NULL`). It is also **money-touch=true** — the actuals computation reuses feature 007's per-currency-per-type aggregation primitive (`Prisma.transaction.groupBy({ by: ["currency", "type"], _sum: { amount: true }, where: { ... } })`) but extends the grouping dimension by `categoryId` and the `where:` by a per-period date range. The money-reviewer subagent's audit greps (codified in plan.md §Money & Currency Notes) cover the new surface.

The work is small precisely because the prerequisite features did the heavy lifting: `<Money>` already exists; `<CategoryPicker>` already supports `kind="EXPENSE"`; `<WidgetErrorBoundary>` + `<WidgetCard>` + `<EmptyCell>` already exist; the per-currency / per-type / Postgres-side aggregation pattern already exists in `lib/transactions/queries.ts`; the data-scoping convention is on its fifth exercise.

---

## R1. Schema shape — `Budget` model + `BudgetPeriod` enum + indexes + partial unique index

**Decision.**

Add to `db/schema.prisma`:

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
  // Partial unique index added via raw SQL in the migration (see below).
}

enum BudgetPeriod {
  MONTHLY
  YEARLY
}
```

**Indexes** (plus the partial unique index):

| Index | Reason |
|---|---|
| `@@index([userId, archivedAt])` | Default list query: `WHERE userId = ? AND archivedAt IS NULL ORDER BY createdAt DESC`. Also supports the dashboard widget's top-5 query. |
| `@@index([userId, categoryId])` | The app-level uniqueness pre-check: `WHERE userId = ? AND categoryId = ? AND currency = ? AND period = ? AND archivedAt IS NULL`. Also supports "what budgets reference this category?" future query. |
| **Partial unique index** `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` | Enforces the uniqueness invariant (FR-002). At most one ACTIVE budget per the four-tuple per user; archived rows do NOT contribute to uniqueness (a user can archive an old budget and create a new one for the same tuple). Raw SQL because Prisma 7's `@@unique([...], where: ...)` may not support partial-index `WHERE` natively (see below). |

**Prisma 7 partial-unique-index support — verification + fallback.**

Prisma 7 documents `@@unique` and `@@index` with optional `map:`, `name:`, and `type:` modifiers, but the `where: ...` filter for *partial* indexes is NOT a first-class Prisma schema feature as of Prisma 7.x (it is a Postgres-specific physical-layer feature). The reliable workaround — used by other Prisma-on-Postgres projects with the same need — is to:

1. Declare the regular `@@unique([userId, categoryId, currency, period])` constraint OR omit it, then
2. Edit the generated `migration.sql` to use a raw `CREATE UNIQUE INDEX` with the `WHERE archivedAt IS NULL` clause.

The recommended approach (and what we will use): **do NOT declare `@@unique([...])` in the Prisma schema** (because we don't want a full unique constraint — we want a *partial* one), and add the raw SQL in the migration file:

```sql
CREATE UNIQUE INDEX "Budget_userId_categoryId_currency_period_active_unique"
  ON "Budget"("userId", "categoryId", "currency", "period")
  WHERE "archivedAt" IS NULL;
```

The migration file is the source of truth for the database; the Prisma schema documents the constraint as a leading comment on the `Budget` model.

**Rationale.**

- The uniqueness invariant is the load-bearing constraint that prevents two active budgets for the same `(userId, categoryId, currency, period)` tuple (spec FR-002 + clarification). Without it, a race between two near-simultaneous create requests would persist duplicates.
- The partial-index form (vs. a regular unique constraint over four columns) allows the same tuple to be re-used after archive — a user can archive their old USD-MONTHLY Groceries budget and immediately create a new one. A full unique constraint would block this (archived rows would still claim the slot).
- Postgres natively supports partial unique indexes; the raw SQL is one line.

**Alternatives considered.**

- *Full `@@unique([userId, categoryId, currency, period])` constraint.* Rejected — would prevent archive-then-recreate for the same tuple, which is a user-facing surprise (the user archives a budget and then tries to create a "fresh" one with the same shape, and gets a uniqueness error). The spec's archive-as-soft-delete convention requires that archived rows do NOT block re-creation.
- *Only app-level enforcement via the pre-check in `lib/budgets/queries.ts`.* Rejected — the spec's clarification about race conditions (US1 ac.5 + Edge Cases) requires schema-level enforcement. App-level alone has a TOCTOU window between the pre-check and the insert that two parallel requests can interleave.
- *MySQL-portable approach (no partial unique).* Rejected — Abacus is Postgres-only by constitutional choice (technology stack section). Future portability is not a v1 concern.

---

## R2. Period boundary computation — pure helpers in `lib/budgets/periods.ts`, UTC midnight, recomputed at request time

**Decision.**

Add a NEW helper file `lib/budgets/periods.ts` with:

```ts
// Re-export the existing month-range helper from feature 008.
export { computeCurrentMonthRange } from "@/lib/dashboard/dates"

/** Compute the current calendar-year range in UTC. dateTo is the first of NEXT year (exclusive). */
export function computeCurrentYearRange(): { dateFrom: Date; dateTo: Date } {
  const now = new Date()
  const year = now.getUTCFullYear()
  const dateFrom = new Date(Date.UTC(year, 0, 1))      // Jan 1 of current year
  const dateTo   = new Date(Date.UTC(year + 1, 0, 1))  // Jan 1 of next year (exclusive)
  return { dateFrom, dateTo }
}

/** Compute the current-period range for either MONTHLY or YEARLY. */
export function computeCurrentPeriodRange(period: "MONTHLY" | "YEARLY"): { dateFrom: Date; dateTo: Date } {
  return period === "MONTHLY" ? computeCurrentMonthRange() : computeCurrentYearRange()
}
```

Per FR-009 and FR-014: `dateFrom` is **inclusive** (UTC midnight of the 1st of the current month or year), `dateTo` is **exclusive** (UTC midnight of the 1st of the next month or year). Recomputed on every request — no module-level memoization.

**Rationale.**

- **UTC-only**: consistent with feature 007's `@db.Date` calendar-day storage and feature 008's `computeCurrentMonthRange` shape. The dashboard cash-flow widget already uses `[firstOfMonth, firstOfNextMonth)`; the budgets actuals query MUST use the same boundary so a USD-MONTHLY budget's "this month" sum matches the cash-flow widget's "this month" USD EXPENSE sum.
- **First-of-next-period exclusive** avoids the off-by-one that an inclusive `lte` on the last day of the month/year would create AND handles month-length variance + leap year via `Date.UTC(...)`'s native normalization.
- **Re-export `computeCurrentMonthRange`** from `lib/dashboard/dates.ts` (don't duplicate) — there is exactly one source of truth for the month-range helper across the codebase. The new `computeCurrentYearRange` is a sibling shape.
- **Recomputed per call** honors FR-014. A long-running server process must re-evaluate the boundary on every dashboard or budgets-page render; a cached value computed at module-load time would be wrong after midnight UTC on the 1st of a new month / 1st of a new year.

**Alternatives considered.**

- *Place the year-range helper in `lib/dashboard/dates.ts` instead of `lib/budgets/periods.ts`.* Considered — would be a fine layering choice. We chose `lib/budgets/periods.ts` because (a) the year range is currently only consumed by budgets (the cash-flow widget is month-only), and (b) it keeps the budgets module self-contained for future extensions (e.g., quarterly periods in feature 015 or 019). If a third consumer ever needs `computeCurrentYearRange`, it moves to `lib/dashboard/dates.ts` and `lib/budgets/periods.ts` re-exports.
- *Use date-fns.* Rejected — no new deps per constitution + plan constraint. The native `Date.UTC(...)` arithmetic is 2 lines.
- *Per-budget rolling periods anchored to `startDate`.* Rejected by spec Clarification Q1 (calendar-aligned only).

---

## R3. Actuals batched aggregation — single helper per period type, mapped client-side per budget

**Decision.**

Add a NEW helper in `lib/transactions/queries.ts`:

```ts
/**
 * Aggregate EXPENSE actuals per (categoryId, currency) over a date range.
 * Used by the budgets module to compute actuals for all budgets sharing the same period
 * window (MONTHLY OR YEARLY) in a SINGLE Prisma groupBy round-trip.
 *
 * The caller fans out by period: one call for MONTHLY (with [firstOfMonth, firstOfNextMonth))
 * + one call for YEARLY (with [firstOfYear, firstOfNextYear)). At most 2 round-trips total
 * regardless of how many budgets the user has.
 */
export async function sumExpenseByCategoryForBudgetsForUser(
  userId: string,
  dateFrom: Date,                 // inclusive
  dateTo: Date,                   // exclusive
  categoryIds: string[],          // restrict to the budgeted categories (small)
  currencies: string[],           // restrict to the budgeted currencies (small)
): Promise<Array<{ categoryId: string; currency: string; _sum: { amount: Money } }>> {
  if (categoryIds.length === 0 || currencies.length === 0) return []
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId", "currency"],
    where: {
      userId,
      type: "EXPENSE",                       // FR-010 — actuals are EXPENSE only
      archivedAt: null,                      // FR-010 — non-archived only
      date: { gte: dateFrom, lt: dateTo },   // [dateFrom, dateTo) — first-of-next-period exclusive
      categoryId: { in: categoryIds },       // FR-010 — only budgeted categories
      currency: { in: currencies },          // FR-019 — only budgeted currencies
    },
    _sum: { amount: true },
  })
  return rows
    .filter((r) => r.categoryId !== null)
    .map((r) => ({
      categoryId: r.categoryId as string,
      currency: r.currency,
      _sum: { amount: r._sum.amount != null ? new Money(r._sum.amount) : new Money(0) },
    }))
}
```

`lib/budgets/queries.ts` fans this out **at most twice** per `listBudgetsWithActualsForUser` render:

```ts
// Inside listBudgetsWithActualsForUser:
const budgets = await prisma.budget.findMany({ where: { userId, archivedAt: null }, include: { category: true } })

// Group budgets by period.
const monthlyBudgets = budgets.filter(b => b.period === "MONTHLY")
const yearlyBudgets  = budgets.filter(b => b.period === "YEARLY")

// Two ranges (idempotent computations).
const monthRange = computeCurrentMonthRange()
const yearRange  = computeCurrentYearRange()

// Distinct category + currency lists per period type.
const monthCategoryIds = [...new Set(monthlyBudgets.map(b => b.categoryId))]
const monthCurrencies  = [...new Set(monthlyBudgets.map(b => b.currency))]
const yearCategoryIds  = [...new Set(yearlyBudgets.map(b => b.categoryId))]
const yearCurrencies   = [...new Set(yearlyBudgets.map(b => b.currency))]

// Fire (at most) 2 groupBy queries in parallel.
const [monthlyRows, yearlyRows] = await Promise.all([
  monthlyBudgets.length > 0
    ? sumExpenseByCategoryForBudgetsForUser(userId, monthRange.dateFrom, monthRange.dateTo, monthCategoryIds, monthCurrencies)
    : Promise.resolve([]),
  yearlyBudgets.length > 0
    ? sumExpenseByCategoryForBudgetsForUser(userId, yearRange.dateFrom, yearRange.dateTo, yearCategoryIds, yearCurrencies)
    : Promise.resolve([]),
])

// Build a per-budget map: key = `${period}::${categoryId}::${currency}` → Money sum (absolute).
const actualsMap = new Map<string, Money>()
for (const r of monthlyRows) actualsMap.set(`MONTHLY::${r.categoryId}::${r.currency}`, r._sum.amount.abs())
for (const r of yearlyRows)  actualsMap.set(`YEARLY::${r.categoryId}::${r.currency}`,  r._sum.amount.abs())

// Attach actuals to each budget via attachActualsToBudgets (lib/budgets/aggregations.ts).
```

**Note on the absolute-value step.** Per feature 007's signed-amount convention, EXPENSE rows are stored negative. The actuals display for a budget is the absolute magnitude of spending (per FR-010 second sentence). So the queries layer calls `.abs()` once at the boundary before the actuals map; everything downstream is positive Decimal.

**Rationale.**

- **Two round-trips, regardless of budget count.** With per-period batching, even a user with 30 MONTHLY budgets in 5 currencies + 10 YEARLY budgets fires exactly 2 Prisma queries. Each query uses the existing `@@index([userId, date])` from feature 007 + the in-row `categoryId` and `currency` filters. At personal-finance scale (≤ 50 budgets, ≤ 10k transactions/user), milliseconds.
- **The `(categoryId, currency)` group key matches the budget uniqueness key minus `period`.** This is the right shape: the period dimension is handled by which `[dateFrom, dateTo)` window we query in.
- **Postgres-side `_sum.amount`** is constitutionally compliant (same primitive as `sumIncomeExpenseByCurrencyForUser`).
- **The `categoryId: { in: ... }` + `currency: { in: ... }` filters** restrict the query to only the data the user actually has budgets for. The result set is bounded by the budget count, not the user's total transaction count.

**Alternatives considered.**

- *Per-budget query (N round-trips).* Rejected — N+1 trap; the spec explicitly warns against it (R3 hint in the prompt). 30 budgets = 30 queries.
- *Single `groupBy` over a wide date range covering both MONTHLY and YEARLY, then bucket client-side.* Considered. The widest range (YEARLY) covers all MONTHLY data too, so one query could in principle serve both. Rejected because (a) it ships rows for periods the MONTHLY budgets don't care about (e.g., MONTHLY budget gets the whole year's worth of rows pushed to the application), (b) the client-side bucketing requires re-applying the date-range filter in JS — slower + more error-prone, (c) the two-query strategy is the same shape feature 008 uses for cash-flow and is well-trodden.
- *Group by `period` SQL-side via a window function.* Rejected — would require raw SQL outside Prisma's typed `groupBy`. The two-call strategy keeps the type safety end-to-end.

---

## R4. Default-currency-for-budget helper — most-used by COUNT in last 90 days; fall back to first account; fall through to null

**Decision.**

Per Clarification Q2, the create-budget form's default currency is computed as:

1. Most-frequent (by COUNT) currency of non-archived EXPENSE transactions in the last 90 days.
2. Fall back to the user's first non-archived account currency (ordered `createdAt asc`, ties broken by `id asc`).
3. Fall through to `null` if the user has neither transactions nor accounts in any currency.

Implementation:

```ts
// In lib/transactions/queries.ts (added; preserves the "prisma.transaction.* lives only here" invariant):
export async function getMostUsedExpenseCurrencyForUser(
  userId: string,
  sinceDays = 90,
): Promise<string | null> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - sinceDays)
  since.setUTCHours(0, 0, 0, 0)

  const rows = await prisma.transaction.groupBy({
    by: ["currency"],
    where: {
      userId,
      type: "EXPENSE",
      archivedAt: null,
      date: { gte: since },
    },
    _count: { _all: true },
    orderBy: [
      { _count: { currency: "desc" } },  // most COUNT first
      { currency: "asc" },                // tie-break: alphabetical
    ],
    take: 1,
  })
  return rows[0]?.currency ?? null
}

// In lib/budgets/defaults.ts (does NOT import prisma; consumes the helpers above + listAccountsForUser):
import { listAccountsForUser } from "@/lib/accounts/queries"
import { getMostUsedExpenseCurrencyForUser } from "@/lib/transactions/queries"

export async function computeDefaultCurrencyForBudget(userId: string): Promise<string | null> {
  // 1. Most-used by COUNT in last 90 days.
  const fromExpenses = await getMostUsedExpenseCurrencyForUser(userId, 90)
  if (fromExpenses) return fromExpenses

  // 2. Fall back to the first non-archived account's currency.
  const accounts = await listAccountsForUser(userId, { includeArchived: false })
  // listAccountsForUser orders by name asc; for deterministic createdAt-based picking,
  // sort here. The fall-back rule from Clarification Q2 is: createdAt asc, ties by id asc.
  const sorted = [...accounts].sort((a, b) => {
    const aCreated = new Date(a.createdAt).getTime()
    const bCreated = new Date(b.createdAt).getTime()
    if (aCreated !== bCreated) return aCreated - bCreated
    return a.id.localeCompare(b.id)
  })
  return sorted[0]?.currency ?? null
}
```

**Rationale.**

- **Why COUNT, not amount.** Per Clarification Q2: one $5,000 USD rent payment shouldn't outvote 30 small EUR coffees if the user's daily life is mostly EUR. Frequency is a better proxy than magnitude for "what currency the user actually spends in."
- **Why 90 days.** A user who moved countries 6 months ago shouldn't get their old currency suggested.
- **Why the helper lives in `lib/transactions/queries.ts`.** Preserves the feature-007 invariant that `prisma.transaction.*` lives in one file. `lib/budgets/defaults.ts` consumes the typed function, NOT prisma directly.
- **Why `listAccountsForUser` for the fall-back.** Reuses the existing helper; no new prisma surface needed in `lib/accounts/`.
- **Why `null` as the ultimate fall-through.** The form renders without a preselected currency; the user picks manually. Documented in Clarification Q2.

**Alternatives considered.**

- *Aggregate by amount sum instead of count.* Rejected per Clarification Q2.
- *Cache the result per-user.* Rejected — the form is rare to render (only on create), and the underlying data changes on every transaction. Cheap per-render is the right trade-off.
- *Bias the fall-back to the "primary" currency from a future settings feature.* Rejected — feature 017 (Settings — primary currency) is out of scope; this fall-back is what makes the form work today.

---

## R5. Status + sort helpers — per-status priority + progressRatio desc + category.name asc

**Decision.**

```ts
// In lib/budgets/aggregations.ts (pure; no prisma import):

const NEAR_THRESHOLD_RATIO = "0.80"   // Clarification Q1 — 80% is "near"

/** Compute status given Money values; Decimal-precision-correct (no float). */
export function computeStatus(actuals: Money, amount: Money): "under" | "near" | "over" {
  if (amount.isZero()) return "under"  // defensive — FR-005 rejects zero at boundary
  // over: actuals > amount
  if (actuals.comparedTo(amount) > 0) return "over"
  // near: actuals >= 0.80 * amount AND actuals <= amount
  const nearThreshold = amount.times(new Money(NEAR_THRESHOLD_RATIO))
  if (actuals.comparedTo(nearThreshold) >= 0) return "near"
  return "under"
}

/**
 * Sort: status priority desc (over > near > under), then progressRatio desc, then category.name asc.
 * Stable for ties.
 */
export function sortBudgetsByStatusAndProgress(budgets: BudgetWithActuals[]): BudgetWithActuals[] {
  const statusOrder: Record<"under" | "near" | "over", number> = { over: 0, near: 1, under: 2 }
  return [...budgets].sort((a, b) => {
    const sa = statusOrder[a.status]
    const sb = statusOrder[b.status]
    if (sa !== sb) return sa - sb
    // Higher progressRatio first
    if (a.progressRatio !== b.progressRatio) return b.progressRatio - a.progressRatio
    // Tie-break: category.name asc
    return a.category.name.localeCompare(b.category.name)
  })
}
```

**Rationale.**

- **Status thresholds locked by spec Clarification Q1.** 80% is "near"; > 100% is "over"; everything else is "under". The 100% boundary is **inclusive of near** (per the spec's `0.80 ≤ ratio ≤ 1.00`) — a budget at exactly 100% is "near", not "over".
- **Sort by status first** so the user's attention goes to over → near → under (the priority order from US4 ac.2 + FR-028).
- **progressRatio desc within status** so the most-over comes before the least-over, etc.
- **category.name asc tie-break** for stable deterministic ordering.
- **The same sort is used by the dashboard widget's top-5 cut** (FR-028).

**Decimal-precision detail (R12 cross-link).** The status comparison uses `Money.comparedTo(...)` and `Money.times(...)` — both Decimal-precision-correct. The `progressRatio` number used for sort is a float (acceptable here because it's NOT used for status — only for ordering within a status). Mixing float ratio for sort + Decimal comparison for status is intentional: the status is the load-bearing classification, the ratio is the visual hint.

**Alternatives considered.**

- *Compute status from `progressRatio` (float).* Rejected — float drift at the 80% / 100% boundaries would cause edge-case misclassification. Decimal comparison is the constitutional choice.
- *Sort by absolute over-amount (e.g., `actuals - amount` for over budgets).* Considered. Rejected because comparing a $1 overage on a $5 budget (20% over) to a $50 overage on a $1,000 budget (5% over) by absolute dollars would hide the more proportionally-extreme case. Ratio is the better signal.

---

## R6. EXPENSE-only enforcement at three layers (defense in depth)

**Decision.**

The "Budgets are EXPENSE only" rule (FR-003 + US1 ac.4) is enforced at three layers:

1. **UI layer**: the create-budget form's `<CategoryPicker kind="EXPENSE">` filters the picker to EXPENSE only at the rendering layer. INCOME categories are not selectable. (Already supported by the existing CategoryPicker — verified in code review.)
2. **Zod schema layer**: `createBudgetSchema.superRefine(async (value, ctx) => { const cat = await getCategoryForUser(userId, value.categoryId); if (!cat) ctx.addIssue({...not_found...}); else if (cat.kind !== "EXPENSE") ctx.addIssue({...category_wrong_kind...}) })`. Same async-superRefine pattern feature 006 uses for parent-kind-match validation.
3. **Queries layer**: `createBudgetForUser(userId, input)` re-fetches the category via `getCategoryForUser(userId, input.categoryId)` and throws `CategoryWrongKindError` if `kind !== "EXPENSE"`. Caught at the action layer and converted to `category_wrong_kind` envelope.

The same three layers apply to the update action (technically the categoryId is read-only on update per US3 ac.5 — but the schema still includes the check defensively).

**Rationale.**

- **Three layers because a tampered payload that bypasses the UI shouldn't bypass enforcement.** Same defense-in-depth feature 007 used for the sign-must-match-type rule + the currency-must-match-account rule.
- **Layer 1** is UX (the user never sees INCOME categories in the picker).
- **Layer 2** is the structural rejection (Zod's async refine returns a typed error before the queries layer is called).
- **Layer 3** is the structural guardrail (even if the schema is bypassed at runtime — which shouldn't happen but is the "belt-and-suspenders" pattern).

The cost: one extra `getCategoryForUser` round-trip on every create / update. The benefit: structural impossibility of an INCOME-budgeted row.

**Alternatives considered.**

- *Only UI-layer enforcement.* Rejected — a hand-crafted FormData payload would bypass; spec FR-003 binds at the schema layer.
- *Database-level CHECK constraint joining Budget.categoryId to Category.kind.* Rejected — Postgres CHECK constraints can't reference other tables; would require a trigger; out of scope for v1.
- *Two layers (skip the queries-layer re-fetch).* Considered. Rejected — preserves the pattern feature 007 established; the cost of one extra read is negligible.

---

## R7. Uniqueness invariant — app-level pre-check + schema-level partial unique index (race-safe)

**Decision.**

Enforce the uniqueness invariant `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` at TWO layers:

1. **App-level pre-check** in `createBudgetForUser`: before the insert, call `findExistingActiveBudgetForUser(userId, categoryId, currency, period)` which queries the partial-unique key tuple. If a row exists, throw `BudgetExistsError` → action returns `{ error: { code: "budget_exists", … } }` with a friendly message.

2. **Schema-level partial unique index** (R1): catches the race condition where two near-simultaneous requests both pass the pre-check and both attempt the insert. The second insert fails with a Prisma `PrismaClientKnownRequestError` (P2002 — unique constraint violation). The action catches this and returns the SAME `budget_exists` envelope (same error code, same friendly message — the user sees one consistent error regardless of which layer caught it).

The same dual-layer check applies to `unarchiveBudgetForUser`: unarchiving may collide with an existing active budget for the same tuple if one was created while this row was archived. Both the pre-check and the catch are wired.

**Pseudocode.**

```ts
// In lib/budgets/queries.ts:
export async function createBudgetForUser(userId: string, input: CreateBudgetInput) {
  // App-level pre-check.
  const existing = await findExistingActiveBudgetForUser(userId, input.categoryId, input.currency, input.period)
  if (existing) {
    throw new BudgetExistsError(
      `You already have a ${input.currency} ${input.period.toLowerCase()} budget for this category. Edit the existing one or pick a different currency / period.`,
    )
  }
  // Verify EXPENSE-only (R6 layer 3).
  const cat = await getCategoryForUser(userId, input.categoryId)
  if (!cat) throw new CategoryWrongKindError("Category not found.")
  if (cat.kind !== "EXPENSE") throw new CategoryWrongKindError("Budgets are for expense categories.")

  try {
    return await prisma.budget.create({ data: { userId, ...input } })
  } catch (err) {
    // P2002 — schema-level partial unique violation (race).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BudgetExistsError("You already have an active budget for this category, currency, and period.")
    }
    throw err
  }
}

export async function findExistingActiveBudgetForUser(
  userId: string,
  categoryId: string,
  currency: string,
  period: "MONTHLY" | "YEARLY",
) {
  return prisma.budget.findFirst({
    where: { userId, categoryId, currency, period, archivedAt: null },
  })
}
```

**Rationale.**

- **App-level pre-check** gives the user a friendly error message BEFORE the insert and avoids surfacing a Prisma error code in the typical case.
- **Schema-level partial unique** catches the race that the pre-check can't (TOCTOU window between pre-check and insert).
- **Both paths return the same envelope** so the UI handles one error case, not two.

**Race handling on the client.** When the UI sees `budget_exists`, it re-fetches the list (the duplicate creation may have succeeded for the *other* concurrent caller — the user's list should now show that budget). Documented in spec Edge Cases.

**Alternatives considered.**

- *App-level only.* Rejected per the spec's race-handling requirement (Edge Cases line).
- *Schema-level only (rely on Prisma error message).* Rejected — surfaces a generic "Unique constraint failed" Prisma error to the UI; ugly + leaks implementation detail. The app-level pre-check is the user-friendly path.

---

## R8. Archived-category-stays semantics

**Decision.**

Per Clarification Q3 (and FR / Edge Cases): archiving a Category does NOT auto-archive its budgets. The budget row keeps its `categoryId`, and the `/dashboard/budgets` page surfaces it with an "(archived category)" label and a muted treatment.

Implementation:

- `listBudgetsForUser` joins the category via `include: { category: true }` (per Prisma's typed join). The returned row's `category.archivedAt` field tells the UI whether the category is archived.
- `<BudgetRow>` renders the category name with an "(archived category)" suffix when `category.archivedAt !== null`.
- The actuals computation continues to work — `sumExpenseByCategoryForBudgetsForUser` queries by `categoryId` regardless of category-archive state (the existing transactions referencing the archived category still match).
- The user may archive the budget themselves to clean up (no automatic cleanup).

**Rationale.**

- Hard-coupling category-archive to budget-archive would be a surprising side effect.
- The muted-flag approach surfaces the situation visibly.
- Same pattern feature 007's transaction list uses for archived-category references.

**Alternatives considered.**

- *Auto-archive budgets when their category is archived.* Rejected per Clarification Q3.
- *Hide budgets whose category is archived.* Rejected — would silently disappear a user-configured budget, surprising.
- *Reject category-archive when budgets reference it.* Rejected — would prevent the user from archiving the category, surprising in the opposite direction.

---

## R9. Soft-delete pattern — `archivedAt` mirrors features 004 / 006 / 007

**Decision.**

`Budget.archivedAt` is the soft-delete column. Default queries exclude (`where.archivedAt = null`). An opt-in `includeArchived: true` flag reveals them. The setArchivedAt helper (`setArchivedAtForUser`) is symmetric: set to `new Date()` to archive, set to `null` to unarchive.

Same shape as `Account.archivedAt` (feature 004), `Category.archivedAt` (feature 006), `Transaction.archivedAt` (feature 007).

**Rationale.** Constitutional consistency. The pattern is on its fifth repetition; no new infrastructure needed.

**Alternatives considered.** None — the convention is non-negotiable.

---

## R10. Dashboard widget composition — new `<BudgetsWidget>` server component wrapped in existing `<WidgetErrorBoundary>`

**Decision.**

Add a NEW file `app/(shell)/dashboard/_components/budgets-widget.tsx` (server component). It calls `listBudgetsWithActualsForUser(userId, { limit: 5, sortByStatusAndProgress: true })` (the queries-layer helper) and renders top-5 budgets in priority order. Empty state per FR-029 with the "Set up your first budget" CTA.

The widget is added to `app/(shell)/dashboard/page.tsx` as a 4th element inside the existing widget grid, wrapped in the existing `<WidgetErrorBoundary title="Budgets">` from feature 008. No new boundary component.

```tsx
// app/(shell)/dashboard/page.tsx — DELTA:
<div className="grid gap-4 md:grid-cols-2">
  <WidgetErrorBoundary title="Net worth">
    <NetWorthWidget userId={userId} />
  </WidgetErrorBoundary>

  <WidgetErrorBoundary title="This month">
    <CashFlowWidget userId={userId} />
  </WidgetErrorBoundary>

  {/* NEW — 4th widget */}
  <WidgetErrorBoundary title="Budgets">
    <BudgetsWidget userId={userId} />
  </WidgetErrorBoundary>

  <div className="md:col-span-2">
    <WidgetErrorBoundary title="Recent transactions">
      <RecentTransactionsWidget userId={userId} />
    </WidgetErrorBoundary>
  </div>
</div>
```

Layout: budgets joins the top row (becoming the 3rd cell of a 2-col grid, wrapping to a 3rd row on narrow viewports). The recent-transactions widget continues to span the full width below. The exact CSS arrangement is plan-acceptable either way; the constraint is that the existing 3 widgets are unchanged (SC-018).

**Rationale.**

- **Server component** keeps the query on the server; consistent with feature 008's pattern.
- **Reuses `<WidgetErrorBoundary>`** — no new boundary code.
- **Reuses `<WidgetCard>`** — same visual shell as the other widgets.
- **Reuses `<EmptyCell>`** — same inline empty-state primitive.
- **Page-level loading inherited** from existing `app/(shell)/loading.tsx` (FR-032 from spec; FR-033 from feature 008).

**Alternatives considered.**

- *Render the widget client-side with `useEffect` to fetch.* Rejected — server-component composition is the established pattern (consistent with the other 3 widgets).
- *Add a new `<BudgetWidgetErrorBoundary>` boundary.* Rejected — overkill; the existing one is parametric on title.

---

## R11. `lib/budgets/aggregations.ts` is pure — no Prisma import

**Decision.**

`lib/budgets/aggregations.ts`, `lib/budgets/periods.ts`, `lib/budgets/defaults.ts`, `lib/budgets/serialize.ts`, `lib/budgets/schemas.ts`, `lib/budgets/errors.ts` MUST NOT import `prisma`. ONLY `lib/budgets/queries.ts` imports `prisma` (and `prisma.budget.*`).

Same convention as feature 008's `lib/dashboard/aggregations.ts` (no prisma import).

**Audit grep.**

```bash
rg 'from "@/lib/prisma"' lib/budgets/
# Expected: ONLY lib/budgets/queries.ts
```

**Rationale.** Consistency with feature 008. Pure-function modules are unit-testable without Prisma mocks. The Prisma surface is concentrated in one file per module.

**Alternatives considered.** None — the convention is non-negotiable.

---

## R12. Money operations — Decimal-precision-correct status comparison; no float ratio for status

**Decision.**

The status-threshold comparison (`actuals >= 0.80 * amount` for "near"; `> 1.00 * amount` for "over") uses **`Money.comparedTo(...)` and `Money.times(...)`** — Decimal-precision-correct — NOT float division.

```ts
// PROHIBITED (float drift):
const ratio = parseFloat(actuals.toString()) / parseFloat(amount.toString())
if (ratio > 1.0) return "over"

// CORRECT (Decimal-precision):
if (actuals.comparedTo(amount) > 0) return "over"
const nearThreshold = amount.times(new Money("0.80"))
if (actuals.comparedTo(nearThreshold) >= 0) return "near"
```

The `progressRatio` field on `BudgetWithActuals` IS a float (used only for the progress-bar fill % CSS and for the sort tie-breaker — NOT for status). Mixing float `progressRatio` for sort + Decimal status for classification is intentional: the load-bearing classification is Decimal; the visual hint is fine as float.

**Rationale.**

- Constitution Principle I: "no arithmetic on monetary values outside `lib/money/`". `Money.comparedTo(...)` and `Money.times(...)` are the Decimal-blessed operations; using them inside `lib/budgets/aggregations.ts` is constitutionally fine.
- The 80% boundary is the most fragile spot: at $400 budget and $320 actuals, `parseFloat("320") / parseFloat("400") === 0.8` exactly — but at $1000.03 budget and $800.024 actuals (the kind of numbers that show up in real data), the float ratio diverges from the Decimal ratio in the 17th decimal place, causing 1-in-10^17 misclassification. Constitution mandates we don't go there.
- Symmetric for the 100% boundary.

**Implementation note.** `Money` is `Prisma.Decimal` (an alias). Decimal's `.times(other)` returns a new Decimal; `.comparedTo(other)` returns `-1 | 0 | 1`. Both are zero-precision-loss operations.

**Alternatives considered.**

- *Use float ratio for both status and sort.* Rejected — float drift at the 80% / 100% boundaries.
- *Avoid `Money.times(...)` and compare `actuals.times(100).comparedTo(amount.times(80))` instead.* Equivalent in correctness; the form chosen above is more readable. Either is plan-acceptable.

---

## R13. Test surface mapping — which SCs land in which test file

**Decision.**

| SC | Test file | Notes |
|---|---|---|
| SC-001 | E2E — `tests/e2e/budgets.spec.ts` (US1 step) | Stopwatch on the open-page → submit-form → see-row flow. |
| SC-002 | E2E — `tests/e2e/budgets.spec.ts` | Byte-for-byte assertion of actuals vs. transactions-list sum. |
| SC-003 | E2E — `tests/e2e/budgets.spec.ts` | Visual: every `<Money>` shows currency code. |
| SC-004 | E2E — `tests/e2e/budgets.spec.ts` (US2 ac.5) | Multi-currency separation. |
| SC-005 | E2E — `tests/e2e/budgets.spec.ts` (US1 ac.6 step) | Cross-user isolation. |
| SC-006 | Unit — `tests/unit/budgets-queries.test.ts` + E2E — `tests/e2e/budgets.spec.ts` (US1 ac.5 step) | Uniqueness invariant + race-safe handling. |
| SC-007 | Audit grep (run by money-reviewer) | `rg "prisma\.transaction" lib/ app/` returns only `lib/transactions/queries.ts`. |
| SC-008 | Audit greps (run by money-reviewer) | See plan.md §Money & Currency Notes. |
| **SC-009** | **Unit — `tests/unit/budgets-aggregations.test.ts`** | **8+ cases per the plan.md outline.** |
| **SC-010** | **E2E — `tests/e2e/budgets.spec.ts` (US2 step)** | **Full create → record → see-actuals-update flow.** |
| **SC-011** | **E2E — `tests/e2e/budgets.spec.ts` (US2 ac.3 step)** | **Over-budget visual treatment (color + icon + label).** |
| SC-012 | E2E — `tests/e2e/budgets.spec.ts` (US4 step) | Dashboard widget composition. |
| SC-013 | E2E — `tests/e2e/budgets.spec.ts` (US2 ac.5 step) | Multi-currency separate rows. |
| SC-014 | E2E — `tests/e2e/budgets.spec.ts` | Placeholder replaced; functional list visible. |
| **SC-015** | **All existing test files unchanged + green** | Cross-feature preservation. |
| SC-016 | E2E — `tests/e2e/budgets.spec.ts` (keyboard-only path) | Tab + Enter from the page top through the CTA. |
| SC-017 | E2E — `tests/e2e/budgets.spec.ts` | Archived-category renders with the label. |
| **SC-018** | **Re-run existing `tests/e2e/dashboard.spec.ts`** | The 3 existing widgets render byte-for-byte the same. |

**Rationale.** Constitution Principle IV requires "test the money paths." The aggregations + actuals computation IS the money path. The constitution-mandated E2E (SC-010 + SC-011) lands in `tests/e2e/budgets.spec.ts`.

---

## R14. Migration plan — additive only, no data hazard

**Decision.**

One Prisma migration, generated via:

```bash
pnpm db:migrate -- --name add_budget
```

Migration contents (in order):

1. `CREATE TYPE "BudgetPeriod" AS ENUM ('MONTHLY', 'YEARLY');`
2. `CREATE TABLE "Budget" (...)` with the columns enumerated in R1.
3. `CREATE INDEX "Budget_userId_archivedAt_idx" ON "Budget"("userId", "archivedAt");`
4. `CREATE INDEX "Budget_userId_categoryId_idx" ON "Budget"("userId", "categoryId");`
5. **Partial unique index (raw SQL, R1):**
   ```sql
   CREATE UNIQUE INDEX "Budget_userId_categoryId_currency_period_active_unique"
     ON "Budget"("userId", "categoryId", "currency", "period")
     WHERE "archivedAt" IS NULL;
   ```
6. FK constraints:
   ```sql
   ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey"
     FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey"
     FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
   ```

**Data hazard.** None. Existing `main` has zero budgets; the migration is purely additive. No back-fill required. The migration is reversible (Prisma's down-migration is auto-generated; can be rolled back via `pnpm db:migrate reset` or by reverting the migration directory).

**Edit-the-generated-SQL workflow.** Because Prisma 7 may not natively express the partial unique index in the schema, the implementer:

1. Adds the model to `db/schema.prisma` WITHOUT a `@@unique([...])` line (the comment documents what's wanted).
2. Runs `pnpm db:migrate -- --name add_budget --create-only` to generate the SQL without applying.
3. Edits the generated `migration.sql` to add the raw `CREATE UNIQUE INDEX ... WHERE archivedAt IS NULL` statement.
4. Runs `pnpm db:migrate` to apply.

Documented in `quickstart.md`.

**Rationale.** Same workflow other Prisma-on-Postgres projects use for partial indexes. No `db push`. The migration file is the source of truth.

**Alternatives considered.**

- *Use Prisma's `previewFeatures = ["..."]` for some hypothetical partial-index preview.* Rejected — would tie us to an unstable preview API.
- *Skip the partial unique entirely + rely only on app-level pre-check.* Rejected per R7 (TOCTOU race).

---
