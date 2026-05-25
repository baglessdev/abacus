# Function-Surface Contract — `lib/transactions/queries.ts` extensions

This contract documents the **two changes** this feature makes to the existing `lib/transactions/queries.ts` file. Both changes preserve the feature-007 invariant that `prisma.transaction.*` MUST appear ONLY in this file.

## Location

`lib/transactions/queries.ts` — the file is unchanged in shape (it is still the ONLY file in the codebase that imports `prisma.transaction.*`). The two changes below are an ADD (new helper) and an EXTEND (optional parameter on an existing helper).

---

## Change 1: ADD `sumIncomeExpenseByCurrencyForUser`

### Signature

```ts
export async function sumIncomeExpenseByCurrencyForUser(
  userId: string,
  dateFrom: Date,                  // inclusive — UTC midnight of the 1st of the current calendar month
  dateTo: Date,                    // exclusive — UTC midnight of the 1st of the next calendar month
): Promise<CashFlowAggregateRow[]>

type CashFlowAggregateRow = {
  currency: string                 // ISO 4217 alpha-3, uppercase
  type: "INCOME" | "EXPENSE"       // never TRANSFER — filtered at the SQL `where:` level
  _sum: { amount: Money }          // null Decimals from Prisma are lifted to new Money(0) at the boundary
}
```

`Money` is `Prisma.Decimal` aliased from `lib/money/decimal.ts`.

### Behavior

1. Issues one Prisma `groupBy` query:
   ```ts
   const rows = await prisma.transaction.groupBy({
     by: ["currency", "type"],
     where: {
       userId,
       type: { in: ["INCOME", "EXPENSE"] },   // TRANSFER excluded at SQL level (FR-010 / FR-015)
       archivedAt: null,                       // FR-013
       date: { gte: dateFrom, lt: dateTo },    // [dateFrom, dateTo) — first-of-next-month exclusive
     },
     _sum: { amount: true },
   })
   ```
2. Lifts each `_sum.amount` `Decimal | null` to `Money`:
   ```ts
   return rows.map((r) => ({
     currency: r.currency,
     type: r.type as "INCOME" | "EXPENSE",
     _sum: { amount: r._sum.amount != null ? new Money(r._sum.amount) : new Money(0) },
   }))
   ```
3. Returns the lifted array.

### Input contract

- `userId` MUST be supplied by the caller from `session.user.id` (data-scoping convention; FR-025). The helper does NOT call `auth()` internally — that is the caller's responsibility (the dashboard page server component).
- `dateFrom` MUST be UTC midnight of the 1st of the target calendar month (the caller supplies this via `computeCurrentMonthRange()` from `lib/dashboard/dates.ts`).
- `dateTo` MUST be UTC midnight of the 1st of the next calendar month (exclusive).

### Output contract

- Array of zero or more `CashFlowAggregateRow` elements.
- Each element's `_sum.amount` is a `Money` instance (never `null`, never a raw Decimal).
- The array is unordered by default (Prisma `groupBy` ordering is not guaranteed); the caller (`buildCashFlowShape`) handles sorting.

### Errors

