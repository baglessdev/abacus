# Implementation Plan: Categories

**Branch**: `006-categories` | **Date**: 2026-05-17 | **Spec**: [`spec.md`](./spec.md)

**Status**: READY_FOR_BUILD

**Constitution baseline**: `.specify/memory/constitution.md` v0.2.0 (multi-user from day one; data-scoping convention binding from feature 004 onward).

## Summary

This feature lands the **second domain entity** in Abacus — `Category` — and exercises the data-scoping convention established by feature 004 (`Account`) for the first time on a non-money-touching model. It introduces the `Category` Prisma model (self-referential `parentId`, `CategoryKind` enum, three indexes), the `lib/categories/` module (server actions + Zod schemas + Prisma helpers that always inject `userId` from the session), two curated allow-lists in `lib/categories/colors.ts` and `lib/categories/icons.ts` (the run-time vocabulary the form, the picker, and the seed all share), a static `lib/categories/seed.ts` const, a **modification to the `signUp` action** in `lib/auth/actions.ts` that wraps user creation + category seeding in a single Prisma transaction (FR-012), the real `/dashboard/categories` UI (server-rendered list grouped by `kind` with children nested under parents, side-sheet form mirroring feature 004's accounts pattern), and the canonical `<CategoryPicker>` primitive that features 006 (Transactions) and 008 (Budgets) will plug into without forking. Archive is soft-only; cross-user reads collapse to a `not_found` envelope. The constitution's money-paths gate is N/A here — categories store no money — so the existing money unit suite is the bar that must keep passing, untouched.

## Technical Context

| Field | Value |
|---|---|
| **Language / Version** | TypeScript 5.x (strict), React 19, Node 20.x — unchanged from feature 004 |
| **Framework** | Next.js 16 (App Router), Auth.js v5 (NextAuth), Prisma 7 — unchanged |
| **Storage** | PostgreSQL 16 (docker-compose, local only) — unchanged |
| **ORM driver** | `@prisma/adapter-pg` — unchanged |
| **Auth** | Auth.js Credentials + JWT-only sessions (from feature 003); `await auth()` at server-action boundary; **`userId` from session, never request input** |
| **Money** | N/A this feature (categories classify money, they do not hold it). `lib/money/` is not touched. |
| **Color allow-list** | Bundled `lib/categories/colors.ts` const, 12 curated tokens with HSL values that meet WCAG AA against both themes |
| **Icon allow-list** | Bundled `lib/categories/icons.ts` const, ~40 curated `lucide-react` icon names; each entry exposes `{ name, label, component }` |
| **Seed mechanism** | `lib/categories/seed.ts` exports the static 11-row `DEFAULT_CATEGORIES` const; `signUp` action runs `prisma.$transaction([userCreate, categoriesCreate])` so seed is atomic with user creation (FR-012) |
| **UI primitives in use** | All shadcn primitives from feature 004 (`button`, `input`, `label`, `card`, `sheet`, `command`, `popover`, `switch`, `alert-dialog`, `table`, `badge`) plus `select` for the kind dropdown |
| **New runtime deps** | `@radix-ui/react-select` only — every other primitive already shipped with feature 004 |
| **Validation** | Zod at every server-action input boundary; structural rules (kind-match, single-level, no-self-parent) live in `lib/categories/schemas.ts` via async `superRefine` calls that consult `lib/categories/queries.ts` |
| **Testing** | Vitest (unit) — new suite covering FR-005, FR-006, FR-009 and the seed-data shape (SC-013); Playwright (E2E) — one categories spec covering signup-seed + CRUD round-trip + cross-user isolation |
| **Target platform** | Local dev only (no production deployment in scope) |
| **Performance** | One Prisma roundtrip per mutation; list query is a single indexed read; picker materializes once per consumer mount; sub-100ms perceived latency on every interaction |
| **Constraints** | No `db push` (FR-001); `userId` is the FK and the filter on every query (FR-002, FR-003); single-level depth enforced at boundary (FR-006); kind of a parent-with-children is immutable (FR-005); archive is soft, never hard delete (FR-010) |
| **Scale** | "A few dozen top-level categories with single-level children" per spec; no enforced hard limit |

## Constitution Check

*Evaluated against `.specify/memory/constitution.md` v0.2.0. Re-evaluated after Phase 1 design (see end of doc).*

| Principle | Applicability | Status | Note |
|---|---|---|---|
| **I — Money math is non-negotiable** | NO | N/A | Categories store no money. No `Decimal` column; no currency; no arithmetic. `lib/money/` is not imported anywhere in `lib/categories/`. |
| **II — Type safety end-to-end** | YES | PASS | Strict TS; no `any`. Zod schemas at every server-action input boundary (FR-021). `CategoryKind` is a Prisma-generated enum re-exported as a TS literal union for the schemas. `Category[]` back-relation is added to `User`. |
| **III — Validate at boundaries, trust internally** | YES | PASS | The five server actions each `safeParse` before any helper call. The structural parent rules (FR-006, FR-009) are enforced inside the schema via `superRefine` that consults a single read of the candidate parent row through `getCategoryForUser`. Internal helpers in `queries.ts` trust their typed inputs (FR-014). Auth checked at action boundary only. |
| **IV — Test the money paths** | NO | N/A | This feature adds no money paths. The four existing money-suite tests from feature 004 are not touched and must keep passing (SC-013). The new unit suite covers the parent-validation rules and the seed contents per spec FR-022 line item. |
| **V — Spec-driven development** | YES | PASS | Spec exists, approved, **0 open clarifications** (resolved in the 2026-05-17 session). Plan flows spec → plan → tasks per the standard workflow. Single feature in flight (`006-categories`); no parallel branches. |

**Conventions check.**

| Convention | Status | Note |
|---|---|---|
| Folder layout (`app/`, `lib/`, `components/`, `db/`, `tests/`) | PASS | All new files land under these. New: `lib/categories/`, `app/(shell)/dashboard/categories/_components/`, `components/categories/`, `components/illustrations/categories-illustration.tsx`. |
| **Money helpers — all monetary operations go through `lib/money/`** | N/A | No monetary operations in this feature. |
| Migrations (no `db push`) | PASS | One generated migration: `db/migrations/<timestamp>_add_category/migration.sql`. FR-001. |
| Secrets (`.env.local` only) | PASS | No new env vars. |
| API response envelope `{ data } \| { error: { code, message } }` | PASS | All five server actions return this shape; six error codes (see contracts). |
| Dates UTC | PASS | `createdAt`, `updatedAt`, `archivedAt` all `DateTime` (UTC). |
| CSV exports | N/A | Not in this feature. |
| **Data scoping — every domain row owned by `userId`; queries filter by session** | PASS | **Second feature to exercise this rule.** `Category.userId` FK with `ON DELETE CASCADE`. Every helper in `lib/categories/queries.ts` takes `userId` as the first positional arg; supplied from `session.user.id`. No action accepts `userId` from request input (FR-003, FR-013). Self-referential `parentId` FK uses `ON DELETE RESTRICT` so archiving a parent does not silently delete its children. |

**No violations.** No justification required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-categories/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log (R1..R20)
├── data-model.md        # Phase 1 — Category model + indexes + scoping rule + future-FK note
├── quickstart.md        # Phase 1 — local-run delta over features 001–005
├── contracts/           # Phase 1 — one file per server action + the picker UI contract
│   ├── README.md
│   ├── createCategory.md
│   ├── updateCategory.md
│   ├── archiveCategory.md
│   ├── unarchiveCategory.md
│   ├── listCategories.md
│   └── CategoryPicker.md
├── spec.md              # Approved, 0 open clarifications
└── tasks.md             # Phase 2 — produced by /speckit-tasks
```

### Source code (after this feature)

```text
abacus/
├── app/
│   ├── (shell)/dashboard/categories/
│   │   ├── page.tsx                          # NEW — server component, lists categories
│   │   └── _components/
│   │       ├── categories-list.tsx           # NEW — grouped-by-kind list + Show archived + Add CTA
│   │       ├── category-form.tsx             # NEW — 3-mode form (create/edit/edit-archived)
│   │       ├── category-form-sheet.tsx       # NEW — Sheet wrapper owning open/close state
│   │       ├── color-picker.tsx              # NEW — palette button group (12 swatches)
│   │       ├── icon-picker.tsx               # NEW — Command-in-Popover icon picker
│   │       └── archive-confirm-dialog.tsx    # NEW — AlertDialog wrapper around archive action
│   ├── (auth)/                               # MODIFIED indirectly — signUp action seeds (FR-012)
│   ├── (marketing)/                          # unchanged
│   ├── api/                                  # unchanged
│   └── (shell)/{layout,error,loading}.tsx    # unchanged
├── components/
│   ├── categories/                           # NEW DIRECTORY
│   │   └── category-picker.tsx               # NEW — the canonical reusable picker (FR-018)
│   ├── illustrations/
│   │   ├── …                                 # unchanged (accounts, budgets, settings, transactions)
│   │   └── categories-illustration.tsx       # NEW — brand SVG for the empty state
│   ├── shell/
│   │   └── nav-items.ts                      # MODIFIED — add Categories to MANAGE group
│   └── ui/                                   # unchanged except one new shadcn primitive
│       └── select.tsx                        # NEW — shadcn Select (wraps @radix-ui/react-select)
├── lib/
│   ├── categories/                           # NEW DIRECTORY
│   │   ├── actions.ts                        # NEW — 5 server actions
│   │   ├── queries.ts                        # NEW — only file that touches prisma.category.*
│   │   ├── schemas.ts                        # NEW — Zod schemas per action
│   │   ├── serialize.ts                      # NEW — Prisma row → CategoryDTO
│   │   ├── errors.ts                          # NEW — error code constants + canonical messages
│   │   ├── colors.ts                         # NEW — curated 12-token color palette
│   │   ├── icons.ts                          # NEW — curated lucide icon allow-list
│   │   ├── seed.ts                           # NEW — DEFAULT_CATEGORIES const (11 rows)
│   │   └── index.ts                          # NEW — server-only barrel
│   ├── auth/
│   │   └── actions.ts                        # MODIFIED — signUp wraps user + seed in one transaction
│   ├── env.ts                                # unchanged
│   └── prisma.ts                             # unchanged
├── db/
│   ├── schema.prisma                         # MODIFIED — adds Category + CategoryKind + User.categories
│   └── migrations/
│       ├── …                                 # unchanged (User, Account)
│       └── <timestamp>_add_category/         # NEW
│           └── migration.sql                 # NEW — generated by pnpm db:migrate
└── tests/
    ├── unit/
    │   ├── …                                 # unchanged (auth, money — must keep passing)
    │   ├── categories-schemas.test.ts        # NEW — parent rules, kind rules, single-level depth
    │   └── categories-seed.test.ts           # NEW — seed contents shape + allow-list membership
    └── e2e/
        ├── …                                 # unchanged (auth, accounts, health — must keep passing)
        └── categories.spec.ts                # NEW — signup→seeded list + US2/US3 round-trip + isolation
```

**Structure Decision:** the same vertical-feature module pattern feature 004 established for `lib/accounts/` is duplicated for `lib/categories/`. The picker is the only Categories surface that lives **outside** `app/(shell)/dashboard/categories/_components/` — it lands at `components/categories/category-picker.tsx` so feature 006 and feature 008 can import it without reaching into a route-bound `_components/` directory. The two allow-lists (`colors.ts`, `icons.ts`) live in `lib/categories/` and are imported by both the seed file and the page-local pickers, giving us a single source of truth across server and client.

## Data Model Changes

The full reference lives in [`data-model.md`](./data-model.md). Summary here.

### Prisma schema diff

**Add:**

```prisma
model Category {
  id         String       @id @default(cuid())
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  parentId   String?
  parent     Category?    @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children   Category[]   @relation("CategoryHierarchy")
  name       String       @db.VarChar(80)
  kind       CategoryKind
  color      String       @db.VarChar(32)
  icon       String       @db.VarChar(64)
  archivedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@index([userId])
  @@index([userId, archivedAt])
  @@index([userId, parentId])
}

enum CategoryKind {
  INCOME
  EXPENSE
}
```

**Modify** (back-relation only — no SQL):

```prisma
model User {
  // … unchanged fields …
  accounts   Account[]   // already present from feature 004
  categories Category[]  // NEW
}
```

### Migration

Generated via:

```bash
pnpm db:migrate -- --name add_category
```

Lands at:

```text
db/migrations/<timestamp>_add_category/migration.sql
```

The SQL creates (in order): the `CategoryKind` enum, the `Category` table, three indexes, the `userId` FK with `ON DELETE CASCADE`, and the self-referential `parentId` FK with `ON DELETE RESTRICT`. No `db push` (FR-001).

### Indexes & constraints

- `@@index([userId])` — the primary lookup path; every read filters by `userId`.
- `@@index([userId, archivedAt])` — supports the default list query (`WHERE userId = ? AND archivedAt IS NULL`) and the "show archived" variant in a single B-tree.
- `@@index([userId, parentId])` — supports the picker / list "children of X" lookup and the kind-change pre-flight check (FR-005: "does this row have children?").
- Foreign key `Category.userId → User.id ON DELETE CASCADE` — same data-scoping pattern as `Account`.
- Foreign key `Category.parentId → Category.id ON DELETE RESTRICT` — protects children from being silently orphaned. See research.md R4.
- No unique constraint on `(userId, name)` (intentional; spec edge case allows duplicates).

### Future references (NOT created here)

- Feature 006 will add `Transaction.categoryId String?` referencing `Category.id` (nullable — uncategorized transactions are allowed by feature 006's design).
- Feature 008 will add `Budget.categoryId String` referencing `Category.id` (non-null — a budget must target a category).

Both downstream FKs will inherit the same `userId` data-scoping rule (the transaction/budget's `userId` must match the category's `userId`; cross-user references collapse to `not_found` at the boundary). This plan's schema lands once and the downstream features attach to it without re-migrating `Category`.

## API Surface

Five server actions in `lib/categories/actions.ts`. Full per-action contracts in `contracts/`. Compressed table here.

| Action | Input | Success | Error codes | FRs |
|---|---|---|---|---|
| `createCategory` | `FormData` { name, kind, color, icon, parentId? } | `{ data: { category: CategoryDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `hierarchy_violation`, `kind_mismatch`, `internal_error` | FR-001..009, 014..016, 021 |
| `updateCategory` | `FormData` { id, name, [kind, color, icon, parentId\|""] } | `{ data: { category: CategoryDTO } }` | `unauthenticated`, `not_found`, `validation_failed`, `archived_field_locked`, `hierarchy_violation`, `kind_mismatch`, `kind_change_blocked`, `internal_error` | FR-002..009, 013..016, 021 |
| `archiveCategory` | `FormData` { id } | `{ data: { category: CategoryDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-002, 003, 010, 013..015, 021 |
| `unarchiveCategory` | `FormData` { id } | `{ data: { category: CategoryDTO } }` | `unauthenticated`, `validation_failed`, `not_found`, `internal_error` | FR-002, 003, 010, 013..015, 021 |
| `listCategories` | `{ includeArchived?: boolean; kind?: "INCOME" \| "EXPENSE" }` | `{ data: { categories: CategoryDTO[] } }` | `unauthenticated`, `internal_error` | FR-002, 003, 010, 011, 013..015, 019, 021 |

### Error envelope

```ts
type ErrorEnvelope =
  | { code: "unauthenticated"; message: string }
  | { code: "validation_failed"; message: string; fieldErrors: Partial<Record<string, string[]>> }
  | { code: "not_found"; message: string }
  | { code: "hierarchy_violation"; message: string; field: "parentId" }
  | { code: "kind_mismatch"; message: string; field: "parentId" | "kind" }
  | { code: "kind_change_blocked"; message: string; field: "kind" }
  | { code: "archived_field_locked"; message: string; field: "name" | "kind" | "color" | "icon" | "parentId" }
  | { code: "internal_error"; message: string }
```

Catalog and rationale in research.md R16. "not yours" and "does not exist" both surface as `not_found` (FR-013, SC-007) — enforced structurally by the `where: { id, userId }` query shape in `lib/categories/queries.ts`.

### Shared DTO

```ts
type CategoryDTO = {
  id: string
  userId: string
  name: string
  kind: "INCOME" | "EXPENSE"
  parentId: string | null
  color: string             // a token from CATEGORY_COLORS
  icon: string              // a name from CATEGORY_ICONS
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string         // ISO 8601 UTC
  updatedAt: string         // ISO 8601 UTC
}
```

No `Decimal` → string conversion needed (categories store no money). The `Date` → ISO string conversion follows the same pattern as `AccountDTO`.

### No route handlers

No file under `app/api/*` is added or modified. The Auth.js catch-all at `app/api/auth/[...nextauth]/route.ts` is unchanged. Same "server actions, not REST" decision as feature 004 (research R6 there); rationale unchanged.

## UI Surface

### Page

| URL | File | Renders |
|---|---|---|
| `/dashboard/categories` | `app/(shell)/dashboard/categories/page.tsx` | Server component. Calls `auth()`, calls `listCategories({ includeArchived: false })`, hydrates the client `<CategoriesList>` with the result. |

The route is new (no placeholder exists today; the feature-002 placeholder set covered only accounts/transactions/budgets/settings — categories was never stubbed).

### Client components

All page-local under `app/(shell)/dashboard/categories/_components/`:

| Component | Purpose | Key shadcn / primitives |
|---|---|---|
| `CategoriesList` | Owns the "Show archived" toggle and the two-section list (INCOME / EXPENSE), renders children indented under parents; receives `initialCategories: CategoryDTO[]` as a prop; re-fetches via the server action when the toggle flips or after any mutation closes the sheet | `Switch`, `Badge`, `Button`, custom row markup (no `Table` — the indented-tree layout is hand-rolled for clarity, mirroring how YNAB / Copilot render category lists) |
| `CategoryForm` | Renders the form in `create` / `edit` / `edit-archived` mode; bound to a server action via `useActionState`; preserves entered values across server rejects | `Input`, `Label`, `Select` (for kind), `Button`, plus the three pickers below |
| `CategoryFormSheet` | The `Sheet` wrapper owning open/close state; chooses which mode the inner form renders | `Sheet`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetContent` |
| `ColorPicker` | 12-swatch palette as a button group; props `{ value, onChange, disabled }`; renders each swatch as a small circular button with the token's resolved HSL background and an aria-label naming the color | `Button` |
| `IconPicker` | `Command` inside `Popover`, scrollable list of ~40 icons with their lucide glyph + label; props `{ value, onChange, disabled }`; the trigger button shows the currently-picked icon glyph + name | `Command`, `Popover`, `Button` |
| `ArchiveConfirmDialog` | The "Archive this category?" confirmation gating `archiveCategory`; props `{ categoryId, categoryName }` | `AlertDialog` |

And the reusable picker — **outside** `_components/` so future features can import it:

| Component | Location | Purpose |
|---|---|---|
| `CategoryPicker` | `components/categories/category-picker.tsx` | The canonical reusable category-picker (FR-018). Consumed in this feature's `CategoryForm` (parent selection). Future-consumed by feature 006 (transaction form) and feature 008 (budget form). Internal contract documented in `contracts/CategoryPicker.md`. |

### Empty state

When `listCategories({ includeArchived: false })` returns `{ data: { categories: [] } }`, the page renders `<EmptyState>` with:

- Illustration: `<CategoriesIllustration />` — a new SVG at `components/illustrations/categories-illustration.tsx`, brand-coherent with the existing five illustrations (accounts, budgets, settings, transactions, abacus).
- Title: "No categories yet".
- Description: short copy explaining the recovery path ("You've archived all your categories. Add a new one or use the toggle above to see archived ones.").
- Action: `{ label: "Add a category", onClick: openCreateSheet }`.

In practice this state is reached only when a user has archived all 11 seeded categories AND the default filter is hiding them. The fresh-signup happy path renders the populated list immediately (FR-012, US1).

### Sidebar navigation

`components/shell/nav-items.ts` adds a `categories` entry to the MANAGE group:

```ts
const categories: NavItem = { href: "/dashboard/categories", label: "Categories", icon: Tags }
// MANAGE becomes: [budgets, categories, settings]  (alphabetical within the group)
```

The icon is `Tags` from `lucide-react` (consistent with the "things you maintain" character of MANAGE; not used elsewhere in the navbar).

### Charts

None this feature (FR-022; Recharts is locked to feature 015 / Reports).

## File-Level Layout

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/categories/colors.ts` | `CATEGORY_COLORS: readonly Color[]`, `CATEGORY_COLOR_TOKENS: ReadonlySet<string>`, `isCategoryColor(token): token is Color["token"]`, `getCategoryColor(token): Color \| undefined`. 12 entries hardcoded; each has `{ token, label, hsl }`. |
| `lib/categories/icons.ts` | `CATEGORY_ICONS: readonly CategoryIcon[]`, `CATEGORY_ICON_NAMES: ReadonlySet<string>`, `isCategoryIcon(name): name is CategoryIcon["name"]`, `getCategoryIcon(name): CategoryIcon \| undefined`. ~40 entries; each `{ name, label, component: LucideIcon }`. |
| `lib/categories/seed.ts` | `DEFAULT_CATEGORIES: ReadonlyArray<{ name, kind, color, icon, parentName: string \| null }>`. 11 rows per FR-012. Exposes a single helper `buildSeedRows(userId, ids: Map<string, string>): Prisma.CategoryCreateManyInput[]` consumed by the modified `signUp` action. |
| `lib/categories/errors.ts` | Error code constants + canonical user-facing messages; overload-typed `errorEnvelope(code, opts)` mirroring `lib/accounts/errors.ts`. |
| `lib/categories/serialize.ts` | `serializeCategory(row: Category): CategoryDTO`. Converts `Date` → ISO string; preserves `parentId` as-is. |
| `lib/categories/schemas.ts` | Zod schemas: `createCategorySchema`, `updateCategorySchema` (a function returning a schema bound to the pre-fetched row for the kind-change-blocked rule), `archiveCategorySchema`, `unarchiveCategorySchema`. Each schema uses `superRefine` for the structural parent rules (FR-006, FR-009). |
| `lib/categories/queries.ts` | `listCategoriesForUser`, `getCategoryForUser`, `countChildrenOfForUser`, `createCategoryForUser`, `updateCategoryForUser`, `setArchivedAtForUser`. **The only file that touches `prisma.category.*`.** First positional arg of every helper is `userId: string`. |
| `lib/categories/actions.ts` | The five server actions (`createCategory`, `updateCategory`, `archiveCategory`, `unarchiveCategory`, `listCategories`). All `"use server"`. |
| `lib/categories/index.ts` | Server-only barrel re-exporting actions, types, allow-lists (the color/icon arrays are safe to ship to client components via re-export from `components/categories/category-picker.tsx`'s own imports — see research R3 for the cross-server/client sharing rule). |
| `app/(shell)/dashboard/categories/page.tsx` | Server component; `auth()` + `listCategories({ includeArchived: false })` + hydrates `<CategoriesList>` (or `<EmptyState>` if zero). |
| `app/(shell)/dashboard/categories/_components/categories-list.tsx` | Client component: the grouped INCOME / EXPENSE list + "Show archived" `Switch` + "Add category" button. |
| `app/(shell)/dashboard/categories/_components/category-form.tsx` | Client component: 3-mode form bound to server actions via `useActionState`. |
| `app/(shell)/dashboard/categories/_components/category-form-sheet.tsx` | Client component: `Sheet` wrapper owning open/close + mode selection. |
| `app/(shell)/dashboard/categories/_components/color-picker.tsx` | Client component: 12-swatch button group. |
| `app/(shell)/dashboard/categories/_components/icon-picker.tsx` | Client component: `Command` inside `Popover`, ~40 lucide icons. |
| `app/(shell)/dashboard/categories/_components/archive-confirm-dialog.tsx` | Client component: `AlertDialog` around the archive button. |
| `components/categories/category-picker.tsx` | The canonical reusable picker (FR-018). `Command` inside `Popover`, filters by `kind` and `includeArchived` props; returns the selected `categoryId` to the parent via `onChange`. |
| `components/illustrations/categories-illustration.tsx` | Brand SVG for the categories empty state, matching the existing five illustrations' style. |
| `components/ui/select.tsx` | New shadcn primitive wrapping `@radix-ui/react-select` — used by the `CategoryForm` for the kind dropdown. |
| `tests/unit/categories-schemas.test.ts` | Unit suite: parent rules (FR-009), single-level depth (FR-006), kind-mismatch (FR-005), kind-change-blocked, no-self-parent. |
| `tests/unit/categories-seed.test.ts` | Unit suite: `DEFAULT_CATEGORIES` shape (11 entries, 9 EXPENSE + 2 INCOME, two children under "Food"); every color / icon in the seed exists in the allow-lists. |
| `tests/e2e/categories.spec.ts` | E2E: signup → seeded list visible → create custom category → edit → archive → toggle → unarchive + cross-user isolation. |
| `db/migrations/<timestamp>_add_category/migration.sql` | Generated migration. |

### Files to MODIFY

| Path | Nature of change |
|---|---|
| `db/schema.prisma` | Add `model Category`, `enum CategoryKind`, and `User.categories` back-relation. |
| `lib/auth/actions.ts` | Wrap `createUser` + category seed in a single `prisma.$transaction([…])` inside `signUp`. The seed insert uses `prisma.category.createMany` with the new user's id. On any failure the transaction rolls back, leaving no orphan User row. |
| `lib/auth/user.ts` | Replace `createUser` with `createUserWithDefaultCategories(input)` (or add a second helper) that returns the user id from inside a transaction. The seed write happens here so the `signUp` action stays thin; the transaction boundary lives one helper down. |
| `components/shell/nav-items.ts` | Add `categories` `NavItem`; insert into the MANAGE group between `budgets` and `settings` (alphabetical). |
| `tests/e2e/auth.spec.ts` | One-line update: the "shell navigates across all dashboard routes" test currently iterates over four routes; add `categories` to the list (path, label, h1). No other test logic changes; the existing assertions about `auth` itself are unaffected. |
| `package.json` | Add `@radix-ui/react-select` as a runtime dep. |

### Files NOT touched

`lib/money/*`, `lib/accounts/*`, `app/(shell)/dashboard/accounts/*`, `app/(auth)/*`, `app/(marketing)/*`, `middleware.ts`, `app/api/*`, `next.config.*`. None of these need to know about Categories.

## Money & Currency Notes

**N/A — single-currency or non-monetary feature.** Categories do not store money. They have no `currency` column, no `amount` column, no `Decimal` anywhere in the model or the module. The `lib/money/` boundary is untouched. The four money-suite unit tests from feature 004 are not modified and continue to pass (SC-013).

The only forward-looking implication: when feature 006 adds `Transaction.categoryId`, the transaction's `amount` and `currency` come from its `Account`, never its `Category`. This plan does not pre-empt that decision; it just records that the category model intentionally has no monetary fields.

## Auth & Validation Boundaries

### Auth required at

- Every server action in `lib/categories/actions.ts` (`createCategory`, `updateCategory`, `archiveCategory`, `unarchiveCategory`, `listCategories`). Enforced by `await auth()` at the top of each action body. On missing session → `unauthenticated` envelope.
- `/dashboard/categories` route — already gated by `middleware.ts` from feature 003 (matcher includes `/dashboard/:path*`). The route's server component additionally calls `auth()` for defense-in-depth.

### Auth NOT required at

- N/A — this feature adds no public surface. The marketing page does not link to any categories URL.

### Zod validation at

- `createCategory` server action — `createCategorySchema.safeParse({ name, kind, color, icon, parentId })` before any helper call. The schema's `superRefine` consults `getCategoryForUser(userId, parentId)` when `parentId` is non-empty, and rejects (a) cross-user references with `not_found`, (b) kind mismatches with `kind_mismatch`, (c) parents that are themselves children with `hierarchy_violation`.
- `updateCategory` server action — branches on `archivedAt` to pick the active-schema vs. archived-only-name-schema (same pattern feature 004 used for FR-009a). When kind is being changed, the schema's `superRefine` consults `countChildrenOfForUser(userId, id)` and rejects with `kind_change_blocked` if any children exist.
- `archiveCategory` / `unarchiveCategory` server actions — each just validates the `id` field shape.
- `listCategories` — internal helper input; no Zod boundary (Principle III's "trust internally" applies because the input is a typed in-process options object, not a request body).

### Trust-internally rule

Once a Zod schema has validated input, downstream helpers (`createCategoryForUser`, `updateCategoryForUser`, `setArchivedAtForUser`, etc.) treat their inputs as typed and do **not** re-validate (Principle III, FR-014). The structural parent rules and the kind-change rule are upstream guarantees.

### Cross-user isolation pattern

Same five-step rule established by feature 004, restated for this entity:

1. `await auth()` at the action boundary.
2. `userId = session.user.id`.
3. Pass `userId` as the first positional arg to every `lib/categories/queries.ts` helper.
4. Every Prisma `where:` clause for the `category` table includes `userId`.
5. **No code path** in the app passes a `userId` derived from request input.

Cross-user `read`/`update`/`archive`/`unarchive` attempts collapse to a `not_found` envelope by structure. Cross-user `parentId` references (a malicious form submission referencing another user's category as a parent) ALSO collapse to `not_found`, since `getCategoryForUser` returns `null` for them — the `superRefine` then attaches the `parentId` field error indistinguishably from a non-existent-id reference (FR-013, US5 scenario 5).

## Testing Strategy

### Unit (Vitest) — required

Two new test files under `tests/unit/` cover the validation-correctness paths required by SC-013:

- `categories-schemas.test.ts`
  - blank / whitespace-only `name` is rejected (FR-004).
  - `name` > 80 chars is rejected (FR-004).
  - `kind` not in `{INCOME, EXPENSE}` is rejected (FR-005).
  - `color` not in `CATEGORY_COLOR_TOKENS` is rejected (FR-007).
  - `icon` not in `CATEGORY_ICON_NAMES` is rejected (FR-008).
  - `parentId` referencing a non-existent row is rejected with `not_found` (FR-013).
  - `parentId` referencing a category whose `kind` differs is rejected with `kind_mismatch` (FR-009).
  - `parentId` referencing a category that already has a non-null `parentId` is rejected with `hierarchy_violation` (FR-006).
  - On update: `parentId` equal to the row's own id is rejected with `hierarchy_violation` (FR-006).
  - On update: changing `kind` on a category with children is rejected with `kind_change_blocked` (FR-005).
- `categories-seed.test.ts`
  - `DEFAULT_CATEGORIES` has exactly 11 entries (SC-008's seed contract).
  - 9 are `EXPENSE`, 2 are `INCOME`.
  - 2 entries have `parentName === "Food"`; "Food" itself is in the top-level set and is EXPENSE.
  - The seven top-level EXPENSE entries are exactly `["Food", "Housing", "Transport", "Utilities", "Entertainment", "Health", "Other Expenses"]`.
  - The two top-level INCOME entries are exactly `["Salary", "Other Income"]`.
  - Every `color` token in the seed is in `CATEGORY_COLOR_TOKENS`.
  - Every `icon` name in the seed is in `CATEGORY_ICON_NAMES`.

Both files are pure unit tests — no Prisma, no DB, no auth. The schema tests stub `getCategoryForUser` / `countChildrenOfForUser` with a tiny in-memory map; this keeps the boundary rule under test without dragging the DB in.

### E2E (Playwright) — required

One new spec: `tests/e2e/categories.spec.ts`. Covers:

1. `test.beforeAll` truncates `Category` then `User` (cascade order doesn't strictly matter — cascade fires automatically — but order is correct.)
2. **Signup seeds the eleven defaults**. Sign up a fresh user, navigate to `/dashboard/categories`, assert the 11 seeded category names are visible, EXPENSE / INCOME sections both render, "Groceries" and "Restaurants" appear nested under "Food" (SC-001, SC-003, US1).
3. **Create custom category**. Open the create sheet, fill `Pets` / `EXPENSE` / pick a color + icon, submit. Assert "Pets" appears in the EXPENSE section.
4. **Create child category**. Open the sheet again, fill `Vet` / parent = `Pets`, submit. Assert "Vet" renders nested under "Pets". Verify the kind control is read-only and forced to `EXPENSE` (US2 scenario 4).
5. **Edit name**. Click an existing seeded category, change the name, save. Assert the new name renders.
6. **Kind-change-blocked**. Try to edit "Food" (which has children "Groceries" and "Restaurants") and flip its kind to INCOME. Assert the form rejects with the `kind_change_blocked` message; the row remains EXPENSE.
7. **Archive**. Open the edit sheet on a category with no children (e.g., "Other Expenses"), click "Archive", confirm. Assert the row disappears from the default list view. Children stay visible (FR-010).
8. **Show archived**. Flip the "Show archived" `Switch`. Assert the archived row reappears with the "Archived" badge.
9. **Unarchive**. Click "Unarchive". Toggle "Show archived" off. Assert the row is back in the active list.
10. **Cross-user isolation**. Open a fresh context, sign up a second user, navigate to `/dashboard/categories`. Assert this user's OWN 11 seeded categories appear (SC-003) — and that this user CANNOT see the first user's "Pets" or "Vet" (SC-007).
11. **Signup transaction rolls back on seed failure**. (Optional / harder to assert reliably from an E2E.) Verified instead at the unit/integration level — see "What can skip tests" below.

### What can skip tests

- `<CategoryPicker>`'s keyboard navigation is covered structurally by `cmdk`'s upstream tests; we do not add a Playwright spec for individual keypress traversal.
- The signup-rollback-on-seed-failure path (FR-012, SC-008): asserting this in Playwright would require injecting a fault into the seed at runtime, which the test framework can't do cleanly. Instead the implementer will assert it at the integration level: a small `tests/unit/auth-signup-seed.test.ts` (one extra test on `lib/auth/actions.ts`) that mocks `prisma.category.createMany` to throw and asserts the user row is not created. This belongs in the auth surface, not the categories surface, so it's listed under FILES TO MODIFY (`tests/e2e/auth.spec.ts`) and the implementer will decide between Playwright (harder) or a Vitest harness (preferred).
- Visual styling of the "Archived" badge — covered by the rendering assertion.

### Constitution coverage summary

- Principle IV money-paths unit suite: PASS — not touched; still green.
- Principle IV signup→login→logout E2E: PASS — `auth.spec.ts` unchanged except for the four-route iterator becoming five.
- Principle IV transfer E2E: belongs to feature 006; not in scope.

## Risks & Trade-offs

1. **Seed inside the signup transaction.** A new user's signup now writes 12 rows (1 User + 11 Category) in a single transaction. **Decision: accept.** 12 rows fit comfortably in a single `prisma.$transaction`; the latency cost is sub-10ms on local Postgres. The alternative — seed outside the transaction with a post-signup background insert — leaves a window where a signed-up user has zero categories, which FR-012 explicitly bans. Acceptable.

2. **Single-level hierarchy enforced at the application layer, not the DB layer.** A malicious direct DB write (psql, Prisma Studio) could create a grandchild. **Decision: accept.** Postgres CHECK constraints cannot express "this row's parent's parent is null" without a trigger; triggers are noisy in Prisma migrations and not worth the line of defense for a personal-finance app. The boundary is the Zod schema; that's the rule of record. The self-referential FK is retained at the DB level so a future feature could lift the single-level rule without a destructive migration (the rule is a schema-level rejection, not a column-level constraint).

3. **Color allow-list maintenance.** Hardcoding 12 tokens in `lib/categories/colors.ts` means we ship a code release whenever we want to expand or rebalance the palette. **Decision: accept.** Same trade-off matrix as the ISO 4217 allow-list in feature 004 (research R3): static content, infrequent churn, one place to edit. The alternative — a `Theme`-table-driven palette — is a database-y solution to a UI problem and adds latency to every render.

4. **Icon curation cost.** Picking the right ~40 lucide icons is a product taste call. **Decision: accept** with a documented methodology in research R3: cover the 11 seed categories plus the next 20–25 most likely user-created categories (Pets, Childcare, Charity, Subscriptions, Travel, Hobbies, Education, Gifts, Personal Care, Fitness, …). Any time the seed list expands, the icon list expands in lockstep — that's a single PR.

5. **Editing the kind of a parent with children is blocked.** A user who wants to "convert" an EXPENSE tree to INCOME has to recreate from scratch. **Decision: accept** as deliberate. The alternative is to cascade-change the children's kind to match, which silently rewrites data the user didn't directly touch — a classic footgun. Research R6 documents the choice.

6. **Cascade behavior asymmetry.** `Category.userId → User.id` is `ON DELETE CASCADE`; `Category.parentId → Category.id` is `ON DELETE RESTRICT`. Two different semantics on the same row. **Decision: accept** and document. Cascade is correct for whole-user deletion (the user's data goes with them); RESTRICT is correct for parent-child (archiving a parent should not silently delete the children — they're independent rows in their own right). Research R4 covers both.

## Constitution Compliance — Post-Design Re-Check

After completing Phase 0 (research) and Phase 1 (data model, contracts, quickstart), the design re-passes every applicable gate:

| Principle | Status | Why |
|---|---|---|
| **I — Money math** | N/A | No money in categories. `lib/money/` untouched. The feature-004 Decimal abstraction continues to be the only money path in the codebase. |
| **II — Type safety** | PASS | Strict TS; no `any`; Prisma is the data SoT; Zod schemas at every server-action boundary; `CategoryKind` is a generated enum. The two allow-lists are typed as `readonly` literal unions; no `as const` escape hatches required. |
| **III — Validate at boundaries** | PASS | Zod at each action's input; helpers in `queries.ts` trust their typed inputs; auth at the action boundary, not in helpers. Structural parent rules are inside the schema's `superRefine`, which is the canonical Zod way to express cross-field / DB-touching invariants at the boundary. |
| **IV — Test the money paths** | N/A (this feature) | Feature 004's money suite is preserved untouched. The new categories unit suite covers FR-005, FR-006, FR-009 + seed contents per SC-013. |
| **V — Spec-driven** | PASS | spec → plan → tasks order observed; single feature in flight; 0 open clarifications. |

**Conventions** (after Phase 1 design): all five rows of the convention table still PASS — most importantly, the **data-scoping convention** is enforced by `lib/categories/queries.ts` always taking `userId` as the first positional arg supplied from `session.user.id`, never from request input. This is the second feature (after Accounts) to exercise the rule on a fresh domain entity, and it does so identically.

**No constitution violations identified. No Complexity Tracking entries required.**

## Phase 2 — Task Planning Approach

`/speckit-tasks` will generate `tasks.md` from this plan. Expected task bundles (provided here as a guide; the actual atomized task list is produced by `/speckit-tasks` and will run ~35–50 items):

1. **Schema + migration.** Update `db/schema.prisma` (add `Category`, `CategoryKind`, `User.categories`). Run `pnpm db:migrate -- --name add_category`. Commit the generated SQL.
2. **Allow-lists.** Land `lib/categories/colors.ts` and `lib/categories/icons.ts` with their type guards. These are upstream of every other Categories file.
3. **Seed module + signup wiring.** Land `lib/categories/seed.ts`. Modify `lib/auth/user.ts` to wrap `createUser` + category seed in a single `prisma.$transaction`; the existing `signUp` action consumes the new helper unchanged at the boundary level. Add the optional `tests/unit/auth-signup-seed.test.ts` for the rollback assertion.
4. **`lib/categories/` server surface.** Land `errors.ts`, `serialize.ts`, `schemas.ts`, `queries.ts`, `actions.ts`, `index.ts` in that order. Each ships with its unit-test slice where applicable (`categories-schemas.test.ts` ships with `schemas.ts`; `categories-seed.test.ts` ships with `seed.ts`).
5. **New shadcn primitive.** Land `components/ui/select.tsx`. Add `@radix-ui/react-select` to `package.json`.
6. **Reusable picker.** Land `components/categories/category-picker.tsx`. The contract in `contracts/CategoryPicker.md` is the spec for this component.
7. **Page-local UI.** Land `color-picker.tsx`, `icon-picker.tsx`, `category-form.tsx`, `category-form-sheet.tsx`, `archive-confirm-dialog.tsx`, `categories-list.tsx`. Implement against the server actions from step 4 and the picker from step 6.
8. **Page wiring.** Land `app/(shell)/dashboard/categories/page.tsx`. Add `<CategoriesIllustration>` at `components/illustrations/categories-illustration.tsx`. Update `components/shell/nav-items.ts`.
9. **E2E.** Land `tests/e2e/categories.spec.ts`. Update `tests/e2e/auth.spec.ts` to include the categories route in its dashboard-shell traversal test.
10. **Final audits.** `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm test:e2e`. Grep `lib/` for any `prisma.category.` outside `lib/categories/queries.ts` (data-scoping convention audit). Verify the migration applies cleanly to a fresh DB and the 11 seeded rows materialize.

The implementer SHOULD execute these in order (later steps depend on earlier ones). The `lib/categories/colors.ts` + `lib/categories/icons.ts` task and the `components/ui/select.tsx` task can in principle parallelize, but the implementer convention is one task at a time; this is just a scheduling note.

The `/speckit-tasks` output will expand each bundle into atomic, individually-verifiable units with explicit "DONE" / "DONE_WITH_CONCERNS" criteria.

## Complexity Tracking

No constitution violations. No justification entries required.

## Handoff

```
STATUS: READY_FOR_BUILD
Reason: plan complete, constitution v0.2.0 compliant, all six contracts written, data model finalized, 0 open clarifications, one new runtime dep (@radix-ui/react-select), no new env vars
File: /Users/rgederin/git/abacus/specs/006-categories/plan.md
```
