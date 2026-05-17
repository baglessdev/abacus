# Feature 006 — Phase 0 Research

Non-obvious decisions taken during planning. Each entry: Decision / Rationale / Alternatives considered. Inputs locked by the spec's Clarifications section (hierarchy depth = single level, route = `/dashboard/categories`, seed = 11 categories in the signup transaction) are NOT re-litigated here; the entries below cover only the choices the spec deliberately left to the plan.

This is the second feature to exercise the data-scoping convention (the first was 004 Accounts). The pattern reuses feature 004's `lib/<feature>/` module shape, the `userId`-first helper convention, the cross-user-collapse-to-`not_found` rule, the archive-not-delete UX, the side-sheet-on-list-page form, and the per-feature error catalog. Where this feature replicates feature 004's R-entry verbatim, the entry below is shorter and cites the precedent rather than re-arguing it.

---

## R1. Database column types — Prisma-native enum for `kind`, varchar for the allow-listed string columns

**Decision.**

- `parentId` — `String?` (nullable). Self-referential FK to `Category.id` (relation name `"CategoryHierarchy"`). Cascade behavior is detailed in R4.
- `kind` — Prisma enum `CategoryKind { INCOME EXPENSE }`. Maps to a Postgres enum at the DB level.
- `color` — `String @db.VarChar(32)`. The column does **not** enforce membership in the allow-list; that's the Zod boundary's job (R2).
- `icon` — `String @db.VarChar(64)`. Same logic: column accepts any short string; the Zod boundary rejects anything outside `CATEGORY_ICON_NAMES`.
- `name` — `String @db.VarChar(80)`, mirroring `Account.name` from feature 004 FR-004 for consistency.

**Rationale.**

- A closed Prisma enum for `kind` gives us a real Postgres enum with two values and a generated TS literal union. Adding a third kind in the future would be a Prisma migration + a TS recompile — fine because the spec locks the set at two.
- For `color` and `icon`, putting the allow-list at the DB level would mean a CHECK constraint per column (or a foreign-key into a `Color` / `Icon` lookup table). Both are extra schema mass for static content the application layer already owns. Feature 004 made the same call for the ISO 4217 currency allow-list (research R3 there): "the boundary is the Zod schema; the column is just a string." Doing it differently here would split the convention.

**Alternatives considered.**

- *`color` and `icon` as Prisma enums.* Rejected — re-enumerating 12 colors and 40 icons in `schema.prisma` makes every palette change a destructive enum migration. The allow-list is a TS module so a curator can revise it via a PR; the column doesn't need to know.
- *Separate `Color` / `Icon` lookup tables.* Rejected — runtime DB lookup for static content is a regression versus the in-process `Set` membership check. Same rationale as currencies in feature 004 R3.
- *`color` as a hex string (e.g., `#7C3AED`) instead of a token.* Rejected — see R2.

---

## R2. Color allow-list shape — 12 curated tokens, each resolving to an HSL value

**Decision.** `lib/categories/colors.ts` exports:

```ts
type CategoryColor = {
  token: string  // e.g., "violet", "blue", "cyan", "teal", "green", "lime", "yellow",
                 //       "orange", "red", "pink", "slate", "stone"
  label: string  // user-facing in the picker, e.g., "Violet"
  hsl: string    // e.g., "262 83% 58%"  (Tailwind / shadcn HSL triplet form)
}

export const CATEGORY_COLORS: readonly CategoryColor[] = [/* 12 entries */]
export const CATEGORY_COLOR_TOKENS: ReadonlySet<string> = new Set(CATEGORY_COLORS.map(c => c.token))
export function isCategoryColor(t: string): t is CategoryColor["token"]
export function getCategoryColor(t: string): CategoryColor | undefined
```

The 12 tokens cover the chromatic wheel evenly plus two neutrals (`slate`, `stone`). Each `hsl` value was selected against the project's tokens to meet WCAG AA contrast against both light and dark backgrounds at the 16x16 swatch size used in lists.

Resolution from token to actual rendered CSS happens at the call site via inline style (`style={{ backgroundColor: \`hsl(${color.hsl})\` }}`) — not via a Tailwind utility class. Tailwind utility classes would mean either (a) generating 12 utility classes statically, or (b) using arbitrary-value selectors which can't be statically extracted. Both options are uglier than reading the HSL triplet off the token record at render time.

**Rationale.**

