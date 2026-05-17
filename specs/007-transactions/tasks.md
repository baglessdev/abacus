---

description: "Task list for feature 006 — Transactions + Transfers (roadmap number)"
---

# Tasks: Transactions + Transfers

**Input**: Design documents from `/specs/007-transactions/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Roadmap number**: feature 006 — Transactions + Transfers. **Spec directory**: `specs/007-transactions/` (sequential; spec slot 005 was consumed by the branded-UI polish chore in May 2026).

**Tests**: Per constitution Principle IV ("test the money paths"), this feature ships three new Vitest unit-test files (`transactions-dates.test.ts`, `transactions-schemas.test.ts`, `transactions-queries.test.ts`) plus one new Playwright spec (`tests/e2e/transactions.spec.ts`) covering US1+US2+US3+US4+US5+US6 round-trip including the constitution-mandated "create transaction, transfer between accounts" E2E. All existing 134 unit + 30 e2e tests MUST continue to pass.

**Money-touch**: TRUE. The money-reviewer subagent runs on this PR. Per the plan's risk #4, the transfer-pair invariant + balance computation + sign-convention enforcement are audit targets.

**Organization**: Tasks grouped by user story. The MVP is **US1 + US2 + US3 + US4 together** (the four P1 stories — record + transfer + edit). US5 (filter) and US6 (validation e2e) are P2 follow-ups.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase (different files, no dependencies).
- **[Story]**: Maps task to user story (US1–US6). Setup / Foundational / Polish tasks have no story label.
- File paths are absolute repository paths under `/Users/rgederin/git/abacus/`.

## Path Conventions

Next.js 16 App Router layout (per [plan.md §Project Structure](./plan.md)). All paths repo-relative below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One new dep + one new shadcn primitive required by the date-range picker.

- [x] T001 Add `react-day-picker` to `package.json` (peer dep of the shadcn `<Calendar>` primitive). Run `pnpm install`. Verify `pnpm-lock.yaml` updates cleanly.
- [x] T002 Add shadcn `<Calendar>` primitive at `components/ui/calendar.tsx` (wraps `react-day-picker`). Match shadcn canonical source. Used by the date-range picker in US5.

**Checkpoint**: `pnpm typecheck` + `pnpm lint` pass. Primitive importable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + migration + `lib/money/` extensions + `lib/transactions/` server surface + unit-test suite + accounts-list balance refactor. Every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 is complete. Money-reviewer audit invariants are seeded here.

### Database

- [x] T003 Update `db/schema.prisma` per [data-model.md](./data-model.md): add `model Transaction` (id, userId, accountId, categoryId, date `@db.Date`, amount `@db.Decimal(20, 8)`, currency `@db.Char(3)`, type, payee `@db.VarChar(120)`, notes `@db.VarChar(500)`, transferGroupId, archivedAt, createdAt, updatedAt) + `enum TransactionType { INCOME EXPENSE TRANSFER }` + back-relations `User.transactions Transaction[]`, `Account.transactions Transaction[]`, `Category.transactions Transaction[]`. Include 4 indexes (`@@index([userId, date])`, `@@index([userId, accountId, date])`, `@@index([userId, categoryId])`, `@@index([userId, transferGroupId])`). FK rules: `Transaction.userId → User.id ON DELETE CASCADE`; `Transaction.accountId → Account.id ON DELETE Restrict` (can't delete an account that has transactions); `Transaction.categoryId → Category.id ON DELETE Restrict`.
- [x] T004 Generate the migration: `pnpm exec prisma migrate dev --name add_transaction --schema=db/schema.prisma`. Verify `db/migrations/<timestamp>_add_transaction/migration.sql` is created and applied. Run `pnpm db:generate` to refresh the Prisma client. Verify the SQL contains: `CREATE TYPE "TransactionType"`, `CREATE TABLE "Transaction"`, all 4 indexes, all 3 FK constraints with the documented `ON DELETE` clauses, and the Decimal/Date column types.

### `lib/money/` extensions (Principle I)

- [x] T005 Extend `lib/money/validate.ts`: add `validateTransactionAmount({ type, amount, currency }): { ok: true } | { ok: false; code: "not_a_number" | "too_many_decimals" | "zero_amount" | "sign_mismatch"; message: string }`. Encodes the sign-must-match-type rule per [research.md R3](./research.md): `type === "INCOME"` → amount > 0; `type === "EXPENSE"` → amount < 0; `type === "TRANSFER"` → amount !== 0; zero rejected for all types. Reuses existing `getCurrency`-aware decimal-place check from feature 004's `validateStartingBalance`.
- [x] T006 [P] Extend `lib/money/decimal.ts`: add `sumAmounts(amounts: readonly Money[]): Money` — thin wrapper around `amounts.reduce((acc, a) => acc.plus(a), new Money(0))`. Pure function, no Prisma dependency.
- [x] T007 Update `lib/money/index.ts` barrel to re-export `validateTransactionAmount` and `sumAmounts`. (Depends on T005, T006.)
- [x] T008 [P] Extend `tests/unit/money-validate.test.ts` with `validateTransactionAmount` test cases per [research.md R3](./research.md): INCOME with amount=`"100"` → ok; INCOME with amount=`"-100"` → `sign_mismatch`; EXPENSE with amount=`"-50"` → ok; EXPENSE with amount=`"50"` → `sign_mismatch`; TRANSFER with amount=`"100"` → ok; TRANSFER with amount=`"-100"` → ok; TRANSFER with amount=`"0"` → `zero_amount`; `"1.234"` on USD → `too_many_decimals`; `"abc"` → `not_a_number`. Constitution Principle IV.
- [x] T009 [P] Extend `tests/unit/money-decimal.test.ts` with `sumAmounts` cases: empty array → zero; single amount → that amount; three amounts → correct sum; mixed signs → correct sum; preserves Decimal precision (no float drift). Constitution Principle IV.

### `lib/transactions/` — dates, errors, serialize (parallelizable after T004)

- [x] T010 [P] Create `lib/transactions/dates.ts`: export `normalizeToUtcDay(input: string | Date): Date` — for an input like `"2026-05-17"` or a `Date` object, returns `new Date(Date.UTC(year, month, day, 0, 0, 0, 0))` representing UTC midnight of that calendar day. Also export `isISODateString(input: string): boolean` — regex check for YYYY-MM-DD. Per [research.md R8](./research.md), date normalization lives here (NOT in `lib/money/` — dates aren't money).
- [x] T011 [P] Create `lib/transactions/errors.ts`: error code constants per [contracts/README.md](./contracts/README.md) — `unauthenticated`, `validation_failed`, `not_found`, `currency_mismatch`, `sign_mismatch`, `transfer_cross_currency`, `transfer_archived_leg`, `archived_account_transfer_blocked`, `internal_error`. Export `TransactionErrorCode` type + `errorEnvelope(code, opts?)` helper. Export custom Error subclasses `CurrencyMismatchError`, `TransferCrossCurrencyError`, `TransferArchivedLegError`, `ArchivedAccountTransferBlockedError` (used by queries.ts to signal these states; caught by actions.ts and converted to envelopes).
- [x] T012 [P] Create `lib/transactions/serialize.ts`: `serializeTransaction(row: Transaction): TransactionDTO`. Convert `Decimal` → canonical string (`.toString()` — per feature 004's serialize pattern), `Date` → ISO string. DTO shape: `{ id, userId, accountId, categoryId, date, amount, currency, type, payee, notes, transferGroupId, archivedAt, createdAt, updatedAt }` — all dates as ISO strings, amount as canonical decimal string.

### `lib/transactions/` — schemas, queries, actions

- [x] T013 Create `lib/transactions/schemas.ts`: Zod schemas for the 7 server actions (one per action). The `amount` field MUST use `validateTransactionAmount` from `lib/money` via `superRefine`. The `date` field MUST be `z.string().refine(isISODateString)` then transformed to `Date` via `normalizeToUtcDay`. The `currency` field MUST be `z.string().trim().transform(s => s.toUpperCase()).pipe(z.string().refine(isCurrencyCode))` (same pattern as feature 004). Cross-field rules enforced at the queries layer (T014), not in the schema. (Depends on T007, T010.)
- [x] T014 Create `lib/transactions/queries.ts`: Prisma helpers — `listTransactionsForUser(userId, filters)`, `getTransactionForUser(userId, id)`, `createTransactionForUser(userId, input)` (single INCOME/EXPENSE row), `createTransferForUser(userId, input)` (**atomic two-leg insert inside `prisma.$transaction`** per [contracts/createTransfer.md](./contracts/createTransfer.md) — generate transferGroupId, insert negative leg + positive leg, return both), `updateTransactionForUser(userId, id, input)`, `updateTransferForUser(userId, transferGroupId, input)` (**atomic two-leg update inside `prisma.$transaction`**), `setArchivedAtForUser(userId, id, value: Date | null)` (auto-detects type; for TRANSFER, archives BOTH legs atomically via shared transferGroupId), `sumAmountsForAccount(userId, accountId)`, `sumAmountsForAccountsBatch(userId, accountIds: string[])` (returns a Map<accountId, Money> via a single `groupBy` query — used by the accounts-list balance refactor). **First positional arg of every helper is `userId`** ([research.md R6](./research.md)). Every Prisma `where:` clause includes `userId`. **This file is the ONLY file in the app that imports `prisma.transaction.*` going forward.** Specific rules: (1) `listTransactionsForUser` applies `orderBy: [{ date: "desc" }, { createdAt: "desc" }]` per FR-020 — deterministic, stable across reloads; (2) when `updateTransactionForUser`/`updateTransferForUser` receives a new `accountId`, fetch that account via `getAccountForUser` and reject if it's archived (`ArchivedAccountTransferBlockedError`-style — covers FR-005 edit path explicitly); (3) other rules enforced inside `createTransactionForUser`/`createTransferForUser`/`updateTransactionForUser`/`updateTransferForUser`: (a) fetch parent account(s) via existing `lib/accounts/queries.ts` helpers (scoped by userId — cross-user accountId naturally collapses to not_found); (b) `currency` MUST equal `account.currency` (throws `CurrencyMismatchError` otherwise); (c) for transfers, `fromAccount.currency === toAccount.currency` (throws `TransferCrossCurrencyError`); (d) for transfers, neither account is archived (throws `ArchivedAccountTransferBlockedError`); (e) when archiving a transfer leg, archive BOTH legs in a single `$transaction` callback. (Depends on T004, T010, T011.)
- [x] T015 Create `lib/transactions/actions.ts`: seven `"use server"` server actions per `contracts/` (`createTransaction`, `createTransfer`, `updateTransaction`, `updateTransfer`, `archiveTransaction`, `unarchiveTransaction`, `listTransactions`). Per-action flow: (1) `await auth()` → on missing session return `unauthenticated`; (2) Zod `safeParse(formData)` → on failure return `validation_failed` with `fieldErrors`; (3) call the relevant queries helper with `session.user.id`; (4) catch `CurrencyMismatchError` → `currency_mismatch`; catch `TransferCrossCurrencyError` → `transfer_cross_currency`; catch `TransferArchivedLegError` → `transfer_archived_leg`; catch `ArchivedAccountTransferBlockedError` → `archived_account_transfer_blocked`; (5) on read returning `null` → `not_found`; (6) `archiveTransaction` sets `archivedAt = new Date()` server-side, never accepts client timestamp; (7) on success return `{ data: { transaction: serializeTransaction(row) } }` or `{ data: { transactions: rows.map(serializeTransaction) } }` or `{ data: { transferGroup: { legs: [serializeTransaction(neg), serializeTransaction(pos)] } } }` for transfers; (8) call `revalidatePath("/dashboard/transactions")` AND `revalidatePath("/dashboard/accounts")` after every successful mutation (accounts balances change). (Depends on T009, T010, T011, T012, T013, T014.)
- [x] T016 Create `lib/transactions/index.ts`: server-only barrel re-exporting the 7 actions, `TransactionDTO` type, `TransferGroupDTO` type, error-code union. Include `import "server-only"` at the top.

### Unit-test suite (Principle IV — MANDATORY)

- [x] T017 [P] Create `tests/unit/transactions-dates.test.ts`: lock `normalizeToUtcDay` per FR-007 and [research.md R8](./research.md). Test cases: `"2026-05-17"` → `Date(2026, 4, 17, 0, 0, 0, 0)` UTC; existing `Date` object with non-midnight time → UTC midnight of that calendar day; timezone-edge case (Date object representing 2026-05-17 23:59 in UTC-5 → 2026-05-18 04:59 UTC → normalized back to 2026-05-18 UTC midnight); `isISODateString` accepts `"2026-05-17"` rejects `"2026-13-01"` and `"2026/05/17"` and `""`.
- [x] T018 [P] Create `tests/unit/transactions-schemas.test.ts`: lock the Zod boundary rules per [contracts/](./contracts/). Test cases: `createTransactionSchema` with sign-mismatch (INCOME with negative amount, EXPENSE with positive) → fails; with valid sign → succeeds; with invalid currency (`"DEM"`) → fails; with non-ISO date → fails; with name=blank/whitespace → fails; with notes > 500 chars → fails; with payee > 120 chars → fails. `createTransferSchema` with fromAccountId === toAccountId → fails (self-transfer rejected); with negative amount → fails (transfer form sends positive; system signs both legs internally); with date in YYYY-MM-DD format → succeeds and transforms to UTC midnight Date.
- [x] T019 [P] Create `tests/unit/transactions-queries.test.ts`: lock the transfer-pair invariant + balance computation + cascade archive per [research.md R26](./research.md). **Strategy**: vitest-mock `@/lib/prisma` and assert call shapes. Test cases: (a) `createTransferForUser` calls `prisma.$transaction` with a callback that creates exactly 2 rows; both rows share `transferGroupId`; one row has negative amount, one positive; both rows have same `date` + `currency` + `type=TRANSFER`. (b) `createTransferForUser` with `fromAccountId === toAccountId` throws (additional structural guard). (c) `createTransferForUser` with `fromAccount.currency !== toAccount.currency` throws `TransferCrossCurrencyError`. (d) `setArchivedAtForUser` on a row where `type === "TRANSFER"` invokes `prisma.transaction.updateMany` with `where: { userId, transferGroupId: row.transferGroupId }` (BOTH legs together), NOT `prisma.transaction.update` on the single row. (e) `setArchivedAtForUser` on a row where `type !== "TRANSFER"` updates just that one row. (f) `sumAmountsForAccount` calls `prisma.transaction.aggregate` with `where: { userId, accountId, archivedAt: null }`. (g) `sumAmountsForAccountsBatch(userId, [a, b, c])` calls `prisma.transaction.groupBy({ by: ["accountId"], where: { userId, accountId: { in: [a, b, c] }, archivedAt: null }, _sum: { amount: true } })` and returns a Map. Constitution Principle IV.

### Accounts-list balance refactor

- [x] T020 Modify `lib/accounts/queries.ts`: extend `listAccountsForUser` to optionally compute live balances. Import `sumAmountsForAccountsBatch` from `@/lib/transactions/queries` (this is the documented cross-module exception per [research.md R6](./research.md) — function call, NOT direct `prisma.transaction.*` access). After fetching the accounts list, call `sumAmountsForAccountsBatch(userId, accountIds)` ONCE to get all the deltas, then add `account.startingBalance.plus(deltaMap.get(account.id) ?? new Money(0))` per account to produce the live balance. Return shape adds a `balance: string` field on each `AccountDTO` (canonical decimal string). The `startingBalance` field stays for callers that need it. Update `lib/accounts/serialize.ts` to include the `balance` field in the DTO.

**Checkpoint**: `pnpm typecheck` + `pnpm lint` + `pnpm test` (134 existing + ~25–35 new from T008/T009/T017/T018/T019 = 160+ unit tests) pass. `pnpm exec prisma migrate status --schema=db/schema.prisma` reports "Database schema is up to date." `grep -rn "prisma\.transaction" --include="*.ts" --exclude-dir=node_modules .` returns matches ONLY in `lib/transactions/queries.ts` AND `tests/unit/transactions-queries.test.ts` (mock, acceptable). Sign up a fresh user, create an account with startingBalance=1000, manually insert one INCOME transaction of amount=500, verify the accounts list now shows balance=1500.

---

## Phase 3: User Story 1 — Record an expense transaction (Priority: P1) 🎯 MVP-START

**Goal**: A user with at least one account can record an expense transaction (account + category + date + amount + payee + notes), see it in the transactions list, and see the account balance decrease by that amount.

**Independent Test**: Sign up a fresh user → create an account (Chase Checking, USD, $1000 startingBalance) → navigate to `/dashboard/transactions` via sidebar → assert the page is empty (no transactions yet) → click "+ Add transaction" → fill (Chase Checking, Groceries category, today, $-50.00, "Whole Foods", "Weekly shop") → submit → assert sheet closes and the row appears in the list with date, payee, category, account, and amount rendered through `<Money>` in money-negative red color. Navigate to `/dashboard/accounts` → assert Chase Checking balance is now $950.00.

### Implementation for User Story 1

- [x] T021 [US1] Create `components/accounts/account-picker.tsx`: the `<AccountPicker>` UI contract surface per [research.md R21](./research.md). Reusable across this feature + future features 008/015/016. Props: `{ value: string | null, onChange: (id: string | null) => void, currency?: string, includeArchived?: boolean, disabled?, allowNone?: boolean, placeholder? }`. Uses shadcn `<Command>` inside `<Popover>`. Fetches via `listAccounts({ includeArchived: includeArchived ?? false })`. Filters by `currency` when set (used by transfer form where to-account currency must match from-account). Renders icon + name + balance per row. Located at `components/accounts/account-picker.tsx` (NOT under a route-bound `_components/`).
- [x] T022 [US1] Create `app/(shell)/dashboard/transactions/_components/transaction-form.tsx`: client component, props `{ mode: "create" | "edit" | "edit-archived", transaction?: TransactionDTO, onSuccess: () => void }`. For US1, implement the `"create"` branch fully; stub `"edit"` and `"edit-archived"` with `// TODO US4` comments. Fields (create): account (`<AccountPicker>`), type (shadcn `<Select>` with INCOME/EXPENSE — TRANSFER goes through the separate transfer form per US3), category (`<CategoryPicker>` filtered to match type's kind: INCOME→`kind=INCOME`, EXPENSE→`kind=EXPENSE`; hidden when type=TRANSFER), date (`<Input type="date" />` or a date picker — pick simple `<Input type="date" />` for v1), amount (`<Input type="text" inputMode="decimal" />` — note the form takes raw decimal, the schema's `superRefine` enforces sign-must-match-type), payee (`<Input>` optional, max 120), notes (`<Textarea>` optional, max 500). Wire to `createTransaction` server action via `useActionState`. Display Zod field errors per field. **On success → call `onSuccess()` AND trigger a balance refresh** (the `revalidatePath("/dashboard/accounts")` from the action handles this server-side, but the local `<TransactionsList>` state also needs a refetch).
- [x] T023 [US1] Create `app/(shell)/dashboard/transactions/_components/transaction-form-sheet.tsx`: client component wrapping shadcn `<Sheet>`. Props: `{ open, onOpenChange, mode, transaction?, onSuccess }`. Renders `<TransactionForm>` inside `<SheetContent>` with title per mode ("Add transaction" / "Edit transaction" / "Edit archived transaction"). Pattern mirrors `<CategoryFormSheet>` from feature 005.
- [x] T024 [US1] Create `app/(shell)/dashboard/transactions/_components/transactions-list.tsx`: client component, props `{ initialTransactions: TransactionDTO[], initialAccounts: AccountDTO[], initialCategories: CategoryDTO[] }`. State: `transactions`, `sheetOpen`, `sheetMode: "create"`, `transferSheetOpen: false` (for US3), `editingTransaction`, `showArchived: false`, `archiveTarget` (US4 will use), `filters` (US5 will use). For US1, render: header strip with `<h1>Transactions</h1>` + "+ Add transaction" button (US1) + "+ Add transfer" button (disabled for US1, enabled in US3). The list itself: shadcn `<Table>` with columns Date, Description (payee + notes), Category, Account, Amount (via `<Money>` with `prominent align="right"`). The list is already sorted by `listTransactionsForUser`'s `orderBy: [{ date: "desc" }, { createdAt: "desc" }]` per FR-020; render in array order. **No render cap in v1** (FR-026 reachability): the URL date range (default 30 days, user-adjustable) is the natural ceiling on result-set size; thousands of rows over a wide range render fine in a single table without pagination. If a future feature needs to cap, add "Load older" then. **Three distinct empty states** to render correctly (FR-019, FR-029): (a) **NO ACCOUNTS** — when `initialAccounts.length === 0` AND `initialAccounts` includes archived (i.e., the user truly has zero accounts of any state): render `<EmptyState illustration={<AbacusIllustration />} title="Create an account first" description="Transactions need an account to belong to. Add your first account to start tracking money." action={{ label: "Add an account", href: "/dashboard/accounts" }} />`. The "+ Add transaction" and "+ Add transfer" buttons MUST be `disabled` in this state. (b) **NO TRANSACTIONS** (but accounts exist) — when `transactions.length === 0` AND `initialAccounts.length > 0`: render `<EmptyState illustration={<AbacusIllustration />} title="No transactions yet" description="Record your first income, expense, or transfer to get started." action={{ label: "Add transaction", onClick: () => openSheet() }} />`. The "+ Add transaction" / "+ Add transfer" buttons remain enabled. (c) **LOADED** — when `transactions.length > 0`: render the table. The illustration reuses `<AbacusIllustration>` from feature 005 — no new illustration for this feature.
- [x] T025 [US1] Replace `app/(shell)/dashboard/transactions/page.tsx`: server component. Imports `auth`, `listTransactions`, `listAccounts`, `listCategories`. Flow: (1) `await auth()` — defense-in-depth; (2) parse URL search params for filters (defer for US1 — just use default last-30-days); (3) call all three list actions in parallel via `Promise.all`; (4) on `unauthenticated` redirect; on other errors throw; (5) render `<TransactionsList initialTransactions={...} initialAccounts={...} initialCategories={...} />`.
- [x] T026 [US1] Add `tests/e2e/transactions.spec.ts` with the US1 round-trip: `test.beforeAll` truncates `Transaction` then `Category` then `Account` then `User` (order matters because of FK dependencies; alternatively use cascade via deleting User). `test.describe("Transactions US1")`. (a) Sign up fresh user, create an account (Chase Checking, USD, 1000), navigate to `/dashboard/transactions`. Assert empty state. Click "+ Add transaction". Fill EXPENSE for $50 ("Whole Foods", category Groceries), submit. Assert sheet closes, row appears with amount `-$50.00` in money-negative color (verify via class or CSS color). (b) Navigate to `/dashboard/accounts`. Assert Chase Checking balance shows `$950.00` (was $1000, now $1000 + $-50 = $950). (c) Reload `/dashboard/transactions`. Assert the row persists. (d) Open a fresh browser context, sign up a second user, navigate to `/dashboard/transactions`. Assert empty (cross-user isolation).

