# Feature 006 — Categories — Quickstart

Local-run delta for a developer who has features 001 through 005 (Accounts) already working, plus the branded-UI polish chore merged. If you do not, run those quickstarts in order first, then return here.

This feature ships the second domain entity in Abacus (`Category`) plus a curated color palette, a curated lucide-icon set, a `<CategoryPicker>` UI contract for future-consumed pickers, and a default seed of 11 categories on first signup.

## 1. Install new dependencies

This feature introduces ONE new runtime peer-dep for the shadcn primitive needed by the kind picker:

- `@radix-ui/react-select` — peer dep of `components/ui/select.tsx` (the kind selector inside the create/edit form).

After this feature lands, the shadcn primitive `select` exists under `components/ui/`.

```bash
pnpm install
```

(The implementer adds the package to `package.json` in the first task; running `pnpm install` after pulling the branch picks it up.)

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

This applies the `add_category` migration to your local Postgres. The migration creates:

- The `CategoryKind` enum (`INCOME`, `EXPENSE`).
- The `Category` table with all columns plus three indexes (`Category_userId_idx`, `Category_userId_archivedAt_idx`, `Category_userId_parentId_idx`).
- Two foreign-key constraints:
  - `Category.userId` → `User.id` with `ON DELETE CASCADE` (data-scoping convention).
  - `Category.parentId` → `Category.id` with `ON DELETE Restrict` (so archiving a parent doesn't silently lose children).
- A back-relation `User.categories` (no SQL — Prisma-only).

Verify with `pnpm db:studio` and check the `Category` model is browsable. It will be empty initially until a fresh signup runs (which seeds 11 default categories atomically as part of the signup transaction).

## 4. Reset existing local user data (RECOMMENDED for testing the seed)

The seed mechanism only fires for **new** signups. To verify it, either:

**Option A** — drop your local DB and reapply migrations:

```bash
pnpm db:reset           # destructive — wipes your local Postgres data
pnpm db:migrate         # reapplies all migrations
```

**Option B** — keep your existing test users but create a fresh one via the UI in step 5.

## 5. Start the dev server

```bash
pnpm dev
```

Or, if you hit the known Turbopack dev-server panic from features 003/004:

```bash
pnpm exec next build && pnpm exec next start
```

## 6. Walk the feature end-to-end

### 6a. Sign up a fresh user — verify the seed

1. Visit `http://localhost:3000`.
2. Click **Sign up**, enter an email + password (≥12 chars), submit.
3. You should auto-sign-in and land at `/dashboard`. The dashboard welcome panel now shows your email prefix.
4. Click **Categories** in the sidebar's MANAGE group (it sits next to Budgets and Settings).
5. **Verify the seed**: the Categories page should show 11 rows — 9 EXPENSE (Food, Housing, Transport, Utilities, Entertainment, Health, Shopping, Personal Care, Other Expenses) and 2 INCOME (Salary, Other Income). All top-level. All have a color and an icon.

If the seed didn't materialize, check Vercel/Neon logs (or local Postgres logs) for a transaction-rollback error. Per `lib/auth/actions.ts`'s signup transaction, a seed failure rolls back the entire signup — so if you successfully landed at `/dashboard`, the seed succeeded.

### 6b. Create a top-level category

1. On `/dashboard/categories`, click **+ Add category**.
2. The side sheet opens. Fill: name = `Pets`, kind = `EXPENSE`, parent = (leave blank — top-level), color = pick from the curated palette, icon = pick a relevant icon (e.g., `PawPrint`).
3. Click **Save**. The sheet closes and `Pets` appears in the EXPENSE column of the list.

### 6c. Create a child category

1. Click **+ Add category** again.
2. Fill: name = `Pet Food`, parent = `Pets` (from the CategoryPicker dropdown — kind auto-derived from parent).
3. Click **Save**. `Pet Food` appears indented under `Pets`.
4. Try to make `Pet Food` itself a parent (open it, set its parent to another row): the form rejects the attempt because `Pet Food` is already a child (single-level hierarchy rule, FR-006).

### 6d. Edit + archive + unarchive

1. Click any existing category row. The side sheet opens in edit mode pre-populated.
2. Rename, change color/icon, save. Verify the list reflects the change.
3. Click **Archive** on a row that has no children (e.g., `Other Expenses`). Confirm in the AlertDialog. The row disappears from the default list.
4. Toggle **Show archived**. The row reappears with the **Archived** badge.
5. Open it. Click **Unarchive**. The row returns to the default list.
6. Try to **archive a parent** (`Pets`) — the system allows it; the child (`Pet Food`) stays active. Document: archiving a parent does NOT auto-archive its children (per plan §Archive semantics).

### 6e. Kind-change blocked when the parent has children

1. Open `Pets` (which has a child `Pet Food`).
2. Try to change kind from `EXPENSE` to `INCOME`.
3. Save — the form rejects with an inline error (`kind_change_blocked`). You must first archive or reassign the children.

### 6f. Cross-user isolation

1. Open a fresh browser context (or incognito window).
2. Sign up a second user.
3. Visit `/dashboard/categories`. Verify the seed produced THIS user's own 11 categories — none of the first user's `Pets` or `Pet Food` rows are visible.

## 7. Run the unit + e2e suites

```bash
pnpm test            # 105 existing unit tests stay green
pnpm test:e2e        # 17 existing + new categories.spec.ts (categories CRUD + seed-on-signup)
```

The categories.spec.ts file lands in this feature; it covers the round-trip in 6a + 6b + 6c + 6d + 6f.

## 8. Where things live

| Concern | Path |
|---|---|
| Prisma schema | `db/schema.prisma` (Category model + CategoryKind enum + User.categories back-relation) |
| Migration | `db/migrations/<timestamp>_add_category/migration.sql` |
| Color allow-list | `lib/categories/colors.ts` (curated palette of ~12 named tokens) |
| Icon allow-list | `lib/categories/icons.ts` (curated set of ~30-60 lucide icons) |
| Default seed | `lib/categories/seed.ts` (the 11-category const array) |
| Server actions | `lib/categories/actions.ts` (5 actions) |
| Prisma helpers | `lib/categories/queries.ts` (the ONLY file with `prisma.category.*`) |
| Zod schemas | `lib/categories/schemas.ts` |
| Serializer | `lib/categories/serialize.ts` (Category → CategoryDTO) |
| Error catalog | `lib/categories/errors.ts` |
| Barrel | `lib/categories/index.ts` |
| Picker primitive | `components/categories/category-picker.tsx` |
| Page | `app/(shell)/dashboard/categories/page.tsx` |
| Page-local components | `app/(shell)/dashboard/categories/_components/{categories-list,category-form,category-form-sheet,archive-confirm-dialog,color-picker,icon-picker}.tsx` |
| Illustration | `components/illustrations/categories-illustration.tsx` |
| E2E | `tests/e2e/categories.spec.ts` |
| Sidebar nav update | `components/shell/nav-items.ts` (Categories added to MANAGE group) |
| Signup seed wiring | `lib/auth/actions.ts` (modified — adds `prisma.category.createMany` inside the signup transaction) |

## 9. Troubleshooting

- **Seed didn't run for a new user** — check that the signup form actually completed; if signup itself failed, the seed never ran (atomic with the user creation). Look in Postgres logs for transaction-rollback errors.
- **`@radix-ui/react-select` not found** — run `pnpm install` after pulling.
- **`prisma.category` not found in TypeScript** — run `pnpm db:generate` after applying the migration.
- **An e2e test assertion against the dashboard fails after this feature lands** — check that the assertion isn't counting table rows or otherwise sensitive to "user has 11 categories on signup." The branded-UI welcome panel already handles "X accounts" but doesn't yet display category count; if a future test does, it will need to expect 11 from a freshly-seeded user.
- **Categories sidebar item doesn't appear** — verify `nav-items.ts` was updated and that the MANAGE group now lists Budgets, Categories, Settings (in the order chosen by the plan).
