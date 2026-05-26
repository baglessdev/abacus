# Feature Specification: Budgets

**Feature Branch**: `009-budgets`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "Budgets — give the user a way to set spending targets per category per period and see how they're tracking. Per roadmap: Budget model with id, userId, categoryId, period (MONTHLY|YEARLY), amount (Decimal), currency, startDate, endDate. Compare actuals (sum of EXPENSE transactions in that category over the period) vs the budgeted amount. Show progress bars + over-budget warnings on the dashboard (replaces the empty budgets widget slot). Full CRUD UI on /dashboard/budgets (currently a placeholder route). Constraints: only EXPENSE categories are budgetable; respect multi-currency (no implicit FX); use the existing lib/money/ helpers and <Money> primitive; soft delete via archivedAt; user-scoped (no cross-user leakage); the actuals computation reuses the existing transaction aggregation patterns from feature 007."

> **Numbering note**: This is the roadmap-numbered feature **008 — Budgets** (Tier 2 — "Makes it sticky"). The spec directory is `009-budgets` because the branded-UI polish chore consumed spec-dir slot `005-branded-ui-polish` in May 2026. The roadmap entry and this spec describe the same feature; the directory number tracks order-of-spec-authored, not the roadmap slot.

## Why

After Tier 1 closed with the real dashboard (feature 008, roadmap-numbered 007), the app answers *what* the user's finances look like — net worth, this-month cash flow, recent activity — but it does not yet answer *whether the user is on track*. Budgets is the first feature that turns Abacus from a passive ledger ("here's what happened") into an active financial tool ("here's where you are vs. where you said you wanted to be"). Without budgets, every later "are you on plan?" feature — reports, charts, savings goals — has no anchor to compare against. Budgets are also the feature with the highest "sticky" yield per hour of work in the roadmap-baseline competitor analysis: YNAB built an entire company around the envelope-budgeting metaphor; Copilot's main retention hook is the monthly budget vs. actuals delta; Actual Budget's name is literally the feature.

This is the first feature whose `actuals` computation reuses feature 007's per-currency-per-type transaction-aggregation primitive, but scoped down to a single category over a specific period. The cash-flow widget (feature 008) showed that this aggregation shape works end-to-end across multi-currency users. Budgets extends that same pattern with one additional dimension (categoryId) and one additional filter (specific date range per period). No new aggregation infrastructure is invented; the existing `lib/money/` and `lib/transactions/queries.ts` surfaces stretch one more step.

This is also the first feature to introduce a **uniqueness invariant** beyond the per-user uniqueness implicit in `userId`: only one active budget per `(userId, categoryId, currency, period)` tuple. A user can have a USD-monthly Groceries budget AND a EUR-monthly Groceries budget AND a USD-yearly Groceries budget simultaneously — but NOT two USD-monthly Groceries budgets. The constraint is enforced at the schema layer so a race condition can't introduce duplicates.

## Clarifications

### Session 2026-05-26