**Checkpoint**: US1 fully functional. The user-visible payoff — a transaction recorded and reflected in the account balance — works end-to-end.

---

## Phase 4: User Story 2 — Record an income transaction (Priority: P1)

**Goal**: Same flow as US1, but with type=INCOME and positive amount. The form is the same component; only the test asserts the income-specific behavior.

**Independent Test**: With a user who has at least one account, click "+ Add transaction", fill (Chase Checking, Salary category, today, $3200, "Acme Corp"), submit. Assert sheet closes, row appears with amount `$3,200.00` in default foreground color (positive). Account balance updated by +$3200.

### Implementation for User Story 2

- [x] T027 [US2] Add US2 e2e block to `tests/e2e/transactions.spec.ts`: from the user created in US1 (or a fresh user), create an INCOME transaction for $3200 (Salary, Acme Corp). Assert the row appears with `$3,200.00` in foreground (NOT money-negative red). Assert the account balance reflects both the US1 expense and the US2 income (starting=1000, -50 from US1, +3200 from US2 = 4150). NO new component code needed — US1's `<TransactionForm>` handles INCOME type fully.

**Checkpoint**: US1 + US2 cover the two single-transaction flows. Account balance computation verified by aggregating multiple transactions.

---

## Phase 5: User Story 3 — Transfer money between two accounts (Priority: P1)

