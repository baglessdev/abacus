# Feature 009 — Budgets — Quickstart

A 5-minute "verify this feature works" walkthrough for a developer who has features 001–008 already working. If you don't, run those quickstarts in order first (especially `specs/007-transactions/quickstart.md` and `specs/008-real-dashboard/quickstart.md`), then return here.

This feature introduces one new domain model (`Budget` + `BudgetPeriod` enum), one new module (`lib/budgets/`), one new CRUD UI (`/dashboard/budgets`), one new dashboard widget (`<BudgetsWidget>`), and two additive helpers in `lib/transactions/queries.ts`. **No new npm dependencies.** One new migration.

## 1. No new dependencies to install

Verify:

```bash
git diff main -- package.json
# Expected: zero changes (or no diff if you're on main).
```

If your `node_modules/` is stale:

```bash
pnpm install
```

## 2. No new environment variables

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` from features 001 + 003 are all that's needed.

## 3. Apply the new migration

This feature DOES change the database schema (adds the `Budget` model + `BudgetPeriod` enum + the partial unique index). Apply via:

```bash
pnpm db:migrate
```

(Or, when generating the migration for the first time during implementation: `pnpm exec prisma migrate dev --name add_budget --schema=db/schema.prisma --create-only`, then manually edit the generated `migration.sql` to add the raw `CREATE UNIQUE INDEX ... WHERE archivedAt IS NULL` statement before running `pnpm db:migrate`.)

Verify the migration landed:

```bash
git diff main -- db/schema.prisma db/migrations/
# Expected: one new model + enum + one new migration directory.
```

Spot-check the migration SQL contains the partial unique index:

```bash
rg "WHERE \"archivedAt\" IS NULL" db/migrations/*_add_budget/migration.sql
# Expected: one match (the CREATE UNIQUE INDEX ... WHERE archivedAt IS NULL line).
```

If you see zero matches, the partial-unique-index raw SQL was not added to the migration; re-edit and re-run `pnpm db:migrate`.

## 4. Seed test data (optional but recommended)

Use the existing demo-user seeder:

```bash
pnpm seed:demo-user
```

This creates the demo user + accounts + categories + a handful of transactions in the last 30 days. **It does NOT yet seed budgets** (we may extend the seed in a follow-up if useful; for v1 we expect the QA path to create budgets manually through the new UI). If you prefer to seed a couple of budgets via the script, add to `scripts/seed-demo-user.ts` after the transactions seed block:

```ts
// Optional: seed a couple of demo budgets to exercise the page on fresh setup
await tx.budget.create({
  data: {
    userId: newUser.id,
    categoryId: foodParent.id,                   // Food category from the seed
    period: "MONTHLY",
    amount: new Prisma.Decimal("400.00"),
    currency: "USD",
    startDate: new Date(Date.UTC(year, month, 1)),
  },
})
```

(Adding this is implementer's choice — not required for the feature to ship.)

## 5. Start the dev server

```bash
pnpm dev
```

## 6. Walk the feature end-to-end

### 6a. Log in

1. Visit `http://localhost:3000/login`.
2. Sign in as the demo user (or your hand-seeded user).

### 6b. The placeholder is gone (FR-015, SC-014)

1. Navigate to `/dashboard/budgets`.
2. Verify the page renders the no-budgets empty state ("Set spending targets for your expense categories" heading + "Create your first budget" CTA) — NOT the previous illustration-and-progress-bar placeholder.

### 6c. Create your first budget (US1, SC-001)

1. Activate the "Create your first budget" CTA (or the "Add budget" CTA if you have other budgets already).
2. Side sheet opens in create mode.
3. Verify defaults:
   - Category picker shows EXPENSE categories only (no INCOME — verify by scanning the list).
   - Period defaults to MONTHLY.
   - Currency defaults to the user's most-used EXPENSE currency from the last 90 days (per Clarification Q2). For the demo user this should be USD.
   - Start date defaults to the 1st of the current calendar month.
   - End date is empty (open-ended).
4. Fill: category = Food, amount = 400, leave currency = USD, leave period = MONTHLY.
5. Submit.
6. Sheet closes. Row appears in the list showing: category name + budgeted $400.00 + actuals (current month's USD Food EXPENSE sum, e.g., $X.XX) + remaining ($400 - actuals) + progress bar.

### 6d. Actuals byte-for-byte check (SC-002, SC-010)

1. Note the actuals value on the Food row.
2. Navigate to `/dashboard/transactions`.
3. Filter to: category = Food, type = EXPENSE, current month, currency = USD.
4. Sum the absolute amounts mentally (or via the cash-flow widget on `/dashboard`).
5. Verify the per-currency Food EXPENSE sum equals the budget row's actuals **byte-for-byte**.

### 6e. Trigger the over-budget state (SC-011, US2 ac.3)

1. From the dashboard, click "+ Add transaction".
2. Record an EXPENSE for $500 in the Food category (Chase Checking, today's date).
3. Navigate back to `/dashboard/budgets`.
4. Verify the Food row now shows:
   - Actuals updated (= previous actuals + $500).
   - If total now exceeds $400, status = "over"; visual treatment: red color + over-budget icon + "Over by $X.XX" or "X%" label. NEVER color alone — the icon + label must be present (FR-025).
   - Remaining is negative.
   - Progress bar capped at 100% fill visually but labelled with the actual ratio (e.g., "125%").

### 6f. Edit a budget (US3)

1. Click the Food row.
2. Sheet opens in edit mode.
3. Verify: amount, startDate, endDate are editable; categoryId, currency, period are disabled (read-only per US3 ac.5).
4. Change amount to 600. Save.
5. Sheet closes; row updates: budgeted $600.00, remaining = $600 - actuals.

### 6g. Archive + unarchive (US3 ac.4)

1. Click the Food row. Click "Archive". Confirm in the dialog.
2. Row disappears from the default list view.
3. Toggle "Show archived" at the top of the list.
4. Row reappears with an "Archived" badge.
5. Click it, click "Unarchive". Row returns to the default view (toggle off the show-archived to verify).

### 6h. Uniqueness violation (US1 ac.5, SC-006)

1. With the USD-MONTHLY Food budget active, click "Add budget".
2. Try to create another USD-MONTHLY Food budget (same category, currency, period).
3. Verify a friendly inline error: "You already have a USD monthly budget for Food. Edit the existing one or pick a different currency / period."
4. Change the period to YEARLY. Submit. This succeeds (different tuple).

### 6i. Archived-category interaction (US3 ac.7, SC-017)

1. Note the Food row is still active.
2. Navigate to `/dashboard/categories`. Archive the Food category.
3. Navigate back to `/dashboard/budgets`. Verify the Food budget row is still visible, now with "(archived category)" suffix on the name and a muted treatment.
4. Verify the actuals computation still works — the existing EXPENSE transactions in Food (which can still reference an archived category per feature 006) still sum into the actuals.
5. Unarchive the Food category to clean up.

### 6j. Dashboard widget (US4, SC-012)

1. Navigate to `/dashboard`.
2. Verify the dashboard now has 4 data widgets: Net Worth, This Month (cash flow), **Budgets** (NEW), and Recent Transactions.
3. Verify the Budgets widget shows:
   - Up to 5 budgets sorted by status priority (over → near → under).
   - Each row: category name + actuals via `<Money>` + budgeted via `<Money>` + compact progress bar.
   - "See all" link routing to `/dashboard/budgets`.
4. Click "See all" → navigates to `/dashboard/budgets`.

### 6k. Dashboard widget — empty state (US4 ac.4)

1. Archive all your budgets (or sign up a fresh user with no budgets).
2. Navigate to `/dashboard`.
3. Verify the Budgets widget renders its empty state ("Set up your first budget" + CTA to `/dashboard/budgets`).
4. The other 3 widgets continue to render normally — the Budgets empty state does NOT take over the page (unlike the page-level no-accounts state from feature 008).

### 6l. Existing widgets unchanged (SC-018)

1. With at least 1 active account + a few transactions: navigate to `/dashboard`.
2. Verify the Net Worth, Cash Flow, and Recent Transactions widgets render the same values they rendered before this feature was added (byte-for-byte — feature 008's `tests/e2e/dashboard.spec.ts` continues to pass).

### 6m. Cross-user isolation (SC-005)

1. With one user signed in (user A): note the budgets list.
2. Open a fresh incognito window. Sign up as user B.
3. Visit `/dashboard/budgets` as user B. Verify the no-budgets empty state — none of A's budgets leak.
4. Switch back to A; verify A's data is intact.

### 6n. Multi-currency (SC-004, SC-013)

If your demo data has EUR transactions or accounts:

1. Create an EUR-MONTHLY budget for the same category as your USD budget.
2. Navigate to `/dashboard/budgets`. Verify BOTH rows render — the USD row's actuals sum only USD transactions; the EUR row's actuals sum only EUR transactions. No cross-currency aggregation.

### 6o. Keyboard-only navigation (SC-016)

1. From `/dashboard/budgets`: press Tab from the page top. Verify focus reaches the "Add budget" CTA.
2. Press Enter. Sheet opens with focus on the first form field.
3. Tab through the form, fill values, Tab to Submit, Enter.
4. Verify the new row appears in the list.

## 7. Run the unit + e2e suites

```bash
pnpm test            # all existing tests stay green + new budgets unit suites
pnpm test:e2e        # all existing e2e tests stay green + new budgets.spec.ts
```

The new files:

- `tests/unit/budgets-periods.test.ts` — MONTHLY + YEARLY boundaries.
- `tests/unit/budgets-aggregations.test.ts` — 8+ cases covering SC-009.
- `tests/unit/budgets-defaults.test.ts` — default-currency helper.
- `tests/unit/budgets-schemas.test.ts` — Zod boundary.
- `tests/unit/budgets-queries.test.ts` — Prisma helper shape (mocked).
- `tests/unit/budgets-serialize.test.ts` — DTO shape.
- `tests/e2e/budgets.spec.ts` — constitution-mandated E2E.

## 8. Where things live

| Concern | Path |
|---|---|
| Budgets page (server component) | `app/(shell)/dashboard/budgets/page.tsx` (REPLACES the placeholder) |
| Budgets list (client) | `app/(shell)/dashboard/budgets/_components/budgets-list.tsx` |
| Budget row (server) | `app/(shell)/dashboard/budgets/_components/budget-row.tsx` |
| Budget form (client) | `app/(shell)/dashboard/budgets/_components/budget-form.tsx` |
| Budget form sheet (client) | `app/(shell)/dashboard/budgets/_components/budget-form-sheet.tsx` |
| Archive confirm dialog (client) | `app/(shell)/dashboard/budgets/_components/archive-confirm-dialog.tsx` |
| Progress bar (server, shared) | `app/(shell)/dashboard/budgets/_components/progress-bar.tsx` |
| Dashboard widget (server) | `app/(shell)/dashboard/_components/budgets-widget.tsx` |
| Module barrel + types | `lib/budgets/index.ts` |
| Server actions | `lib/budgets/actions.ts` |
| Prisma helpers (owns prisma.budget.*) | `lib/budgets/queries.ts` |
| Zod schemas | `lib/budgets/schemas.ts` |
| Errors + envelope helper | `lib/budgets/errors.ts` |
| Period boundary helpers | `lib/budgets/periods.ts` |
| Default-currency helper | `lib/budgets/defaults.ts` |
| Pure reducers (status, sort, attach) | `lib/budgets/aggregations.ts` |
| Serialize (Prisma → DTO) | `lib/budgets/serialize.ts` |
| Two new helpers in transactions module | `lib/transactions/queries.ts` (added: `getMostUsedExpenseCurrencyForUser`, `sumExpenseByCategoryForBudgetsForUser`) |
| Schema | `db/schema.prisma` (adds `Budget` + `BudgetPeriod` + back-relations) |
| Migration | `db/migrations/<timestamp>_add_budget/migration.sql` (includes partial unique index raw SQL) |
| Money rendering primitive | `components/money/money.tsx` (UNCHANGED — consumed by every budget surface) |
| Category picker | `components/categories/category-picker.tsx` (UNCHANGED — already supports `kind="EXPENSE"`) |
| Widget error boundary | `app/(shell)/dashboard/_components/widget-error-boundary.tsx` (UNCHANGED — wraps the new widget) |
| Widget card shell | `app/(shell)/dashboard/_components/widget-card.tsx` (UNCHANGED — consumed by the new widget) |
| Page-level loading | `app/(shell)/loading.tsx` (UNCHANGED — covers FR-032) |
| Shell-level error | `app/(shell)/error.tsx` (UNCHANGED) |

## 9. Troubleshooting

- **`/dashboard/budgets` still shows the placeholder** — the page file did not change, or your dev server is stale. Restart `pnpm dev`. Verify `app/(shell)/dashboard/budgets/page.tsx` no longer renders the `EmptyState` + faux progress bar.
- **Migration applied but the partial unique index doesn't exist** — Postgres may have created a non-partial unique constraint, or the raw `WHERE archivedAt IS NULL` clause was missing from the migration. Verify with `pnpm db:studio` → indices on Budget. To fix: drop the wrong index, edit the migration, re-run.
- **Creating a second budget for the same (category, currency, period) succeeds when it should fail** — the partial unique index didn't apply. See above.
- **Actuals are zero on every budget even though I recorded EXPENSE transactions** — most likely the date range computation is wrong. Check `lib/budgets/periods.ts.computeCurrentMonthRange()` returns `dateFrom = first of CURRENT month, dateTo = first of NEXT month` (exclusive). Compare with `lib/dashboard/dates.ts` from feature 008.
- **Actuals on a budget includes the wrong currency** — the `sumExpenseByCategoryForBudgetsForUser` `currency: { in: currencies }` filter isn't applied, OR the actuals-Map key construction has a typo (correct: `${period}::${categoryId}::${currency}`).
- **Status is misclassified at exactly 80% or 100%** — the comparison is using float division (`actuals/amount`) instead of `Money.comparedTo(amount.times("0.80"))`. See R12. Fix the comparison to use Decimal.
- **Dashboard widget renders but shows the wrong sort order** — `sortBudgetsByStatusAndProgress` priority order should be `over (0) → near (1) → under (2)` (ascending integer = highest priority first).
- **A monetary value renders without its currency code** — a `<Money>` is missing its `currency` prop (TypeScript should have blocked this). Run `rg "<Money " app/(shell)/dashboard/budgets/_components/` and inspect each match.
- **Cross-user budget leakage** — verify `userId` is the first positional arg to every helper call AND that every Prisma `where:` clause includes `userId`. The audit grep is documented in plan.md §Auth & Validation Boundaries.

## 10. Money-correctness verification

The full money-correctness checklist from `specs/007-transactions/quickstart.md` continues to apply on `/dashboard/transactions` (unchanged) and the dashboard widgets from feature 008 (unchanged).

Additionally, on `/dashboard/budgets` AND the new dashboard widget:

| # | Check | Expected behavior |
|---|---|---|
| 1 | Every monetary value on a budget row shows its currency code adjacent. | Visual inspection: budgeted + actuals + remaining all have currency. |
| 2 | A user with USD and EUR budgets sees them as separate rows; no implicit FX. | Visual inspection: two rows. |
| 3 | The actuals for a USD-MONTHLY budget equals the sum of this calendar month's USD-currency EXPENSE rows in that category. | Cross-check against `/dashboard/transactions` filtered to the same dimensions. |
| 4 | Status thresholds at 80% and 100% classify correctly without float drift. | Edge case: create a budget where actuals exactly equal `0.80 * amount` — assert "near"; create one where actuals exactly equal `amount` — assert "near"; one where actuals = amount + 0.01 — assert "over". |
| 5 | Archiving a budget does not change any transaction-level value. | Compare `/dashboard/transactions` and the dashboard cash-flow widget before and after archiving — identical. |
| 6 | The dashboard's existing 3 widgets render byte-for-byte the same. | SC-018 — feature 008's E2E continues to pass. |
| 7 | Cross-user URL or hand-crafted request never leaks another user's budgets. | See section 6m above. |

If items 1–7 all behave correctly, the budgets feature's money-correctness invariants are intact. The money-reviewer subagent will run the audit greps documented in `plan.md` §Money & Currency Notes as part of the PR review.
