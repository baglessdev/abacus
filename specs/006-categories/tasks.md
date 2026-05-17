---

description: "Task list for feature 005 — Categories (roadmap number)"
---

# Tasks: Categories

**Input**: Design documents from `/specs/006-categories/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Roadmap number**: feature 005 — Categories. **Spec directory**: `specs/006-categories/` (sequential; spec slot 005 was consumed by the branded-UI polish chore).

**Tests**: Two new unit-test files (`tests/unit/categories-queries.test.ts`, `tests/unit/categories-seed.test.ts`) lock the parent-validation + seed-contents rules per spec **SC-013** (T010a, T011a in Phase 2). One new Playwright spec lands (`tests/e2e/categories.spec.ts`) covering the US1+US2+US3+US5 round-trip. Per FR-021 + the constitution Principle V, every existing Vitest unit suite (105 tests) and Playwright suite (17 tests) MUST continue to pass.

**Organization**: Tasks grouped by user story. The MVP is **US1 + US2 + US3 together** (the three P1 stories — seeded-on-signup + create + manage). US4 (picker contract preservation) and US5 (validation e2e) are P2 follow-ups.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other `[P]` tasks in the same phase (different files, no dependencies).
- **[Story]**: Maps task to user story (US1–US5). Setup / Foundational / Polish tasks have no story label.
- File paths are absolute repository paths under `/Users/rgederin/git/abacus/`.

## Path Conventions

Next.js 16 App Router layout (per [plan.md §Project Structure](./plan.md)). All paths repo-relative below.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One new dep + one new shadcn primitive required by the kind picker.

- [x] T001 Add `@radix-ui/react-select` to `package.json` (peer dep of the shadcn `<Select>` primitive). Run `pnpm install`. Verify `pnpm-lock.yaml` updates cleanly.
- [x] T002 Add shadcn `<Select>` primitive at `components/ui/select.tsx` (wraps `@radix-ui/react-select`). Match shadcn canonical source. Used by `<CategoryForm>`'s kind selector.

**Checkpoint**: `pnpm typecheck` + `pnpm lint` pass. Primitive importable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + migration + `lib/categories/` server surface + seed wiring. Every user story depends on these.

**⚠️ CRITICAL**: No user-story work begins until Phase 2 is complete.

### Database

- [x] T003 Update `db/schema.prisma` per [data-model.md](./data-model.md): add `model Category` (id, userId, parentId, name, kind, color, icon, archivedAt, createdAt, updatedAt) + `enum CategoryKind { INCOME EXPENSE }` + `User.categories Category[]` back-relation. Include 3 indexes (`@@index([userId])`, `@@index([userId, archivedAt])`, `@@index([userId, parentId])`). FK rules: `Category.userId → User.id ON DELETE CASCADE`; `Category.parentId → Category.id ON DELETE Restrict` (named relation `"CategoryHierarchy"`).
- [x] T004 Generate the migration: `pnpm exec prisma migrate dev --name add_category --schema=db/schema.prisma`. Verify `db/migrations/<timestamp>_add_category/migration.sql` is created and applied to local Postgres. Run `pnpm db:generate` to refresh the Prisma client. Verify the SQL contains: `CREATE TYPE "CategoryKind"`, `CREATE TABLE "Category"`, all 3 indexes, both FK constraints with the documented `ON DELETE` clauses.

### `lib/categories/` — allow-lists, errors, serialize

- [x] T005 [P] Create `lib/categories/colors.ts`: curated palette per [research.md R2](./research.md) — ~12 named color tokens (`violet`, `blue`, `cyan`, `teal`, `green`, `lime`, `yellow`, `orange`, `red`, `pink`, `slate`, `stone`). Each entry: `{ token: string, label: string, cssClass: string }` where `cssClass` is a Tailwind utility (e.g., `text-violet-500`). Export `CATEGORY_COLORS: readonly Color[]`, `CATEGORY_COLOR_TOKENS: ReadonlySet<string>`, `isCategoryColor(token): token is string`. Each color MUST meet WCAG AA against both light and dark backgrounds (document the verification).
- [x] T006 [P] Create `lib/categories/icons.ts`: curated lucide-icon allow-list per [research.md R3](./research.md) — ~30-60 lucide icon names. Each entry: `{ name: string, label: string, component: LucideIcon }`. Export `CATEGORY_ICONS: readonly CategoryIcon[]`, `CATEGORY_ICON_NAMES: ReadonlySet<string>`, `getCategoryIcon(name): CategoryIcon | undefined`, `isCategoryIcon(name): name is string`. MUST cover the 11 seed categories (Utensils for Food, Home for Housing, Car for Transport, Plug for Utilities, Film for Entertainment, HeartPulse for Health, ShoppingBag for Shopping, Scissors for Personal Care, Coins for Salary, Gift for Other Income, MoreHorizontal for Other Expenses) plus 20-40 common neighbors.
- [x] T007 [P] Create `lib/categories/seed.ts`: the **11-category default seed** per [spec.md FR-012](./spec.md). Export a structure that captures the parent/child relationship — e.g., `const DEFAULT_CATEGORIES: ReadonlyArray<{ name, kind, color, icon, children?: ReadonlyArray<{ name, color, icon }> }>`. The seed MUST consist of **EXACTLY**: (a) **seven top-level EXPENSE**: Food (Utensils, red), Housing (Home, orange), Transport (Car, yellow), Utilities (Plug, lime), Entertainment (Film, teal), Health (HeartPulse, cyan), Other Expenses (MoreHorizontal, slate); (b) **two top-level INCOME**: Salary (Coins, green), Other Income (Gift, violet); (c) **two child EXPENSE under "Food"**: Groceries (ShoppingBag, blue), Restaurants (Utensils, pink). Total = 7 + 2 + 2 = **11**. The two children MUST inherit `kind: EXPENSE` from their parent at seed time (FR-005, FR-009). Consumed by the modified `signUp` action in T014. **Do NOT add Shopping or Personal Care** — they are not in the spec's seed list.
- [x] T008 [P] Create `lib/categories/errors.ts`: error code constants per [plan.md §Error envelope](./plan.md) — `unauthenticated`, `validation_failed`, `not_found`, `hierarchy_violation`, `kind_change_blocked`, `internal_error`. Export `errorEnvelope(code, opts?)` helper producing `{ code, message, ...opts }`. Each code has a canonical user-facing message.
- [x] T009 [P] Create `lib/categories/serialize.ts`: `serializeCategory(row: Category): CategoryDTO`. Converts `Date` → ISO string. No business logic. The DTO shape: `{ id, userId, parentId, name, kind, color, icon, archivedAt: string | null, createdAt, updatedAt }`. No `Decimal` fields — Categories store no money (Principle I N/A).

### `lib/categories/` — schemas, queries, actions

- [x] T010 Create `lib/categories/schemas.ts`: five Zod schemas — `createCategorySchema`, `updateCategorySchema`, `archiveCategorySchema`, `unarchiveCategorySchema`, `listCategoriesSchema`. The `name` field MUST be `z.string().trim().min(1).max(80)`. The `color` field MUST use `isCategoryColor` from T005. The `icon` field MUST use `isCategoryIcon` from T006. The `kind` field MUST be `z.enum(["INCOME", "EXPENSE"])`. `parentId` is optional `z.string().nullable().optional()` — single-level + kind-matching are enforced at the queries layer (T011), not in the schema. (Depends on T005, T006.)
- [x] T011 Create `lib/categories/queries.ts`: helpers — `listCategoriesForUser(userId, { includeArchived })`, `getCategoryForUser(userId, id)`, `createCategoryForUser(userId, input)`, `updateCategoryForUser(userId, id, input)`, `setArchivedAtForUser(userId, id, value: Date | null)`, `hasChildrenForUser(userId, id)`. **First positional arg of every helper is `userId`** ([plan.md R11](./plan.md)). Every Prisma `where:` clause includes `userId`. **This file is the ONLY file in the app that imports `prisma.category.*` going forward.** Specific rules: (a) `listCategoriesForUser` applies `orderBy: { name: "asc" }` per FR-019 (deterministic alphabetical sort, stable across reloads); (b) the parent fetch inside `createCategoryForUser`/`updateCategoryForUser` uses `getCategoryForUser(userId, parentId)` — this naturally collapses cross-user `parentId` references to a not-found-style error per FR-009 + FR-013 (the where-clause scopes by userId, so a foreign-owned parent returns null and the create fails with `HierarchyViolationError` or equivalent); (c) when `parentId` is provided, reject if `parent.parentId !== null` (single-level rule, throws `HierarchyViolationError`); (d) reject if `parent.kind !== input.kind` (kind-mismatch rule, throws `HierarchyViolationError`); (e) reject if `parentId === id` (no self-parent, throws `HierarchyViolationError`); (f) on update: if changing `kind` and `hasChildrenForUser` returns true, throw `KindChangeBlockedError`. (Depends on T004.)
- [x] T012 Create `lib/categories/actions.ts`: five `"use server"` server actions per `contracts/`. Per-action flow: (1) `await auth()` — on missing session return `unauthenticated` envelope; (2) Zod `safeParse` — on failure return `validation_failed` envelope with `fieldErrors`; (3) call the relevant `queries.ts` helper with `session.user.id`; (4) catch `HierarchyViolationError` → `hierarchy_violation` envelope; catch `KindChangeBlockedError` → `kind_change_blocked` envelope; (5) on read returning `null` → `not_found` envelope; (6) `archiveCategory` MUST set `archivedAt = new Date()` server-side, never accept a client-supplied timestamp; (7) on success return `{ data: { category: serializeCategory(row) } }` or `{ data: { categories: rows.map(serializeCategory) } }`; (8) call `revalidatePath("/dashboard/categories")` after every successful mutation. Use `auth()` from `@/lib/auth`. (Depends on T008, T009, T010, T011.)
- [x] T013 Create `lib/categories/index.ts`: server-only barrel re-exporting the five actions, the `CategoryDTO` type, and the error-code union. Include `import "server-only"`. (Depends on T012.)
- [x] T013a Create `tests/unit/categories-seed.test.ts`: lock the seed contents per spec **SC-013** + **FR-012**. Assertions: `DEFAULT_CATEGORIES` has exactly 9 top-level entries; 7 of them have `kind: EXPENSE` and 2 have `kind: INCOME`; the EXPENSE entries' names match exactly `["Food", "Housing", "Transport", "Utilities", "Entertainment", "Health", "Other Expenses"]` (any order); the INCOME entries' names match exactly `["Salary", "Other Income"]`; the "Food" entry has exactly 2 children named "Groceries" and "Restaurants" (children kind is inherited as EXPENSE at seed time); every entry has a non-empty `color` (member of `CATEGORY_COLOR_TOKENS`) and a non-empty `icon` (member of `CATEGORY_ICON_NAMES`); no other entry has children. (Depends on T005, T006, T007.)
- [x] T013b Create `tests/unit/categories-queries.test.ts`: lock the parent-validation + kind-change-blocked rules per spec **SC-013** + **FR-005/006/009**. Pure-function tests against a minimal in-memory Prisma mock OR against a transactional test fixture (spec doesn't mandate which — pick whichever is faster). Assertions: (a) creating a child with `parentId` whose parent is already a child fails with `HierarchyViolationError` (would-be-grandchild rule, FR-006); (b) creating a child with `parentId.kind !== input.kind` fails with `HierarchyViolationError` (kind-mismatch rule, FR-005); (c) creating a category with `parentId === id` fails (no self-parent, FR-006 — likely tested by mutating an updateInput); (d) updating `kind` on a parent that has children fails with `KindChangeBlockedError` (FR-005); (e) updating `kind` on a parent with NO children succeeds; (f) `listCategoriesForUser` returns rows ordered by `name` ascending (FR-019). (Depends on T011.)

### Signup seed wiring

- [x] T014 Modify `lib/auth/actions.ts` — extend the existing `signUp` server action to seed the 11 default categories inside the same `prisma.$transaction` that creates the `User` row. **Because the seed includes parent/child relationships** (the two children "Groceries" and "Restaurants" reference "Food" as their parent — FR-012), `createMany` is insufficient. Use a **two-pass insert** inside the SAME transaction: (1) `tx.category.createMany(...)` for the 9 top-level rows (7 EXPENSE + 2 INCOME), then (2) fetch the inserted "Food" row's id via `tx.category.findFirst({ where: { userId: newUser.id, name: "Food", parentId: null } })`, then (3) `tx.category.createMany(...)` for the 2 children with `parentId` set to Food's id. **All three operations are inside the same `prisma.$transaction` callback**, so if ANY step fails, the user creation AND all categories roll back (atomic per [spec.md FR-012, SC-008](./spec.md)). Import `DEFAULT_CATEGORIES` from `@/lib/categories/seed` (the seed file, NOT the barrel — keep the barrel server-only and the seed importable from the auth action). (Depends on T007 + T004.)

**Checkpoint**: `pnpm typecheck` + `pnpm lint` + `pnpm test` (105 existing + ~10 new from T013a/T013b = 115+ unit tests) pass. `pnpm exec prisma migrate status --schema=db/schema.prisma` reports "Database schema is up to date." `grep -rn "prisma\.category" --include="*.ts" --exclude-dir=node_modules .` returns matches ONLY in `lib/categories/queries.ts` AND `lib/auth/actions.ts` (the seed write inside signup — documented exception). Sign up a fresh user manually and verify Postgres has 11 rows in `Category` for that user (9 top-level + 2 children under Food).

---

## Phase 3: User Story 1 — Empty state replaced by seed (Priority: P1) 🎯 MVP-START

**Goal**: A newly-signed-up user visiting `/dashboard/categories` immediately sees 11 seeded categories grouped by kind — not a sparse empty state.

**Independent Test**: Sign up a fresh user → navigate to `/dashboard/categories` via the MANAGE sidebar group → assert the page shows 11 rows (9 EXPENSE + 2 INCOME) grouped by kind with their seed name, color, and icon. Reload — same 11 rows. Sign up a second user in a fresh browser context, navigate to `/dashboard/categories` — that user also sees their own 11 seeded categories (cross-user isolation).

### Implementation for User Story 1

- [x] T015 [US1] [P] Create `components/illustrations/categories-illustration.tsx`: stroke-based, monochrome with one violet accent, ~120×120 viewBox. Visual: stacked colored labels or tag-cluster glyph. Static inline React SVG. No animation. Consistent with the brand-mark aesthetic established by the branded-UI polish chore. `aria-hidden="true"`.
- [x] T016 [US1] Create `app/(shell)/dashboard/categories/_components/categories-list.tsx`: client component, props `{ initialCategories: CategoryDTO[] }`. State: `categories`, `sheetOpen`, `sheetMode`, `editingCategory`, `showArchived`, `archiveTarget`. Renders the categories grouped by `kind` — two visual sections (INCOME column / EXPENSE column OR two stacked sections, plan-level layout choice). Within each kind, top-level categories are rendered first; children indented under their parents. Each row shows the lucide icon (from `getCategoryIcon(name).component`), the colored name, and trailing actions. Above the listing: "+ Add category" button + "Show archived" `<Switch>` (default off). Use `<Money>` is NOT needed (categories have no money). Use the upgraded `<EmptyState>` from `components/shell/empty-state.tsx` with `illustration={<CategoriesIllustration />}` ONLY when `categories.length === 0` (rare — only fires if all categories archived).
- [x] T017 [US1] Replace `app/(shell)/dashboard/categories/page.tsx`: server component. Imports `auth` from `@/lib/auth`, `listCategories` from `@/lib/categories`, `redirect` from `next/navigation`, and `<CategoriesList>`. Flow: (1) `await auth()` (defense in depth — middleware already protects `/dashboard/*`); (2) call `await listCategories({ includeArchived: false })`; (3) on `error.code === "unauthenticated"` redirect; (4) on other errors throw to bubble to `error.tsx`; (5) render `<CategoriesList initialCategories={result.data.categories} />`. Create the route directory if it doesn't exist. (Depends on T013, T016.)
- [x] T018 [US1] Update `components/shell/nav-items.ts`: add `Categories` to the MANAGE group, position next to Budgets (e.g., between Budgets and Settings). Use the lucide `Tags` icon (or similar) for the nav-item icon. The flat `navItems` back-compat re-export from feature 005 (branded-UI polish) stays consistent.
- [x] T019 [US1] Create `tests/e2e/categories.spec.ts` with the US1 round-trip: `test.beforeAll` truncates `Category` and `User`; sign up a fresh user; navigate to `/dashboard/categories` (via sidebar click — verifies T018); assert the page shows 11 rows; assert at least one EXPENSE row (e.g., `Food`) and one INCOME row (e.g., `Salary`) are visible with their seed names. Reload — same 11 rows. Add a second `test.describe` block: open a fresh browser context, sign up a second user, navigate to `/dashboard/categories`, assert that user has 11 categories AND none of the first user's categories are visible. (Per FR-014 + SC-003.)

**Checkpoint**: US1 fully functional. MVP shippable here for "demonstrate the feature exists with seeded defaults".

---

## Phase 4: User Story 2 — Create a new category (Priority: P1)

**Goal**: A user can create a new category (top-level or as a child of an existing parent) with a chosen name, kind, color, and icon. The category appears in the list and is available for selection in the (future-consumed) `<CategoryPicker>`.

**Independent Test**: From a user with the 11 seed categories, click "+ Add category"; fill name = `Pets`, kind = `EXPENSE`, parent = (blank), color = pick, icon = pick; submit. Assert sheet closes and `Pets` appears in the EXPENSE section. Click "+ Add category" again; fill name = `Pet Food`, parent = `Pets` (kind auto-derived as EXPENSE); submit. Assert `Pet Food` appears indented under `Pets`.

### Implementation for User Story 2

- [x] T020 [US2] Create `components/categories/category-picker.tsx`: the `<CategoryPicker>` UI contract surface per [contracts/CategoryPicker.md](./contracts/CategoryPicker.md). Props: `{ value: string | null, onChange: (id: string | null) => void, kind?: "INCOME" | "EXPENSE", includeArchived?: boolean, disabled?, allowNone?: boolean }`. Uses shadcn `<Command>` inside `<Popover>` (existing primitives from feature 004). Fetches via `listCategories` on mount (memoize per `kind`). **Behavior per spec FR-018**: (a) when `kind` is set, filters to that-kind categories; when omitted, shows BOTH kinds **grouped by `kind`** with visible section headers (INCOME group, EXPENSE group); (b) **visually expresses the parent/child hierarchy** — children render indented under their parents (e.g., 2 spaces of left padding, or a visible tree-line); (c) **selecting a parent and selecting a child are independent picks** — picking "Food" does NOT auto-pick "Groceries", and picking "Groceries" does NOT auto-pick "Food"; each option returns its own stable id via `onChange`. When `includeArchived` is false (default), filters out archived rows (FR-011). Renders icon + colored name per row (name is the primary visual signal — color is NOT the sole carrier per FR-020). Used by this feature's `<CategoryForm>` (for parent selection — typically with a specific `kind`) AND future-consumed by feature 006 (Transactions) and 008 (Budgets) per [plan.md R12](./plan.md).
- [x] T021 [US2] [P] Create `app/(shell)/dashboard/categories/_components/color-picker.tsx`: client component. Props: `{ value: string, onChange: (token: string) => void }`. Renders a grid of buttons (one per `CATEGORY_COLORS` entry) — each button shows a colored circle + the label, with the selected state visually indicated. Keyboard-accessible (Tab through buttons, Enter/Space to select).
- [x] T022 [US2] [P] Create `app/(shell)/dashboard/categories/_components/icon-picker.tsx`: client component. Props: `{ value: string, onChange: (name: string) => void }`. Renders a grid or scrollable list of `CATEGORY_ICONS` entries — each rendering the icon component + label. Selected state indicated. Keyboard-accessible. May use shadcn `<Command>` for search if the icon list is large.
- [x] T023 [US2] Create `app/(shell)/dashboard/categories/_components/category-form.tsx`: client component, props `{ mode: "create" | "edit" | "edit-archived", category?: CategoryDTO, onSuccess: () => void }`. For US2, implement the `"create"` branch fully; stub `"edit"` and `"edit-archived"` with `// TODO US3` comments. Fields (create): name (`<Input>`), kind (shadcn `<Select>` with INCOME/EXPENSE), parent (`<CategoryPicker>` filtered to the chosen kind), color (`<ColorPicker>`), icon (`<IconPicker>`). When parent is chosen, kind is derived from the parent and the kind selector becomes read-only. Wire to `createCategory` via React 19's `useActionState`. Display Zod field errors per field. (Depends on T013, T020, T021, T022.)
- [x] T024 [US2] Create `app/(shell)/dashboard/categories/_components/category-form-sheet.tsx`: client component wrapping shadcn `<Sheet>`. Props: `{ open, onOpenChange, mode, category? }`. Renders `<CategoryForm>` inside `<SheetContent>` with appropriate title per mode ("Add category" / "Edit category" / "Edit archived category"). Closes via `onOpenChange(false)` when `<CategoryForm>` calls `onSuccess`. (Depends on T023.)
- [x] T025 [US2] Update `app/(shell)/dashboard/categories/_components/categories-list.tsx`: wire the "+ Add category" button to open the `<CategoryFormSheet>` in `"create"` mode. After successful create, re-fetch via `listCategories({ includeArchived: showArchived })` and replace local state (pessimistic UI matches the Accounts feature pattern). (Depends on T024, T016.)
- [x] T026 [US2] Add US2 e2e block to `tests/e2e/categories.spec.ts`: from a fresh user, create a top-level category (`Pets / EXPENSE / red / PawPrint` or similar). Assert sheet closes and `Pets` appears in the EXPENSE section. Then create a child category (`Pet Food`, parent = `Pets`); assert the form's kind selector becomes read-only when parent is selected; assert `Pet Food` appears indented under `Pets` after save.

**Checkpoint**: US1 + US2 form the MVP — a user can sign up, see seeded categories, and create their own (top-level + child). Ships as a usable feature increment.

---

## Phase 5: User Story 3 — Edit / archive / unarchive (Priority: P1)

**Goal**: A user can rename a category, change its color/icon/kind (with the kind-change-blocked rule for parents-with-children), archive it (soft delete), and unarchive it. Archived categories don't appear in the default `<CategoryPicker>` but appear in the admin list with "Show archived" on.

**Independent Test**: From a user with the seed + a custom `Pets` category, click the `Pets` row → edit sheet opens pre-populated → rename to `Pets & Animals` → submit. Assert the new name in the list. Open it again → click `Archive` → confirm in the `AlertDialog` → the row disappears from the default list. Toggle `Show archived` → row reappears with `Archived` badge. Click the archived row → assert the edit sheet opens in `edit-archived` mode with `name` editable but `kind`/`color`/`icon` read-only (matching the Accounts FR-009a pattern for consistency). Click `Unarchive` → row returns to default list. Try to change `kind` of a category that has children → form rejects with `kind_change_blocked` inline error.

### Implementation for User Story 3

- [x] T027 [US3] Extend `app/(shell)/dashboard/categories/_components/category-form.tsx`: implement the `"edit"` and `"edit-archived"` branches per [plan.md §Edit/create form](./plan.md). `"edit"`: pre-populate from `category` prop; name editable; kind editable (subject to T011's kind-change-blocked rule — if the action returns `kind_change_blocked`, show the inline error); parent picker editable; color + icon pickers editable. Hidden `<input type="hidden" name="id" value={category.id} />`. `"edit-archived"`: same as edit BUT only `name` is editable; `kind`, `color`, `icon`, `parent` are all disabled (consistency with Accounts FR-009a pattern). Add an inline caption "This category is archived. Only the name can be edited while archived."
- [x] T028 [US3] Create `app/(shell)/dashboard/categories/_components/archive-confirm-dialog.tsx`: client component. Props: `{ categoryId, categoryName, open, onOpenChange, onArchived }`. Renders shadcn `<AlertDialog>` with title "Archive this category?" and description `Archive {name}? You can unarchive it later — your data is not deleted.`. On Archive action, call `archiveCategory` via `useTransition`. On success, call `onArchived()` then close. (Mirrors Accounts feature's archive-confirm-dialog from feature 004.)
- [x] T029 [US3] Extend `app/(shell)/dashboard/categories/_components/categories-list.tsx`: wire row click → open edit sheet (mode `edit` for active, `edit-archived` for archived). Wire row trailing buttons (`Archive` for active, `Unarchive` for archived). On archive, open the `<ArchiveConfirmDialog>`. On unarchive, directly call `unarchiveCategory` via `useTransition`. After every successful mutation, re-fetch via `listCategories({ includeArchived: showArchived })`. Add `<Badge variant="secondary">Archived</Badge>` for archived rows. (Depends on T027, T028.)
- [x] T030 [US3] Add US3 e2e blocks to `tests/e2e/categories.spec.ts`: (a) edit name flow — click an existing row, rename, save, assert new name in list; (b) archive flow — click trailing "Archive", confirm in dialog, assert row disappears from default list, toggle "Show archived", assert reappearance with Badge; (c) archived-row field lock — click archived row, assert `name` input enabled but `kind`/`color`/`icon` controls disabled; (d) unarchive flow — click "Unarchive", toggle off "Show archived", assert row in active list; (e) kind-change-blocked — try to change `kind` of `Pets` (which has child `Pet Food`), assert form shows the inline error and persisted row unchanged.

**Checkpoint**: All three P1 user stories complete. MVP+ shippable.

---

## Phase 6: User Story 4 — Picker primitive contract (Priority: P2)

**Goal**: The `<CategoryPicker>` primitive contract is preserved for downstream consumption by features 006 (Transactions) and 008 (Budgets). The primitive correctly filters by kind, respects the `includeArchived` flag, and the `allowNone` option works.

**Independent Test**: Verify the picker's behavior end-to-end via e2e in the create form context — the same UI is exercised in US2's tests, but here we add focused assertions on the picker's filter behavior.

### Implementation for User Story 4

- [x] T031 [US4] Add e2e block to `tests/e2e/categories.spec.ts` verifying picker filter behavior: open the create form, select kind = `INCOME`, open the parent picker. Assert ONLY income categories are listed (Salary, Other Income, plus any custom income categories). Cancel, select kind = `EXPENSE`, open the parent picker. Assert ONLY expense categories are listed (no Salary, no Other Income). Archive a category, re-open the picker. Assert the archived category is NOT in the list (default `includeArchived: false`).

**Checkpoint**: Picker contract verified for downstream features. No new components — US4 is e2e-only verification.

---

## Phase 7: User Story 5 — Validation surfaces actionable errors (Priority: P2)

**Goal**: Invalid input (blank name, name too long, invalid color, invalid icon, parent already a child, kind mismatch with parent, kind-change-blocked on parent-with-children) is rejected at the Zod boundary OR the queries layer with a field-scoped or action-scoped error.

**Independent Test**: For each invalid input, submit the form and assert the error message is visible near the offending field; the form does not close; the persisted state is unchanged.

### Implementation for User Story 5

- [x] T032 [US5] Add validation e2e block to `tests/e2e/categories.spec.ts`: from the create form, attempt to submit with each invalid input and verify rejection: (a) blank/whitespace-only name → name field error, no row added; (b) 81-character name → length error, no row added; (c) attempt to set parent to a category that's already a child (hierarchy violation — needs setup: create a child first, then try to use that child as the parent of a new category) → assert `hierarchy_violation` error; (d) attempt to set parent of one kind to a parent of the OTHER kind (kind mismatch) → assert validation error; (e) on an existing parent-with-children category, change kind → assert `kind_change_blocked` error and persisted row unchanged.

**Checkpoint**: All five user stories pass independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verification — every existing test stays green, type/lint/format pass, data-scoping audit, manual quickstart walkthrough.

- [X] T033 Run `pnpm typecheck` from the repo root — zero errors, zero `any` introduced.
- [X] T034 Run `pnpm lint` from the repo root — zero errors.
- [X] T035 Run `pnpm format` to apply Prettier across modified files, then `pnpm format:check` to verify clean.
- [X] T036 Run `pnpm test` from the repo root — all 105 unit tests still green (no new unit tests added by this feature; FR-021 binds preservation).
- [X] T037 Run `pnpm test:e2e` from the repo root — 17 existing e2e tests + new categories.spec.ts blocks all pass.
- [X] T038 Data-scoping audit: from the repo root, run `grep -rnE "prisma\.category" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=specs --exclude-dir=.specify .` and verify the ONLY file with matches is `lib/categories/queries.ts` (plus possibly `tests/e2e/categories.spec.ts` for test setup, which is acceptable). Any match elsewhere is a data-scoping convention violation.
- [X] T039 Manual walkthrough per [quickstart.md](./quickstart.md): drop local DB (`pnpm db:reset && pnpm db:migrate`), sign up a fresh user, verify 11 seeded categories, create a top-level + child, edit + archive + unarchive, verify cross-user isolation. Confirm all 14 spec acceptance scenarios + 14 edge cases.

**Final checkpoint**: Categories feature is mergeable. Constitution v0.2.0 compliant; data-scoping convention enforced; no new domain-arithmetic introduced; existing 105 unit + 17 e2e tests preserved.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup** (T001 deps + T002 select primitive) — must complete first.
- **Phase 2 — Foundational** (T003–T014) depends on Phase 1.
  - T003 → T004 (migration needs the schema change).
  - T004 → T011 + T014 (`prisma.category` types need the generated client).
  - T005 / T006 / T007 / T008 / T009 — all `[P]` (different files, no inter-deps).
  - T005 + T006 → T010 (schemas need the allow-lists).
  - T009 + T010 + T011 + T008 → T012 (actions need all the above).
  - T012 → T013 (barrel).
  - T007 + T004 → T014 (seed wiring needs the seed array + the Prisma client).
- **Phase 3 (US1)** depends on Phase 2. T015 / T016 / T018 are parallelizable; T017 depends on T016; T019 depends on T017 + T018.
- **Phase 4 (US2)** depends on Phase 2. T020 / T021 / T022 are parallelizable; T023 depends on T020 + T021 + T022; T024 → T023; T025 depends on T024 + T016; T026 depends on T025.
- **Phase 5 (US3)** depends on Phase 4 (extends US2 components). T027 + T028 are parallelizable; T029 depends on T027 + T028; T030 depends on T029.
- **Phase 6 (US4)** and **Phase 7 (US5)** are e2e-only on top of US1+US2+US3. Independent of each other.
- **Phase 8 (Polish)** depends on all earlier phases.

### Parallel opportunities

- **Phase 2**: T005, T006, T007, T008, T009 all `[P]` (5 files, no inter-deps).
- **Phase 3**: T015 / T016 / T018 parallelize.
- **Phase 4**: T021 / T022 parallelize after T020.
- **Phase 5**: T027 + T028 parallelize.

---

## Parallel Example: Phase 2 allow-lists + errors + serialize

```bash
# After T004 (migration applied) lands:
Task: "Create lib/categories/colors.ts (12 named tokens, WCAG AA verified)"
Task: "Create lib/categories/icons.ts (30-60 lucide icons covering seed + neighbors)"
Task: "Create lib/categories/seed.ts (11-category const array)"
Task: "Create lib/categories/errors.ts (6 error codes + envelope helper)"
Task: "Create lib/categories/serialize.ts (Category → CategoryDTO)"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 — the three P1 stories)

1. Complete Phase 1: Setup (T001–T002).
2. Complete Phase 2: Foundational (T003–T014) — the bulk of the work; schema, migration, server surface, seed wiring.
3. Complete Phase 3: US1 (T015–T019) — page renders the 11 seeded categories.
4. Complete Phase 4: US2 (T020–T026) — create flow with pickers.
5. Complete Phase 5: US3 (T027–T030) — edit/archive/unarchive.
6. **STOP and VALIDATE**: run polish audits (T033–T039). MVP is shippable here.

### Incremental Delivery

1. MVP (US1 + US2 + US3) ships first.
2. Add US4 (T031) — picker contract e2e. Ship.
3. Add US5 (T032) — validation e2e. Ship.

### What can be safely cut under schedule pressure

- T031 (US4 picker filter e2e) — picker is exercised via US2's create flow anyway; the focused filter test is belt-and-braces.
- T032 (US5 validation e2e) — Zod's per-field error rendering is the actual safety net; e2e is verification.

### What CANNOT be cut

- T003–T014 — the foundational layer; everything depends on it.
- T014 (seed inside signup transaction) — without it, US1 collapses to "user lands on empty page" which is the legacy bad UX we're explicitly fixing.
- T011 (queries.ts hierarchy + kind-mismatch checks) — without these, the data model accepts invalid trees.
- T038 (data-scoping audit) — the second feature to exercise the convention; must be guarded.

---

## Traceability: spec FRs → tasks

| FR | Covered by |
|---|---|
| FR-001 (Category domain model + migration) | T003, T004 |
| FR-002 (`userId` FK with cascade) | T003, T011 |
| FR-003 (queries scoped to session userId) | T011, T012, T038 |
| FR-004 (name validation) | T010 |
| FR-005 (kind enum) | T003, T010 |
| FR-006 (single-level hierarchy + cycle-free) | T011 (parent.parentId check) |
| FR-007 (kind matches between parent and child) | T011 |
| FR-008 (color allow-list) | T005, T010 |
| FR-009 (icon allow-list) | T006, T010 |
| FR-010 (archive soft, reversible) | T011, T012, T029 |
| FR-011 (kind-change blocked on parent-with-children) | T011 (hasChildrenForUser check), T012, T030 |
| FR-012 (default seed atomic with signup; 11 entries incl. 2 children under Food) | T007, T013a, T014, T019 |
| FR-013 (Zod at boundary; helpers trust) | T010, T012 |
| FR-014 (cross-user collapse to not_found) | T011, T012, T019 |
| FR-015 (error envelope shape) | T008, T012 |
| FR-016 (sidebar MANAGE-group placement) | T018 |
| FR-017 (top-level route `/dashboard/categories`) | T017 |
| FR-018 (side-sheet edit UX) | T024 |
| FR-019 (picker primitive contract) | T020, T031 |
| FR-020 (accessibility — labels, keyboard, no color-only meaning) | T016, T021, T022, T023 |
| FR-021 (strict TS, no `any`) | all tasks + T033 |
| FR-022 (FR-040 preservation — existing tests pass) | T036, T037 |
| SC-008 (signup-rollback on seed failure) | T014 (atomic transaction), T013b (boundary tests) |
| SC-013 (new unit tests for parent + seed) | T013a (seed contents), T013b (parent-validation + sort) |
| SC-001..SC-014 (other measurable outcomes) | all have at least one task or audit |

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps a task to its user story; Setup / Foundational / Polish tasks have no story label.
- The seed (T014) sits in `lib/auth/actions.ts`'s signup transaction, NOT in `lib/categories/`. This is a deliberate boundary choice (the seed wires into auth lifecycle, not into the categories module).
- `prisma.category.*` MUST appear in ONLY `lib/categories/queries.ts` (the data-scoping convention; verified by T038). The signup seed in T014 uses `tx.category.createMany` which is INSIDE the auth transaction — this is the documented exception (one extra match in `lib/auth/actions.ts`); update T038 to allow that one file as well.
- Commit after each task or each tight logical group (e.g., one commit for T005+T006+T007 as "category allow-lists + seed").
- The implementer SHOULD NOT skip the `kind_change_blocked` rule (T011) — it's the rule that prevents silent data corruption when a user tries to flip a parent's kind while children exist.
- Avoid: vague tasks, same-file `[P]` conflicts, cross-story dependencies that break independence.