**Goal**: A user with ≥2 accounts in the same currency can transfer money between them. The transfer creates two atomic legs sharing a `transferGroupId`; both account balances update.

**Independent Test**: With a user who has Chase Checking ($950 from US1) and Savings ($0 startingBalance, USD), click "+ Add transfer", fill (from=Chase Checking, to=Savings, $500, "Move to savings"), submit. Assert sheet closes. Navigate to `/dashboard/accounts`. Assert Checking balance is now $450 (was $950, -$500); Savings balance is now $500 (was $0, +$500). Back to `/dashboard/transactions`. Assert TWO rows visible — one with amount `-$500.00` linked to Checking, one with `+$500.00` linked to Savings; both have `type=TRANSFER`.

### Implementation for User Story 3

- [x] T028 [US3] Create `app/(shell)/dashboard/transactions/_components/transfer-form.tsx`: client component, props `{ mode: "create" | "edit", transferGroup?: TransferGroupDTO, onSuccess: () => void }`. For US3, implement `"create"` branch fully; stub `"edit"` with `// TODO US4`. Fields (create): fromAccount (`<AccountPicker>`), toAccount (`<AccountPicker currency={fromAccount?.currency}>` — filtered to same currency for v1 since cross-currency is feature 020), date, amount (single positive value — the system signs both legs internally), notes (max 500). Wire to `createTransfer` server action via `useActionState`. On success → `onSuccess()`.
- [x] T029 [US3] Create `app/(shell)/dashboard/transactions/_components/transfer-form-sheet.tsx`: client component wrapping shadcn `<Sheet>`. Props: `{ open, onOpenChange, mode, transferGroup?, onSuccess }`. Renders `<TransferForm>` with title "Add transfer" / "Edit transfer".
- [x] T030 [US3] Update `app/(shell)/dashboard/transactions/_components/transactions-list.tsx`: enable the "+ Add transfer" button (remove `disabled`). State: add `transferSheetOpen: boolean`, `transferSheetMode: "create"`. Wire the button to open the `<TransferFormSheet>`. Mount the sheet at the bottom of the component. After successful create, the action calls `revalidatePath("/dashboard/transactions")` AND `/dashboard/accounts` so both surfaces refresh.
- [x] T031 [US3] Add US3 e2e block to `tests/e2e/transactions.spec.ts`: from a user with two same-currency accounts, click "+ Add transfer", fill the form ($500 Checking → Savings), submit. Assert sheet closes. Assert TWO new rows in the transactions list — one with `-$500.00` (Checking row), one with `+$500.00` (Savings row); both with `type=TRANSFER`; both share a `transferGroupId` (verify by inspecting the page text OR via direct DB query in the test setup). Navigate to `/dashboard/accounts`. Assert both balances updated correctly (Checking down $500, Savings up $500).

