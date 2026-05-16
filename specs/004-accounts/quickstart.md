# Feature 004 — Quickstart

Local-run delta for a developer who has features 001, 002, and 003 already working. If you do not, run those feature quickstarts in order first, then return here.

## 1. Install new dependencies

This feature introduces two new runtime peer-deps for the shadcn primitives that didn't exist before in this project:

- `cmdk` — peer dep of `components/ui/command.tsx` (the currency picker).
- `@radix-ui/react-popover` — peer dep of `components/ui/popover.tsx` (the popover host for the command).
- `@radix-ui/react-switch` — peer dep of `components/ui/switch.tsx` (the "Show archived" toggle).
- `@radix-ui/react-alert-dialog` — peer dep of `components/ui/alert-dialog.tsx` (the archive confirmation).

All four are tiny (each < 10KB) and are already part of the Radix family this project uses for its other primitives. After this feature lands, the shadcn primitives `command`, `popover`, `switch`, `alert-dialog`, `table`, `badge` exist under `components/ui/`.

```bash
pnpm install
```

(The implementer will add the four packages to `package.json` in the first task; running `pnpm install` after pulling the branch picks them up.)

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

This applies the `add_account` migration to your local Postgres. The migration creates:

- The `AccountType` enum (`CHECKING`, `SAVINGS`, `CREDIT`, `CASH`, `INVESTMENT`, `OTHER`).
- The `Account` table with all columns plus two indexes (`Account_userId_idx`, `Account_userId_archivedAt_idx`).
- The foreign-key constraint from `Account.userId` to `User.id` with `ON DELETE CASCADE`.

Verify with `pnpm db:studio` and check the `Account` model is browsable (empty initially).

## 4. Start the dev server

```bash
pnpm dev
```

Visit `http://localhost:3000`. The marketing page renders (from feature 003).

## 5. Walk the happy path

### Sign up (if you haven't already)

1. From `/`, click **"Sign up"**.
2. Create a fresh account at `/signup` with email + password ≥12 chars. You land on `/dashboard`.

### Create your first account

1. Click "Accounts" in the sidebar. You land at `/dashboard/accounts`.
2. **Expected** (zero-state): the page renders an empty state with a single "Add account" CTA. No table.
3. Click "Add account". A side sheet opens with:
   - `Name` — text input, empty.
   - `Type` — radio group or select (six options).
   - `Currency` — searchable combobox (shows ~170 active ISO 4217 codes). Defaults to your locale's currency if detectable; otherwise USD. Tab into it, type "EUR", select.
   - `Starting balance` — text input, default `0`. Showing the chosen currency symbol/code adjacent.
4. Fill in:
   - Name: `Chase Checking`
   - Type: `CHECKING`
   - Currency: `USD` (use the picker; type "USD" or scroll)
   - Starting balance: `1250.00`
5. Click **"Create account"**.
6. **Expected**: the sheet closes; the empty state is replaced by a table with one row: `Chase Checking · CHECKING · $1,250.00`. The "Show archived" toggle is above the table, off.

### Edit the account

1. Click the `Chase Checking` row. The sheet opens in **edit** mode pre-populated.
2. Notice: the `Currency` field renders as a disabled control with a caption "Currency is locked at creation to keep balances consistent." (FR-007).
3. Change the name to `Chase Primary Checking`. Click **"Save changes"**.
4. **Expected**: the sheet closes; the row's name updates to `Chase Primary Checking`.

### Try the validation rules

1. Click "Add account" again.
2. Fill: `Cash on hand`, type `CASH`, currency `USD`, starting balance `-50`.
3. Click "Create account".
4. **Expected**: the form does NOT submit. The `Starting balance` field shows a red error: "Cash accounts cannot start with a negative balance." (or equivalent message from `validateStartingBalance`). The other field values are preserved.
5. Change the balance to `50` and submit. The row appears in the list.

### Multi-currency

1. Click "Add account".
2. Fill: `Travel fund`, type `SAVINGS`, currency `EUR`, starting balance `800`.
3. Submit. The new row appears showing `€800.00`. The first row still shows `$1,250.00`. No total is displayed at the bottom (FR-012a).

### Archive and unarchive

1. Click the `Cash on hand` row to open it in edit mode.
2. Click **"Archive"**. A confirmation dialog appears asking "Archive this account?".
3. Click "Yes, archive".
4. **Expected**: the dialog closes, the sheet closes, the row disappears from the table. Two visible rows remain.
5. Toggle **"Show archived"** ON above the table.
6. **Expected**: the archived row reappears, rendered with a muted/dimmed style and an "Archived" badge.
7. Click the archived row. The sheet opens in **edit-archived** mode:
   - `Name` is editable.
   - `Type` is read-only.
   - `Starting balance` is read-only.
   - `Currency` is read-only (as always).
   - The primary action is "Save changes"; the secondary action is **"Unarchive"**.
8. Click **"Unarchive"**.
9. **Expected**: the sheet closes; the row returns to the active list (the "Archived" badge is removed); toggle "Show archived" OFF and the row is still visible.

