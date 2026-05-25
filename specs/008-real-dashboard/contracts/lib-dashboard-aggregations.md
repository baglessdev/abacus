# Function-Surface Contract — `lib/dashboard/aggregations.ts`

This feature exposes NO HTTP API surface. The contract below describes the **server-only function exports** added in this feature to the new file `lib/dashboard/aggregations.ts`. All exports are pure functions (no Prisma access, no I/O, no clock dependency); they are consumed by the dashboard's widget server components and unit-tested directly.

## Location

`lib/dashboard/aggregations.ts`. NOT marked `"use server"` (these are pure data shapers, not server actions). The file is server-only by convention (re-exported via the `lib/dashboard/index.ts` server-only barrel).

## Imports the file may use

- `lib/money/decimal` → `Money`, optionally `sumAmounts`
- Standard library (`Map`, `Array`)
- TypeScript-only types from `lib/accounts/serialize` (`AccountDTO`)
- TypeScript-only types from `lib/transactions/queries` for the `CashFlowAggregateRow` shape (the helper return type)

## Imports the file MUST NOT use

- `@/lib/prisma` — **never imported**. The audit grep `rg "from \"@/lib/prisma\"" lib/dashboard/` MUST return zero matches.
- `@prisma/client` for runtime values (the Prisma client) — only type imports are acceptable if needed for the `Money = Prisma.Decimal` aliasing, but `Money` is already re-exported from `lib/money/decimal.ts`; the file should import from there.

## Exports

### `computeNetWorthByCurrency`

```ts
export function computeNetWorthByCurrency(
  accounts: AccountDTO[]
): PerCurrencyTotal[]
```

**Behavior.**

1. Iterates `accounts`, grouping by `account.currency`.
2. For each currency, sums the per-account `account.balance` (lifted from `string` to `Money` via `new Money(account.balance)`) — using either `Money.plus(...)` in a `Map<string, Money>` reduce OR `sumAmounts(arr)` from `lib/money/decimal.ts`.
3. Materializes each currency's sum as `{ currency: string; total: string }` by calling `.toString()` on the `Money` at the final step.
4. Sorts by descending absolute value of `total`; ties broken by ISO 4217 alphabetical ascending (FR-007).
5. Returns the sorted array.

**Input contract.**