**Checkpoint**: US3 ships transfer atomicity. The constitution Principle IV E2E mandate ("create transaction, transfer between accounts") is now covered: US1 covers create transaction, US3 covers transfer.

---

## Phase 6: User Story 4 — Edit or archive a transaction or transfer (Priority: P1)

**Goal**: A user can edit any field of a single transaction; edit a transfer (modifying BOTH legs atomically); archive a single transaction or a transfer (cascading to both legs); unarchive.

**Independent Test**: From a user with single transactions and transfers in the list, click a single transaction → edit sheet opens → change amount and category → submit. Assert the row updates and account balance recomputes. Click a transfer leg → edit-transfer sheet opens → change amount from $500 to $600 → submit. Assert BOTH legs update to ±$600 atomically. Archive the transfer → assert BOTH legs disappear from the default list. Toggle "Show archived" → assert both reappear with badges. Unarchive → both return.

### Implementation for User Story 4

- [x] T032 [US4] Extend `app/(shell)/dashboard/transactions/_components/transaction-form.tsx`: implement the `"edit"` and `"edit-archived"` branches. `"edit"`: pre-populate from `transaction` prop; all fields editable except `currency` (which is locked by the account — not user-editable here; if the user changes account, the currency follows). Hidden `<input type="hidden" name="id" value={transaction.id} />`. **Per FR-006a**, when the transaction's `categoryId` references a now-archived category, the `<CategoryPicker>` in the edit form MUST keep that archived category selectable as the active value while still hiding OTHER archived categories from the dropdown. Implementation: pass `includeArchived={transaction.category?.archivedAt !== null}` to the picker — this includes the currently-archived selection in the option list. Render the archived category name with a muted treatment + small "(archived)" suffix in the picker option to signal its state. The "Save" action allows the user to either keep the archived category (no-op) or pick a new non-archived one. Similarly, the account picker (per FR-022) preserves the existing account selection if it's been archived, while hiding other archived accounts from the dropdown. `"edit-archived"`: only `notes` and `payee` editable (consistency with the Accounts/Categories archived-edit pattern — semantically loaded fields like amount/date/account/category are frozen while archived). Add an inline notice "This transaction is archived. Only notes and payee can be edited while archived." Both modes bind to `updateTransaction` via `useActionState`.
- [x] T033 [US4] Extend `app/(shell)/dashboard/transactions/_components/transfer-form.tsx`: implement the `"edit"` branch. Pre-populate from the `transferGroup` prop (both legs). When submitted, the action calls `updateTransfer` which atomically updates BOTH legs in a `prisma.$transaction`. Fields editable: fromAccount, toAccount, date, amount, notes. (No edit-archived mode for transfers — once archived, the transfer is shown read-only with an "Unarchive both legs" button.)
- [x] T034 [US4] Create `app/(shell)/dashboard/transactions/_components/archive-confirm-dialog.tsx`: client component. Props: `{ transactionId, transactionLabel, isTransfer, open, onOpenChange, onArchived }`. Renders shadcn `<AlertDialog>`. Copy: "Archive this transaction?" or "Archive this transfer?" (depending on `isTransfer`). Description: `Archive {label}? You can unarchive it later. Account balances will update accordingly.` On Archive: call `archiveTransaction` server action via `useTransition`. On success: `onArchived()` then close.
- [x] T035 [US4] Update `app/(shell)/dashboard/transactions/_components/transactions-list.tsx`: wire row click → opens edit sheet (transaction form for single, transfer form for TRANSFER rows; mode is `edit` if active, `edit-archived` if archived). Wire row trailing buttons (Archive for active, Unarchive for archived). Mount the `<ArchiveConfirmDialog>` at the bottom. For TRANSFER rows, archive/unarchive operates on BOTH legs structurally via `archiveTransaction` (which detects `type === "TRANSFER"` and uses `setArchivedAtForUser` to update both via `transferGroupId`). Add the "Show archived" Switch (default off); when toggled, refetch with `includeArchived: true`. Add `<Badge variant="secondary">Archived</Badge>` to archived rows.
- [x] T036 [US4] Add US4 e2e blocks to `tests/e2e/transactions.spec.ts`: (a) edit a single transaction — change amount, save, assert row updates AND account balance recomputes. (b) edit a transfer — change amount from $500 to $600, save, assert BOTH legs update (look for the two rows with $-600 and $+600 instead of $-500 and $+500); navigate to accounts, assert balances recomputed. (c) archive a transfer — click any TRANSFER row's archive button, confirm in dialog, assert BOTH legs disappear from default list and account balances revert (Checking back up $600, Savings back down $600). (d) toggle "Show archived" on, assert both archived TRANSFER legs reappear with badges. (e) unarchive — click any archived TRANSFER leg's unarchive button, assert BOTH legs return to active list and balances re-apply.