- Q: Period semantics — calendar months/years (May 1 – May 31 / 2026-01-01 – 2026-12-31) or rolling periods anchored to `startDate` (May 17 – June 17 / 2026-05-17 – 2027-05-17)? → A: **Calendar months/years (UTC).** A `MONTHLY` budget covers the user's current UTC calendar month; a `YEARLY` budget covers the current UTC calendar year. The `startDate` field anchors when the budget *starts being active* (the first period it applies to) and may be the 1st of any month — but the *period boundaries themselves* are always UTC-calendar-aligned. This matches the cash-flow widget's UTC-calendar-month convention from feature 008 and the per-day storage convention from feature 007. Rationale: rolling periods would require recomputing the boundary per-budget instead of per-feature, would not align with how the cash-flow widget shows the same numbers, and would introduce surprising edge cases (a "monthly" budget that ends on the 17th when the user actually thinks in calendar months). Calendar alignment matches every roadmap-baseline competitor (YNAB, Copilot, Monarch, Actual Budget, Lunch Money — all calendar-month-based).
- Q: Recurring vs single-period — does a `MONTHLY` budget mean "this current month only" or "every month from `startDate` onward (with optional `endDate`)"? → A: **Recurring rule.** A Budget row is a recurring rule: it applies to every period (MONTHLY or YEARLY) from `startDate` (inclusive) through `endDate` (inclusive, optional — `null` means open-ended). Each rendering of the budget for a given period (e.g., "May 2026" or "2026") computes the actuals for THAT period against the same `amount`. Per-period overrides (e.g., "this November I want a $1,000 holiday-spending Groceries budget instead of the usual $400") are explicitly OUT OF SCOPE for v1 and would be a future enhancement on top of this same row-per-rule shape. Rationale: matches how every roadmap-baseline competitor models budgets; avoids a per-period-row explosion (a user with 10 categories × 12 months = 120 budget rows just for one year of monthly budgets); the periodic-actuals computation is the load-bearing work and is independent of how many rules exist.
- Q: When a category that has an existing budget gets archived, what happens to the budget? → A: **Budget stays; flagged.** Archiving a category does NOT auto-archive its budget rows. The budget row keeps its `categoryId`, and the `/dashboard/budgets` page surfaces it with an "(archived category)" label and a muted treatment so the user knows the category is no longer in active use. The actuals computation still works — it sums EXPENSE transactions whose `categoryId` matches, regardless of the category's current archived state (and transactions can still reference an archived category per the existing feature-007 / feature-006 invariants). The user MAY archive the budget themselves to clean up. Rationale: hard-coupling category-archive to budget-archive would be a surprise side effect; the muted-flag approach surfaces the situation visibly without forcing a destructive cascade; it matches the pattern feature 007's transaction list uses for archived-category references.
- Q: At what percentage of the budgeted amount does a budget transition from "under" to "near" (warning) state, and at what percentage does it transition to "over"? → A: **80% near, 100% over.** Under-budget = `actuals / amount < 0.80`. Near-budget = `0.80 ≤ actuals / amount ≤ 1.00`. Over-budget = `actuals / amount > 1.00`. The 80% boundary matches Lunch Money and Copilot Money defaults — earlier than YNAB's 90% (which gives little actionable runway on a monthly budget) and later than a 75% boundary (which causes warning fatigue). 80% gives a user with a monthly budget roughly 6 days of "you're trending hot, slow down" lead time at the average daily-spend rate before the period rolls over, which is enough time to course-correct meaningfully. The constitution Principle I "non-color secondary signal" rule (FR-025 + FR-030 from feature 008) still applies — `near` is identified by an icon / label, not solely by color.
- Q: How is the default currency in the create-budget form computed for the user (US1 acceptance scenario 1)? → A: **Most-used by COUNT of non-archived EXPENSE transactions in the last 90 days; fall back to the user's first non-archived account's currency (ordered by `createdAt asc`, ties broken by `id asc`) if no transactions exist.** Rationale: the form is specifically for setting an EXPENSE budget, so the strongest signal is "what currency the user actually spends in" — by frequency rather than by amount (one $5,000 USD rent payment shouldn't outvote 30 small EUR coffees if the user's daily life is mostly EUR). The 90-day window keeps the suggestion current to the user's recent behaviour (a user who moved countries 6 months ago shouldn't get their old currency suggested). The fallback handles the brand-new user who has accounts but no transactions yet. The lookup is one additional indexed query (`prisma.transaction.groupBy` on `currency` with the existing `[userId, date]` index from feature 007) and is computed at form-render time, never cached. If the user has neither transactions nor accounts in any currency, the form falls through to no preselected currency and the user picks manually. This is a UX convenience only — the user can always override the suggestion before submitting.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Set a monthly spending target for a category (Priority: P1)

As a user who has been recording grocery expenses for a few weeks and now wants to put a cap on next month's grocery spending, I open the Budgets page, activate the "Add budget" CTA, pick the Groceries category, set the amount to $400, pick USD, pick MONTHLY, leave the start date at this month, submit, and immediately see the new budget in the list — showing the budgeted amount, the actuals so far this month, the remaining amount, and a progress bar.

**Why this priority**: This is the core "I want to budget" flow. Without it, the entire feature is meaningless. P1 because every other user story in this feature depends on a budget existing; the create flow IS the feature's entry point. Without this, the Budgets page is permanently empty.

