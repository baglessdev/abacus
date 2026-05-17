# Feature 007 — Phase 0 Research

Non-obvious decisions taken during planning. Each entry: **Decision / Rationale / Alternatives considered**. Inputs locked by the spec's Clarifications section (signed amounts, calendar-day-only dates, soft archive with cascading two-leg archive on transfers) are NOT re-litigated here; the entries below cover only the choices the spec deliberately left to the plan.

This is the **third feature** to exercise the data-scoping convention (the first two were 004 Accounts and 006 Categories) — the boilerplate around `userId`-first helpers, cross-user-collapse-to-`not_found`, archive-not-delete UX, side-sheet-on-list-page forms, and per-feature error catalog is re-used verbatim. Where this feature replicates a feature-004 or feature-006 R-entry, the entry below is shorter and cites the precedent rather than re-arguing it.

This is also the **first feature** to introduce: (a) two atomic-multi-row mutation paths (`createTransfer` + `updateTransfer`), (b) a Decimal-summing query path (`sumAmountsForAccount`), (c) a cross-module canonical helper consumed by another module's `queries.ts` (the balance-computation call from `lib/accounts/queries.ts` into `lib/transactions/queries.ts`). These three patterns drive the load-bearing entries below — R3 (transfer atomicity), R6 (data-scoping exception), R7 (balance computation strategy).

---

## R1. Database column types — Prisma-native enum for `type`, signed Decimal for `amount`, denormalized `currency`

**Decision.**

- `type` — Prisma enum `TransactionType { INCOME EXPENSE TRANSFER }`. Maps to a Postgres enum at the DB level.
- `amount` — `Decimal @db.Decimal(20, 8)`. Signed (positive for INCOME, negative for EXPENSE, signed pair for TRANSFER). Same precision/scale as `Account.startingBalance` from feature 004.
- `currency` — `String @db.Char(3)`. Denormalized from `Account.currency`. Always uppercase ISO 4217.
- `payee` — `String? @db.VarChar(120)`. Same upper-bound shape as `Account.name`'s `@db.VarChar(80)` precedent, sized larger for free-form merchant names.
- `notes` — `String? @db.VarChar(500)`. Free-form, sized for one-paragraph commentary.

**Rationale.**

A closed Prisma enum for `type` gives us a real Postgres enum with three values and a generated TS literal union; adding a fourth type in a future feature (e.g., `ADJUSTMENT` for feature 010 CSV import edge cases) would be a Prisma migration + a TS recompile — fine because the spec locks the set at three. The Decimal column matches the storage shape already proven on `Account.startingBalance`, so the `lib/money/` boundary doesn't have to learn two precision policies. The denormalized `currency` column is intentional and is the canonical strategy for transactional-money systems (R2 below).

**Alternatives considered.**

- *`type` as a Postgres CHECK constraint on a free-form `VARCHAR(20)`.* Rejected — the Prisma enum produces a proper TS literal union plus a Postgres-level constraint at zero additional code.
- *`amount` stored as unsigned Decimal + a separate `direction` column.* Rejected — the 2026-05-17 clarification locked signed amounts; this is downstream of that decision.
- *`payee` as a FK into a `Payee` lookup table.* Rejected — payee uniqueness is hostile to the personal-finance UX (the same coffee shop appears under slightly different names month-to-month). A free-form column is correct. Feature 012 (auto-categorization rules) may introduce a payee-pattern table later; that's an additive change.

---

## R2. Currency denormalization — `Transaction.currency` mirrors `Account.currency`, equality enforced at boundary

**Decision.** Store `currency` on every transaction row (denormalized from the parent account). On every write, the Zod boundary reads the parent account's currency via `getAccountForUser` and rejects any payload whose declared currency disagrees with `currency_mismatch`. In practice the form auto-populates currency from the chosen account; the boundary check is the defense against tampering.

**Rationale.**

- **Query efficiency.** The per-account `SUM(amount)` query (FR-019a balance computation) and feature 008's budget rollups + feature 015's charts + feature 016's reports all need `currency` adjacent to `amount` for the `<Money>` rendering. Without denormalization, every aggregated row would need a join to `Account` just to render its currency badge — a real cost at chart-rendering scale.
- **Forward-compatibility with feature 020 (FX).** When cross-currency transfers land, the two legs of a transfer will have **different** currencies (source leg in USD, destination leg in EUR with an FX rate). The denormalized column lets each leg carry its own currency natively, with no schema change.
- **Defensive integrity.** The equality invariant is enforced at the Zod boundary; reassigning an account's currency post-create is structurally blocked by feature 004 FR-007 (currency is immutable on `Account`). So the invariant holds for the lifetime of every transaction row.

**Alternatives considered.**

- *No denormalization — derive `currency` at query time via join on `Account`.* Rejected for the query-efficiency reasons above. The added complexity of "currency lives in one place" (which a denormalized DB schema gives away) is a small cost vs. the join overhead on every render path.
- *Foreign-key the currency code into a `Currency` lookup table.* Rejected for the same reason feature 004 R3 rejected it — the allow-list is a static TS module; a DB lookup adds latency for no value.

---

## R3. Transfer atomicity — `prisma.$transaction(async (tx) => {...})` with server-generated `transferGroupId`

**Decision.** Both `createTransfer` and `updateTransfer` execute their two-leg writes inside `prisma.$transaction(async (tx) => { ... })`. The `transferGroupId` is generated **once** inside the transaction callback via a `cuid()` call (using `@paralleldrive/cuid2` if it's already a dep, otherwise via Prisma's own cuid implementation re-exported from a small `lib/transactions/transfer-group-id.ts` module). Inside the transaction callback:

```ts
// createTransfer skeleton (not the implementation — schema/types omitted)
return await prisma.$transaction(async (tx) => {
  const transferGroupId = createId() // cuid
  const source = await tx.transaction.create({
    data: { userId, accountId: fromAccountId, amount: minusX, currency, type: "TRANSFER",
            date, notes, transferGroupId, categoryId: null }
  })
  const destination = await tx.transaction.create({
    data: { userId, accountId: toAccountId, amount: plusX, currency, type: "TRANSFER",
            date, notes, transferGroupId, categoryId: null }
  })
  return { source, destination }
})
```

If either `create` throws, Postgres rolls back both inserts; the action surfaces `internal_error`. The server-generated `transferGroupId` is sealed inside the transaction callback — never accepted from request input (FR-012).

**Rationale.** Constitution Principle I makes this verbatim mandatory: "Transfers between accounts are atomic: a single transaction creates two ledger entries in one DB transaction or it fails." The interactive `prisma.$transaction(async (tx) => ...)` form (vs. the array form `prisma.$transaction([...])`) is required here because the second `create` depends on the first's success and both inserts share a generated id that must be in scope across both calls. Prisma 7's interactive transactions are stable and well-supported. The auth signup transaction in `lib/auth/actions.ts` already uses the same pattern (R8 below cites it as the precedent).

**Alternatives considered.**