**Checkpoint**: All four P1 stories complete. MVP shippable. Transfer atomicity invariant verified on create + edit + archive.

---

## Phase 7: User Story 5 — Filter and scan the transactions list (Priority: P2)

**Goal**: The transactions list supports filtering by date range, account, category, and type. Filters are URL-driven (shareable).

**Independent Test**: From a user with transactions across multiple dates/accounts/categories, set date range = last 7 days → assert only matching rows. Set account filter to a specific account → assert only that account's rows. Filter by category → assert only that category's rows. Filter by type = TRANSFER → assert only transfer rows. URL contains the filter params; reloading preserves them.

### Implementation for User Story 5

- [x] T037 [US5] Create `app/(shell)/dashboard/transactions/_components/date-range-picker.tsx`: client component using shadcn `<Calendar>` (from T002) inside `<Popover>`. Props: `{ from: Date | null, to: Date | null, onChange: (from: Date | null, to: Date | null) => void }`. Allows selecting a date range; renders the chosen range as text on the trigger. Default presets: "Last 7 days", "Last 30 days", "This month", "Custom".
- [x] T038 [US5] Create `app/(shell)/dashboard/transactions/_components/transaction-filters.tsx`: client component combining date range, account picker (`<AccountPicker allowNone={true} placeholder="All accounts">`), category picker (`<CategoryPicker allowNone={true} placeholder="All categories">`), and type filter (shadcn `<Select>` with options: All / INCOME / EXPENSE / TRANSFER). Wires each filter change to `useRouter().push` with updated search params (URL-driven).
- [x] T039 [US5] Update `app/(shell)/dashboard/transactions/page.tsx`: parse search params for `from`, `to`, `accountId`, `categoryId`, `type` (default last-30-days if `from`/`to` absent). Pass parsed filters to `listTransactions({ dateFrom, dateTo, accountId, categoryId, type })`. Pass the filtered transactions + filter values down to `<TransactionsList>`.
- [x] T040 [US5] Update `app/(shell)/dashboard/transactions/_components/transactions-list.tsx`: mount `<TransactionFilters>` above the table. The filters are URL-driven so the list updates when the URL changes (Next.js router triggers a server re-render). The list itself just renders whatever `initialTransactions` it receives.
- [x] T041 [US5] Add US5 e2e block to `tests/e2e/transactions.spec.ts`: from a user with transactions across types and accounts, apply each filter in turn (date range, account, category, type=TRANSFER). Assert the URL updates with search params; assert the rendered list contains only matching rows. Reload — assert filters preserved.