- `accounts` MUST be a typed `AccountDTO[]`. The caller is responsible for filtering archived accounts (the dashboard's call passes `{ includeArchived: false }` to `listAccounts`).
- Empty array → returns empty array.
- Single account → returns one-element array with `total === account.balance`.
- Multi-currency accounts → returns one element per distinct currency.

**Output contract.**

```ts
type PerCurrencyTotal = {
  currency: string   // ISO 4217 alpha-3, uppercase, exactly as carried on the input AccountDTO
  total: string      // canonical decimal string from Money.toString(); preserves the sign
}
```

**Determinism.**

- Same input → same output, byte-for-byte (no clock dependency, no Map-iteration-order dependency, sorted output).
- Negative balances preserved (the reducer does not take absolute value of the per-account balance during summation; absolute value is only used as the **sort key**).

**Errors.**

- **None thrown.** Pure function with no I/O. A malformed `account.balance` string (e.g., not a decimal) would surface as a `Decimal` constructor exception via `new Money(...)`, but the caller is responsible for passing a valid `AccountDTO[]` per the type contract.

**Unit-test cases (tests/unit/dashboard-aggregations.test.ts):**

- Empty input → `[]`.
- Single account → one-element array, `total === account.balance`.
- Three accounts in two currencies (USD x2 + EUR x1) → two elements; USD's total is the sum of the two USD accounts.
- Negative balance in one currency → row shows the negative value.
- Zero balance → row shows the zero (not filtered).
- Mixed-sign within one currency (e.g., USD checking $+2,500 and USD credit -$1,000) → sums to USD $+1,500.
- Sort order: largest absolute total first.
- Tie-break: two currencies with equal absolute totals → ISO 4217 ascending.
- No rounding drift: 0.1 + 0.2 → 0.30 exact (Decimal arithmetic).

### `buildCashFlowShape`

```ts
export function buildCashFlowShape(
  rows: CashFlowAggregateRow[]
): PerCurrencyCashFlow[]
```

Where `CashFlowAggregateRow` is the return-element type of `sumIncomeExpenseByCurrencyForUser` (exported from `lib/transactions/queries.ts`):

```ts
type CashFlowAggregateRow = {
  currency: string
  type: "INCOME" | "EXPENSE"
  _sum: { amount: Money }   // null Decimals from Prisma are lifted to new Money(0) at the boundary
}
```

**Behavior.**

1. Iterates `rows`, grouping by `currency`. For each currency, picks the INCOME row's `_sum.amount` (default to `new Money(0)` if absent) and the EXPENSE row's `_sum.amount` (default to `new Money(0)` if absent).
2. Computes `net = income.plus(expense)` (since EXPENSE is stored negative per feature 007's signed-amount convention, this is `income - |expense|`).
3. Materializes each currency's block as `{ currency: string; income: string; expense: string; net: string }`.
4. Sorts by descending absolute value of `net`; ties broken by ISO 4217 alphabetical ascending (same rule as net worth, for visual consistency).
5. Returns the sorted array.

**Input contract.**

- `rows` MUST be a typed `CashFlowAggregateRow[]`. Per the Prisma `groupBy` shape, each `currency`/`type` combination appears at most once (the SQL `GROUP BY (currency, type)` guarantees this).
- TRANSFER rows MUST NOT appear in the input — the caller's `where: { type: { in: ["INCOME", "EXPENSE"] } }` filters them at the SQL level.
- Empty array → returns empty array.

**Output contract.**

```ts
type PerCurrencyCashFlow = {
  currency: string   // ISO 4217 alpha-3, uppercase
  income: string     // canonical decimal string; always >= 0
  expense: string    // canonical decimal string; always <= 0 (stored sign preserved)
  net: string        // canonical signed decimal string; net = income + expense
}
```

**Determinism.** Same as `computeNetWorthByCurrency`: same input → same byte-for-byte output.

**Errors.** None thrown. Pure function.

**Unit-test cases (tests/unit/dashboard-aggregations.test.ts):**

- Empty input → `[]`.
- Single currency, only INCOME → `{ currency: "USD", income: "5000.00", expense: "0", net: "5000.00" }`.
- Single currency, only EXPENSE → `{ currency: "USD", income: "0", expense: "-1200.00", net: "-1200.00" }`.
- Single currency, both → `{ currency: "USD", income: "5000.00", expense: "-1200.00", net: "3800.00" }`.
- Multi-currency (USD with both + EUR with both) → two elements, sorted by descending absolute net.
- Net = 0 edge case → row renders with `net: "0"`; not filtered out.

---

## Consumed by

- `<NetWorthWidget>` in `app/(shell)/dashboard/_components/net-worth-widget.tsx` — calls `computeNetWorthByCurrency(accounts)` and iterates the result.
- `<CashFlowWidget>` in `app/(shell)/dashboard/_components/cash-flow-widget.tsx` — calls `buildCashFlowShape(rows)` after `sumIncomeExpenseByCurrencyForUser(...)` resolves.
- `tests/unit/dashboard-aggregations.test.ts` — direct invocation under all the cases enumerated above.

## Constitution compliance

- **Principle I (money math)**: PASS. All arithmetic flows through `Money.plus(...)` / `sumAmounts(...)` from `lib/money/decimal.ts`. No raw Decimal `.plus()` / `.minus()` / `new Decimal(...)` outside the `lib/money/` consumer surface. The audit grep `rg '\.plus\(|\.minus\(|new Decimal\(|new Money\(' lib/dashboard/aggregations.ts` returns only `new Money(...)` boundary lifts (lifting a Decimal-as-string to Money) and `.plus(...)` calls on `Money` instances.
- **Principle II (type safety)**: PASS. Strict types throughout; public types (`PerCurrencyTotal`, `PerCurrencyCashFlow`) exported from `lib/dashboard/index.ts`.
- **Principle III (validate at boundaries)**: N/A — pure in-process functions, typed inputs, no boundary.
- **Principle IV (test the money paths)**: PASS. Unit suite covers every case enumerated above.

## Data-scoping note

These functions do NOT take `userId`. They are pure data shapers operating on data that the caller (the widget server component) has already fetched with a `userId`-scoped query. There is no userId path through these functions — they cannot leak across users by construction.

## Applicable FRs

FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-015, FR-026, FR-027.

## Applicable SCs

SC-003, SC-004, SC-005, SC-006, SC-011.