- A curated palette beats a free-form hex/color picker for three reasons: predictable visual rhythm in lists (the same color always looks the same against the same background), no accessibility footguns (a user can't pick `#FFFFFF` on white), no theme drift (every token resolves the same way against light + dark themes).
- 12 is a number chosen to evenly cover the color wheel without overwhelming the picker. 6 felt too few (no orange, no pink). 18 felt too many (the picker becomes a paint store).
- Storing the **token** (not the HSL value) on the row means a palette refresh ships in one PR and re-themes every existing category row without a data migration. That's exactly the property feature 004 R3 prizes for currencies and the spec line "the allow-list MUST live in the codebase, not in a runtime lookup" (FR-007).

**Alternatives considered.**

- *Tailwind-class tokens (e.g., `bg-violet-500`).* Rejected — Tailwind's JIT can't statically extract dynamic class names, so we'd need to enumerate 12 `bg-*-500` classes in a safelist. That works but couples the allow-list to Tailwind specifically, which the project shouldn't have to care about.
- *Hex strings.* Rejected — the token form is more robust to a future theme refactor (switch to OKLCH? switch to a new palette? no data migration required).
- *CSS variables (`--cat-violet`).* Rejected for a different reason: defining 12 CSS variables in `globals.css` is fine, but then the picker has to know the variable names AND the schema layer has to know them, and they live in two places. The HSL-on-the-record form keeps the data in one file.

---

## R3. Icon allow-list shape — ~40 curated `lucide-react` icon names with display labels

**Decision.** `lib/categories/icons.ts` exports:

```ts
import type { LucideIcon } from "lucide-react"

type CategoryIcon = {
  name: string         // e.g., "utensils", "home", "car", "plug", "film"
  label: string        // user-facing in the picker, e.g., "Utensils"
  component: LucideIcon  // the actual React component for rendering
}

export const CATEGORY_ICONS: readonly CategoryIcon[] = [/* ~40 entries */]
export const CATEGORY_ICON_NAMES: ReadonlySet<string> = new Set(CATEGORY_ICONS.map(i => i.name))
export function isCategoryIcon(n: string): n is CategoryIcon["name"]
export function getCategoryIcon(n: string): CategoryIcon | undefined
```

The ~40 icons cover the 11 seed categories plus the next ~25 most likely user-created categories. Categories include: food/dining (Utensils, Coffee, Pizza), housing (Home, Bed, Sofa), transport (Car, Plane, Bus, Train, Bike), utilities (Plug, Wifi, Phone, Lightbulb), entertainment (Film, Music, Gamepad, BookOpen), health (HeartPulse, Stethoscope, Pill, Dumbbell), shopping (ShoppingBag, Shirt, Gift), people (HeartHandshake, Baby, Dog), income (Briefcase, Coins, TrendingUp, Banknote), and generic catchalls (Tag, MoreHorizontal).

The `lucide-react` library is already a peer dep of the project (used in `components/shell/nav-items.ts` and several illustration files). No new package.

**Cross-server/client sharing rule.** The allow-list file is a plain TS module — no `"use server"`, no `import "server-only"`. It is imported by both server code (the Zod schema, the seed) AND client code (the icon picker, the list row renderer). The `LucideIcon` component import is safe in either context because `lucide-react` ships pure RSC-compatible components.

**Rationale.**

- A curated icon set beats a free-form text input (typo prevention) and beats every-icon-in-lucide (the picker would have 1,500+ entries; the user would never find the right one). 40 covers the realistic personal-finance category surface.
- Co-locating `name` + `label` + `component` in a single record means: the picker renders the glyph and a readable label; the seed file references icons by `name` only (the picker resolves `name → component` at render time); the validation refines a string against the name set; one source of truth.
- `name`-as-stored-value (a kebab-or-camel string like `"heart-pulse"` or `"heartPulse"`) is forward-compatible: if we ever swap icon libraries, the allow-list file changes but the column data does not (since the validation key is the `name` field, not the library's internal export name). We use lucide's standard kebab-case names for stability.

**Alternatives considered.**

- *Free-form icon URL.* Rejected — user-uploaded icons mean a storage backend and an XSS surface, both out of scope.
- *Every lucide icon.* Rejected — 1,500+ entries makes the picker unusable; quality control (visual weight consistency, recognizability) drops to zero.
- *Two-tier palette (a small "favorites" set + a "more icons" expander).* Rejected for v1 — the curated 40 covers the spec's stated use cases. Revisit if user feedback says otherwise.

---

## R4. Self-referential FK + cascade behavior — `userId` CASCADE, `parentId` RESTRICT

**Decision.**

```prisma
model Category {
  // ...
  user     User      @relation(fields: [userId],   references: [id], onDelete: Cascade)
  parent   Category? @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children Category[]                              @relation("CategoryHierarchy")
}
```

- `User → Category` is `ON DELETE CASCADE`. Deleting a user (when that path ever exists) removes all their categories in one referential step. This matches the data-scoping convention established by feature 004 (research R15 there) and FR-002.
- `Category → Category` (parent relation) is `ON DELETE RESTRICT`. Trying to delete a parent row that still has children fails at the DB level. In practice the application never hard-deletes a category (archive is the only path; FR-010), so this constraint is a belt-and-suspenders backstop. If a future feature ever introduces hard delete, the developer will hit this constraint and have to consciously decide what to do with the children — exactly the right failure mode.

**Rationale.**

- Cascade on the user FK matches feature 004 Accounts and the FR-002 spec line. No new ground.
- RESTRICT on the parent FK is the conservative default for self-referential hierarchies: it ensures the database cannot end up with orphan rows pointing to a non-existent parent. Cascade-on-parent-delete (which would silently delete the children when the parent is deleted) is wrong because (a) archive isn't delete — we don't even use this code path in v1 — and (b) if a future feature ever does add hard delete, silently nuking children is a footgun.
- The asymmetry (CASCADE on user, RESTRICT on parent) is intentional and is documented in plan.md §Risks.

**Alternatives considered.**

- *`parentId` with `onDelete: Cascade`.* Rejected — silently destroys children. The v1 archive path never triggers it, but a future hard-delete path would.
- *`parentId` with `onDelete: SetNull`.* Considered. When a parent is hard-deleted, its children become top-level categories. Tempting but rejected: it changes the semantic of "this child belongs to that parent" without the user explicitly approving, which is the kind of silent data change v1 should avoid.
- *No FK at all (just a free `parentId String?` column).* Rejected — Prisma can express the FK; cheap to add; protects against typos and orphan rows.

---

## R5. Single-level enforcement — at the Zod boundary, via async `superRefine` consulting the candidate parent row

**Decision.** When `parentId` is non-empty in either `createCategory` or `updateCategory`:

1. The Zod schema's `superRefine` is `async` and calls `getCategoryForUser(userId, parentId)`.
2. If the helper returns `null`, attach a `not_found`-coded issue to the `parentId` path (the schema produces a `validation_failed` envelope; the action collapses it to `not_found` if the issue is uniquely a non-existent parent — see contracts/createCategory.md).
3. If the helper returns a row, check `parent.parentId`. If it is non-null, attach a `hierarchy_violation`-coded issue (would-be-grandchild rule, FR-006).
4. Also (in the update path): if the candidate `parentId` equals the row's own id, attach a `hierarchy_violation`-coded issue (no-self-parent rule, FR-006, US5 scenario 8).

Cycle detection is **structurally unnecessary** because the single-level rule itself prevents cycles: the only way A could become a child of B-which-is-a-child-of-A would require B to become a parent, which means B would have to flip from being a child to being a top-level, which requires clearing B's `parentId` — at which point A and B are no longer connected. The single-level rule is its own cycle detector.

**Rationale.**

- Putting the rule at the Zod boundary keeps it inside the layer the constitution requires (Principle III: "Every API route validates input with Zod before touching business logic"). The schema doesn't reach past validation into action code.
- `superRefine` is the canonical Zod way to express cross-field or DB-consulting invariants. Using `async` `superRefine` is supported by Zod and keeps the boundary check inline with the rest of validation.
- The structural-cycle-freedom of the single-level rule means we ship zero cycle-detection logic. That's a notable saving.

**Alternatives considered.**

- *Database CHECK constraint.* Rejected — Postgres can't express "this row's parent has a null parent" without a trigger; triggers are a noise source in Prisma migrations.
- *Enforce in the action body instead of in the schema.* Rejected — split the validation across two layers, harder to test in isolation, less canonical.
- *Compute on read (allow grandchildren in the DB; collapse them in the picker).* Rejected — silently rewrites the model the user submitted; spec FR-006 says reject at the boundary.

---

## R6. Kind inheritance / matching — child kind derived from parent on create, parent kind frozen on update

**Decision.**

**On create:** if the form has a `parentId`, the kind field in the form is set to (and locked at) the parent's kind. The form is the single source of "what kind is this child?"; the user never has to pick it, and the boundary validation rejects any mismatch with `kind_mismatch`. This matches US2 scenario 4 ("kind control becomes read-only once a parent is selected").

**On update:**

- If the candidate `parentId` is non-null AND the candidate `kind` does not match the parent's `kind` → reject with `kind_mismatch` (FR-009).
- If the row being edited HAS children AND the candidate `kind` differs from the row's current `kind` → reject with `kind_change_blocked` (FR-005, US3 scenario 5).

The `kind_change_blocked` check is implemented in the schema's `superRefine` by calling `countChildrenOfForUser(userId, id)` and refusing the change if `count > 0`.

**Rationale.**

- Forcing the child's kind to match the parent's kind structurally prevents the "an EXPENSE has an INCOME child" anomaly without requiring a DB-level constraint.
- Blocking kind change on a parent with children is the deliberate trade-off documented in plan.md §Risks. The alternative is to cascade the kind change to all children, which would silently rewrite data the user didn't directly touch. The "block and require explicit movement of children first" path is the conservative one.
- The two checks are mechanically separate (one looks at the would-be parent's kind; the other looks at the count of own children), so they live in separate `superRefine` arms with distinct error codes. A user who sees `kind_mismatch` knows they need to change the parent or the kind; a user who sees `kind_change_blocked` knows they need to move or archive the children first.

**Alternatives considered.**

- *Allow kind change on a parent with children; cascade to children.* Rejected — silent data rewrite.
- *Derive child kind from parent at read time (don't store on the child row).* Rejected — duplicates the storage rule of feature 004 (FR-005) for a tiny saving; the spec explicitly stores `kind` on every row (FR-001), so storing matches the spec.

---

## R7. Archive semantics — soft delete; archiving a parent does NOT cascade to children

**Decision.** Same `archivedAt: DateTime?` pattern as `Account` (research R8 there). `archiveCategory` sets the timestamp; `unarchiveCategory` clears it. Both are reversible an arbitrary number of times. There is no hard-delete affordance.

**Archiving a parent does NOT auto-archive its children.** The children retain their own `archivedAt` state independently. The default list view filters out rows where `archivedAt IS NOT NULL` (so an archived parent hides from the default list); its non-archived children continue to render at their normal indentation level, with a visual indicator that their parent is currently archived (a small "parent: Food (archived)" hint inline, exact wording plan-level — the data-level rule is what's locked).

**In the picker:** archived categories are excluded by default (FR-011). An archived parent that still has active children means those active children remain pickable; they just don't show under their archived parent in the picker — they render as if they had no parent (a flat row with a "(child of {archived parent})" hint), or are pushed to the bottom of their kind section. Either UX is acceptable; the picker contract in `contracts/CategoryPicker.md` documents the chosen rule.

**Rationale.**

- Cascade-archive on the parent was tempting (treat the parent as the unit of organization) but rejected because: (a) the children are independent rows with their own identities and their own future-Transaction backlinks; (b) it silently changes the state of rows the user didn't directly touch — same footgun pattern as the kind-cascade decision in R6.
- Soft delete is non-negotiable per FR-010 and matches the convention from feature 004.

**Alternatives considered.**

- *Hard delete with safeguards (e.g., only categories never referenced by any transaction).* Out of scope per FR-010 / spec Out-of-Scope section.
- *Cascade-archive on parent.* See above; rejected for footgun reasons.

---

## R8. Default seed mechanism — `prisma.$transaction` wrapping user creation and `createMany`

**Decision.** The existing `signUp` server action at `lib/auth/actions.ts` currently calls `createUser({ email, passwordHash })`, which itself does `prisma.user.create(...)`. We modify this path so the user-row create AND the 11-row `category.createMany` happen inside a single `prisma.$transaction([...])`:

```ts
// lib/auth/user.ts (modified)
export async function createUserWithDefaultCategories(input: {
  email: string
  passwordHash: string
}): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: input })
    const seedRows = buildSeedRows(user.id)  // from lib/categories/seed.ts
    await tx.category.createMany({ data: seedRows })
    return user
  })
}
```

The function builds the seed rows in two passes: first the 9 top-level rows (their `parentId` is null), then the 2 child rows whose `parentId` is the id of the "Food" row inserted in the first pass. Because `createMany` is one batch and Prisma generates the ids as `cuid()` defaults, we either (a) use Prisma's `createMany` with explicit ids generated by the helper (passing `id: cuid()` for each row so the children can reference them), or (b) do two `createMany` calls back-to-back inside the same transaction. The plan picks (a) — generating ids in the helper — because it's a single round trip and Prisma's `cuid()` is exposed for this purpose.

**The transaction is atomic.** If the `category.createMany` fails for any reason (DB error, transient I/O, etc.), the user-row creation rolls back. A signed-up user with no categories MUST never be a reachable state (FR-012, SC-008). The existing `try { … } catch (P2002) { … }` block in `signUp` already handles the unique-email-violation case; the new failure surface is "seed throws", which propagates up the existing `catch`/`throw` chain.

**Rationale.**

- `prisma.$transaction` with the callback form gives us a single SQL transaction that the helper can compose against. The alternative (two separate `prisma.user.create` + `prisma.category.createMany` calls) leaves an observable window where a signed-up user has zero categories, which FR-012 bans.
- Generating ids in JS via cuid (Prisma exposes `cuid()` from `@paralleldrive/cuid2` under the hood, but for our purposes any cuid generator works; Prisma's default is fine via the schema's `@default(cuid())`) means we can reference them as `parentId` in the same batch, avoiding a second round trip.
- The signup happy path (no seed failure) cost is one extra Prisma query (`createMany` of 11 rows) inside an already-existing transaction. Sub-10ms on local Postgres.

**Alternatives considered.**

- *Seed via Prisma migration's `seed` script.* Rejected — that only runs once per `db:reset`; we need per-user seeding on every signup.
- *Seed via a post-signup background job.* Rejected — creates the forbidden zero-category-signed-up-user state during the window between signup and job completion.
- *Two separate `prisma.user.create` + `prisma.category.createMany` calls outside a transaction.* Rejected for the same reason.

---

## R9. Seed data location — static TS const in `lib/categories/seed.ts`

**Decision.** `lib/categories/seed.ts` exports:

```ts
type SeedRow = {
  name: string
  kind: "INCOME" | "EXPENSE"
  color: string                  // a token from CATEGORY_COLORS
  icon: string                   // a name from CATEGORY_ICONS
  parentName: string | null      // "Food" for the two child rows; null otherwise
}

export const DEFAULT_CATEGORIES: readonly SeedRow[] = [
  // 9 top-level EXPENSE
  { name: "Food",           kind: "EXPENSE", color: "orange", icon: "utensils",     parentName: null },
  { name: "Housing",        kind: "EXPENSE", color: "blue",   icon: "home",         parentName: null },
  { name: "Transport",      kind: "EXPENSE", color: "cyan",   icon: "car",          parentName: null },
  { name: "Utilities",      kind: "EXPENSE", color: "teal",   icon: "plug",         parentName: null },
  { name: "Entertainment",  kind: "EXPENSE", color: "pink",   icon: "film",         parentName: null },
  { name: "Health",         kind: "EXPENSE", color: "red",    icon: "heart-pulse",  parentName: null },
  { name: "Other Expenses", kind: "EXPENSE", color: "slate",  icon: "more-horizontal", parentName: null },
  // 2 top-level INCOME (yes, the spec says 2 INCOME + 7 EXPENSE for the top-level set,
  // and 2 children under Food — total 11)
  { name: "Salary",         kind: "INCOME",  color: "green",  icon: "briefcase",    parentName: null },
  { name: "Other Income",   kind: "INCOME",  color: "lime",   icon: "coins",        parentName: null },
  // 2 child EXPENSE under Food
  { name: "Groceries",      kind: "EXPENSE", color: "orange", icon: "shopping-bag", parentName: "Food" },
  { name: "Restaurants",    kind: "EXPENSE", color: "orange", icon: "utensils",     parentName: "Food" },
] as const

export function buildSeedRows(userId: string): Prisma.CategoryCreateManyInput[] {
  // Resolves parentName -> id by first generating ids for the top-level rows,
  // then attaching parentId to the children. Returns 11 rows ready for createMany.
}
```

The actual color/icon tokens used are placeholders — the implementer picks final values from `CATEGORY_COLORS` and `CATEGORY_ICONS` (the unit test in `tests/unit/categories-seed.test.ts` asserts every color/icon in the seed exists in the allow-lists, so a typo here fails the build).

**Rationale.**

- Static TS const, not a config file or env var, because the product decision is locked (the 11-row composition is fixed by the spec's Clarifications section). Runtime configurability is unnecessary and would invite drift.
- Co-locating with the rest of `lib/categories/` keeps the categories surface self-contained; the auth module imports from it but doesn't own it.
- A `buildSeedRows(userId)` helper instead of exposing the const directly to `signUp` means the cuid generation and `parentId` resolution live in one tested function rather than being repeated at the auth boundary.

**Alternatives considered.**

- *Seed in a JSON file under `db/seed/`.* Rejected — loses literal type safety; needs a parse step at startup; harder to import in the same module that runs unit tests against it.
- *Seed in `db/schema.prisma` via Prisma's `@default` semantics.* Not applicable — there is no Prisma feature that seeds 11 rows on every user create.

---

## R10. `lib/categories/` module shape — mirror `lib/accounts/` 1:1 plus three domain-specific files

**Decision.** The module file set is:

```
lib/categories/
├── actions.ts         # 5 server actions (mirrors lib/accounts/actions.ts)
├── queries.ts         # only file that touches prisma.category.* (mirrors lib/accounts/queries.ts)
├── schemas.ts         # Zod schemas per action (mirrors lib/accounts/schemas.ts)
├── serialize.ts       # Prisma row → CategoryDTO (mirrors lib/accounts/serialize.ts)
├── errors.ts          # error codes + canonical messages + overload-typed envelope (mirrors lib/accounts/errors.ts)
├── colors.ts          # NEW — curated 12-token palette
├── icons.ts           # NEW — curated 40-icon allow-list
├── seed.ts            # NEW — DEFAULT_CATEGORIES const + buildSeedRows helper
└── index.ts           # server-only barrel (mirrors lib/accounts/index.ts)
```

We deliberately duplicate the patterns from `lib/accounts/` rather than abstract them. The `errorEnvelope` overload pattern, the schema-shape pattern (one base schema + a function for the pre-fetched-row-aware variant), the `queries.ts` "single Prisma surface" rule — all replicated.

**Rationale.**

- Two domain modules sharing a pattern is not yet enough evidence to refactor into a shared abstraction. After the third domain entity (likely feature 008 Budgets) we revisit; the third call is when the abstraction's shape is clear. (DRY-after-three is a project-level heuristic; this is the explicit application.)
- Duplicate-then-abstract beats abstract-first. The shape of `lib/accounts/` is already correct (money paths exercised, archive UX exercised, cross-user isolation exercised); duplicating it confirms it generalizes without committing to a premature shared module.
- The duplication is small (4 files, each ~100–200 lines) and entirely mechanical. The implementer can use the feature-004 files as a template.

**Alternatives considered.**

- *Extract a shared `lib/_domain/` or `lib/_shared/` module now.* Rejected — premature. We don't know yet whether the third domain entity (Budgets, with a money column AND a category FK AND a period-of-time concept) will fit the same shape.
- *Inline more logic in `actions.ts`, skip the separate `queries.ts`.* Rejected — `queries.ts` being the only file that touches `prisma.category.*` is the load-bearing rule of the data-scoping convention; it can't be merged into actions without weakening the convention.

---

## R11. Cross-user isolation pattern — second exercise of the convention

**Decision.** Re-apply feature 004's five-step rule verbatim:

1. `await auth()` at the action boundary.
2. `userId = session.user.id`.
3. Pass `userId` as the first positional arg to every `lib/categories/queries.ts` helper.
4. Every Prisma `where:` clause for the `category` table includes `userId`.
5. **No code path** passes a `userId` derived from request input to the helpers.

Cross-user `read` / `update` / `archive` / `unarchive` attempts collapse to `not_found` envelope by structure. Cross-user `parentId` references collapse the same way: `getCategoryForUser(userId, otherUsersCategoryId)` returns `null`, which the schema treats indistinguishably from a non-existent id (FR-013, US2 scenario 6).

**Rationale.** Same as feature 004 R15. Documented again here because this is the second feature to exercise the rule on a new entity; the documentation serves as precedent for future features (Budgets, Transactions).

**Alternatives considered.** Same set as feature 004 R15 (Postgres RLS, prisma middleware, etc.). Same rejections. Re-litigating is not warranted; the rule is now project doctrine.

---

## R12. Picker primitive contract — `<CategoryPicker>` props + filter rules + future-consumer interface

**Decision.** `components/categories/category-picker.tsx` exports a single React component with this prop shape:

```ts
type CategoryPickerProps = {
  value: string | null                             // currently-selected category id, or null
  onChange: (categoryId: string | null) => void    // fires when a category is picked or cleared
  kind?: "INCOME" | "EXPENSE" | "any"              // filter to this kind; default "any"
  includeArchived?: boolean                        // default false (FR-011)
  excludeIds?: readonly string[]                   // optional — used in this feature's edit form
                                                   // to prevent picking the category being edited
                                                   // (or its descendants) as its own parent
  disabled?: boolean
  placeholder?: string                             // default "Pick a category"
  ariaLabel?: string                               // for screen reader users
}
```

**Render contract.**

- The trigger is a `Button` rendered with the currently-selected category's icon + name (or the placeholder if `value === null`). Clicking opens a `Popover` containing a `Command` (cmdk) list.
- Inside the popover: `Command` is grouped by `kind` (INCOME header + rows; EXPENSE header + rows). Within each kind, top-level categories come first, then their children indented (visual indentation only — children are independent pickable rows per FR-018 / US4 scenario 5).
- Each row shows the icon glyph, the name, and (for children) a small parent hint to disambiguate same-named children.
- `cmdk` provides typeahead filtering across visible rows out of the box.

**Filter rules.**

- When `kind` is set to `"INCOME"` or `"EXPENSE"`, the picker shows only that kind's rows; the other kind's header is omitted.
- When `kind` is `"any"` (default), both headers render.
- When `includeArchived` is `false` (default), rows with `archivedAt !== null` are excluded.
- When `excludeIds` is provided, those category ids are excluded from the list. Used by the edit form to prevent setting a category as its own parent or as a child of one of its own children. (In v1 with single-level hierarchy, the second case is impossible — a category that has children IS a top-level category and can't become a child anyway — but the prop is forward-compatible for a future multi-level world.)

**Data source.** The picker calls `listCategories({ includeArchived })` on mount and caches the result in component state. On `revalidatePath("/dashboard/categories")` from a mutation elsewhere, the parent component is responsible for re-rendering the picker (e.g., by remounting it, or by passing it a new key prop). This feature's `CategoryForm` does this implicitly because the form remounts on each sheet open.

**Accessibility contract.**

- Trigger button has `aria-haspopup="listbox"` and `aria-expanded`.
- Inside the popover, the `Command` provides keyboard navigation (arrow keys, type-ahead, Enter to select, Escape to close) via `cmdk`.
- The selected row has `aria-selected="true"`.
- The picker meets the spec's keyboard-operable bar (FR-020) by construction.

**Future-consumer interface.**

- Feature 006 (Transactions) will mount `<CategoryPicker>` inside its transaction form, passing the transaction's `kind` (derived from positive/negative amount or from a separate INCOME/EXPENSE radio) as the picker's `kind` prop.
- Feature 008 (Budgets) will mount it inside its budget form, passing `kind="EXPENSE"` (budgets target spending categories per the roadmap).
- Both consumers receive the picked `categoryId` via `onChange` and store it in their own form state. The picker has zero opinions about how the consumer persists.

**Rationale.**

- The `kind` filter prop covers the two known future consumers in one knob. The `excludeIds` prop is the future-proofing escape hatch for "exclude this row and any rows that would create a cycle if picked."
- `Command` inside `Popover` is the same primitive feature 004 used for the currency picker. Reusing the pattern means the same keyboard model, the same visual style, the same accessibility props — one shape across the app.
- Caching the result in component state (instead of revalidating on every keystroke) keeps the picker responsive on slow networks. The implementer can revisit if user feedback says stale data is a problem.

**Alternatives considered.**

- *A `Select` (Radix) instead of `Command-in-Popover`.* Rejected — `Select` doesn't support type-ahead-filtering over a large list, and 11 (seeded) + N (user) categories can grow.
- *Server-side rendering of the picker list.* Rejected — picker is interactive; cmdk owns the search state.
- *Inline-expand vs. popover.* Rejected — the picker can appear inside small surfaces (transaction form on mobile); popover keeps the form layout compact.

---

## R13. List page UX — grouped by kind, children indented under parents, "Show archived" toggle

**Decision.** `/dashboard/categories` renders two stacked sections (EXPENSE first, then INCOME — EXPENSE is the more-frequently-touched kind in personal finance). Each section is a card with the kind label, the count of active categories in that kind, and a list of rows. Within each section:

- Top-level categories sorted alphabetically (case-insensitive ascending) per FR-019.
- Children rendered immediately under their parent, indented (e.g., `pl-8` in Tailwind terms), also sorted alphabetically among themselves.
- Each row shows: the icon glyph (colored with the row's color), the name, and (for the rightmost cell) an "Archive" or "Unarchive" button.
- Archived rows (when "Show archived" is on) render with reduced opacity and an "Archived" `Badge` to the right of the name.

The "Show archived" toggle (`Switch`) and the "+ Add category" button sit in a header row above the two sections, same vertical layout as the accounts page header.

**Why not a Table.** Feature 004 used a `Table` because its rows are flat with multiple columns (Name / Type / Currency / Balance / Actions). The categories list has fewer columns (Icon+Name / Actions) and a tree shape that a flat table renders awkwardly. The two-section card layout reads naturally because the kind grouping is the first axis the user wants to scan; the indent expresses the parent/child relationship without needing a column for it.

**Rationale.**

- Grouping by kind first matches how users actually think about categories (income vs. expense is the top-level mental model in every personal-finance app the spec cites — YNAB, Copilot, Monarch).
- EXPENSE first because the user spends more often than they earn; the EXPENSE section is the one they'll interact with most. Inverting (INCOME first) was considered and rejected on this basis.
- Indenting children under their parent is the YNAB / Copilot convention and it scales to a single level cleanly without needing a tree widget.

**Alternatives considered.**

- *Single flat list, kind shown as a column or badge.* Rejected — the kind grouping is too central to the mental model to relegate to a column.
- *Two side-by-side columns (EXPENSE | INCOME).* Considered. Rejected for mobile: at narrow widths the two columns would have to stack anyway, and the stacked-cards layout works at every viewport without media-query gymnastics.
- *A `Table` per kind.* Considered. Rejected for the indented-children reason — `Table` doesn't have a natural way to express "this row is a child of the row above"; you'd end up with either a colspan hack or a `parent` column repeating the parent name on every child row.

---

## R14. Edit/create form fields & mode→capabilities mapping

**Decision.** The form fields are:

| Field | Type | Notes |
|---|---|---|
| `name` | text input | trimmed at boundary; 1–80 chars |
| `kind` | `Select` (INCOME / EXPENSE) | disabled if `parentId !== null` (kind is inherited from parent); also disabled if mode is `edit` AND the row has children (FR-005 `kind_change_blocked` rule, pre-flighted client-side for UX) |
| `parent` | `<CategoryPicker>` | filtered by `kind` (so only same-kind top-level categories appear); `excludeIds` includes the row's own id in edit mode |
| `color` | `ColorPicker` (12 swatches) | required; default = `slate` on create |
| `icon` | `IconPicker` (40 icons) | required; default = `tag` on create |

**Modes:**

- `create` — all fields editable. `parent` is optional. Default `kind = EXPENSE` (the more frequently created kind).
- `edit` — all fields editable EXCEPT `kind` when the row has children (server returns `kind_change_blocked` even if the client lets it through; the client also pre-flights the disabled state by reading the row's child count from a prop).
- `edit-archived` — only `name` is editable. `kind`, `color`, `icon`, and `parentId` are all disabled. (This follows feature 004's `FR-009a` archived-only-name pattern, applied here to the four non-money fields. The spec doesn't lock this specifically — see "Decision rationale" below.)

The mode→capabilities mapping mirrors feature 004's account form pattern. On submit, the server action's `safeParse` is the authoritative gate; the client-side disabled state is purely UX.

**Decision rationale for `edit-archived` field locks.** The spec's FR-009a equivalent for accounts says "while archived, only `name` is editable." The categories spec does NOT have an explicit FR-009a-style rule, but the implicit contract of "archive is not delete, but the row is paused" suggests treating archived rows as read-only-except-name for the same reasons feature 004 used: (1) the row may be referenced by future Transaction rows, and changing color/icon/kind on a paused row creates an inconsistency between what the historical reference "looked like" and what it "looks like now"; (2) the user can always unarchive, edit, and re-archive if they really want to change something. The plan ADOPTS this pattern for categories.

**Rationale.**

- A single unified form file with three modes is the same shape as `account-form.tsx`. Diffing the modes against each other is the easiest mental model for the implementer.
- Disabling `kind` on the client when the row has children is purely UX polish — the server-side rejection (`kind_change_blocked`) is the canonical gate. Pre-flighting on the client just saves a round trip when the user clicks "Save".
- The `edit-archived` mode locks more fields than `edit` mode, mirroring feature 004's pattern.

**Alternatives considered.**

- *Allow free editing of archived rows.* Rejected — see the consistency argument above.
- *Allow editing of `kind`, `color`, `icon` while archived but not `parentId`.* Rejected — the asymmetry is hard to explain to a user; pick one rule and stick to it.
- *Three separate form files (one per mode).* Rejected — the modes share 80%+ of their fields; one file with mode branches mirrors feature 004 and is easier to keep in sync.

---

## R15. Empty state — illustration + "Add a category" CTA, only reached after archiving everything

**Decision.** When `listCategories({ includeArchived: false })` returns `{ data: { categories: [] } }`, render the same `EmptyState` primitive used elsewhere in the shell with:

- Illustration: `<CategoriesIllustration />`, a new SVG at `components/illustrations/categories-illustration.tsx`.
- Title: "No categories yet".
- Description: "You've archived all your categories. Add a new one or toggle 'Show archived' above to see your archived list." (FR-016 / spec edge case "A user archives all their categories").
- Action: `{ label: "Add a category", onClick: openCreateSheet }`.

**This state is rarely reached.** The seeded user has 11 active categories on first visit; the empty state appears only after the user has archived every one of them and not created any replacements. The empty state is the long-tail recovery surface; the populated list is the happy path.

**Rationale.**

- The spec FR-016 explicitly calls out the `EmptyState` primitive as the zero-state pattern. Using it is required, not optional.
- The "Show archived" toggle (`Switch`) is in the header bar that renders above the empty state when the user has ever had categories — i.e., always, after signup. This means the empty state co-exists with the toggle, and the user can flip the toggle to recover their archived rows without going through "Add a category".

**Alternatives considered.** None — the spec locks the primitive and the pattern.

---

## R16. Error code catalog — 8 codes with documented triggers

**Decision.** The categories error catalog has eight codes (vs. feature 004's five). The two extra are domain-specific (`hierarchy_violation`, `kind_mismatch`, `kind_change_blocked`); the rest are direct lifts.

| Code | Trigger | Where raised |
|---|---|---|
| `unauthenticated` | No session at action boundary | Top of every action body |
| `validation_failed` | Zod `safeParse` fails (with `fieldErrors`) | After `safeParse` in any action |
| `not_found` | Target row doesn't exist OR belongs to another user (collapsed per FR-013) | `lib/categories/queries.ts` returns null |
| `hierarchy_violation` | `parentId` points to a row already at depth 1 OR equals the row's own id | Schema `superRefine` |
| `kind_mismatch` | `parentId` references a category whose `kind` differs from the submitted `kind` | Schema `superRefine` |
| `kind_change_blocked` | Update tries to change `kind` on a row with children | Schema `superRefine` (after `countChildrenOfForUser`) |
| `archived_field_locked` | Update tries to change a locked field on an archived row | Pre-Zod check in `updateCategory` |
| `internal_error` | Prisma throws unexpectedly | catch block in any action |

Cross-user `parentId` references collapse to `not_found` per FR-013 (the `superRefine` calls `getCategoryForUser`, which returns null for cross-user references — same shape as for non-existent ids).

**Rationale.**

- The three domain-specific codes (`hierarchy_violation`, `kind_mismatch`, `kind_change_blocked`) are distinct enough that collapsing them into `validation_failed` would erase information the form needs to surface a useful message. Keeping them separate means the UI can render targeted text ("A parent's kind cannot be changed while it has children" vs. "Parent and child must share a kind").
- The pattern mirrors feature 004 R16's "lowercase snake_case constants" convention. Renaming the codes between features would be a footgun.

**Alternatives considered.**

- *Collapse all parent-rule failures to `validation_failed` with field errors.* Considered. Rejected because the three rules have distinct user-facing messages and distinct recovery actions (change parent vs. change kind vs. move children first). Distinguishing them in the wire format keeps the UI simple.

---

## R17. Decimal precision — N/A

Categories store no money. No `Decimal` column. The constitution Principle I and feature 004's R18 are not in scope for this feature.

---

## R18. Migration — single Prisma migration, generated and committed

**Decision.** Run:

```bash
pnpm db:migrate -- --name add_category
```

The generated SQL lands at `db/migrations/<timestamp>_add_category/migration.sql`. The SQL creates (in order):

1. The `CategoryKind` enum (`CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');`).
2. The `Category` table with all columns.
3. Three indexes: `Category_userId_idx`, `Category_userId_archivedAt_idx`, `Category_userId_parentId_idx`.
4. Two FK constraints: `Category_userId_fkey` (CASCADE) and `Category_parentId_fkey` (RESTRICT).

The implementer reviews the generated SQL before commit. No `db push` (FR-001).

**Rationale.** Same as feature 004 R8 — Prisma-generated migrations are the project convention.

**Alternatives considered.** None.

---

## R19. Existing E2E preservation — one targeted change to `auth.spec.ts`

**Decision.** All existing tests must keep passing. The only change required is to `tests/e2e/auth.spec.ts`'s "shell navigates across all dashboard routes" test, which currently iterates over four routes (`accounts / transactions / budgets / settings`). After this feature, the nav has five routes (the four plus `categories`); the test iterator gets one new entry:

```ts
const routes = [
  { path: "/dashboard/accounts",      label: "Accounts",      h1: "No accounts yet" },
  { path: "/dashboard/categories",    label: "Categories",    h1: /* expected h1 */ },
  { path: "/dashboard/transactions",  label: "Transactions",  h1: "Transactions are coming soon" },
  { path: "/dashboard/budgets",       label: "Budgets",       h1: "Budgets are coming soon" },
  { path: "/dashboard/settings",      label: "Settings",      h1: "Settings are coming soon" },
] as const
```

The h1 on `/dashboard/categories` for a freshly-seeded user is the heading of the populated list (e.g., "Categories"). The auth.spec.ts test's user goes through signup, which now triggers the seed — so by the time the test hits `/dashboard/categories`, the page renders the populated list (not the empty state). The assertion is on the page's main h1 heading, which is "Categories" regardless of whether the list is populated or empty.

The signup test in `auth.spec.ts` will now create a user with 11 categories instead of 0. **No existing assertion in `auth.spec.ts` checks the post-signup category count, so no breakage.** Specifically:

- The "first signup → dashboard" test asserts the URL is `/dashboard` and the h1 "Welcome to Abacus" is visible; both still hold.
- The "shell navigates across all dashboard routes" test only checks URLs / labels / h1s; the categories addition is captured above.
- The "duplicate signup is rejected" test creates a second user-creation attempt with the same email; the unique constraint trips before any category seed runs, so no orphan categories appear. Verified by the existing assertion `count = 1`.

**Mobile drawer test:** does NOT iterate over routes; only clicks "Accounts" from the drawer. Unaffected.

The accounts E2E (`tests/e2e/accounts.spec.ts`) does NOT touch categories; unaffected.

**Rationale.** Surgical change to one test file; everything else is structurally unaffected because the existing assertions don't enumerate category counts or category-page state.

**Alternatives considered.**

- *Skip the auth.spec.ts change and let it fail.* Rejected — broken existing test.
- *Add a separate dashboard-shell smoke test for categories.* Considered. Rejected — duplicates the existing iterator; the single-test-file change is cleaner.

---

## R20. Sidebar navigation placement — Categories slots into MANAGE alphabetically

**Decision.** `components/shell/nav-items.ts` adds:

```ts
const categories: NavItem = { href: "/dashboard/categories", label: "Categories", icon: Tags }

export const navGroups: readonly NavGroup[] = [
  { label: "TRACK",  items: [dashboard, accounts, transactions] },
  { label: "MANAGE", items: [budgets, categories, settings] },  // alphabetical within MANAGE
] as const
```

Categories is placed in MANAGE (per the spec's locked clarification Q2). Within MANAGE, the order is alphabetical: Budgets, Categories, Settings.

The icon is `Tags` from `lucide-react` — chosen because (a) it's distinct from every other navbar icon (Wallet for Accounts, PieChart for Budgets, Settings for Settings, ArrowLeftRight for Transactions, LayoutDashboard for Dashboard), and (b) the "tag" metaphor maps cleanly to the "classification" semantic of a Category.

**Rationale.**

- Alphabetical placement within a group is the simplest sort rule and matches the convention TRACK already uses (Dashboard → Accounts is alphabetical-ish; more importantly, the group has a defensible internal ordering).
- The `Tags` icon is unused elsewhere in the navbar, so it's free for this slot.

**Alternatives considered.**

- *Frequency-of-use placement (put Categories first in MANAGE because it's visited more than Budgets).* Considered. Rejected — alphabetical is more predictable as the navbar grows; frequency is a guess.
- *Place Categories in TRACK instead of MANAGE.* Rejected — spec Q2 locks MANAGE.
- *Use a different icon (e.g., `Folder`, `List`, `Layers`).* `Tags` is the strongest semantic match; the others either evoke files (Folder) or are too generic (List).
