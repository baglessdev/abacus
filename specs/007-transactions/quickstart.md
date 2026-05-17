# Feature 007 — Transactions + Transfers — Quickstart

Local-run delta for a developer who has features 001 through 006 (Categories) already working. If you do not, run those quickstarts in order first, then return here.

This is **the keystone money-correctness feature**. The constitution's Principle I leaves the spec stage and enters the runtime here; the money-reviewer subagent will audit the resulting PR. The walkthrough below includes a money-correctness verification checklist after the standard end-to-end walk.

## 1. Install new dependencies

This feature introduces **no new runtime dependencies**. Every shadcn primitive needed (Sheet, Popover, Command, AlertDialog, Switch, Table, Badge, Select) already shipped with features 004–006. The date-range picker is built from the existing Popover + Calendar primitives — Calendar lands as a new shadcn primitive but it wraps `react-day-picker` which Next.js + the shadcn registry expect.

If `react-day-picker` is not yet in `package.json`, the implementer adds it under the schema task. Verify after pulling:

```bash
pnpm install
```

## 2. Set required environment variables (unchanged)

No new env vars in this feature. `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` from features 001 and 003 are all that's needed. Verify with:

```bash
cat .env.local
```

`pnpm dev` will fail fast with a Zod error if any required var is missing.

## 3. Apply the new migration

```bash
pnpm db:migrate
```

This applies the `add_transaction` migration to your local Postgres. The migration creates:

- The `TransactionType` enum (`INCOME`, `EXPENSE`, `TRANSFER`).
- The `Transaction` table with all columns plus four indexes (`Transaction_userId_date_idx`, `Transaction_userId_accountId_date_idx`, `Transaction_userId_categoryId_idx`, `Transaction_userId_transferGroupId_idx`).
- Three foreign-key constraints:
  - `Transaction.userId` → `User.id` with `ON DELETE CASCADE`.
  - `Transaction.accountId` → `Account.id` with `ON DELETE RESTRICT`.
  - `Transaction.categoryId` → `Category.id` with `ON DELETE RESTRICT`.
- Back-relations on `User`, `Account`, `Category` (no SQL — Prisma-only).

Verify with `pnpm db:studio` and check the `Transaction` model is browsable. It will be empty initially.

## 4. Start the dev server

```bash
pnpm dev
```

Or, if you hit the known Turbopack dev-server panic from features 003/004:

```bash
pnpm exec next build && pnpm exec next start
```

## 5. Walk the feature end-to-end

### 5a. Sign up a fresh user — verify the prerequisites

1. Visit `http://localhost:3000`.
2. Click **Sign up**, enter an email + password (≥12 chars), submit.
3. You should auto-sign-in and land at `/dashboard`. Per feature 006, the signup transaction has seeded 11 default categories.
4. Verify by clicking **Categories** in the sidebar — 11 rows should appear.
5. Click **Transactions** in the sidebar. You should see the **no-accounts empty state** (FR-029) — a clear pointer to `/dashboard/accounts` with the message "Add an account first." The "+ Add transaction" and "+ Add transfer" CTAs are disabled.

### 5b. Add accounts (prerequisite for transactions)

1. Click **Accounts** in the sidebar.
2. Click **+ Add account**. Fill: name = `Chase Checking`, type = `CHECKING`, currency = `USD`, starting balance = `1250.00`. Submit.
3. Click **+ Add account** again. Fill: name = `Savings`, type = `SAVINGS`, currency = `USD`, starting balance = `5000.00`. Submit.
4. (Optional) Add a third account: name = `EuroSavings`, type = `SAVINGS`, currency = `EUR`, starting balance = `100.00`. This is used for the cross-currency-rejection check in step 5j.
5. Verify the balance column shows `$1,250.00`, `$5,000.00`, `€100.00` respectively. **These values are now computed live as `startingBalance + Σ(transactions)`, not just `startingBalance`.** For zero transactions, the math reduces to `startingBalance`, so the display is unchanged from feature 004.

### 5c. Record an EXPENSE transaction