**Checkpoint**: US5 ships URL-driven filtering. Sets up feature 009 (Search & filter) cleanly.

---

## Phase 8: User Story 6 — Validation surfaces actionable errors (Priority: P2)

**Goal**: Invalid input (sign mismatch, currency mismatch, transfer cross-currency, blank required fields, over-length payee/notes, etc.) is rejected at the Zod boundary with field-scoped errors.

**Independent Test**: For each invalid input, submit the form and assert the error message is visible near the offending field; the form does not close; the persisted state is unchanged.

### Implementation for User Story 6

- [x] T042 [US6] Add validation e2e block to `tests/e2e/transactions.spec.ts`: exercise each rejection path: (a) **sign mismatch** — open create form, set type=INCOME, enter amount=-100, submit; assert sign_mismatch error and no row added. (b) **currency mismatch** — this is structurally prevented by the form (account selection auto-derives currency); to test the server-side guard, you may need to bypass the form by directly POSTing the action with a tampered payload — or skip and document via comment that it's covered by T019 unit test. (c) **transfer cross-currency** — create a USD account and an EUR account; open the transfer form, select from=USD account, the toAccount picker should be filtered to only USD accounts (verify this in the test); to verify the server-side guard, similarly attempt a tampered POST or skip with comment. (d) **blank required fields** — submit with blank amount, blank account, blank date; assert each surface its respective field error. (e) **over-length payee** — submit a 121-char payee; assert max-length error. (f) **invalid date format** — submit a malformed date string (via bypassing the date input); assert validation_failed.

**Checkpoint**: All six user stories pass independently.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verification — every existing test stays green, type/lint/format pass, data-scoping audit, money-boundary audit, manual quickstart walkthrough. The money-reviewer subagent audits after this phase.