### Cross-user isolation (optional but worth verifying)

1. Open a private/incognito window. Sign up a second user (`friend@example.com`).
2. Navigate to `/dashboard/accounts`.
3. **Expected**: the empty state renders. You see none of the first user's accounts.

## 6. Run the test suites

### Unit (Vitest)

```bash
pnpm test
```

The four new test files cover the money-correctness paths (constitution Principle IV / FR-022):

- `tests/unit/money-decimal.test.ts` — `Money` wrapping, arithmetic identities.
- `tests/unit/money-currencies.test.ts` — allow-list shape, lookup behavior.
- `tests/unit/money-validate.test.ts` — currency-aware decimal places + per-type negative-balance rule.
- `tests/unit/money-format.test.ts` — display formatter for each currency family.

Plus the existing `auth-schemas.test.ts`, `auth-password.test.ts`, `env.test.ts` from features 001 and 003 — all unchanged.

### E2E (Playwright)

```bash
pnpm test:e2e
```

The new `tests/e2e/accounts.spec.ts` covers the constitution-mandated US1 + US2 round-trip (signup → create account → edit → archive → unarchive). Existing `tests/e2e/auth.spec.ts` and `tests/e2e/health.spec.ts` continue to pass.

The accounts E2E truncates the `Account` table in a `beforeAll` hook, then re-uses the `auth.spec.ts` signup flow to establish a session, then exercises the user-story flows. **Be aware**: running the E2E against your dev DB removes any accounts and users you created manually; override `DATABASE_URL` for the test run if you want to preserve them.

## 7. Resetting the database

```bash
pnpm db:reset
```

Re-applies all migrations (`add_user` + `add_account`) and leaves the schema empty. The `/dashboard/accounts` page after `db:reset` shows the empty state for any new user.

## File map for this feature

After implementation, the new and modified paths are:

```text
abacus/
├── app/(shell)/dashboard/accounts/
│   ├── page.tsx                       # MODIFIED — replaces placeholder with real list page
│   └── _components/                   # NEW — page-local client components
│       ├── accounts-list.tsx          # NEW — the table + Show archived toggle
│       ├── account-form.tsx           # NEW — the side-sheet form (create/edit/edit-archived modes)
│       ├── account-form-sheet.tsx     # NEW — the Sheet wrapper that controls open state
│       ├── currency-picker.tsx        # NEW — Command-in-Popover combobox
│       └── archive-confirm-dialog.tsx # NEW — AlertDialog wrapper
├── components/ui/
│   ├── command.tsx                    # NEW — shadcn primitive
│   ├── popover.tsx                    # NEW — shadcn primitive
│   ├── switch.tsx                     # NEW — shadcn primitive
│   ├── alert-dialog.tsx               # NEW — shadcn primitive
│   ├── table.tsx                      # NEW — shadcn primitive
│   └── badge.tsx                      # NEW — shadcn primitive
├── lib/accounts/
│   ├── actions.ts                     # NEW — five server actions
│   ├── queries.ts                     # NEW — Prisma-touching helpers (userId-injected)
│   ├── schemas.ts                     # NEW — Zod schemas for each action
│   ├── serialize.ts                   # NEW — Prisma row → AccountDTO
│   ├── errors.ts                      # NEW — error code constants + messages
│   └── index.ts                       # NEW — barrel
├── lib/money/
│   ├── decimal.ts                     # NEW — Money (Prisma.Decimal) + arithmetic helpers
│   ├── currencies.ts                  # NEW — ISO 4217 allow-list + lookup
│   ├── validate.ts                    # NEW — startingBalance validator
│   ├── format.ts                      # NEW — display formatter
│   └── index.ts                       # NEW — barrel
├── db/
│   ├── schema.prisma                  # MODIFIED — adds Account model + AccountType + User.accounts
│   └── migrations/
│       └── <timestamp>_add_account/
│           └── migration.sql          # NEW — generated migration
└── tests/
    ├── unit/
    │   ├── money-decimal.test.ts      # NEW
    │   ├── money-currencies.test.ts   # NEW
    │   ├── money-validate.test.ts     # NEW
    │   └── money-format.test.ts       # NEW
    └── e2e/
        └── accounts.spec.ts           # NEW
```

## What changed since feature 003

| Aspect | Before (003) | After (004) |
|---|---|---|
| `/dashboard/accounts` | Placeholder empty state | Real CRUD surface with side-sheet form |
| Schema | `User` only | `User` + `Account` + `AccountType` enum |
| Server actions | Auth-only | + 5 account actions |
| `lib/money/` | does not exist | exists, with 4 files + barrel |
| Money column | none | first `Decimal` column in the DB |
| `lib/accounts/queries.ts` | does not exist | exists; the only file that touches `prisma.account.*` |
| Currency picker | none | searchable combobox over ~170 ISO 4217 codes |
| Archive UX | none | soft-delete via `archivedAt` + "Show archived" toggle |