1. Navigate back to **Transactions** in the sidebar.
2. The "+ Add transaction" CTA is now active. Click it.
3. The side sheet opens with: type = EXPENSE (default), account = (empty), category = (empty), date = today, amount = (empty), payee = (empty), notes = (empty).
4. Fill: account = `Chase Checking`, category = `Food / Groceries` (or any EXPENSE category — the category picker shows only EXPENSE categories because `type=EXPENSE`), date = today, amount = `87.43`, payee = `Whole Foods`, notes = (empty). Submit.
5. The sheet closes. The new row appears at the top of the list with `-$87.43` rendered in red (the `<Money>` primitive's sign-aware color). The amount column is right-aligned with tabular numerals.
6. **Verify the balance update.** Navigate to **Accounts** in the sidebar. The Chase Checking row's balance is now `$1,162.57` (`$1,250.00 - $87.43`).
7. Navigate back to **Transactions** and reload the page. The transaction is still there.

### 5d. Record an INCOME transaction

1. Click **+ Add transaction** again.
2. Change type to INCOME. The category picker re-renders showing only INCOME categories (Salary, Other Income).
3. Fill: account = `Chase Checking`, category = `Salary`, date = today, amount = `3200.00`, payee = `Acme Corp`, notes = (empty). Submit.
4. The sheet closes. The new row appears in the list with `+$3,200.00` (no sign character on positive amounts; the column is right-aligned).
5. Navigate to **Accounts**. Chase Checking's balance is now `$4,362.57` (`$1,250.00 - $87.43 + $3,200.00`).

### 5e. Record a TRANSFER between two same-currency accounts

1. Navigate back to **Transactions**.
2. Click **+ Add transfer** (the second CTA in the header bar, distinct from "+ Add transaction").
3. The transfer side sheet opens. It has DIFFERENT fields from the transaction sheet: `From account`, `To account`, `Date`, `Amount`, `Notes`. **No `Type`, no `Category`, no `Payee`.**
4. Fill: From = `Chase Checking`, To = `Savings`, date = today, amount = `500.00`, notes = (empty). Submit.
5. The sheet closes. **Two rows** appear in the transactions list: one with `-$500.00` on Chase Checking (the source leg), one with `+$500.00` on Savings (the destination leg). The rows share a date and the user can see they are paired (the list rendering may show them as paired visually, or as two separate rows — either is plan-acceptable per FR-025).
6. **Verify both balances updated.** Navigate to **Accounts**:
   - Chase Checking: `$3,862.57` (`$1,250.00 - $87.43 + $3,200.00 - $500.00`)
   - Savings: `$5,500.00` (`$5,000.00 + $500.00`)
7. Click the **+** icon or open a Postgres console (`pnpm db:studio` works, or `psql $DATABASE_URL`) and run:
   ```sql
   SELECT id, "accountId", amount, "transferGroupId", "userId"
   FROM "Transaction"
   WHERE type = 'TRANSFER' AND "archivedAt" IS NULL
   ORDER BY "createdAt" DESC LIMIT 2;
   ```
   Verify:
   - Exactly **two rows** appear.
   - Both share the same `transferGroupId` (non-null cuid).
   - Both share the same `userId`.
   - One has `amount = -500.00` (Chase Checking); the other has `amount = +500.00` (Savings).
   - This is the **transfer atomicity invariant** (SC-003).

### 5f. Edit the transfer

1. Click on either leg of the transfer in the transactions list. The **transfer-edit side sheet** opens (NOT the single-leg edit sheet).
2. The sheet pre-populates with `From = Chase Checking`, `To = Savings`, `Date = today`, `Amount = 500.00`, `Notes = (empty)`. The user sees the transfer as a single unit; one leg is not editable in isolation.
3. Change amount to `600.00`. Submit.
4. The sheet closes. **Both legs are updated atomically** — the source leg is now `-$600.00` on Chase Checking and the destination leg is `+$600.00` on Savings.
5. Verify in Accounts:
   - Chase Checking: `$3,762.57` (the previous `$3,862.57 - $100.00` net change because the magnitude went from $500 to $600 = $100 more deducted from source).
   - Savings: `$5,600.00`.

### 5g. Archive the transfer

1. In Transactions, click on the transfer (either leg). The transfer-edit sheet opens.
2. Click **Archive**. Confirm in the AlertDialog ("Archive this transfer? Both legs will be archived together.").
3. **Both legs disappear** from the default list. Cash balances revert as if the transfer never happened:
   - Chase Checking: `$3,862.57` (back to pre-transfer-edit but post-INCOME/EXPENSE state, accounting only for the salary and grocery transactions).

   Wait — actually: `$1,250.00 (start) - $87.43 (groceries) + $3,200.00 (salary) = $4,362.57`. The transfer's negative leg ($500 then edited to $600) is now archived, so it's excluded from the sum. Savings is back to `$5,000.00`. Verify both.
4. Toggle **Show archived** in the list. **Both archived legs reappear** with the "Archived" badge.
5. Click on one of the archived legs to confirm the edit sheet opens in the same transfer-edit shape — but archived rows are read-only (no Save button; only "Unarchive").

### 5h. Unarchive the transfer

1. With "Show archived" still on, click **Unarchive** on either archived leg.
2. **Both legs reappear in the active list.** Toggle "Show archived" off; both are still visible. Balances re-include them: Chase Checking back to `$3,762.57`, Savings back to `$5,600.00`.

### 5i. Date-range filter

1. With several transactions present, find the date-range picker in the page header.
2. Set "from" = yesterday and "to" = yesterday. The list re-renders showing only yesterday's transactions (which is none if you just created everything today — list is empty with the empty-state message "No transactions in this range").
3. Reset to default (last 30 days). The list re-renders with all your transactions.
4. **Verify URL encoding.** When you set from/to, the URL bar updates to `/dashboard/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD`. Bookmark this URL; reload; the filter is preserved.

### 5j. Money-correctness verification checklist

This is the load-bearing part. Each item below MUST behave as described; any deviation is a constitution Principle I failure.

| # | Check | Expected behavior |
|---|---|---|
| 1 | Open Add Transaction; set type = INCOME; amount = `87.43` (positive); category = `Salary`; submit. | Persisted `amount = +87.43`. Account balance increases by $87.43. |
| 2 | Open Add Transaction; set type = INCOME; amount = `-87.43` (negative — typed manually); submit. | Form rejects at the boundary with an actionable amount-field error: "Income must be entered as a positive amount" (or similar). Persisted state unchanged. |
| 3 | Open Add Transaction; set type = EXPENSE; amount = `87.43` (positive). | The form prepends `-` when posting. Persisted `amount = -87.43`. Account balance decreases by $87.43. |
| 4 | Open Add Transaction; set amount = `0`. | Form rejects with "Amount must be greater than zero." Persisted state unchanged. |
| 5 | Open Add Transaction; account = `Chase Checking` (USD); amount = `87.4321` (4 decimals; USD only supports 2). | Form rejects with "USD supports at most 2 decimal places." Persisted state unchanged. |
| 6 | Open Add Transaction; account = a JPY account (if you have one); amount = `100.5`. | Form rejects with "JPY does not support decimal places." Persisted state unchanged. |
| 7 | Open Add Transfer; From = Chase Checking; To = Chase Checking (same account). | Form rejects with "Source and destination must be different accounts." Persisted state unchanged. |
| 8 | Open Add Transfer; From = Chase Checking (USD); To = EuroSavings (EUR). | Form rejects with "Cross-currency transfers are not supported in this version." Persisted state unchanged — verify zero new rows in Postgres. |
| 9 | Open Add Transaction; type = INCOME; pick an EXPENSE category (if the picker allows it). | The picker SHOULD prevent this client-side. If a tampered request bypasses the picker, the boundary rejects with "Category kind must match transaction type." |
| 10 | Open Add Transaction; payee = a 121-char string. | Form rejects with "Payee must be at most 120 characters." |
| 11 | Open Add Transaction; notes = a 501-char string. | Form rejects with "Notes must be at most 500 characters." |
| 12 | (Manual SQL check) After all the above operations, run: `SELECT type, COUNT(*) FROM "Transaction" WHERE archivedAt IS NULL AND ((type = 'INCOME' AND amount <= 0) OR (type = 'EXPENSE' AND amount >= 0) OR (type = 'TRANSFER' AND amount = 0)) GROUP BY type;` | Returns zero rows. The sign-must-match-type invariant holds across every persisted active row. |
| 13 | (Manual SQL check) Run: `SELECT "transferGroupId", COUNT(*) FROM "Transaction" WHERE type = 'TRANSFER' AND archivedAt IS NULL GROUP BY "transferGroupId" HAVING COUNT(*) != 2;` | Returns zero rows. Every active TRANSFER has exactly two legs. |
| 14 | (Manual SQL check) Run: `SELECT "transferGroupId" FROM "Transaction" WHERE type = 'TRANSFER' GROUP BY "transferGroupId" HAVING SUM(amount) != 0;` | Returns zero rows. Every transfer pair (active OR archived) has source amount + destination amount = 0. |

If items 1–11 all behave correctly AND items 12–14 all return zero rows, the money-correctness invariants are intact. The unit suite + the constitution-mandated E2E should also pass — they assert the same invariants programmatically.

### 5k. Cross-user isolation

1. Open a fresh browser context (or incognito window).
2. Sign up a second user.
3. Visit `/dashboard/transactions`. You should see the **no-accounts empty state** — none of the first user's transactions appear (SC-011).
4. Sign back in as the first user. All your transactions are visible. Cross-user reads collapse to `not_found` at the queries layer (SC-010).

## 6. Run the unit + e2e suites

```bash
pnpm test            # 134 existing unit tests stay green + new transactions money-correctness suite
pnpm test:e2e        # 30 existing e2e tests stay green + new transactions.spec.ts (constitution-mandated)
```

The constitution-mandated E2E `tests/e2e/transactions.spec.ts` covers FR-033: sign in, create EXPENSE, verify balance, create INCOME, verify balance, create TRANSFER between same-currency accounts, verify both balances, verify two-row atomicity invariant in Postgres.

## 7. Where things live

| Concern | Path |
|---|---|
| Prisma schema | `db/schema.prisma` (Transaction model + TransactionType enum + back-relations on User, Account, Category) |
| Migration | `db/migrations/<timestamp>_add_transaction/migration.sql` |
| Money helpers (new) | `lib/money/validate.ts` (extended with `validateTransactionAmount`), `lib/money/decimal.ts` (extended with `sumAmounts`), `lib/money/index.ts` (barrel) |
| Server actions | `lib/transactions/actions.ts` (7 actions) |
| Prisma helpers | `lib/transactions/queries.ts` (the ONLY file with `prisma.transaction.*`) |
| Date helper | `lib/transactions/dates.ts` (`normalizeToUtcDay`) |
| Zod schemas | `lib/transactions/schemas.ts` |
| Serializer | `lib/transactions/serialize.ts` (Transaction → TransactionDTO) |
| Error catalog | `lib/transactions/errors.ts` |
| Barrel | `lib/transactions/index.ts` |
| Account picker primitive (new) | `components/accounts/account-picker.tsx` |
| Page | `app/(shell)/dashboard/transactions/page.tsx` (REPLACES the coming-soon placeholder) |
| Page-local components | `app/(shell)/dashboard/transactions/_components/{transactions-list,transaction-form,transaction-form-sheet,transfer-form,transfer-form-sheet,archive-confirm-dialog,date-range-picker,transaction-filters}.tsx` |
| Updated accounts queries | `lib/accounts/queries.ts` (now calls `sumAmountsForAccountsBatch` from `lib/transactions/queries.ts` to compute balances) |
| Updated accounts list | `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` (renders computed balance instead of startingBalance) |
| Updated accounts serialize | `lib/accounts/serialize.ts` (adds optional `balance` field to `AccountDTO`) |
| E2E | `tests/e2e/transactions.spec.ts` (constitution-mandated) |

## 8. Troubleshooting

- **Migration fails with "relation 'Transaction' already exists"** — you previously created the table by hand or ran `db push`. Reset with `pnpm db:reset && pnpm db:migrate`.
- **Transfer creates only one row** — the implementer broke the `$transaction` wrap. Check `lib/transactions/queries.ts` for the `createTransferForUser` function; both `tx.transaction.create` calls MUST be inside the `prisma.$transaction(async (tx) => { ... })` callback. The unit suite (`tests/unit/transactions-queries.test.ts`) covers this; the money-reviewer grep audit (`rg "prisma\\.\\\$transaction" lib/transactions/`) verifies the file-level pattern.
- **Account balance does not update after a transaction** — check that `lib/accounts/queries.ts` is calling `sumAmountsForAccountsBatch` for the list view. The accounts page hot path should run two Prisma queries on render: one for `account.findMany`, one for the batched `groupBy`. If only the first runs, the balance computation is bypassed.
- **Sign-mismatch error on a positive EXPENSE input** — the form is supposed to prepend `-` before posting. Check the `<TransactionForm>` submit handler. The boundary error is correct; the form's pre-submit transform is missing.
- **`@db.Date` deserialization quirk in Prisma 7** — if `transaction.date` comes back as a Date object with a non-midnight time component, fall back to `DateTime` (TIMESTAMPTZ) without `@db.Date`. The boundary normalization stays the same; only the schema column changes. Documented in `research.md` R8 as a known risk.
- **`Transaction` not found in TypeScript** — run `pnpm db:generate` after applying the migration.
- **Filter URL params not parsed** — the page-level Zod schema (`listTransactionsFiltersSchema`) must validate each param. Check the `searchParams` parsing in `app/(shell)/dashboard/transactions/page.tsx`.