- [X] T043 Run `pnpm typecheck` from the repo root — zero errors, zero `any` introduced.
- [X] T044 Run `pnpm lint` from the repo root — zero errors.
- [X] T045 Run `pnpm format` to apply Prettier across modified files, then `pnpm format:check` to verify clean.
- [X] T046 Run `pnpm test` from the repo root — all 134 existing + new from T008/T009/T017/T018/T019 unit tests green.
- [X] T047 Run `pnpm test:e2e` from the repo root — 30 existing + new categories.spec.ts blocks + new transactions.spec.ts blocks all pass. Use `pnpm exec next start` after `pnpm exec next build` for e2e (Turbopack dev panics).
- [X] T048 Data-scoping audit: from the repo root, run `grep -rnE "prisma\.transaction" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=specs --exclude-dir=.specify .` and verify matches are ONLY in `lib/transactions/queries.ts` AND `tests/unit/transactions-queries.test.ts` (mock, acceptable) AND possibly `tests/e2e/transactions.spec.ts` for test infrastructure (truncation in beforeAll, acceptable). Any match outside these is a data-scoping convention violation.
- [X] T049 Money-boundary audit: from the repo root, run `grep -rnE "(new Decimal|new Prisma\.Decimal|\.plus\(|\.minus\(|\.times\(|\.div\()" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=db --exclude-dir=specs --exclude-dir=.specify .` and verify matches are ONLY in `lib/money/*` (the canonical home) and `lib/transactions/queries.ts` / `lib/accounts/queries.ts` (where `new Prisma.Decimal(...)` is the documented bridge from Zod-validated string to DB column). Also verify every `prisma.$transaction(...)` call site that creates a TRANSFER row is in `lib/transactions/queries.ts` (transfer atomicity invariant). Use `grep -n "type:.*TRANSFER" lib/transactions/queries.ts` to confirm all TRANSFER inserts are inside `$transaction` callbacks (manual review of the file).
- [X] T050 Manual walkthrough per [quickstart.md](./quickstart.md): drop local DB, signup + create account + create transactions of all 3 types + create transfer + edit + archive + unarchive + filter; verify balance computations across all surfaces; verify cross-user isolation.

**Final checkpoint**: Transactions feature is mergeable. Constitution v0.2.0 compliant. **Money-reviewer subagent runs on this PR** — audit invariants from [research.md R26](./research.md): (a) all monetary writes go through `lib/money/`; (b) transfer atomicity verifiable by grep (every TRANSFER write is inside `$transaction`); (c) currency stored alongside amount on every row; (d) no rounding in business logic; (e) the new unit suite covers all the constitution-Principle-IV money paths; (f) the e2e covers "create transaction, transfer between accounts."

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup** (T001 + T002) — must complete first.
- **Phase 2 — Foundational** (T003–T020) — depends on Phase 1. Within Phase 2: T003 → T004 → everything else; T005–T009 are `lib/money/` extensions; T010–T012 are independent files (`[P]`); T013 depends on T007 + T010; T014 depends on T004 + T010 + T011; T015 depends on T009–T014; T016 depends on T015; T017–T019 are independent test files (`[P]`); T020 depends on T014.
- **Phase 3 (US1)** depends on Phase 2. T021 / T022 / T024 are independent; T023 → T022; T025 → T021 + T022 + T023 + T024; T026 → T025.
- **Phase 4 (US2)** depends on Phase 3 (uses US1's form). Only one task (T027) — e2e-only.
- **Phase 5 (US3)** depends on Phase 3. T028 / T029 independent; T030 → T028 + T029 + T024; T031 → T030.
- **Phase 6 (US4)** depends on Phases 3, 4, 5. T032 + T033 + T034 parallelizable; T035 → T032 + T033 + T034; T036 → T035.
- **Phase 7 (US5)** depends on Phase 3 (extends the page). T037 → T002 (Calendar primitive); T038 → T037; T039 → T038; T040 → T039; T041 → T040.
- **Phase 8 (US6)** depends on Phase 3 (uses the create form). One task (T042).
- **Phase 9 (Polish)** depends on all earlier phases.

### Parallel opportunities

- **Phase 2**: T005 / T006 parallelizable; T008 / T009 parallelizable; T010 / T011 / T012 all `[P]`; T017 / T018 / T019 all `[P]`.
- **Phase 3**: T021 / T022 / T024 parallelizable (different files).
- **Phase 6**: T032 / T033 / T034 parallelizable.

---

## Parallel Example: Phase 2 unit-test suite

```bash
# After T013 + T014 + T015 land:
Task: "Create tests/unit/transactions-dates.test.ts"
Task: "Create tests/unit/transactions-schemas.test.ts"
Task: "Create tests/unit/transactions-queries.test.ts"
```

These three test files have no shared state and exercise distinct modules.

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 + US4 — the four P1 stories)

1. Complete Phase 1: Setup (T001–T002).
2. Complete Phase 2: Foundational (T003–T020) — the bulk; schema, migration, server surface, unit suite, accounts-list balance refactor.
3. Complete Phase 3: US1 (T021–T026) — expense flow + e2e.
4. Complete Phase 4: US2 (T027) — income e2e (no new components).
5. Complete Phase 5: US3 (T028–T031) — transfer flow + e2e + atomicity verification.
6. Complete Phase 6: US4 (T032–T036) — edit + archive + cascade atomicity + e2e.
7. **STOP and VALIDATE**: run polish audits (T043–T050). The MVP is shippable here. The constitution Principle IV E2E mandate is satisfied.

### Incremental Delivery

1. MVP (US1 + US2 + US3 + US4) ships first.
2. Add US5 — URL-driven filters (T037–T041). Re-run audits. Ship.
3. Add US6 — validation e2e verification (T042). Re-run audits. Ship.

### What CANNOT be cut

- T003–T020 — foundational; everything depends on them.
- T017–T019 — Principle IV mandates these unit tests for the money paths.
- T020 — accounts-list balance refactor; without it, feature 004 FR-017's promised live balance never materializes.
- T031 — transfer atomicity e2e; this is the constitution-mandated E2E from Principle IV ("create transaction, transfer between accounts").
- T048 + T049 — data-scoping + money-boundary audits; guard rails against future regressions.

### What can be safely deferred under schedule pressure

- T041 + T042 (US5 + US6 e2e) — both are e2e-only verification; the underlying behavior is already covered by foundational schemas and queries.
- The default "Last 30 days" date range filter — if the page renders all transactions for now and date filtering lands later as a follow-up, US1+US2+US3+US4 still demo cleanly.

---

## Traceability: spec FRs → tasks

(Spec uses suffixed FR numbering: FR-001..FR-034 + FR-006a + FR-019a + FR-026a = 37 FRs. Maps below.)

