# Function-Surface Contract — `lib/budgets/aggregations.ts`

This contract describes the **server-only function exports** in the new file `lib/budgets/aggregations.ts`. All exports are pure functions (no Prisma access, no I/O, no clock dependency); they are consumed by the queries-layer composite helper and unit-tested directly.

## Location

`lib/budgets/aggregations.ts`. NOT marked `"use server"` (pure data shapers, not server actions). Re-exported via the `lib/budgets/index.ts` server-only barrel.

## Imports the file may use

- `lib/money/decimal` → `Money`, optionally `sumAmounts`
- Standard library (`Map`, `Array`)
- TypeScript-only types from `@prisma/client` for the `Budget`, `Category`, `BudgetPeriod` Prisma types (type-only imports OK; runtime `prisma.*` is NOT)

## Imports the file MUST NOT use

- `@/lib/prisma` — **never imported**. Audit grep `rg 'from "@/lib/prisma"' lib/budgets/aggregations.ts` MUST return zero.
- `prisma.*` runtime values from `@prisma/client` — only TYPE imports are acceptable.

## Exports

### `computeStatus`

```ts
export function computeStatus(actuals: Money, amount: Money): "under" | "near" | "over"
```

**Behavior** (R5 + R12).

Decimal-precision-correct status classification:

```ts
if (amount.isZero()) return "under"                              // defensive — FR-005 rejects zero at boundary
if (actuals.comparedTo(amount) > 0) return "over"               // actuals > amount → over
const nearThreshold = amount.times(new Money("0.80"))           // 80% threshold as Decimal
if (actuals.comparedTo(nearThreshold) >= 0) return "near"       // actuals >= 80% of amount → near
return "under"
```

The 100% boundary is **inclusive of `near`** per spec Clarification Q1 (`0.80 ≤ ratio ≤ 1.00` for near; `> 1.00` for over).

**Determinism.** Same input → same output, byte-for-byte. No clock dependency.

**Errors.** None thrown.

### `attachActualsToBudgets`

```ts
type ActualsKey = string  // `${period}::${categoryId}::${currency}`

export function attachActualsToBudgets(
  budgets: Array<Budget & { category: Category }>,
  actualsMap: Map<ActualsKey, Money>,
  periodWindows: { MONTHLY: { dateFrom: Date; dateTo: Date }; YEARLY: { dateFrom: Date; dateTo: Date } },
): BudgetWithActuals[]
```

**Behavior.**

For each budget:

1. Look up the actuals via `actualsMap.get(`${budget.period}::${budget.categoryId}::${budget.currency}`) ?? new Money(0)`.
2. Compute `amount = new Money(budget.amount)` (boundary lift from Prisma Decimal).
3. Compute `remaining = amount.minus(actuals)` via `Money.minus(...)`.
4. Compute `progressRatio = parseFloat(actuals.toString()) / parseFloat(amount.toString())` (float — used only for UI fill % and sort tie-breaker, NOT for status; see R12).
5. Compute `status = computeStatus(actuals, amount)` (Decimal-precision).
6. Look up `periodStart` and `periodEnd` from `periodWindows[budget.period]`.
7. Return `{ budget, category, actuals, remaining, progressRatio, status, periodStart, periodEnd }`.

The function maps the input array element-wise; preserves input order.

**Input contract.**

- `budgets` MUST be a typed array of `Budget & { category: Category }` (i.e., the `include: { category: true }` shape from Prisma).
- `actualsMap` MUST be keyed by `${period}::${categoryId}::${currency}` exactly. Missing keys default to zero — this is the "no transactions yet" case (US2 ac.6).
- `periodWindows` MUST include both MONTHLY and YEARLY ranges (computed at request time via `computeCurrentMonthRange()` and `computeCurrentYearRange()` from `lib/budgets/periods.ts`).

**Output contract.**

Array of `BudgetWithActuals` of the same length and order as input. See `data-model.md` for the shape.

**Errors.** None thrown for valid typed inputs. A malformed `budget.amount` (not a decimal string) would surface as a `Decimal` constructor exception via `new Money(...)`, but the caller is responsible for valid types.

### `sortBudgetsByStatusAndProgress`

```ts
export function sortBudgetsByStatusAndProgress(budgets: BudgetWithActuals[]): BudgetWithActuals[]
```

**Behavior** (R5).

Sort priority:
1. Status: `over` (0) → `near` (1) → `under` (2) — ascending.
2. Within the same status: `progressRatio` desc (higher ratio first — the most-stressed budget first).
3. Within the same `progressRatio`: `category.name` asc (alphabetical) for stable ordering.

Returns a NEW array (does not mutate input). Stable for ties at any level.

**Determinism.** Same input → same byte-for-byte output.

**Errors.** None thrown.

## Consumed by

- `lib/budgets/queries.ts` — `listBudgetsWithActualsForUser` calls all three.
- `tests/unit/budgets-aggregations.test.ts` — direct invocation under the 8+ cases enumerated in plan.md.

## Constitution compliance

- **Principle I (money math)**: PASS. All arithmetic flows through `Money.plus(...)` / `Money.minus(...)` / `Money.times(...)` / `Money.comparedTo(...)` from `lib/money/decimal.ts`. No raw `.plus(...)` / `.minus(...)` on non-Money. The boundary lift `new Money(budget.amount)` is the canonical pattern (same as `lib/accounts/queries.ts.listAccountsForUser` and `lib/dashboard/aggregations.ts.computeNetWorthByCurrency`).
- **Principle II (type safety)**: PASS. Strict types throughout.
- **Principle III (validate at boundaries)**: N/A — pure in-process functions.
- **Principle IV (test the money paths)**: PASS. Unit suite (SC-009) covers 8+ cases.

## Data-scoping note

These functions do NOT take `userId`. They are pure data shapers operating on data the caller has already fetched with a `userId`-scoped query. There is no userId path through these functions — they cannot leak across users by construction.

## Applicable FRs

FR-010, FR-011, FR-012, FR-014, FR-023, FR-025, FR-028.

## Applicable SCs

SC-002, SC-008, SC-009.
