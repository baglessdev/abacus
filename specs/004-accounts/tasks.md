---

description: "Task list for feature 004 — Accounts"
---

# Tasks: Accounts

**Input**: Design documents from `/specs/004-accounts/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Spec FR-022 and SC-010 mandate the four-file money-correctness unit suite; the plan adds one Playwright spec covering US1+US2+US3+US4. Test tasks are required, not optional.

**Organization**: Tasks are grouped by user story. The MVP is **US1 alone**, but `lib/money/` and `lib/accounts/` server surface are shared infrastructure required by every story and live in the Foundational phase.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4). Setup / Foundational / Polish tasks have no story label.
- File paths are absolute repository paths under `/Users/rgederin/git/abacus/`.

## Path Conventions

Single-project Next.js layout (per [plan.md §Project Structure](./plan.md)). All paths are repo-relative below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New runtime dependencies and shadcn UI primitives required by every later phase.

- [X] T001 Add the four new runtime deps in `package.json` and install: `cmdk`, `@radix-ui/react-popover`, `@radix-ui/react-switch`, `@radix-ui/react-alert-dialog`. Run `pnpm install`. Verify `pnpm-lock.yaml` updates cleanly.
- [X] T002 [P] Add shadcn `Command` primitive at `components/ui/command.tsx` (wraps `cmdk`). Match shadcn canonical source.
- [X] T003 [P] Add shadcn `Popover` primitive at `components/ui/popover.tsx` (wraps `@radix-ui/react-popover`). Match shadcn canonical source.
- [X] T004 [P] Add shadcn `Switch` primitive at `components/ui/switch.tsx` (wraps `@radix-ui/react-switch`). Match shadcn canonical source.
- [X] T005 [P] Add shadcn `AlertDialog` primitive at `components/ui/alert-dialog.tsx` (wraps `@radix-ui/react-alert-dialog`). Match shadcn canonical source.
- [X] T006 [P] Add shadcn `Table` primitive at `components/ui/table.tsx` (pure markup, no Radix). Match shadcn canonical source.
- [X] T007 [P] Add shadcn `Badge` primitive at `components/ui/badge.tsx` (pure markup, variant-based). Match shadcn canonical source.

**Checkpoint**: New shadcn primitives importable. `pnpm typecheck` passes. `pnpm lint` passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, `lib/money/`, and `lib/accounts/` server surface — every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 is complete.

### Database

- [X] T008 Update `db/schema.prisma`: add `model Account`, `enum AccountType`, and the `User.accounts Account[]` back-relation per [data-model.md](./data-model.md). Include `@@index([userId])` and `@@index([userId, archivedAt])`.
- [X] T009 Generate the migration: `pnpm exec prisma migrate dev --name add_account --schema=db/schema.prisma`. Verify `db/migrations/<timestamp>_add_account/migration.sql` is created and applied to local Postgres. Run `pnpm db:generate` to refresh the Prisma client.

### `lib/money/` — the boundary for all monetary operations (FR-016)

- [X] T010 [P] Create `lib/money/decimal.ts`: re-export `Prisma.Decimal` as `Money`; add thin typed wrappers `plus(a, b)`, `minus(a, b)`, `cmp(a, b)`, `isZero(a)`, `isNegative(a)`. Document the boundary rule in a single-line header comment.
- [X] T011 [P] Create `lib/money/currencies.ts`: bundled `CURRENCIES: readonly Currency[]` with all currently-active ISO 4217 codes (~170 entries), each `{ code, name, decimals, symbol }`. Export `CURRENCY_CODES: ReadonlySet<string>`, `getCurrency(code): Currency | undefined`, `isCurrencyCode(code): code is string`. Obsolete codes (DEM, FRF, XEU) are excluded.
- [X] T012 [P] Create `tests/unit/money-decimal.test.ts`: `Money` round-trips lossless from string ("1250.00", "-500", "0.123456789"); arithmetic identities (`a.plus("0").eq(a)`, commutativity, no float drift). Constitution Principle IV / FR-022 / SC-010.
- [X] T013 [P] Create `tests/unit/money-currencies.test.ts`: canonical-code membership (USD, EUR, JPY, BHD, GBP); obsolete-code rejection (DEM, FRF, XEU); `getCurrency` case-sensitivity (`getCurrency("usd")` returns `undefined`; `"USD"` returns the record). FR-022 / SC-010.
- [X] T014 Create `lib/money/validate.ts`: `allowsNegativeStartingBalance(type: AccountType): boolean` returning true for `CREDIT` and `OTHER`, false otherwise; `validateStartingBalance({ type, currency, amount: string }): { ok: true } | { ok: false; code: "negative_not_allowed" | "too_many_decimals" | "not_a_number"; message: string }`. Uses `getCurrency` for the decimal-place rule. (Depends on T011.)
- [X] T015 Create `lib/money/format.ts`: `formatAmount(amount: string | Money, currency: string): string` using `Intl.NumberFormat` keyed by the currency's `decimals`. Output examples from [plan.md §Currency display](./plan.md). Never rounds; pads to `decimals` count. (Depends on T011.)
- [X] T016 [P] Create `tests/unit/money-validate.test.ts`: `"0"` accepted for every type; `"-1"` rejected on CHECKING/SAVINGS/CASH/INVESTMENT; `"-1"` accepted on CREDIT/OTHER; `"1.234"` rejected on USD; `"1.234"` accepted on BHD; `"1.5"` rejected on JPY; `"1"` accepted on JPY. (Depends on T014.) FR-022 / SC-010.
- [X] T017 [P] Create `tests/unit/money-format.test.ts`: `formatAmount("1250.00", "USD")` → `$1,250.00`; `formatAmount("0", "JPY")` → `¥0`; `formatAmount("-500", "USD")` → `-$500.00`; `formatAmount("1.234", "BHD")` outputs three decimals; thousands separator + sign placement. (Depends on T015.) FR-022 / SC-010.
- [X] T018 Create `lib/money/index.ts`: barrel re-export of `Money`, `Currency`, `CURRENCIES`, `getCurrency`, `isCurrencyCode`, `allowsNegativeStartingBalance`, `validateStartingBalance`, `formatAmount`, `ACCOUNT_TYPES_ALLOWING_NEGATIVE`. (Depends on T010, T011, T014, T015.)

### `lib/accounts/` — server-side surface (queries, schemas, actions)

- [X] T019 [P] Create `lib/accounts/errors.ts`: error code constants per [plan.md §Error envelope](./plan.md) (`unauthenticated`, `validation_failed`, `not_found`, `archived_field_locked`, `internal_error`) and canonical user-facing messages. Export helper `errorEnvelope(code, opts?)`.
- [X] T020 [P] Create `lib/accounts/serialize.ts`: `serializeAccount(row: Account): AccountDTO` per [plan.md §Shared DTO](./plan.md). Converts `Decimal` → canonical string and `Date` → ISO string. No business logic.
- [X] T021 Create `lib/accounts/schemas.ts`: five Zod schemas — `createAccountSchema`, `updateActiveAccountSchema`, `updateArchivedAccountSchema` (name-only per FR-009a), `archiveAccountSchema`, `unarchiveAccountSchema`. The `currency` field in `createAccountSchema` MUST be `z.string().trim().transform(s => s.toUpperCase()).pipe(z.string().refine(isCurrencyCode))` so that `usd`, ` USD `, and `USD` all normalize to canonical uppercase before the allow-list check (FR-005, spec edge case L118). Each `startingBalance`-bearing schema uses `superRefine` for the currency-aware decimal-place + per-type negative rule via `validateStartingBalance`. Currency field is absent from BOTH update schemas (FR-007). (Depends on T018.)
- [X] T022 Create `lib/accounts/queries.ts`: `listAccountsForUser(userId, { includeArchived })`, `getAccountForUser(userId, id)`, `createAccountForUser(userId, input)`, `updateAccountForUser(userId, id, input)`, `setArchivedAtForUser(userId, id, value: Date | null)`. **First positional arg of every helper is `userId`** (plan R15). Every Prisma `where:` clause includes `userId`. This file is the ONLY file in the app that imports `prisma.account.*`. (Depends on T009.)
- [X] T023 Create `lib/accounts/actions.ts`: five `"use server"` server actions per [contracts/](./contracts/). Each action: (1) `await auth()` — on missing session return `unauthenticated` envelope; (2) Zod `safeParse` of input — on failure return `validation_failed` envelope with `fieldErrors`; (3) call the relevant `lib/accounts/queries.ts` helper with `session.user.id` as the first arg; (4) on `null` return from a read return `not_found` envelope; (5) for `updateAccount`, branch on the pre-fetched row's `archivedAt` to pick which schema to apply (plan R10 / contracts/updateAccount.md); (6) for `archiveAccount`, the `archivedAt` value MUST be set server-side via `new Date()` — the action MUST NOT accept a client-supplied timestamp (FR-008); (7) on success return `{ data: { account: serializeAccount(row) } }` (or `{ data: { accounts: rows.map(serializeAccount) } }` for `listAccounts`); (8) call `revalidatePath("/dashboard/accounts")` after every successful mutation. (Depends on T020, T021, T022, T019.)
- [X] T024 Create `lib/accounts/index.ts`: server-only barrel re-exporting the five actions, the `AccountDTO` type, the error-code union, and `ACCOUNT_TYPES` array (for the type select). (Depends on T023.)

**Checkpoint**: `pnpm test` passes — four money-suite unit-test files green. `pnpm typecheck` passes with zero `any`. `pnpm exec prisma migrate status --schema=db/schema.prisma` reports "Database schema is up to date." Server actions importable from `lib/accounts`. No `prisma.account.*` access exists outside `lib/accounts/queries.ts` (verify with `pnpm exec grep -rn "prisma\.account" --include="*.ts" --exclude-dir=node_modules .`).

---

## Phase 3: User Story 1 — Create the first account from empty state (Priority: P1) 🎯 MVP

**Goal**: A newly-signed-up user with no accounts opens `/dashboard/accounts`, sees the empty state with a single primary CTA, opens the create sheet, fills in name + type + currency + starting balance, submits, and immediately sees the new account in a list.

**Independent Test**: Sign up a fresh user → navigate to `/dashboard/accounts` → assert empty state with "Add your first account" CTA → click CTA → fill form (Chase Checking / CHECKING / USD / 1250.00) → submit → assert sheet closes and the row appears in a table with name, type, currency, and balance. Reload → assert row persists.

### Implementation for User Story 1

- [X] T025 [P] [US1] Create `app/(shell)/dashboard/accounts/_components/currency-picker.tsx`: client component, `cmdk` `Command` inside `Popover`, props `{ value, onChange, disabled }`. Renders a searchable combobox over `CURRENCIES`. When `disabled` is true, renders a read-only `Input` showing the code (no popover trigger). Keyboard-accessible by construction. (Depends on T002, T003, T018.)
- [X] T026 [P] [US1] Create `app/(shell)/dashboard/accounts/_components/account-form.tsx`: client component, props `{ mode: "create" | "edit" | "edit-archived", account?: AccountDTO, onSuccess: () => void }`. Implement `"create"` branch only for now: text `Input` for name, `Select` for type (six options), `CurrencyPicker`, `Input` for starting balance (default `"0"`). Bind to `createAccount` via `useActionState`. Display Zod field errors next to fields; preserve entered values across rejects. (Depends on T024, T025.)
- [X] T027 [US1] Create `app/(shell)/dashboard/accounts/_components/account-form-sheet.tsx`: client component wrapping shadcn `Sheet`, props `{ open, onOpenChange, mode, account? }`. Renders `<AccountForm>` inside `SheetContent` with appropriate title ("Add account" / "Edit account"). (Depends on T026.)
- [X] T028 [US1] Create `app/(shell)/dashboard/accounts/_components/accounts-list.tsx`: client component, props `{ initialAccounts: AccountDTO[] }`. State: `accounts`, `sheetOpen`, `sheetMode`. Renders the shadcn `Table` of active accounts (name, type, currency, balance via `formatAmount`); top-right "Add account" `Button` opens the sheet in `"create"` mode. After successful create, prepend the new account to local state and close the sheet. Empty path: render `<EmptyState>` from `components/shell/empty-state.tsx` with `Wallet` icon, "No accounts yet" title, primary CTA "Add your first account" that opens the sheet. (Depends on T024, T027.)
- [X] T029 [US1] Replace `app/(shell)/dashboard/accounts/page.tsx`: server component, calls `auth()` (defense-in-depth), calls `listAccounts({ includeArchived: false })`, on `error.code === "unauthenticated"` calls `redirect("/login?from=/dashboard/accounts")`, otherwise renders `<AccountsList initialAccounts={result.data.accounts} />`. Remove the placeholder `EmptyState` from the old page. (Depends on T024, T028.)
- [X] T030 [US1] Add `tests/e2e/accounts.spec.ts` with the US1 round-trip: `test.beforeAll` truncates `Account` then `User`; sign up a fresh user; navigate to `/dashboard/accounts`; assert empty state with the CTA; click the CTA; fill the form (Chase Checking / CHECKING / USD / 1250.00); submit; assert sheet closes and table contains exactly one row with the expected cells. Reload page; assert the row is still present (SC-002).
- [X] T031 [US1] Add a second-user cross-isolation block to `accounts.spec.ts` (new `test.describe` or `test`): open a fresh browser context, sign up a second user, navigate to `/dashboard/accounts`, assert the empty state is shown — none of user 1's accounts visible (FR-013, SC-003, SC-008).

**Checkpoint**: US1 fully functional and testable. `pnpm test:e2e -- accounts.spec.ts` passes US1 blocks. The MVP can ship here.

---

## Phase 4: User Story 2 — Manage existing accounts: rename, edit, archive, unarchive (Priority: P1)

**Goal**: With at least one account, the user can open it from the list, edit its name/type/startingBalance, archive it (row leaves the default list), toggle "Show archived" to see archived rows with a badge, and unarchive (row returns to the default list). Archived rows allow only `name` edits (FR-009a).

**Independent Test**: Starting from a user with one active account (created via US1), click the row → edit sheet opens pre-populated → change name → submit → list reflects new name. Open it again → click "Archive" → confirm in `AlertDialog` → row disappears from default list. Toggle "Show archived" on → row reappears with "Archived" badge. Open the archived row → assert `type` and `startingBalance` inputs are disabled, `name` is editable. Click "Unarchive" → row returns to active list.

### Implementation for User Story 2

- [X] T032 [US2] Extend `app/(shell)/dashboard/accounts/_components/account-form.tsx`: implement the `"edit"` and `"edit-archived"` branches. In `"edit"`: pre-populate from `account` prop; currency rendered via `CurrencyPicker disabled` with the locked-caption text ("Currency is locked at creation"); type, name, and startingBalance editable; bind to `updateAccount`. In `"edit-archived"`: only `name` is editable; `type`, `currency`, `startingBalance` rendered disabled; bind to `updateAccount` (the server picks the archived schema based on `archivedAt`). FR-007, FR-009a. (Depends on T026.)
- [X] T033 [US2] Create `app/(shell)/dashboard/accounts/_components/archive-confirm-dialog.tsx`: client component, props `{ accountId, accountName, open, onOpenChange, onArchived }`. Renders shadcn `AlertDialog` with copy "Archive {name}?" and Cancel / Archive buttons. On Archive: call `archiveAccount` server action; on success call `onArchived` and close. (Depends on T005, T024.)
- [X] T034 [US2] Extend `app/(shell)/dashboard/accounts/_components/accounts-list.tsx`: add `<Switch>` for "Show archived" (default off) above the table; on toggle change call `listAccounts({ includeArchived: <toggleValue> })` and replace local state. Render archived rows with muted styling + `<Badge>Archived</Badge>`. Row click opens the edit sheet — if `account.archivedAt` is non-null, mode is `"edit-archived"`, otherwise `"edit"`. Add a row-level "Archive" or "Unarchive" action (kebab menu or trailing button) per row state. Wire `ArchiveConfirmDialog` for archive, direct `unarchiveAccount` call for unarchive. (Depends on T004, T007, T024, T032, T033.)
- [X] T035 [US2] Add edit-name e2e block to `tests/e2e/accounts.spec.ts`: with one active account, click row → edit sheet opens with currency control showing `aria-disabled="true"` or visibly read-only — assert the currency cannot be changed (FR-007, US3 scenario 3, SC-009); change the name to "Chase Primary Checking" → submit → assert the new name in the list row.
- [X] T036 [US2] Add archive→toggle→unarchive e2e block to `accounts.spec.ts`: click row → open edit sheet → click "Archive" → confirm in `AlertDialog` → assert row disappears from default list (SC-005). Flip "Show archived" toggle on → assert archived row reappears with "Archived" badge (SC-005). Click the archived row → assert sheet opens in `"edit-archived"` mode: `name` input is enabled; `type` select is disabled; `startingBalance` input is disabled (FR-009a, SC-014). Edit name to "Closed Chase" → submit → assert name updates in the list. Click "Unarchive" → flip the toggle off → assert the row reappears in the active list (SC-005).

**Checkpoint**: US1 + US2 both pass independently. MVP+archive flow shippable.

---

## Phase 5: User Story 3 — Multi-currency accounts coexist in one list (Priority: P2)

**Goal**: A user with accounts in multiple currencies sees each account's balance with its own currency code; no aggregated total widget; no per-currency subtotals; the create form's currency picker accepts any active ISO 4217 code.

**Independent Test**: Starting from a clean user, create two accounts in different currencies (USD checking, EUR savings) → list shows two rows, each balance rendered with its own currency code/symbol → no "all-accounts total" widget anywhere → no per-currency subtotal line. The currency picker offers any active ISO 4217 code and refuses obsolete codes via the type system (combobox source list excludes them).

### Implementation for User Story 3

- [X] T037 [US3] Add multi-currency display e2e block to `tests/e2e/accounts.spec.ts`: from a fresh user, create one account in USD (Chase Checking / CHECKING / USD / 1250.00), create a second in EUR (Euro Savings / SAVINGS / EUR / 800.00). Assert the list has two rows; each row renders the balance with its own currency code or symbol (`$1,250.00` and `€800.00`); assert no element matching a "total" widget exists on the page (FR-012a, SC-011, SC-015). Use a stable `data-testid="accounts-total"` absence check, not text matching.

**Checkpoint**: US3 e2e green. Multi-currency works end-to-end without any aggregation surface.

---

## Phase 6: User Story 4 — Validation surfaces actionable errors (Priority: P2)

**Goal**: Invalid input (blank name, name over max length, unrecognized currency, negative balance on a non-credit/non-other type, too-many-decimals for the chosen currency) is rejected at the Zod boundary with a field-scoped error message; the form re-renders preserving still-valid values; the offending field is focused; the database state is unchanged.

**Independent Test**: Submitting the create or edit form with each invalid input surfaces a clear field-scoped error and does NOT persist. Specifically: blank name → name error; 81-char name → length error; currency `DEM` (obsolete) → currency error; `-100.00` on `CHECKING` → starting-balance error; `1.234` on `USD` → starting-balance error.

### Implementation for User Story 4

- [X] T038 [US4] Add a validation-rejection e2e block to `tests/e2e/accounts.spec.ts`: open the create sheet; for each invalid input listed below, assert (a) the inline field error renders, (b) the form does NOT submit (sheet stays open), (c) the still-valid fields keep their values, (d) the table on the page does NOT gain a new row (SC-007): blank name, 81-character name, an unrecognized currency code, `-100.00` starting balance on a `CHECKING` account, and `1.234` starting balance on a `USD` account.

**Checkpoint**: All four user stories pass independently. Constitution Principle IV / SC-007 / SC-010 / SC-014 / SC-015 demonstrably covered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Lint, typecheck, full suite, money-boundary audit, and quickstart validation.

- [X] T039 Run `pnpm typecheck` from the repo root — zero errors, no introduced `any` (FR-021, SC-012).
- [X] T040 Run `pnpm lint` from the repo root — zero errors.
- [X] T041 Run `pnpm format:check` from the repo root — clean.
- [X] T042 Run `pnpm test` from the repo root — full unit suite green, including the four money-suite files (FR-022, SC-010).
- [X] T043 Run `pnpm test:e2e` from the repo root — all e2e tests green, including the entire `accounts.spec.ts` US1-US4 set.
- [X] T044 Money-boundary audit: from the repo root, run `pnpm exec grep -rnE "(Decimal\.|new Decimal|\.plus\(|\.minus\(|\.times\(|\.div\()" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=db/migrations .` and verify every match path is under `lib/money/`. Any hit outside that directory is a Principle I / FR-016 violation that must be fixed before merge.
- [X] T045 Cross-user isolation audit: from the repo root, run `pnpm exec grep -rn "prisma\.account" --include="*.ts" --exclude-dir=node_modules .` and verify the ONLY file with matches is `lib/accounts/queries.ts`. Any match elsewhere is a data-scoping convention violation (FR-003, FR-013, plan R15).
- [X] T046 Walk through [quickstart.md](./quickstart.md) end-to-end on a clean checkout: install, migrate, dev-server up, signup → empty state → create → reload → edit → archive → toggle → unarchive → cross-user check. All steps complete without manual intervention.

**Final checkpoint**: Feature 004 is mergeable. Plan's Constitution Check post-design re-evaluation still holds; all 26 functional requirements have at least one corresponding task (verify via the FR → SC → task traceability below).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup** has no dependencies; can start immediately.
- **Phase 2 — Foundational** depends on Phase 1 (the shadcn primitives are imported by Phase 2 schemas/UI code that the `lib/` layer doesn't touch — only Phase 3+ does — so technically `lib/money/` and `lib/accounts/` can start in parallel with Phase 1's shadcn additions; T008 schema and T009 migration are independent of Phase 1 entirely). Practically, run Phase 1 first to keep the dependency graph simple.
- **Phase 3 (US1)** depends on Phase 2 completion. US1 must complete before Phase 4 (US2 extends US1 components in place).
- **Phase 4 (US2)** extends `account-form.tsx` and `accounts-list.tsx` from US1 → run after US1.
- **Phase 5 (US3)** and **Phase 6 (US4)** are e2e-only and depend on US1+US2 components being complete; they do not modify components.
- **Phase 7 (Polish)** depends on all earlier phases.

### Within Phase 2

- T008 → T009 (migration needs the schema change first).
- T009 → T022 (`lib/accounts/queries.ts` needs the generated Prisma client with the `Account` model).
- T011 → T014, T015, T016, T017, T018 (every other money file depends on the currencies allow-list).
- T010, T011, T014, T015 → T018 (the money barrel).
- T019, T020 → T023 (errors + serialize feed actions).
- T018, T021, T022 → T023 (the actions need the schemas, queries, and money helpers).
- T023 → T024 (the accounts barrel).

### Within Phase 3 (US1)

- T025, T026 can run in parallel (different files).
- T026 → T027 → T028 → T029 (the chain: form → sheet → list → page).
- T029 → T030 (e2e needs the page wired).
- T031 can run alongside T030 once T029 is done (both modify `accounts.spec.ts` but in additive `test.describe` blocks).

### Within Phases 4–6

- T032 → T033, T034 (form modes feed the list and dialog).
- T033, T034 are independent of each other.
- T035, T036, T037, T038 all extend `accounts.spec.ts` in different test blocks — they can land in any order after T034 is complete.

### Parallel opportunities

- Phase 1: T002–T007 are all `[P]` (six different files, no inter-dependencies once T001's deps are installed).
- Phase 2 `lib/money/`: T010, T011 in parallel (different files). T012, T013 in parallel (different test files, no implementation dependency since they test files that already exist or are being created in parallel). T016, T017 in parallel.
- Phase 2 `lib/accounts/`: T019, T020 in parallel (errors + serialize are independent).
- Phase 3: T025, T026 in parallel.

---

## Parallel Example: Phase 1 setup

```bash
# After T001 (deps installed), launch T002–T007 in parallel:
Task: "Add shadcn Command primitive at components/ui/command.tsx"
Task: "Add shadcn Popover primitive at components/ui/popover.tsx"
Task: "Add shadcn Switch primitive at components/ui/switch.tsx"
Task: "Add shadcn AlertDialog primitive at components/ui/alert-dialog.tsx"
Task: "Add shadcn Table primitive at components/ui/table.tsx"
Task: "Add shadcn Badge primitive at components/ui/badge.tsx"
```

## Parallel Example: Phase 2 lib/money/ initial files

```bash
# After T008 + T009 (schema + migration) are done:
Task: "Create lib/money/decimal.ts with Money wrapper"
Task: "Create lib/money/currencies.ts with bundled ISO 4217 allow-list"
# Then in parallel for the tests:
Task: "Create tests/unit/money-decimal.test.ts"
Task: "Create tests/unit/money-currencies.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (T001–T007).
2. Complete Phase 2: Foundational (T008–T024) — this is the bulk of the work; everything money-correctness, every server action, the schema, and the migration land here.
3. Complete Phase 3: US1 (T025–T031).
4. **STOP and VALIDATE**: run `pnpm test:e2e -- accounts.spec.ts` against the US1 blocks; sign up locally; create an account; reload. If it works, this is a shippable MVP increment.