- *Array form: `prisma.$transaction([tx1, tx2])`.* Rejected — the array form is great when the two queries are independent, but our second `create` needs to share `transferGroupId` from the same generated value as the first, which requires the value to live in JavaScript scope. The interactive form is the canonical Prisma pattern for "two related inserts that share a value."
- *Optimistic two-step (insert + insert + reconcile).* Rejected outright — a transfer where one leg succeeded and the other failed silently corrupts both balances; this is exactly the failure mode the constitution exists to prevent.
- *Generate `transferGroupId` client-side.* Rejected — client-supplied identifiers can be tampered with (e.g., overwriting an existing transfer's group id); FR-012 mandates server generation.

---

## R4. `transferGroupId` shape + nullability invariant — enforced at Zod boundary, not at DB layer

**Decision.** `transferGroupId` is `String?` on the Prisma model. The structural invariant `(type === "TRANSFER") ↔ (transferGroupId !== null)` is enforced at the **Zod schema boundary** (`createTransactionSchema` rejects any payload setting `transferGroupId`; `createTransferSchema` always generates one; the queries layer asserts the invariant before persisting). No Postgres CHECK constraint enforces the invariant at the DB layer.

**Rationale.**

- A CHECK constraint of the form `(type = 'TRANSFER' AND transferGroupId IS NOT NULL) OR (type IN ('INCOME', 'EXPENSE') AND transferGroupId IS NULL)` is expressible in Postgres but is hostile to Prisma's migration generator — Prisma doesn't model CHECK constraints declaratively, so the migration would carry a manually-edited raw-SQL DDL statement. The pattern is noisy and out of step with the convention established by features 004 and 006 (same call made in feature 006 R5 for single-level hierarchy depth).
- The application-layer boundary is the rule-of-record. A malicious direct-DB write that violates the invariant is out of scope for a personal-finance app's threat model; the boundary defends the product surface, which is what matters.
- The `@@index([userId, transferGroupId])` index supports the `WHERE userId = ? AND transferGroupId = ?` pair-fetch query; nothing about the partial-row invariant requires DB enforcement.

**Alternatives considered.**

- *Add a `WHERE` CHECK constraint via raw-SQL migration.* Rejected — see above.
- *Two separate models (`SingleTransaction`, `TransferLeg`) with a polymorphic union.* Rejected — destroys query efficiency for the list view, which displays all three types in one chronological feed.

---

## R5. Sign-must-match-type enforcement — at Zod boundary via `validateTransactionAmount`

**Decision.** A new helper `validateTransactionAmount({ type, amount, currency })` lands at `lib/money/validate.ts` (next to `validateStartingBalance` from feature 004). It encodes:

```text
type === "INCOME"   → amount must be > 0
type === "EXPENSE"  → amount must be < 0
type === "TRANSFER" → amount must be != 0  (sign is per-leg, validated separately for source/destination)
all types           → magnitude must be > 0 (zero amount rejected)
all types           → currency-aware decimal-places via the existing FR-009 rule
```

It returns `{ ok: true } | { ok: false; code: "sign_mismatch" | "zero_amount" | "too_many_decimals" | "not_a_number"; message: string }`.

Called by `createTransactionSchema` and `updateTransactionSchema` via `superRefine`. The TRANSFER side of the validation lives in `createTransferSchema` and `updateTransferSchema` — both treat the form's user-entered magnitude as the absolute value and produce the signed pair downstream; the schema just validates the magnitude is positive, > 0, and decimal-precision-valid.

**Rationale.**

- Keeps the sign convention enforcement in one place (`lib/money/`). No file outside `lib/money/` performs sign-checking on a Decimal (constitution Principle I, FR-028).
- Mirrors the shape of `validateStartingBalance` so the implementer can copy the pattern.
- The form UX accepts a positive magnitude from the user (the "+5,000" or "-87.43" UX has been re-litigated in personal-finance apps for two decades; the modern consensus is "type the magnitude, the system applies the sign per the chosen type"); the boundary's `superRefine` validates the sign **after** the form's user-facing transform has applied the sign per the type.

**Alternatives considered.**

- *Enforce in the queries layer.* Rejected — the helper would have to re-implement the Zod check or call back into it. Validation at the boundary is the constitutional rule (Principle III).
- *Auto-flip the sign if the user enters the wrong sign for the type.* Considered. The acceptance scenario US6 §3 explicitly allows the auto-flip option ("the boundary either (a) auto-flips the sign at the Zod transformer per the convention, OR (b) rejects the payload"). **Decision: reject (b).** Auto-flipping is silent magic; a user who entered `-87.43` on an INCOME by accident does not want a $87.43 income — they made a mistake. Rejecting with a clear error message preserves user intent. The form does this auto-flip at the **client-side display layer** (the user types `87.43` for an EXPENSE; the form prepends `-` for display + posts `-87.43` as the canonical value) — that's a UX nicety, not a boundary policy.

---

## R6. Data-scoping convention — one documented exception, owned by `lib/transactions/queries.ts`

**Decision.** `prisma.transaction.*` is owned by `lib/transactions/queries.ts`. **No other file** in the codebase touches `prisma.transaction.*` directly. The balance-computation call from `lib/accounts/queries.ts` consumes a typed function (`sumAmountsForAccount(userId, accountId): Promise<Money>`) exported from `lib/transactions/queries.ts` — it does NOT touch `prisma.transaction.*` itself.

This means:
- `lib/accounts/queries.ts` imports `sumAmountsForAccount` from `lib/transactions/queries.ts`. **This cross-module import is the only deviation from the strict "queries.ts files don't import each other" pattern features 004 and 006 set.**
- The implementation lives once, in the canonical owner; the consumer module is a thin caller.
- A grep audit confirms the rule: `rg "prisma\.transaction\." lib/` should match only `lib/transactions/queries.ts` after this feature ships.

**Rationale.**

- The balance-computation formula `startingBalance + Σ(transaction.amount where archivedAt IS NULL)` is canonically transaction-scoped — the SUM is a query against `Transaction`, not `Account`. Asking `lib/accounts/queries.ts` to own the SUM means it would need its own `prisma.transaction.*` call, which would split the data-scoping convention across two files for the `transaction` table. That's worse than one cross-module function call.
- The cross-module call is one-directional (`accounts` consumes `transactions`'s helper; no reverse import). No circular-dep risk.
- Future feature 008 (Budgets) and feature 015 (Charts) will follow the same pattern: their queries modules will consume helpers exported from `lib/transactions/queries.ts` (e.g., `sumAmountsForCategoryInRange(userId, categoryId, dateFrom, dateTo)`), not touch `prisma.transaction.*` themselves. The convention scales.

**Alternatives considered.**

- *`lib/accounts/queries.ts` runs its own `prisma.transaction.aggregate` call.* Rejected — splits the convention.
- *A new shared module `lib/balance/queries.ts` that owns both `prisma.account.*` and `prisma.transaction.*` calls related to balance computation.* Rejected — overengineered. One cross-module function call beats inventing a third module.

---

## R7. Balance computation strategy — `aggregate({_sum: amount})` with `groupBy` batching for the accounts list

**Decision.** Two exported helpers from `lib/transactions/queries.ts`:

```ts
// Single-account balance — used by per-account views (future feature 007 widgets)
async function sumAmountsForAccount(userId: string, accountId: string): Promise<Money> {
  const result = await prisma.transaction.aggregate({
    where: { userId, accountId, archivedAt: null },
    _sum: { amount: true },
  })
  return result._sum.amount ?? new Money(0)
}

// Many-accounts balance batch — used by the accounts-list page to avoid N+1
async function sumAmountsForAccountsBatch(
  userId: string,
  accountIds: readonly string[],
): Promise<Map<string, Money>> {
  if (accountIds.length === 0) return new Map()
  const rows = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId, accountId: { in: [...accountIds] }, archivedAt: null },
    _sum: { amount: true },
  })
  const map = new Map<string, Money>()
  for (const id of accountIds) map.set(id, new Money(0))
  for (const r of rows) map.set(r.accountId, r._sum.amount ?? new Money(0))
  return map
}
```

`lib/accounts/queries.ts` calls `sumAmountsForAccountsBatch` once with all of the user's account ids and then composes per-row balances as `startingBalance.plus(sumMap.get(account.id))`. One Prisma round-trip for N accounts. The N+1 trap documented in feature 004 FR-017 is avoided structurally.

**Rationale.**

- Prisma's `aggregate` with `_sum` translates to a single SQL `SUM(amount)` — Postgres handles the arithmetic on the Decimal column natively (no rounding, no float). Returns `Prisma.Decimal | null`; the `null` case maps to `new Money(0)`.
- `groupBy` is the same primitive scaled across `accountId`. Both queries hit the `@@index([userId, accountId, date])` composite index for the userId+accountId equality plus the archivedAt-null partial-condition predicate.
- Returning a `Map<string, Money>` from the batch helper makes the call site explicit — no chance of confusing array-by-index ordering.

**Alternatives considered.**

- *N separate `aggregate` calls (one per account).* Rejected — N+1 at the accounts-list page load. Sub-100ms locally but hostile at higher account counts.
- *Cache the balance on a column on `Account` and update it on every transaction write.* Rejected — denormalized state with two writes per transaction is the canonical source of money-correctness bugs (the `Account.balance` column would drift from the true SUM the moment a single write fails or races). The SUM-on-read pattern is the boring correct choice.

---

## R8. Date column shape — `@db.Date` with UTC-midnight Zod normalization

**Decision.** `Transaction.date` is `DateTime @db.Date`. The column at the Postgres level is `DATE` (4 bytes, no time component). The Zod boundary normalizes user input to UTC midnight (`new Date(Date.UTC(year, month, day, 0, 0, 0, 0))`) before the Prisma write. A small helper `normalizeToUtcDay(input: string | Date): Date` lives in `lib/transactions/dates.ts` (new file, owned by the transactions module — date semantics are transaction-scoped, not money-scoped).

**Rationale.**

- The 2026-05-17 clarification locked calendar-day-only semantics. `@db.Date` is the storage form that **structurally enforces** the calendar-day invariant — the column cannot carry sub-day precision even if the application layer's normalization were buggy.
- 4-byte storage vs. 8-byte for `TIMESTAMPTZ`. Negligible at personal-finance scale, but the win is intent: the schema tells a future reader "this is a calendar day, not a timestamp."
- The Zod normalization keeps the application-layer round-trip symmetric (`Date → DATE → Date`); Prisma 7's `@db.Date` deserialization returns a `Date` object set to midnight in the local server process timezone, which the application treats as UTC midnight (the application never reads sub-day fields from this column).
- The helper lives in `lib/transactions/dates.ts` rather than `lib/money/dates.ts` because dates are not money. The transactions module owns the date semantics it uses; `lib/money/` stays focused on Decimal arithmetic.

**Alternatives considered.**

- *`DateTime` (`TIMESTAMPTZ`) with application-layer normalization only.* Rejected — relies on the application to do the right thing on every write. The `@db.Date` form provides defense-in-depth.
- *`String` column storing ISO date (`"2026-05-17"`).* Rejected — loses Postgres's native date comparison and range-query support. Date-range filters and `ORDER BY date DESC` become string comparisons; locale and lexicographic-vs-temporal issues lurk.

**Risk noted.** If during implementation the Prisma 7 `@db.Date` deserialization surfaces a quirk (e.g., timezone-offset sensitivity), the fallback is plain `DateTime` (`TIMESTAMPTZ`) + application-layer normalization. The boundary normalization stays the same; the only schema change is dropping `@db.Date`. Documented in `plan.md` §Risks.

---

## R9. Date filter behavior — inclusive range, default last 30 days, URL-encoded

**Decision.** `listTransactions({ dateFrom?: Date | null, dateTo?: Date | null })`:

- Both bounds are **inclusive** (`date >= dateFrom AND date <= dateTo`).
- If neither is provided, default to `dateFrom = today minus 30 days`, `dateTo = today`.
- If only one bound is provided, the other is unbounded (no upper limit if `dateFrom` only; no lower limit if `dateTo` only).
- Both bounds are normalized to UTC midnight via the same `normalizeToUtcDay` helper.

URL-encoded filter state: the `/dashboard/transactions` page reads `?from=YYYY-MM-DD&to=YYYY-MM-DD&account=<id>&category=<id>&type=<INCOME|EXPENSE|TRANSFER>&archived=1` from `searchParams` and builds the call to `listTransactions`. Sets up feature 009 (Search & filter) to attach a free-text-search param to the same shape.

**Rationale.**

- "Last 30 days" is the spec's locked default (FR-026). Inclusive bounds are the personal-finance UX expectation ("transactions from May 1 to May 31" means the whole month).
- URL encoding makes the filtered view shareable and reload-stable (FR-026a). Feature 009 will extend with `?q=` for free-text search; no schema change to plan for.

**Alternatives considered.**

- *Default last 7 days.* Rejected — locked at 30 per spec FR-026.
- *Exclusive upper bound.* Rejected — semantically less intuitive ("up to but not including May 31" requires the user to do mental date math).
- *State-only filters (not URL-encoded).* Rejected — kills reload stability and shareability; FR-026a calls it out.

---

## R10. List pagination strategy — date-range-driven "Load older" affordance, NOT cursor pagination

**Decision.** Render all matching rows in the current date range. If matching rows exist **beyond** the range (a row count check via `prisma.transaction.count({ where: { ..., date: { lt: dateFrom } } })`), surface a "Load older" affordance. Clicking it extends `dateFrom` backward by 30 days (updates the URL → re-renders the page).

**Rationale.**

- The locked default range is 30 days; most user sessions will see at most a few hundred rows. Postgres + the indexes can render thousands of rows in this shape with no perceptible latency.
- "Load older" is a date-range extension, not a cursor — the same primitive (`dateFrom` URL param) drives both the initial render and the pagination. No new state shape.
- Cursor pagination (the canonical "infinite scroll" pattern) is overkill for v1 — adds API complexity, complicates URL-shareable filter state, and the date-range form is more intuitive for personal finance (users think in months, not in 50-row chunks).

**Alternatives considered.**

- *Cursor-based pagination (skip + take + cursor).* Rejected as overkill for v1. May reintroduce later if a user reports a slow render at thousands of rows in the current range.
- *Render-everything (no pagination at all).* Rejected — a user with 5+ years of data could hit a multi-thousand-row render. The 30-day default already filters; "Load older" extends as needed.

---

## R11. URL-driven filter state shape

**Decision.** Query-string parameters with these names:

- `from=YYYY-MM-DD` — date range lower bound (inclusive). Default: `today - 30 days`.
- `to=YYYY-MM-DD` — date range upper bound (inclusive). Default: `today`.
- `account=<accountId>` — single-select account filter. Absent or empty = "All accounts".
- `category=<categoryId>` or `category=__uncategorized__` — single-select category filter. Absent = "All categories"; the sentinel `__uncategorized__` filters `categoryId IS NULL`.
- `type=INCOME|EXPENSE|TRANSFER` — single-select type filter. Absent = "All types".
- `archived=1` — boolean; when set, `archivedAt IS NULL` is relaxed. Absent = exclude archived.

The page-level server component parses these from `searchParams` (Next.js App Router `props.searchParams`), validates each via a small Zod schema (`listTransactionsFiltersSchema`), and calls `listTransactions(filters)`.

**Rationale.**

- Short param names match common URL conventions (Stripe Dashboard, GitHub Issues — all use `?type=`, `?archived=`).
- The `__uncategorized__` sentinel is explicit and self-describing in URL form; alternatives like an empty-string value are ambiguous.
- The Zod-on-`searchParams` boundary is consistent with the constitution Principle III "Zod at every boundary" rule.

**Alternatives considered.**

- *Server-side cookie state.* Rejected — breaks shareability.
- *POST a search payload, render a separate results page.* Rejected — over-engineered for a list filter; the URL-encoded form is canonical for filtering.

---

## R12. Edit-transfer atomicity — `updateTransfer` inside `prisma.$transaction`

**Decision.** `updateTransfer({ id, fromAccountId, toAccountId, date, amount, notes })`:

1. Fetch the row by id (`getTransactionForUser(userId, id)`). Reject if not found, or if `row.type !== "TRANSFER"`, or if `row.transferGroupId === null` (this case is impossible structurally per R4, but defensive).
2. Fetch BOTH legs by `transferGroupId` (`getTransferLegsForUser(userId, transferGroupId)`). Expect exactly two rows; reject with `internal_error` (an "impossible" state) if not.
3. Validate the new fields at the Zod boundary: both accounts exist, both owned by `userId`, both non-archived, both share the same currency, `fromAccountId !== toAccountId`, magnitude > 0, magnitude valid for the currency's decimals.
4. Inside `prisma.$transaction(async (tx) => { ... })`:
   - Update the source-leg row: `{ accountId: fromAccountId, amount: -magnitude, currency: fromAccount.currency, date, notes }`.
   - Update the destination-leg row: `{ accountId: toAccountId, amount: +magnitude, currency: toAccount.currency, date, notes }`.
   - `transferGroupId`, `userId`, `type`, `categoryId` (which stays `null`) are NEVER changed.
5. Return the updated pair via the contract's response shape.

**Rationale.**

- The two-leg invariant survives an edit only if both rows mutate inside one transaction. Otherwise a mid-edit failure on the second leg leaves the pair desynced.
- The fetch-both-legs pre-flight ensures the implementer never accidentally rewrites just one leg.
- The "which leg is which" identification is by **sign**, not by row order: source = leg with `amount < 0`, destination = leg with `amount > 0`. This is robust to insertion-order quirks.

**Failure modes (rejected at boundary, not at transaction layer):**

- `fromAccountId === toAccountId` → `validation_failed` with `fieldErrors: { toAccountId: ["..."] }`.
- `fromAccountId` or `toAccountId` references an archived account → `archived_account_blocked`.
- The two accounts differ in currency → `transfer_cross_currency`.
- The transfer is itself archived → `transfer_archived_leg` (the user must unarchive first).

---

## R13. Archive-transfer atomicity — `archiveTransaction` auto-detects TRANSFER and cascades to both legs

**Decision.** `archiveTransaction({ id })`:

1. Fetch the row (`getTransactionForUser(userId, id)`). Reject if not found.
2. If `row.type !== "TRANSFER"`: single-leg path. One `UPDATE` setting `archivedAt = new Date()`. Atomic by default.
3. If `row.type === "TRANSFER"`: transfer path. Inside `prisma.$transaction`:
   - `tx.transaction.updateMany({ where: { userId, transferGroupId: row.transferGroupId }, data: { archivedAt: new Date() } })`.
   - Verify `result.count === 2` after the update; if not, throw (rolls back the transaction).
4. Return the (now-archived) row via the contract's response shape. For TRANSFER, return the originating row; the consumer knows both legs were archived together.

The `unarchiveTransaction` symmetric path uses the same pattern with `archivedAt = null`.

**Rationale.**

- `updateMany` with a `transferGroupId` filter is the **single SQL statement** that updates both legs simultaneously — there's no race window where the two rows could be observed in different archive states.
- The `result.count === 2` guard catches a malformed pair (e.g., a stale dataset where one leg has already been archived independently); the implementation throws and rolls back, preventing partial-archive states.

**Alternative — fetch both legs first, then update each by id.** Considered. Equivalent semantics inside the `$transaction`, but more roundtrips (`SELECT` + 2 × `UPDATE` vs. `SELECT` + 1 × `updateMany`). The `updateMany` form is preferred.

---

## R14. Server actions surface — seven distinct actions (NOT five unified)

**Decision.** `lib/transactions/actions.ts` exports seven server actions:

1. `createTransaction` — INCOME or EXPENSE only.
2. `createTransfer` — atomic two-leg.
3. `updateTransaction` — INCOME or EXPENSE only; rejects with `transfer_leg_isolated` if the row's `type === "TRANSFER"`.
4. `updateTransfer` — atomic two-leg.
5. `archiveTransaction` — handles INCOME / EXPENSE / TRANSFER (auto-detects via `type` and cascades for TRANSFER per R13).
6. `unarchiveTransaction` — symmetric.
7. `listTransactions` — filterable list.

**Rationale.**

- The single-leg vs. two-leg shapes differ enough that one polymorphic action would have a union-typed input + branching internals + worse error messages. Two distinct actions are cleaner contracts for the client + the implementer.
- Archive / unarchive are symmetric across types because the auto-detection logic is internal and the input shape is the same (just an `id`). Keeping these unified is a UX win — the "Archive" button in the list doesn't need to know whether the row is a transfer.
- The list action is a single endpoint that takes a typed filter object.

**Alternatives considered.**

- *Five actions: `createTransaction` (polymorphic — handles all three types), `updateTransaction`, `archive`, `unarchive`, `list`.* Rejected — the polymorphic create would have to branch the input shape (single-leg vs. transfer fields are disjoint sets), and the implementer would face union narrowing inside one action body. Two distinct create actions are simpler.
- *Nine actions: separate `archiveSingleTransaction` / `archiveTransfer` / `unarchive…`* Rejected — the auto-detection logic is trivial and centralizes the "is this a transfer?" check in one place.

---

## R15. Error code catalog

**Decision.** `lib/transactions/errors.ts` defines:

```ts
const ERROR_CODES = {
  UNAUTHENTICATED:                "unauthenticated",
  VALIDATION_FAILED:              "validation_failed",
  NOT_FOUND:                      "not_found",
  CURRENCY_MISMATCH:              "currency_mismatch",
  SIGN_MISMATCH:                  "sign_mismatch",
  TRANSFER_CROSS_CURRENCY:        "transfer_cross_currency",
  TRANSFER_SAME_ACCOUNT:          "transfer_same_account",
  TRANSFER_LEG_ISOLATED:          "transfer_leg_isolated",
  ARCHIVED_ACCOUNT_BLOCKED:       "archived_account_blocked",
  INTERNAL_ERROR:                 "internal_error",
} as const
```

Each code maps to a canonical user-facing message + an optional `field` discriminator (for codes that are field-scoped). The shape mirrors `lib/accounts/errors.ts` and `lib/categories/errors.ts`. Custom error classes thrown inside `lib/transactions/queries.ts` (e.g., `CurrencyMismatchError`, `TransferAccountMismatchError`) are caught by `lib/transactions/actions.ts` and converted to envelopes.

**Explicit non-codes:**

- **No** `archived_category_blocked`. Archived categories CAN remain assigned to transactions (FR-006a's category-archive policy is "archived category retains its reference on existing transactions"; the category picker on the create form just hides archived categories). The transactions module never rejects on the basis of an archived `categoryId`.
- **No** `transfer_archived_leg` as a distinct code on the archive action. Archiving an already-archived row is idempotent (a no-op that returns success). The code only fires on the **edit** action when the user tries to edit a transfer whose both legs are already archived — and even there, it's a subcase of `not_found` semantics (the row is "not present in the active set"). After consideration: simpler to just route to `not_found`. **The code is removed from the catalog.**
- **No** `kind_mismatch` distinct code for the category-kind rule. The transaction's category kind must match the transaction's type (FR-011), but this is reported as a `validation_failed` with a `categoryId` field error (same way `lib/categories/schemas.ts` reports parent-kind mismatch). No need for a top-level error code.

**Rationale.** Keep the catalog small. Every code is exercised by a clear user-visible scenario in the spec; codes with no user-visible path are absent.

---

## R16. Data-scoping — `prisma.transaction.*` confined to `lib/transactions/queries.ts`

**Decision.** Already covered in R6. The one allowed cross-module consumer is `lib/accounts/queries.ts`, which imports `sumAmountsForAccount` and `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts` for the balance computation. No other file imports from `prisma.transaction.*`.

A grep audit after this feature lands MUST return only `lib/transactions/queries.ts`:

```bash
rg "prisma\.transaction\." lib/ app/
```

Documented as a money-reviewer audit invariant in R26.

---

## R17. New helpers in `lib/money/`

**Decision.** This feature adds the following to `lib/money/`:

- `lib/money/validate.ts` — extend with `validateTransactionAmount({ type, amount, currency })` returning the result-shape established by `validateStartingBalance`. Result codes: `not_a_number`, `too_many_decimals`, `zero_amount`, `sign_mismatch`.
- `lib/money/decimal.ts` — extend with `sumAmounts(amounts: readonly Money[]): Money` (a thin wrapper around `amounts.reduce((acc, a) => acc.plus(a), new Money(0))`). Used inside `lib/transactions/queries.ts` to compose totals, not by callers.
- `lib/money/index.ts` — re-export the new symbols.

**NOT added** to `lib/money/`:

- **Date helpers.** Date normalization (`normalizeToUtcDay`) lives at `lib/transactions/dates.ts`, NOT `lib/money/`. Money is Decimal-typed values + their currency; dates are a separate concern. Documented in R8.
- **Transfer-pair invariant check helper.** Considered for `lib/money/`. Rejected: the invariant (same currency, same date, inverse amounts, same userId, same transferGroupId) is a *transaction-shape* invariant, not a money-arithmetic invariant. It lives in `lib/transactions/queries.ts` as an assertion inside the `$transaction` callback. The unit suite covers it directly.
- **Balance-computation helper.** Lives in `lib/transactions/queries.ts` as `sumAmountsForAccount` / `sumAmountsForAccountsBatch` (R6, R7). The `Money` wrapper from `lib/money/decimal.ts` is the building block; the SQL-side aggregation lives where the SQL lives.

**Rationale.** `lib/money/` is the **boundary for monetary arithmetic** — Decimal math, currency formatting, signed-amount validation, decimal-place rules. It is NOT a kitchen sink for "any helper that touches money-shaped data." Date normalization, balance computation (which is a SQL aggregation), and the transfer-pair invariant all live in `lib/transactions/` because they are transaction-shaped concerns.

---

## R18. Money primitive UI rendering — every amount renders through `<Money>` from feature 005

**Decision.** Every amount displayed in the transactions list, the transaction form's amount field (read-only summary line), the transfer form's amount field (read-only summary line), and the account balance column on `/dashboard/accounts` renders through `<Money>` from `components/money/money.tsx`. No new display primitive is introduced.

The `<Money>` primitive's sign-aware color (`text-money-negative` for negative, `text-foreground` for positive, `text-muted-foreground` for zero) handles the EXPENSE-row visual treatment automatically (FR-030's "color must not be the sole carrier of meaning" is satisfied by the sign character + currency-with-sign rendering already in `formatAmount`).

**Rationale.** `<Money>` was built in feature 005 with exactly this consumer in mind. Re-using it preserves the visual consistency across all monetary displays in Abacus.

**Alternative considered.** A new `<TransactionAmount>` primitive that wraps `<Money>` with the "Archived" badge logic. Rejected — the badge is a sibling element in the table cell, not a property of the amount; conflating them couples concerns.

---

## R19. Form UX — two distinct forms (`<TransactionForm>` and `<TransferForm>`), each in its own side sheet

**Decision.** Two separate React components:

- `<TransactionForm>` — for INCOME / EXPENSE create + edit. Fields: `type` (segmented control: INCOME | EXPENSE, defaults to EXPENSE on create), `account` (uses the new `<AccountPicker>` from R21), `category` (uses `<CategoryPicker>` from feature 005, `kind` derived from `type`), `date` (defaults to today), `amount` (user-entered positive magnitude; the form applies sign at submit time per `type`), `payee`, `notes`.
- `<TransferForm>` — for TRANSFER create + edit. Fields: `fromAccount` (uses `<AccountPicker>`), `toAccount` (uses `<AccountPicker>`, `excludeIds: [fromAccountId]`), `date`, `amount` (positive magnitude; the system signs both legs server-side), `notes`. **No `category` field, no `type` field, no `payee` field.**

Each form is mounted inside a separate `<TransactionFormSheet>` / `<TransferFormSheet>` wrapper (the same `Sheet` primitive used by feature 004 and feature 006). The transactions-list page has two distinct CTAs in the header bar: **"+ Add transaction"** and **"+ Add transfer"** (FR-021).

**Rationale.**

- The two forms have **structurally different input shapes** (one `accountId` vs. two `accountId`s; categories present vs. absent; type-selector present vs. absent). One polymorphic form with conditional sections would have ~50% conditional render code and worse a11y (form labels would have to be conditional). Two clean components are easier to reason about + easier to test.
- FR-021 locks the two-CTA design. The plan honors it.

**Alternative considered.** One polymorphic form with a top-level type switcher (INCOME / EXPENSE / TRANSFER). Rejected — see above.

---

## R20. Type ↔ category-kind interaction in `<TransactionForm>`

**Decision.** The form's `type` state drives the `<CategoryPicker>`'s `kind` prop:

- `type === "INCOME"` → `<CategoryPicker kind="INCOME" />`
- `type === "EXPENSE"` → `<CategoryPicker kind="EXPENSE" />`
- (TRANSFER is handled by `<TransferForm>`, not `<TransactionForm>` — the type switcher in `<TransactionForm>` does NOT offer a TRANSFER option per R19.)

The user can change `type` mid-form; doing so clears the `categoryId` state (because the previously-chosen category may not match the new type's kind). The picker re-renders showing only categories of the matching kind.

**Boundary enforcement.** Even if a tampered client submits an `EXPENSE` transaction with an `INCOME` `categoryId`, the Zod schema's `superRefine` fetches the category via `getCategoryForUser` and rejects with `validation_failed { fieldErrors: { categoryId: ["Category kind does not match transaction type"] } }`. The client-side picker filtering is a UX nicety; the boundary is the rule-of-record (constitution Principle III).

**Rationale.** The kind-must-match-type rule is FR-011. The form prevents the mismatch at input time; the boundary defends against tampering. Both layers are required.

---

## R21. `<AccountPicker>` primitive — new at `components/accounts/account-picker.tsx`

**Decision.** Build a new reusable picker at `components/accounts/account-picker.tsx`. Mirrors the shape of `<CategoryPicker>` from feature 005: `Command` inside `Popover`, props `{ value, onChange, excludeIds?, includeArchived?, currency?, disabled?, placeholder?, ariaLabel? }`. Fetches via `listAccounts({ includeArchived: false })` on mount; filters client-side by `excludeIds` and `currency` (when `currency` is set, only accounts with matching currency are shown — the transfer form uses this for the to-account picker after the from-account is chosen).

**Rationale.**

- Feature 004 did not build a reusable account picker — the account form had no place to select another account. Feature 007 is the first feature to need it (the transaction form needs one account picker; the transfer form needs two).
- Reusable component lives **outside** the `app/(shell)/dashboard/transactions/_components/` route-bound directory because future features (008 Budgets, 015 Charts, 016 Reports) will consume it. Pattern matches `components/categories/category-picker.tsx` from feature 006.
- The `currency` filter prop is the affordance that lets the transfer form prevent cross-currency transfers at input time (the to-account picker only shows same-currency accounts once a from-account is selected). The boundary still enforces this; the picker filter is UX.

**Alternative considered.** Inline the account `<Select>` inside the form. Rejected — the form needs two of them (transfer) and the picker would have to be re-implemented twice or live inline at one place and import from there.

---

## R22. Sidebar nav — no change

**Decision.** `/dashboard/transactions` already exists in the TRACK group from feature 002. The current placeholder `app/(shell)/dashboard/transactions/page.tsx` is replaced; the sidebar entry is unchanged.

**Rationale.** Feature 002 (sidebar scaffolding) already added the entry. No work to do here.

---

## R23. Migration — `pnpm exec prisma migrate dev --name add_transaction`

**Decision.** One generated migration, lands at `db/migrations/<timestamp>_add_transaction/migration.sql`. Creates the enum, table, four indexes, three FK constraints (CASCADE on userId, RESTRICT on accountId, RESTRICT on categoryId).

Three back-relations on `User`, `Account`, `Category` are schema-only (no SQL).

**Rationale.** Standard Prisma migration. No `db push` (constitution Conventions).

---

## R24. Migration data hazard — none (purely additive)

**Decision.** Existing `main` has zero transactions. The migration is purely additive — no `UPDATE`, no backfill SQL, no data-modifying steps.

**Rationale.** Straightforward. Documented to make the absence explicit.

**Watch-out.** The accounts-list balance column currently renders `account.startingBalance`; after this feature, it renders the computed balance. For a brand-new account with zero transactions, `startingBalance + 0 === startingBalance`, so existing data presentation is unchanged. See R25 for the test churn implications.

---

## R25. Existing tests preservation — accounts e2e + 134 unit tests stay green

**Decision.** The current `tests/e2e/accounts.spec.ts` creates an account with `startingBalance = 1250.00` and asserts the balance column renders `$1,250.00`. After this feature, the balance column shows `startingBalance + Σ(transactions)`. For a brand-new account with zero transactions, the displayed value is still `$1,250.00` — **the assertion continues to hold without modification**.

The 134 existing unit tests (auth, money, env, categories-queries, categories-seed) and 30 existing e2e tests (auth, health, accounts, categories) are all expected to pass unchanged. The implementer verifies this in the final-audits task bundle.

**Watch-out.** If the implementer accidentally regresses the accounts-list rendering (e.g., adds an unconditional "Live balance" badge), the e2e snapshot may shift. The plan calls out the assertion contract explicitly so the implementer doesn't break it.

**Rationale.** SC-016 mandates "existing tests continue to pass." Documented to ensure the implementer is aware of the assertion shape.

---

## R26. Money-reviewer audit invariants — the explicit contract the reviewer will check

**Decision.** The money-reviewer subagent will verify (per SC-017) that the PR satisfies:

1. **No raw Decimal arithmetic outside `lib/money/`.** Grep `rg '\\.plus\\(|\\.minus\\(|\\.times\\(|\\.div\\(|new Decimal\\(|new Money\\(' lib/ app/ components/` returns matches only inside `lib/money/` (or call sites that consume `lib/money/` helpers — those are fine; the audit grep cares about the file, not the line).
2. **Transfer atomicity is verifiable structurally.** Grep `rg "prisma\\.\\\$transaction" lib/transactions/` matches at minimum two call sites: one inside `createTransfer` and one inside `updateTransfer`. The archive/unarchive transfer paths also call `prisma.$transaction` when handling a transfer leg. The grep catches the pattern at the file level.
3. **Currency stored alongside amount on every row.** Schema audit: `Transaction.currency` is non-null `@db.Char(3)`. Boundary audit: every `createTransaction` / `createTransfer` / `updateTransaction` / `updateTransfer` path reads the parent account's currency, validates equality, persists the value. `validateTransactionCurrency(payloadCurrency, accountCurrency)` returns `{ ok: false; code: "currency_mismatch" }` for any inequality.
4. **No rounding in business logic.** Grep `rg "toFixed|Math\\.round|Math\\.floor|Math\\.ceil" lib/transactions/ lib/money/` — `toFixed` is allowed only inside `lib/money/format.ts` (the display formatter, which is the constitution-allowed UI edge). Business logic never rounds.
5. **Sign-must-match-type holds for every persisted row.** Unit test in `tests/unit/money-validate.test.ts` asserts `validateTransactionAmount` rejects every mismatch. An additional unit test in `tests/unit/transactions-queries.test.ts` (or similar) verifies the queries layer never persists a row whose sign disagrees with its type.
6. **Calendar-day normalization is consistent.** Unit test asserts `normalizeToUtcDay(input)` returns midnight UTC for various input shapes (string, Date, timezone-offset Date).
7. **Constitution-mandated E2E.** `tests/e2e/transactions.spec.ts` covers the "create transaction, transfer between accounts" path (FR-033, SC-009). The transfer assertion verifies both legs are present.
8. **Data-scoping convention upheld.** Grep `rg "prisma\\.transaction\\." lib/ app/` returns matches only in `lib/transactions/queries.ts`. (One cross-module consumer is allowed: `lib/accounts/queries.ts` calls `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts`, but the call site does not touch `prisma.transaction.*` directly — it calls a function.)

The money-reviewer's PASS criterion is satisfaction of all eight. Documented in the plan.md §Constitution Compliance — Post-Design Re-Check.

**Rationale.** The constitution requires the money-reviewer audit. Codifying the exact checks the reviewer will run lets the implementer satisfy them by construction rather than by guesswork.

---