- Throws on Prisma error (the caller's per-widget error boundary catches and renders the inline error state). No envelope shape — this is a query helper, not a server action.

### Index used

`@@index([userId, date])` (from feature 007). Postgres satisfies the `userId` equality and the `date` range with one index scan; per-row `type` and `currency` filters are evaluated in-row from the heap.

### Constitution compliance

- **Principle I (money math)**: PASS. Aggregation is Postgres-side via `_sum.amount` on the Decimal column (no JavaScript arithmetic on monetary amounts inside the helper). The `null → new Money(0)` lift is the boundary conversion from Postgres Decimal to in-process `Money`.
- **Data-scoping convention**: PASS. `userId` is the first positional arg and is included in the `where:` clause. Cross-user reads collapse to empty results (no other user's rows can leak in).
- **`prisma.transaction.*` confined to this file**: PASS. The new helper lives in this file; the call site does not exist elsewhere.

### Consumed by

- `<CashFlowWidget>` in `app/(shell)/dashboard/_components/cash-flow-widget.tsx`.

### Unit-test coverage

The helper itself is a thin wrapper around Prisma `groupBy`; the unit tests in `tests/unit/dashboard-aggregations.test.ts` cover the downstream `buildCashFlowShape` adapter (which is the meaningful transformation). The helper's Prisma round-trip is exercised in `tests/e2e/dashboard.spec.ts` (the byte-for-byte cash-flow assertion).

---

## Change 2: EXTEND `listTransactionsForUser` with optional `limit?: number`

### Signature delta

```ts
// BEFORE (feature 007):
export type ListTransactionsFilters = {
  dateFrom?: Date
  dateTo?: Date
  accountId?: string
  categoryId?: string
  type?: "INCOME" | "EXPENSE" | "TRANSFER"
  includeArchived?: boolean
}

// AFTER (feature 008):
export type ListTransactionsFilters = {
  dateFrom?: Date
  dateTo?: Date
  accountId?: string
  categoryId?: string
  type?: "INCOME" | "EXPENSE" | "TRANSFER"
  includeArchived?: boolean
  limit?: number                         // NEW — when set, applied via Prisma `take`
}

// listTransactionsForUser signature unchanged; body gains one line:
export async function listTransactionsForUser(
  userId: string,
  filters: ListTransactionsFilters = {},
) {
  const where: Prisma.TransactionWhereInput = { userId }
  // ... existing where: clause build (unchanged) ...

  return prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    ...(filters.limit ? { take: filters.limit } : {}),       // NEW
  })
}
```

### Behavior

- When `filters.limit` is set to a positive integer N: Prisma applies `take: N`, returning at most N rows.
- When `filters.limit` is absent or zero: behaviour is identical to the pre-feature-008 helper (no `take` applied).
- Sort order is unchanged: `date DESC, createdAt DESC` (FR-017 / feature 007 FR-020).
- All other filter fields behave identically.

### Input contract

- `filters.limit` MUST be a positive integer when set. The helper does NOT validate this (it trusts its typed input per Principle III); callers should not pass `0`, `-1`, or `NaN`. In practice the dashboard's only caller passes the literal `10`.

### Output contract

- Returns `Transaction[]` (Prisma row type). At most `filters.limit` rows; fewer if the underlying data has fewer matching rows.
- Sort order: `date DESC, createdAt DESC` — same as before.
- The caller serializes each row to `TransactionDTO` via `serializeTransaction(row)` from `lib/transactions/serialize.ts`.

### Errors

- Throws on Prisma error (the dashboard's per-widget error boundary catches).

### Index used

- `@@index([userId, date])` for the date sort + userId filter, with the `take: 10` causing Postgres to stop scanning after 10 rows.

### Backward compatibility

- Existing call sites in `lib/transactions/actions.ts` (`listTransactions` server action) and `app/(shell)/dashboard/transactions/page.tsx` continue to work without modification — they pass `filters` without `limit`, and the new code path is gated on `filters.limit ? {} : {}` so absence is a no-op.
- **No regression** to feature 007's transactions-list rendering.

### Consumed by

- `<RecentTransactionsWidget>` in `app/(shell)/dashboard/_components/recent-transactions-widget.tsx` — calls `listTransactionsForUser(userId, { limit: 10 })`.
- (Existing callers continue to call without `limit`; behaviour unchanged for them.)

### Constitution compliance

- **Principle I, II, III**: PASS. No money math change; type-safe extension; typed-input boundary unchanged.
- **`prisma.transaction.*` confined to this file**: PASS. The extension touches only this file.
- **No regression**: The audit grep `rg "limit" lib/transactions/actions.ts` SHOULD return zero matches (the action does NOT expose `limit` to its FormData/URL contract).

---

## Summary of audit invariants after this feature

```bash
# 1. prisma.transaction.* still lives only here
rg "prisma\.transaction\." lib/ app/
# Expected: matches only lib/transactions/queries.ts

# 2. The new helper exists
rg "export async function sumIncomeExpenseByCurrencyForUser" lib/transactions/queries.ts
# Expected: one match

# 3. The limit extension exists
rg "filters\.limit" lib/transactions/queries.ts
# Expected: one or two matches (the type definition + the conditional take)

# 4. No new prisma.* call site outside lib/transactions/queries.ts
rg "prisma\." lib/dashboard/
# Expected: zero matches
```

## Applicable FRs

FR-010, FR-011, FR-013, FR-015, FR-016, FR-017, FR-019, FR-025, FR-027.

## Applicable SCs

SC-005, SC-006, SC-007, SC-010, SC-011.
