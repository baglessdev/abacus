# Function-Surface Contract — `lib/transactions/queries.ts` extensions

This contract documents the **TWO ADDITIONS** this feature makes to the existing `lib/transactions/queries.ts` file. Both changes preserve the feature-007 invariant that `prisma.transaction.*` MUST appear ONLY in this file.

**No existing public surface is modified.** All existing exports (listTransactionsForUser, sumIncomeExpenseByCurrencyForUser, sumAmountsForAccount, sumAmountsForAccountsBatch, createTransactionForUser, etc.) are untouched. Add-only.

## Location

`lib/transactions/queries.ts` — the file is unchanged in shape (it is still the ONLY file in the codebase that imports `prisma.transaction.*`). The two changes below are both ADDs.

---

## Change 1: ADD `getMostUsedExpenseCurrencyForUser`

### Signature

```ts
export async function getMostUsedExpenseCurrencyForUser(
  userId: string,
  sinceDays?: number,    // default 90 — per Clarification Q2
): Promise<string | null>
```

### Behavior

1. Compute `since = now - sinceDays * 24h` truncated to UTC midnight.
2. Issue a Prisma `groupBy`:
   ```ts
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
       { _count: { currency: "desc" } },
       { currency: "asc" },
     ],
     take: 1,
   })
   ```
3. Return `rows[0]?.currency ?? null`.

### Input contract

- `userId` MUST be supplied by the caller from `session.user.id` (data-scoping convention).
- `sinceDays` is optional; defaults to `90` per Clarification Q2.

### Output contract

- A single ISO 4217 alpha-3 currency code (uppercase) OR `null` (no EXPENSE transactions in the window).
- If two currencies tie on COUNT, the alphabetically-first wins (deterministic tie-break).

### Errors

- Throws on Prisma error (caller — `lib/budgets/defaults.ts.computeDefaultCurrencyForBudget` — handles by falling back to the account-based currency OR returning null).

### Index used

`@@index([userId, date])` (from feature 007). The userId equality + date range satisfies the index scan; the per-row `type === "EXPENSE"` filter is evaluated in-row.

### Consumed by

- `lib/budgets/defaults.ts.computeDefaultCurrencyForBudget` — for the create-budget form's default-currency suggestion.

### Constitution compliance

- **Principle I (money math)**: N/A (returns currency code, not money).
- **Data-scoping convention**: PASS. `userId` first arg, in `where:` clause. Cross-user reads collapse to null.
- **`prisma.transaction.*` confined to this file**: PASS. New helper lives in this file.

### Unit-test coverage

- `tests/unit/budgets-defaults.test.ts` — covers the consumer; the helper itself is exercised indirectly. A direct unit test on the helper requires a Prisma mock that supports `groupBy` ordering; if added, it lands in `tests/unit/transactions-queries.test.ts` (mocked).

---

## Change 2: ADD `sumExpenseByCategoryForBudgetsForUser`

### Signature

```ts
export async function sumExpenseByCategoryForBudgetsForUser(
  userId: string,
  dateFrom: Date,                 // inclusive — UTC midnight
  dateTo: Date,                   // exclusive — UTC midnight of first-of-next-period
  categoryIds: string[],          // restrict to the budgeted categories (small)
  currencies: string[],           // restrict to the budgeted currencies (small)
): Promise<BudgetActualsRow[]>

type BudgetActualsRow = {
  categoryId: string              // non-null after the application-side filter
  currency: string                // ISO 4217 alpha-3
  _sum: { amount: Money }         // null Decimals lifted to new Money(0); EXPENSE sums are negative per signed-amount convention
}
```

### Behavior

1. Short-circuit: if `categoryIds.length === 0 || currencies.length === 0`, return `[]` (no Prisma round-trip).
2. Issue a Prisma `groupBy`:
   ```ts
   const rows = await prisma.transaction.groupBy({
     by: ["categoryId", "currency"],
     where: {
       userId,
       type: "EXPENSE",
       archivedAt: null,
       date: { gte: dateFrom, lt: dateTo },
       categoryId: { in: categoryIds },
       currency: { in: currencies },
     },
     _sum: { amount: true },
   })
   ```
3. Filter out rows where `categoryId === null` (defensive — EXPENSE rows shouldn't have null categoryId at create time, but the schema allows it; the budget actuals query specifically wants categorized rows).
4. Lift each `_sum.amount` Decimal to `Money` at the boundary (`null → new Money(0)`).
5. Return the lifted array.

### Input contract

- `userId` MUST be supplied by the caller from `session.user.id`.
- `dateFrom`, `dateTo` MUST be UTC midnight (the caller supplies via `computeCurrentPeriodRange(period)` from `lib/budgets/periods.ts`).
- `categoryIds` MUST be the distinct list of categoryIds budgeted in this period type. Empty array → short-circuit.
- `currencies` MUST be the distinct list of currencies budgeted in this period type. Empty array → short-circuit.

### Output contract

- Array of zero or more `BudgetActualsRow`. Each row's `_sum.amount` is a `Money` instance (never null).
- The `_sum.amount` carries the **stored sign** (negative for EXPENSE per feature 007). The CALLER (`lib/budgets/queries.ts.listBudgetsWithActualsForUser`) applies `.abs()` before storing in the actuals Map, since the display value is positive magnitude (FR-010 second sentence).
- The array is unordered (Prisma groupBy ordering is not guaranteed); the caller maps by `(categoryId, currency)` key.

### Errors

- Throws on Prisma error (the caller's listBudgets action catches and returns `internal_error`).

### Index used

`@@index([userId, date])` (from feature 007). The userId equality + date range satisfies the index scan; the `categoryId IN (...)` + `currency IN (...)` + `type === "EXPENSE"` filters are evaluated in-row from the heap. Performance is comparable to feature 008's `sumIncomeExpenseByCurrencyForUser` — one indexed scan + small in-row filters.

### Consumed by

- `lib/budgets/queries.ts.listBudgetsWithActualsForUser` — called at most twice per render (MONTHLY + YEARLY), in parallel via `Promise.all`.

### Constitution compliance

- **Principle I (money math)**: PASS. Aggregation is Postgres-side via `_sum.amount` on the Decimal column (no JavaScript arithmetic on monetary amounts inside the helper). The `null → new Money(0)` lift is the canonical boundary conversion.
- **Data-scoping convention**: PASS. `userId` first arg, in `where:` clause. Cross-user reads collapse to empty results.
- **`prisma.transaction.*` confined to this file**: PASS.

### Unit-test coverage

- Exercised end-to-end in `tests/e2e/budgets.spec.ts` (the byte-for-byte actuals assertion in step 5 of the E2E outline). Direct unit-test coverage on the helper's Prisma shape is optional.

---

## Summary of audit invariants after this feature

```bash
# 1. prisma.transaction.* still lives only in lib/transactions/queries.ts (feature 007 invariant).
rg "prisma\.transaction" lib/ app/ --include="*.ts" --include="*.tsx"
# Expected: matches only lib/transactions/queries.ts (+ tests/unit/transactions-queries.test.ts mock).

# 2. The two new helpers exist.
rg "export async function getMostUsedExpenseCurrencyForUser" lib/transactions/queries.ts
rg "export async function sumExpenseByCategoryForBudgetsForUser" lib/transactions/queries.ts
# Expected: one match each.

# 3. lib/budgets/ does not directly import prisma (except queries.ts).
rg 'from "@/lib/prisma"' lib/budgets/
# Expected: ONLY lib/budgets/queries.ts.
```

## Applicable FRs

FR-010, FR-013, FR-022, FR-023.

## Applicable SCs

SC-002, SC-007, SC-008.