### Incremental Delivery

1. MVP (US1) ships first.
2. Add US2 — edit + archive + unarchive flows + their e2e (T032–T036). Re-run the full suite.
3. Add US3 — multi-currency e2e assertion (T037). Re-run.
4. Add US4 — validation e2e assertion (T038). Re-run.
5. Final polish (T039–T046).

### What can be deferred

Per [plan.md §Risks & Trade-offs](./plan.md), nothing in this task list is "nice-to-have-but-deferred". Every task maps to an FR or SC. If schedule pressure forces a cut, the safe cut is dropping US3 and US4 (P2 stories) and shipping US1+US2 (P1, the MVP). Cuts to Phase 2 are NOT safe — they violate the constitution.

---

## Traceability: spec FRs → tasks

| FR | Covered by |
|---|---|
| FR-001 (Account model + migration, no `db push`) | T008, T009 |
| FR-002 (`userId` FK with cascade) | T008, T022 |
| FR-003 (queries scoped to session userId; no userId from input) | T022, T023, T045 |
| FR-004 (name validation: trimmed, 1–80) | T021 (createAccountSchema, update schemas) |
| FR-005 (currency ISO 4217 normalization + allow-list) | T011, T013, T021 |
| FR-006 (Decimal + currency-aware decimals + per-type negative rule + default 0) | T014, T016, T021 |
| FR-007 (currency immutable after creation) | T021 (no currency field in update schemas), T032 (read-only picker), T035 (e2e) |
| FR-008 (archive soft, reversible, no hard delete) | T022, T023 (no delete action), T034 (UI) |
| FR-009 (default excludes archived; toggle shows; badge) | T023 (listAccounts default), T034 (Switch + Badge) |
| FR-009a (archived row: name-only editable) | T021 (updateArchivedAccountSchema), T023 (branched updateAccount), T032 (mode), T036 (e2e) |
| FR-010 (empty state with CTA) | T028, T030 |
| FR-011 (every monetary value rendered with currency; never rounded) | T015, T017, T028 |
| FR-012 (sort name asc case-insensitive) | T022 (Prisma `orderBy`) |
| FR-012a (no aggregate widget, no per-currency subtotals) | T028, T037 |
| FR-013 (cross-user ops collapse to not_found; no leak) | T022 (`where: { id, userId }`), T023, T031 |
| FR-014 (Zod at boundary; helpers trust) | T021, T023 |
| FR-015 (response envelope `{ data } \| { error: { code, message } }`) | T019, T023, all contracts |
| FR-016 (all monetary arithmetic through `lib/money/`) | T010–T018, T044 (audit) |
| FR-017 (balance = startingBalance + sum(transactions); for now equals startingBalance) | T020 (serialize), T028 (display); future-proofed via formula doc |
| FR-018 (replace `/dashboard/accounts` placeholder) | T029 |
| FR-019 (side sheet edit, no detail page) | T027, T029 |
| FR-020 (keyboard-operable; labels; non-color-only) | T025, T026, T028, T034 |
| FR-021 (strict TS, no `any`, Zod everywhere) | T021, T039 |
| FR-022 (unit tests for money paths) | T012, T013, T016, T017 |
| FR-023 (out-of-scope items NOT introduced) | by-omission across all tasks |
| FR-024 (no per-user account limit) | by-omission across all tasks |
| SC-001..SC-015 (measurable outcomes) | All have at least one e2e or unit assertion |

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps a task to its user story; setup/foundational/polish tasks have no story label.
- The four money-suite unit tests (T012, T013, T016, T017) are constitution-mandated; do NOT cut them.
- The cross-user isolation audit (T045) is the constitution's data-scoping convention guard rail; run it after every refactor of `lib/accounts/`.
- Commit after each task or each tight logical group (e.g., one commit for `lib/money/decimal.ts` + its test).
- Verify tests fail (red) before implementation if writing tests first; otherwise commit impl + test together.
- Avoid: vague tasks ("write money helpers" without specifying which file), same-file `[P]` conflicts (we never have two `[P]` tasks editing the same file), cross-story dependencies that break independence (US3 and US4 are e2e-only on top of US1+US2; they don't modify shared component code).