| FR | Covered by |
|---|---|
| FR-001 (Transaction model + migration) | T003, T004 |
| FR-002 (userId FK cascade + 4 indexes) | T003 |
| FR-003 (queries scoped to session userId; no userId from input) | T014, T015, T048 |
| FR-004 (date normalized to UTC midnight at boundary) | T010, T013, T017 |
| FR-005 (accountId required; non-archived on create; same-currency on edit) | T013, T014 |
| FR-006 (categoryId optional; null for TRANSFER; same-userId; kind-matching) | T013, T014 |
| FR-006a (edit picker includes currently-archived category if it's the active selection) | T032 |
| FR-007 (currency = account.currency; denormalized; equality enforced at boundary) | T013, T014 |
| FR-008 (Decimal amount; signed-amount convention; zero rejected) | T005, T013, T018 |
| FR-009 (currency-aware decimal-places on amount) | T005, T018 |
| FR-010 (payee 1-120 trimmed; notes 1-500 trimmed; empty→null) | T013, T018 |
| FR-011 (TransactionType enum; category kind matches type when non-null) | T013, T014 |
| FR-012 (transferGroupId server-generated; null for INCOME/EXPENSE; shared for TRANSFER) | T013, T014, T019 |
| FR-013 (Zod at boundary; zero rows on validation failure) | T013, T015 |
| FR-014 (transfer atomicity create: 2 legs in 1 $transaction; invariants) | T014, T019, T031 |
| FR-015 (same-currency transfers only in v1; cross-currency rejected) | T014, T019 |
| FR-016 (transfer update atomicity: both legs in 1 $transaction; route enforcement) | T014, T033, T036 |
| FR-017 (archive single-leg soft; excluded from balance + default list) | T014, T015 |
| FR-018 (archive transfer cascades to BOTH legs atomically; route enforcement) | T014, T019, T035, T036 |
| FR-019 (default list excludes archived; Show archived toggle) | T015, T024, T035 |
| FR-019a (balance = startingBalance + Σ(non-archived); centralized; byte-for-byte) | T014, T020 |
| FR-020 (sort by date desc, secondary createdAt desc; deterministic, stable) | T014 |
| FR-021 (two primary CTAs: Add transaction + Add transfer; distinct sheets) | T024, T030 |
| FR-022 (account pickers exclude archived; existing reference preserved on edit) | T021, T032 |
| FR-023 (single-leg sheet fields: account/category/date/amount/type/payee/notes) | T022 |
| FR-024 (transfer sheet fields: From/To/Date/Amount/Notes; no Category/Type/Payee; pair-as-unit) | T028 |
| FR-025 (row click → edit sheet: single → single edit; transfer leg → transfer edit) | T035 |
| FR-026 (default 30-day range; reachability for >render-window results) | T039 + plan-level note (no render cap in v1; URL date range is the natural ceiling) |
| FR-026a (filters: date range + account + category + type + archive; URL-encoded) | T037, T038, T039 |
| FR-027 (error envelope; field-scoped detail; entered values preserved on reject) | T011, T015, T022 |
| FR-028 (all monetary writes through `lib/money/`; transfer-pair invariant helper; balance helper) | T005, T006, T020, T049 |
| FR-029 (no-accounts empty state with disabled CTAs + pointer to /dashboard/accounts) | T024 |
| FR-030 (keyboard-operable; labels; non-color identity; tabular numerals via `<Money>`) | T022, T024, T028, T038 |
| FR-031 (strict TS; no any; Zod is single source of truth at boundary) | T013, T043 |
| FR-032 (unit suite for money paths: transfer-pair invariant, sign rule, currency match, cross-currency rejection, zero rejection, decimal places, balance formula) | T008, T009, T017, T018, T019 |
| FR-033 (Playwright E2E: create transaction, transfer between accounts; atomicity invariant) | T026, T031, T036 |
| FR-034 (out-of-scope items NOT introduced: rules, CSV, recurring, FX, tags, attachments, charts, reports, audit log, real-time) | by-omission |
| SC-001 (≤30s to create first expense) | T026 |
| SC-002 (balance updates in 1 interaction) | T020, T026 |
| SC-003 (transfer-pair DB invariant 100%) | T019, T031 |
| SC-004 (transfer-edit atomicity, no observable intermediate state) | T014, T033, T036 |
| SC-005 (archive-transfer cascades both legs in 1 tx) | T014, T019, T036 |
| SC-006 (cross-currency transfer → 0 rows persisted) | T014, T019 |
| SC-007 (balance byte-for-byte across all rendered surfaces) | T020 |
| SC-008 (money-correctness unit suite passes on clean checkout 100%) | T008, T009, T017, T018, T019, T046 |
| SC-009 (constitution Principle IV E2E present, runs every CI, asserts atomicity + balance) | T026, T031, T036, T047 |
| SC-010 (cross-user attempts collapse to not_found 100%) | T014, T015 |
| SC-011 (second user sees empty list) | T026 |
| SC-012 (invalid payload rejected at Zod boundary 100%) | T013, T018, T042 |
| SC-013 (no money displayed without currency via `<Money>`; tabular numerals) | T022, T024, T028 |
| SC-014 (keyboard end-to-end; non-color identity) | T022, T024, T028, T038 |
| SC-015 (strict TS pass; no any; no arithmetic outside `lib/money/`) | T043, T049 |
| SC-016 (existing 134 unit + 30 e2e tests preserved; no test weakened) | T046, T047 |
| SC-017 (money-reviewer subagent PASS at PR time — invoked outside the tasks list per workflow convention) | post-T050 (PR-time invocation) |
| SC-018 (placeholder route replaced by functional page; sidebar nav unchanged) | T025 |

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps a task to its user story; Setup / Foundational / Polish have no story label.
- **The money-reviewer subagent MUST run after T050**. Money-touch=true on this PR. The audit invariants in [research.md R26](./research.md) are the audit's scope.
- The cross-module data-scoping exception (T020 — `lib/accounts/queries.ts` imports from `lib/transactions/queries.ts`) is the ONLY allowed cross-module call site for `lib/transactions/`. Documented in plan.md and research.md.
- `prisma.transaction.*` MUST appear ONLY in `lib/transactions/queries.ts` (verified by T048). The test mocks and e2e truncations are acceptable exceptions.
- Every TRANSFER write (create, update, archive) MUST be inside `prisma.$transaction(...)`. Verified by manual review in T049 + the unit test in T019.
- Commit after each task or each tight logical group (e.g., one commit for T005+T006+T007+T008+T009 as "lib/money/ extensions for transaction validation + sum + tests").
- Avoid: vague tasks, same-file `[P]` conflicts, breaking the transfer-pair invariant by introducing a "naive single-leg archive" path (the centralized `setArchivedAtForUser` in T014 prevents this — do NOT bypass it).