**Independent Test**: From a user with at least one EXPENSE category and some EXPENSE transactions in that category this calendar month, navigate to `/dashboard/budgets`. Activate the primary "Add budget" CTA. A side sheet opens in "create" mode. Fill: category = "Groceries", amount = $400, currency = USD, period = MONTHLY, startDate = today (defaults to the 1st of the current month). Submit. The sheet closes; a new budget row appears in the list showing: category name "Groceries", budgeted $400.00, actuals this month $X.XX (whatever the sum of this-month's USD Groceries EXPENSE transactions is), remaining = $400 − actuals, progress bar at `actuals / 400` percent, with sign-aware color (under-budget = neutral, near-budget = warning, over-budget = negative).

**Acceptance Scenarios**:

1. **Given** an authenticated user with at least one EXPENSE category, **When** they navigate to `/dashboard/budgets` and activate "Add budget", **Then** a side sheet opens in "create" mode with: category picker (EXPENSE categories only, no INCOME), amount empty, currency defaulted per the rule in Clarifications Q2 (most-used by COUNT of non-archived EXPENSE transactions in the last 90 days; fall back to the user's first non-archived account's currency; fall through to unset if the user has no accounts), period defaulted to MONTHLY, startDate defaulted to the 1st of the current UTC calendar month, endDate empty (open-ended).
2. **Given** the create sheet is open, **When** the user submits a valid monthly budget (Groceries, $400, USD, MONTHLY, startDate = first-of-current-month), **Then** the budget is persisted, the sheet closes, and the new row appears in the list with the budgeted amount via `<Money>`, actuals (computed from this-month's USD Groceries EXPENSE rows) via `<Money>`, remaining via `<Money>`, and a progress bar.
3. **Given** the user just created a budget, **When** they navigate to `/dashboard` (the landing page), **Then** the new dashboard "Budgets" widget (added by this feature) shows the budget's progress visibly.
4. **Given** the user attempts to submit a budget with an INCOME category, **When** the create form is submitted, **Then** the operation is rejected at the form boundary with a clear error message: "Budgets are for expense categories. Income tracking is coming in a future feature." The category picker MUST filter to EXPENSE only at the UI level, so this state is reachable only via direct form manipulation.
5. **Given** the user already has a USD-MONTHLY Groceries budget, **When** they attempt to submit a SECOND USD-MONTHLY Groceries budget, **Then** the operation is rejected at the boundary with: "You already have a USD monthly budget for Groceries. Edit the existing one or pick a different currency / period." The uniqueness invariant `(userId, categoryId, currency, period)` is enforced.
6. **Given** a SECOND authenticated user has signed up, **When** the first user just created the budget in scenario 2, **Then** the second user's `/dashboard/budgets` list is empty — they see only the empty state and see none of the first user's budgets.

---

### User Story 2 — See actuals vs. budget at a glance (Priority: P1)

As a user with at least one budget already configured, when I open the Budgets page mid-period, I want to see — for each budget — how much I've actually spent so far this period, how much is left, and a visual progress indicator that makes the "I'm 80% through this budget" or "I'm over budget" state immediately legible without me doing arithmetic.

**Why this priority**: The create flow (US1) alone is useless without the read-back; setting a budget that you never see compared against your spending is theater. The actuals computation is the load-bearing reason this feature exists — every other reason ("save more", "spend less on dining") reduces to "I can see I'm tracking too high in this category". P1 because the budgets list is the surface the user opens to answer "am I on plan this month?"

**Independent Test**: From a user with at least one MONTHLY budget AND at least one EXPENSE transaction in that category this calendar month, navigate to `/dashboard/budgets`. Assert each budget row shows: budgeted amount, actuals (= sum of non-archived EXPENSE transactions in that category in that currency in this calendar month), remaining (= budgeted − actuals), and a progress bar whose fill matches `actuals / budgeted`. The actuals value MUST equal byte-for-byte what the user would compute by filtering `/dashboard/transactions` to category=Groceries + this month + type=EXPENSE + currency=USD and summing the absolute amounts.

**Acceptance Scenarios**:

1. **Given** a user has a USD-MONTHLY Groceries budget of $400 and has spent $150 on Groceries this month, **When** they open `/dashboard/budgets`, **Then** the Groceries row shows: budgeted `$400.00`, actuals `$150.00`, remaining `$250.00`, progress bar at 37.5% (`150 / 400`), neutral / under-budget color.
2. **Given** a user has spent $320 against a $400 budget (80% — the near-budget boundary), **When** they open `/dashboard/budgets`, **Then** the row shows the progress bar at 80% with a "near-budget" visual treatment (e.g., amber color AND a warning icon — non-color-alone identification per the constitution and FR-025). The same treatment applies at any ratio `0.80 ≤ x ≤ 1.00` (e.g., 90% is also near-budget; 100% is still near-budget; 100.01% flips to over-budget).
3. **Given** a user has spent $450 against a $400 budget (over by $50, 112.5%), **When** they open `/dashboard/budgets`, **Then** the row shows: actuals `$450.00` (negative-styled or warning-styled), remaining `-$50.00` (negative-styled), progress bar capped at 100% fill visually but labelled as "Over by $50.00" or "112%", with a clear over-budget identifier (icon + label + color — never color alone).
4. **Given** a user has a YEARLY budget for Health, **When** they open `/dashboard/budgets`, **Then** the Health row shows actuals = sum of this UTC calendar year's non-archived USD Health EXPENSE transactions.
5. **Given** a user has both USD and EUR Groceries budgets (USD MONTHLY $400 and EUR MONTHLY €100), **When** they open `/dashboard/budgets`, **Then** both budgets render as separate rows; the USD row's actuals sum only USD-currency Groceries EXPENSE transactions; the EUR row's actuals sum only EUR-currency Groceries EXPENSE transactions; no implicit FX (FR-019, constitution Principle I).
6. **Given** a user has no transactions at all in a budgeted category this period, **When** they open `/dashboard/budgets`, **Then** the row shows actuals `$0.00` and remaining = full budgeted amount; the progress bar is at 0% with the neutral / under-budget treatment.
7. **Given** the user reloads `/dashboard/budgets` after recording a new EXPENSE in a budgeted category, **When** the page re-renders, **Then** the affected budget's actuals AND remaining update by exactly the new transaction's amount (byte-for-byte, no rounding drift).

---

### User Story 3 — Edit or archive a budget (Priority: P1)

As a user whose financial situation has changed (got a raise, hit a goal, decided $400/mo is too tight), I want to edit any field of an existing budget — amount, period, currency, startDate, endDate — or archive a budget I no longer want to track. The list updates immediately.

**Why this priority**: Budgets are not static. The user's financial life evolves; rents change, salaries change, life events happen. Without edit and archive, the budget set ossifies at whatever the first create pass produced. P1 because the create-only flow is not viable for any sustained use — every budget will need to be revisited at least once.

**Independent Test**: With a user who has at least one budget, click an existing budget row. A side sheet opens in "edit" mode pre-populated with current values. Change the amount from $400 to $500, save. The row updates; actuals are recomputed; remaining is the new $500 minus actuals; progress bar reflects the new ratio. Reopen the row, archive. The row leaves the default list view. Activate "Show archived". The row reappears with an "Archived" badge. Reopen, unarchive. The row returns.

**Acceptance Scenarios**:

1. **Given** the user has at least one budget, **When** they click that budget in the list, **Then** a side sheet opens in "edit" mode pre-populated with the budget's category (read-only — see scenario 5), amount, currency (read-only — see scenario 5), period (read-only — see scenario 5), startDate, endDate.
2. **Given** the edit sheet is open, **When** the user changes the amount to a valid new value and submits, **Then** the budget's amount updates, the sheet closes, and the list reflects the new amount (budgeted, remaining, progress all recomputed against the same actuals).
3. **Given** the edit sheet is open, **When** the user sets an `endDate` in the past (effectively retiring the budget), **Then** the budget is no longer surfaced for periods after `endDate`. The actuals computation for periods that fall WITHIN the active window still works as expected.
4. **Given** the edit sheet is open, **When** the user activates "Archive" and confirms, **Then** `archivedAt` is set, the sheet closes, and the row disappears from the default list view. Toggling "Show archived" surfaces it with an `Archived` badge.
5. **Given** the edit sheet is open, **When** the user attempts to change `categoryId`, `currency`, or `period`, **Then** these fields are read-only on the edit form. Rationale: changing any of them would effectively be creating a different budget (the uniqueness key is `(userId, categoryId, currency, period)`); the user is told to archive this one and create a new one. The form clearly states this.
6. **Given** the user has just edited a budget, **When** they reload the page, **Then** the changes persist (data scoped to this user; FR-022).
7. **Given** the user archived a budget that had actuals, **When** they navigate to `/dashboard` and to `/dashboard/transactions`, **Then** the related transactions are UNCHANGED — archiving a budget never touches transaction rows. The actuals on the dashboard cash-flow widget remain identical.

---

### User Story 4 — See budgets at a glance on the dashboard (Priority: P2)

As an authenticated user who has set up a few budgets, when I open `/dashboard` (the home screen) I want to see — without leaving the dashboard — which of my budgets are at risk or over for this period, so I know what to pay attention to without having to navigate to `/dashboard/budgets` separately.

**Why this priority**: The dashboard is where the user lands; it's where attention happens. A budgets widget on the dashboard provides the at-a-glance "is anything red?" check that's the main reason to set budgets in the first place. P2 because the budgets page itself (US1+US2+US3) is the primary surface and is fully functional without the dashboard widget; the widget is a high-leverage convenience but not the keystone.

**Independent Test**: From a user with at least 2 budgets — one comfortably under budget (e.g., 25% used) and one near-or-over budget (e.g., 95% or 110%) — navigate to `/dashboard`. Assert a new "Budgets" widget renders alongside the existing Net Worth / Cash Flow / Recent Transactions widgets. Assert the at-risk / over budgets are surfaced prominently (e.g., listed first, color-coded, with the over-budget budget showing a warning icon). Assert the comfortably-under-budget budget is also visible but visually de-emphasized. Click anywhere on the widget → navigates to `/dashboard/budgets` for the detail view.

**Acceptance Scenarios**:

1. **Given** an authenticated user with ≥ 1 active budget for the current calendar period (month or year), **When** they navigate to `/dashboard`, **Then** a new "Budgets" widget renders alongside Net Worth, Cash Flow, and Recent Transactions widgets — the page now has 4 data widgets in the grid.
2. **Given** the Budgets widget renders, **When** the user has budgets in mixed states (some under, some near, some over), **Then** the widget lists budgets in priority order: over-budget first (with a clear over-budget indicator), then near-budget (75–100%), then under-budget. Max display is 5 budgets; "See all" link routes to `/dashboard/budgets`.
3. **Given** the Budgets widget renders, **When** each budget row shows, **Then** the row displays: category name, budgeted amount, actuals, remaining, and a compact progress bar — all rendered via `<Money>` (currency code visible per amount per FR-019).
4. **Given** the user has zero active budgets, **When** the dashboard renders, **Then** the Budgets widget renders an empty state with a CTA "Set up your first budget" linking to `/dashboard/budgets`.
5. **Given** the user has only YEARLY budgets (no MONTHLY), **When** the dashboard renders, **Then** the Budgets widget renders the YEARLY budgets with their year-to-date actuals — the widget is period-agnostic; it shows all active budgets for whichever period each one defines.
6. **Given** the user has budgets in 2+ currencies, **When** the dashboard renders, **Then** each budget displays its own currency code via `<Money>`; no cross-currency aggregation; the budgets are listed with their amounts in their own currencies (FR-019, constitution Principle I).

---

### User Story 5 — First-time user / no-budgets state (Priority: P2)

As a user who has just set up Abacus and has not yet created any budgets, when I open `/dashboard/budgets` I should see a clear, friendly empty-state screen that tells me what budgets are for and helps me create my first one — not a blank page that looks broken.

**Why this priority**: Every Tier 2 feature has a first-time-use ramp. If the user opens `/dashboard/budgets` and sees nothing, they're likely to bounce. The empty state is the onboarding for the budgets feature. P2 because the budgets page is still technically correct without the empty-state UX; the feature is a quality-of-onboarding win, not a correctness gate.

**Independent Test**: Sign up a fresh user (or a user with no budgets). Navigate to `/dashboard/budgets`. Assert a single illustrated empty-state panel is shown with a heading ("Set spending targets for your expense categories" or similar), helpful copy explaining what budgets are, and a primary CTA "Create your first budget" that opens the create sheet directly. No monetary numbers and no progress bars are rendered.

**Acceptance Scenarios**:

1. **Given** an authenticated user with zero non-archived budgets, **When** they navigate to `/dashboard/budgets`, **Then** the empty-state panel renders with a heading, descriptive copy, and a primary CTA "Create your first budget".
2. **Given** the empty state is showing, **When** the user activates the CTA, **Then** the create-budget sheet opens directly (same sheet from US1).
3. **Given** the user has at least one EXPENSE category seeded but zero budgets, **When** they open the create-budget sheet from the empty state, **Then** the category picker is populated with the user's EXPENSE categories.
4. **Given** the user has zero EXPENSE categories (edge case — they hard-archived all their EXPENSE categories OR somehow have an empty Categories list), **When** they open `/dashboard/budgets`, **Then** the empty state surfaces a special variant: "You need at least one EXPENSE category to create a budget. Go to Categories to add one." with a CTA to `/dashboard/categories`. The "Create your first budget" CTA is disabled in this case.

---

### Edge Cases

- **All budgets archived**: Same render as zero budgets — the no-budgets empty state from US5 takes over `/dashboard/budgets`. The dashboard's Budgets widget shows its empty state.
- **Budget for an archived category**: per clarification Q3 the budget stays with a muted "(archived category)" label and continues to compute actuals against the (archived) category. The user MAY archive the budget themselves to clean up.
- **Budget with `endDate < today`**: budget is "retired"; no longer surfaced in default views (treated as inactive); appears under "Show archived" if implementer chooses to fold it in, OR appears under a separate "Past budgets" section — implementer's call.
- **Budget with `startDate > today`**: budget is "scheduled"; shows in the list with a "Starts {date}" label; actuals show $0 until the period containing `startDate` begins.
- **Budget for a child category whose parent has its own budget**: both budgets render independently. The parent's actuals sum only that parent category's directly-attached transactions (NOT child-category transactions). Aggregating child actuals into the parent is explicitly OUT OF SCOPE per the prompt (deferred).
- **Mixed-currency transactions in the same category**: each budget is single-currency; a USD budget on Groceries sums ONLY USD-currency Groceries transactions; EUR Groceries transactions do not affect the USD budget. This is the "no implicit FX" rule.
- **MONTHLY budget on the last day of a month**: the period boundary recomputes at midnight UTC. Crossing the boundary resets actuals to $0 for the new period; the user's `startDate` does not change; the budget continues to apply.
- **YEARLY budget crossing year boundary**: same — at UTC midnight on 2027-01-01, the YEARLY budget's actuals reset to $0 for the 2027 period.
- **Cross-user attempt**: a user constructing a URL or request asserting another user's budget sees the no-budgets empty state on their OWN list; the targeted operation resolves to `not_found`. Zero leakage; all queries are user-scoped (FR-022).
- **Concurrent uniqueness race**: two near-simultaneous create requests for the same `(userId, categoryId, currency, period)` — the schema unique index makes one succeed and one fail with a "budget already exists" envelope. The UI handles the race gracefully (re-renders the list to show the just-created budget).

## Requirements *(mandatory)*

### Functional Requirements

**Model & lifecycle**

- **FR-001**: System MUST persist a `Budget` entity with fields: `id`, `userId`, `categoryId`, `period` (one of `MONTHLY` / `YEARLY`), `amount` (Decimal), `currency` (ISO 4217), `startDate` (calendar day), `endDate` (calendar day, nullable), `archivedAt` (nullable timestamp), `createdAt`, `updatedAt`.
- **FR-002**: System MUST enforce a uniqueness invariant: at most one non-archived Budget row per `(userId, categoryId, currency, period)` tuple. Attempts to create a duplicate MUST be rejected with a clear error envelope.
- **FR-003**: A Budget's `categoryId` MUST reference a category whose `kind` is `EXPENSE`. Attempts to create a Budget against an `INCOME` category MUST be rejected.
- **FR-004**: A Budget's `currency` MUST be a valid ISO 4217 alpha-3 code.
- **FR-005**: A Budget's `amount` MUST be a positive Decimal (greater than zero); zero and negative budgets are rejected.
- **FR-006**: `startDate` MUST be a calendar day. For `MONTHLY` budgets it is normalized to the 1st of its containing month at the Zod boundary; for `YEARLY` budgets it is normalized to January 1st of its containing year.
- **FR-007**: `endDate`, when set, MUST be greater than or equal to `startDate`. When `endDate` is null, the budget is open-ended.
- **FR-008**: Soft delete via `archivedAt` — same pattern as accounts (feature 004), categories (feature 006), and transactions (feature 007). Default queries exclude archived rows; an opt-in `includeArchived` flag reveals them.

**Period & actuals computation**

- **FR-009**: Period boundaries are UTC-calendar-aligned. A `MONTHLY` budget's current period runs from UTC midnight of the 1st of the current calendar month (inclusive) to UTC midnight of the 1st of the next calendar month (exclusive). A `YEARLY` budget's current period runs from UTC midnight of January 1st of the current calendar year (inclusive) to UTC midnight of January 1st of the next calendar year (exclusive).
- **FR-010**: Actuals for a Budget in a given period MUST equal the sum of non-archived EXPENSE transactions whose `categoryId === budget.categoryId`, `currency === budget.currency`, and whose `date` falls within the period window. The sign of EXPENSE amounts is stored negative per feature 007's signed-amount convention; the actuals computation returns the absolute sum (a positive number) for display.
- **FR-011**: Remaining for a Budget MUST equal `budget.amount − actuals` (signed; negative when over budget).
- **FR-012**: Progress ratio MUST equal `actuals / budget.amount`. When `budget.amount` is 0 (defensive — FR-005 already rejects this at create), the ratio is undefined and the row renders with a 0% bar.
- **FR-013**: TRANSFER rows are NEVER included in actuals (consistent with the cash-flow widget from feature 008). Only EXPENSE rows count.
- **FR-014**: Period boundaries MUST be recomputed at request time; the boundary at the moment of the dashboard render is the one used, not a cached snapshot.

**`/dashboard/budgets` page (CRUD UI)**

- **FR-015**: The route `/dashboard/budgets` MUST replace the existing placeholder with a functional budgets management page.
- **FR-016**: The page MUST render a list of the user's non-archived budgets, each showing: category name (with "(archived category)" suffix if the category is archived), budgeted amount, actuals for the current period, remaining, and a progress bar.
- **FR-017**: The page MUST render a primary "Add budget" CTA that opens the create sheet (US1).
- **FR-018**: The page MUST support edit and archive flows (US3) via clicking a budget row and using the side-sheet pattern established by features 004 / 006 / 007.
- **FR-019**: Every monetary value displayed on the page MUST render through the shared `<Money>` primitive, with currency code visible adjacent to amount. NO implicit FX, NO collapsed totals across currencies.
- **FR-020**: A "Show archived" toggle MUST reveal archived budgets with an `Archived` badge.
- **FR-021**: The page MUST handle the no-budgets empty state (US5) — including the special "no EXPENSE categories" variant — without rendering monetary values or empty progress bars.

**Data scoping & money correctness**

- **FR-022**: Every Budget read or write MUST be scoped to the current session's user via `userId` as the first positional argument to every query helper, sourced from `session.user.id` and never from request input. Cross-user attempts collapse to `not_found`.
- **FR-023**: All monetary arithmetic on Budget data MUST flow through `lib/money/` helpers (constitution Principle I). The actuals query MUST reuse the existing per-category-per-currency aggregation pattern from feature 007's `lib/transactions/queries.ts`.
- **FR-024**: `<Money>` is the single rendering primitive for all monetary displays — budgeted amount, actuals, remaining. NO inline `formatAmount(...)` calls; NO `<span>{amount}{currency}</span>` patterns.
- **FR-025**: Sign-aware color treatment: under-budget (`< 80%`) = neutral, near-budget (`80% ≤ ratio ≤ 100%`) = warning, over-budget (`> 100%`) = negative — AND identified by a non-color secondary signal (icon, label, or shape; FR-030 from feature 008's accessibility convention).
- **FR-026**: All amounts render with tabular numerals (consistent with the constitution's `<Money>` contract — alignment on the decimal point).

**Dashboard widget (US4)**

- **FR-027**: A new "Budgets" widget MUST be added to `/dashboard` (the landing page), rendered alongside the existing Net Worth, Cash Flow, and Recent Transactions widgets. Per the feature-008 conventions: it is a server component wrapped in `<WidgetErrorBoundary>`, accessible to keyboard, with tabular numerals via `<Money>`.
- **FR-028**: The widget MUST show at most 5 active budgets, sorted in priority order: over-budget (`> 100%`) first, then near-budget (`80% ≤ ratio ≤ 100%`), then under-budget (`< 80%`). A "See all" link routes to `/dashboard/budgets`.
- **FR-029**: When the user has zero non-archived budgets, the widget MUST render an empty state with a "Set up your first budget" CTA linking to `/dashboard/budgets` — it MUST NOT take over the entire dashboard (unlike the page-level no-accounts state from feature 008's FR-003).

**Accessibility & general quality**

- **FR-030**: The page and dashboard widget MUST be fully keyboard-operable; focus order top-to-bottom, left-to-right; visible focus indicators per project convention.
- **FR-031**: Progress bars MUST have an accessible label or `aria-valuenow` / `aria-valuemax` attribute so screen readers can announce the value.
- **FR-032**: The page MUST work without JavaScript for its initial render (server-rendered values acceptable; interactive sheet only opens with JS).
- **FR-033**: Each widget on `/dashboard/budgets` MUST have an accessible label (heading or labelled region).

**Scope guardrails**

- **FR-034**: The following items MUST NOT be introduced in this feature: rollover (unspent budget → next period), savings goals (income-side; feature 019), budget templates / duplicate-from-last-month, budget notifications or email alerts, nested-category-aggregation (a parent's actuals do NOT include its children's transactions), per-period overrides on the same budget rule, custom (non-MONTHLY-non-YEARLY) period lengths, cross-currency comparison or FX, CSV export of budgets, charts (feature 015).
- **FR-035**: The Category model, Transaction model, Account model, and their underlying queries / mutations MUST NOT be modified in scope-affecting ways. Read-only consumption of existing query helpers IS allowed (specifically, the per-category-per-currency-per-period aggregation pattern from `lib/transactions/queries.ts`).
- **FR-036**: The dashboard's existing Net Worth, Cash Flow, and Recent Transactions widgets MUST NOT regress (SC-005, SC-006, SC-007 from feature 008 still hold). Only the addition of the new Budgets widget is in scope on `/dashboard`.

### Key Entities

- **Budget** (NEW): `{ id, userId, categoryId, period, amount, currency, startDate, endDate?, archivedAt?, createdAt, updatedAt }`. Owned by User (CASCADE on delete); references Category (Restrict on delete — a category with budgets cannot be hard-deleted; archive instead). Uniqueness index on `(userId, categoryId, currency, period)` filtered to `archivedAt IS NULL`.
- **BudgetWithActuals** (NEW, in-memory only, not persisted): `{ budget: Budget, actuals: Money, remaining: Money, progressRatio: number, periodStart: Date, periodEnd: Date, status: "under" | "near" | "over" }` — the rendering shape returned by the query layer. Sorts by `status` then `progressRatio` desc.

Existing entities consumed read-only:

- **Category** (feature 006) — filtered to `kind === "EXPENSE"`.
- **Transaction** (feature 007) — read for per-category-per-currency-per-date-range sum aggregation.
- **User** (feature 003) — session subject for data scoping.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create their first budget in under 60 seconds from `/dashboard/budgets` (open page → activate CTA → fill form → submit → see the new row).
- **SC-002**: For any budget, the displayed actuals value equals — byte-for-byte — the sum the user would compute by filtering `/dashboard/transactions` to that category + period + currency + EXPENSE type and summing the absolute amounts. (Verifiable by a single end-to-end assertion per budget.)
- **SC-003**: 100% of monetary values rendered on `/dashboard/budgets` AND on the new dashboard Budgets widget are shown alongside their ISO 4217 currency code (constitution Principle I).
- **SC-004**: 0% of budget renders perform implicit FX conversion across currencies. A user with USD and EUR budgets sees them as separate rows, never a collapsed total.
- **SC-005**: Cross-user data leakage attempts (URL manipulation, second-tab race, hand-crafted requests) resolve to the requesting user's own list 100% of the time. Zero pixels of another user's budgets are ever rendered.
- **SC-006**: The uniqueness invariant `(userId, categoryId, currency, period) WHERE archivedAt IS NULL` is enforced 100% — both at the application layer (Zod boundary check) AND at the schema layer (partial unique index). Concurrent create attempts collapse to one success + one failure, never two duplicates.
- **SC-007**: The actuals computation reuses the existing transaction-aggregation primitive from feature 007's `lib/transactions/queries.ts`; the audit grep `rg "prisma\\.transaction\\." lib/` returns only `lib/transactions/queries.ts` after this feature ships (feature-007 invariant preserved).
- **SC-008**: The constitution Principle I (money math) audit on this PR finds zero new arithmetic on monetary values outside `lib/money/`. (Verified by the money-reviewer subagent at PR time.)
- **SC-009**: The constitution Principle IV money-paths unit suite is extended with at least 8 new cases covering the actuals computation (single-currency, multi-currency, under-budget, near-budget, over-budget, archived-transaction exclusion, period-boundary edge cases — month-rollover and year-rollover).
- **SC-010**: An E2E asserts the full create-budget → record-expense → see-actuals-update flow: create a $400/mo Groceries budget, record a $50 EXPENSE in Groceries, navigate to `/dashboard/budgets`, assert actuals = $50 and remaining = $350. (Constitution Principle IV E2E for this feature.)
- **SC-011**: An E2E asserts the over-budget state: with actuals exceeding budgeted, the row shows the over-budget visual treatment (color + icon + label) without relying on color alone.
- **SC-012**: The dashboard's new Budgets widget shows up to 5 budgets in priority order (over → near → under) for users with budgets, and an empty state with CTA for users without.
- **SC-013**: A user with budgets in 2+ currencies sees each budget rendered separately with its own currency code; no cross-currency aggregation.
- **SC-014**: The placeholder `/dashboard/budgets` page is replaced — a user with at least one budget sees the functional list, not the previous placeholder copy.
- **SC-015**: The existing test suites (unit, integration, E2E) from features 001–008 continue to pass with no test weakened, removed, or skipped.
- **SC-016**: The page is fully keyboard-operable: a keyboard-only user can Tab from page top to the CTA, activate it with Enter, fill the form via keyboard, submit, and see the new row — no mouse interaction required.
- **SC-017**: When a category is archived, the budget rows referencing it continue to render on `/dashboard/budgets` with the "(archived category)" label; the actuals computation still works against transactions referencing that category.
- **SC-018**: The dashboard's existing widgets (Net Worth, Cash Flow, Recent Transactions) continue to render byte-for-byte identically after the Budgets widget is added — no regression to feature 008's SC-005, SC-006, SC-007.

## Assumptions

- The user's "most-used currency" default in the create form (US1 acceptance scenario 1) is computed from recent EXPENSE transaction COUNT per Clarifications Q2; there's no per-user primary-currency setting yet (that's feature 017).
- Per-period overrides (e.g., "November Groceries gets a $1,000 holiday-spending override") are out of scope; a budget is a single recurring rule.
- Aggregating child-category transactions into a parent's actuals is out of scope; a budget on a parent category sums only transactions whose `categoryId === budget.categoryId` directly.
- The dashboard Budgets widget renders ALL active budgets (subject to the 5-row visual cap), not just MONTHLY ones — a user with only YEARLY budgets sees those.
- Archiving a category does NOT auto-archive its budgets (clarification Q3). The budget shows a "(archived category)" label.
- A budget's `endDate` is inclusive — the period containing `endDate` is the last period the budget applies to.
- Pagination on `/dashboard/budgets` is NOT introduced; a user with 50+ active budgets renders them all in a single scroll. If this becomes a problem in practice, a future polish PR can add it.
- The dashboard widget's 5-row visual cap is a soft display limit; users wanting to see all budgets click "See all" → `/dashboard/budgets`.
- The actuals computation runs at request time (server-side, on every render); no precomputed actuals cache is introduced in v1.
- The empty-state illustration and shared `<EmptyState>` / `<EmptyCell>` primitives from features 002–008 are reused; no new illustration asset.

## Out of Scope (Explicit)

The following items are explicitly NOT introduced by this feature and are deferred to the named roadmap features or to future polish:

- **Rollover** (unspent → next period) — common in YNAB; complex semantics; defer to future feature.
- **Savings goals** (positive-direction income / savings targets) — feature 019.
- **Budget templates / duplicate-from-last-month** — defer to future polish.
- **Email or in-app notifications** ("you're 90% through your Groceries budget") — defer; no notification infrastructure exists.
- **Nested-category aggregation** (parent budget shows parent + children's actuals) — defer; v1 budgets are strictly per-category.
- **Per-period amount overrides** ("November Groceries = $1,000 instead of the usual $400") — defer; v1 budgets have one `amount` per rule.
- **Custom period lengths** (weekly, quarterly, biweekly) — defer; v1 supports MONTHLY and YEARLY only.
- **Multi-currency conversion / FX** — feature 020; v1 budgets are strictly per-currency.
- **Charts / visualisations of budget history** — feature 015 (Charts) once it lands.
- **CSV export of budget data** — feature 014.
- **Budget vs actual reports by date range** — feature 016 (Reports) with its own date-range picker.
- **Drag-to-reorder budgets / customisable budget grouping** — not planned for v1.
- **Hard delete of budgets** — soft delete only, consistent with the pattern from features 004 / 006 / 007.
