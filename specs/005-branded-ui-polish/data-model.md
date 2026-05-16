# Feature 005 — Data Model

## No domain entities introduced

**No Prisma migration. No new database column. No new domain entity. No change to any existing entity.** This chore is rendering-layer-only. FR-038 binds this conclusion and it is verifiable by inspection — `git diff db/` after the chore lands produces zero changes.

For completeness:

- `User` (from feature 003) — unchanged.
- `Account` (from feature 004) — unchanged.
- `AccountType` enum (from feature 004) — unchanged.
- No new model added.
- No new column added to any existing model.
- No new index added.
- No new foreign-key constraint added.
- No new check constraint added.
- No new migration in `db/migrations/`.

The data path through this chore is read-only: the dashboard welcome panel server component reads the session via `auth()` and the user's account count via the **existing** `listAccounts({ includeArchived: false })` server action from feature 004. Both calls are unchanged from feature 004's behavior; no new query, no new helper.

## UI contract surfaces (rendering artefacts, not entities)

The chore introduces four UI contract surfaces and a small set of call-site components that consume them. None of these are persisted; they have no database representation. They are documented here so the implementer has a single map of what each artefact owns, where it lives, and who depends on it. Full per-surface contracts (props, render contract, accessibility contract, callers, applicable FRs) live in [`contracts/`](./contracts/).

### `<AbacusIcon>` — the brand-mark contract

| Property | Value |
|---|---|
| Location | `components/brand/abacus-icon.tsx` |
| Shape | Inline React SVG component |
| Key props (sketch) | `{ size?: number; className?: string; accent?: "primary" \| "currentColor"; "aria-label"?: string }` |
| Default size | 20 px (header size) |
| Color behavior | Frame + rod strokes inherit `currentColor`; bead fill controlled by `accent` prop (defaults to `currentColor`, can be set to `"primary"` for the violet brand accent) |
| Consumed by | `components/shell/brand.tsx`, `components/marketing/marketing-header.tsx`, `components/marketing/marketing-footer.tsx`, `components/shell/shell-footer.tsx`, `components/illustrations/abacus-illustration.tsx` (re-export at larger size), `app/icon.tsx` (inline-style transcription), `app/apple-icon.tsx` (inline-style transcription), `app/opengraph-image.tsx` (inline-style transcription) |
| Applicable FRs | FR-001, FR-002, FR-003, FR-004, FR-006, FR-009 |

### `<Money>` — the monetary-display contract

| Property | Value |
|---|---|
| Location | `components/money/money.tsx` |
| Shape | Client component (`"use client"` — sign-based class branching uses runtime parse of the amount string) |
| Key props (sketch) | `{ amount: string \| Money; currency: string; prominent?: boolean; align?: "left" \| "right"; className?: string }` |
| Backing formatter | `lib/money/format.ts → formatAmount(amount, currency)` (UNCHANGED) |
| Renders | A single `<span>` with `tabular-nums` always applied, sign-aware text-color class (`text-foreground` / `text-muted-foreground` / `text-money-negative`), optional `font-semibold text-lg` from `prominent`, optional `text-right` from `align="right"` |
| Refuses | `number` (TypeScript signature blocks the accidental float erosion path — Principle I) |
| Always renders | The currency together with the amount (FR-012; structurally impossible to render amount without currency because `currency` is a required prop and the formatter always includes it in the output) |
| Consumed by | `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` (balance column), `app/(shell)/dashboard/accounts/_components/account-form.tsx` (read-back during edit — if surfaced), future features (006 Transactions, 007 Dashboard, 008 Budgets, 015 Charts) |
| Applicable FRs | FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-036 |

### `<ShellFooter>` — the authenticated-shell footer contract

| Property | Value |
|---|---|
| Location | `components/shell/shell-footer.tsx` |
| Shape | Server component (no client-side state needed) |
| Key props | none |
| Renders | A `<footer>` element containing `<AbacusIcon>` + "Abacus" wordmark + a short attribution line (copyright + optional build-time version string from `process.env`) |
| Sticky-bottom strategy | Flex layout (NOT `position: fixed`) — mounted at flex-end of the main column inside `app-shell.tsx` |
| Consumed by | `components/shell/app-shell.tsx` (mounted once; appears on every authenticated route) |
| Applicable FRs | FR-016, FR-017, FR-018, FR-019 (validates that the toggle remains reachable from the header, where it stays per R14) |

### `EmptyState` (upgraded) — the empty-state contract

| Property | Value |
|---|---|
| Location | `components/shell/empty-state.tsx` (existing file, MODIFIED) |
| Shape | Client component (existing) — extended in-place, NOT replaced |
| Key props (sketch — after upgrade) | `{ title: string; description?: string; illustration?: ReactNode; icon?: LucideIcon; action?: EmptyStateAction; preview?: ReactNode }` |
| Precedence rule | `illustration` takes precedence over `icon` when both are provided (FR-020) |
| Back-compat preserved | The existing `icon: LucideIcon` prop continues to work; `(shell)/error.tsx` (which passes `icon={CircleAlert}`) continues to render correctly without modification (FR-020) |
| Render order | illustration / icon → title → description → action → preview |
| Preview slot a11y | Wrapped in `<div aria-hidden="true" tabIndex={-1}>` (FR-021) |
| Consumed by | `app/(shell)/error.tsx` (unchanged caller — back-compat path), `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` (zero-state, now passes `illustration` and removes `icon`), `app/(shell)/dashboard/transactions/page.tsx`, `app/(shell)/dashboard/budgets/page.tsx`, `app/(shell)/dashboard/settings/page.tsx`, `components/shell/welcome-panel.tsx` |
| Applicable FRs | FR-020, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027 |

### Per-route illustration components (call sites of the brand mark)

These are concrete consumers, not contracts of their own. Each is a small inline React SVG component, stroke-based, monochrome with one violet accent, ~120×120 viewBox, static (no animation). All accept `{ size?: number; className?: string; "aria-label"?: string }`.

| Component | Location | Used by | Glyph concept |
|---|---|---|---|
| `<AbacusIllustration>` | `components/illustrations/abacus-illustration.tsx` | `components/shell/welcome-panel.tsx` | Larger version of `<AbacusIcon>` — the brand mark at ~120px |
| `<AccountsIllustration>` | `components/illustrations/accounts-illustration.tsx` | `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` (zero-state) | Stacked cards |
| `<TransactionsIllustration>` | `components/illustrations/transactions-illustration.tsx` | `app/(shell)/dashboard/transactions/page.tsx` | Two opposing arrows + horizontal lines |
| `<BudgetsIllustration>` | `components/illustrations/budgets-illustration.tsx` | `app/(shell)/dashboard/budgets/page.tsx` | Pie-slice + progress bar |
| `<SettingsIllustration>` | `components/illustrations/settings-illustration.tsx` | `app/(shell)/dashboard/settings/page.tsx` | Slider / gear cluster |

Applicable FRs: FR-022 (welcome panel uses `<AbacusIllustration>`), FR-023 (accounts uses `<AccountsIllustration>`), FR-024 (transactions uses `<TransactionsIllustration>`), FR-025 (budgets uses `<BudgetsIllustration>`), FR-026 (settings uses `<SettingsIllustration>`), FR-027 (all five share the stroke-based monochrome-with-one-accent aesthetic).

### `<WelcomePanel>` — call site of `<EmptyState>` + `<AbacusIllustration>`

Not a contract in its own right; documented here so the data flow is explicit.

| Property | Value |
|---|---|
| Location | `components/shell/welcome-panel.tsx` |
| Shape | Server component (it reads `session` + `accountCount` server-side) |
| Reads | `auth()` for the session (existing helper); `listAccounts({ includeArchived: false })` (existing server action from feature 004) for the account count |
| Renders | The upgraded `<EmptyState>` with: `illustration={<AbacusIllustration />}`, `title="Welcome to Abacus"`, `description={<copy that mentions Accounts is shipped, Transactions+Budgets are coming>}`, `action={{ label: "View accounts", href: "/dashboard/accounts" }}` |
| Consumed by | `app/(shell)/dashboard/page.tsx` |
| Applicable FRs | FR-022 |

### `navGroups` — the sidebar grouping data export

Not a component; a typed data export consumed by both `Sidebar` and `MobileNav`.

| Property | Value |
|---|---|
| Location | `components/shell/nav-items.ts` (existing file, MODIFIED) |
| Shape | `export const navGroups: NavGroup[]` where `NavGroup = { label: string; items: NavItem[] }` |
| Contents | Two groups: `TRACK` (`Dashboard`, `Accounts`, `Transactions`) and `MANAGE` (`Budgets`, `Settings`) per FR-028 |
| Back-compat | `export const navItems: NavItem[] = navGroups.flatMap(g => g.items)` retained so any caller importing the flat list keeps working |
| Consumed by | `components/shell/sidebar.tsx`, `components/shell/mobile-nav.tsx` |
| Applicable FRs | FR-028, FR-029, FR-030 |

### `--money-positive` and `--money-negative` CSS tokens

Not a component; CSS-level artefacts that the rendering primitive depends on.

| Property | Value |
|---|---|
| Location | `app/globals.css` (light + dark variants in `:root` and `.dark`) |
| Tailwind exposure | `tailwind.config.ts` extends `theme.colors` with `money-positive: "hsl(var(--money-positive))"` and `money-negative: "hsl(var(--money-negative))"`. Utilities `text-money-positive`, `bg-money-positive`, `text-money-negative`, `bg-money-negative` are then available. |
| HSL values | See research.md R6 for exact values and WCAG measurement. |
| Used by (chore) | `<Money>` applies `text-money-negative` on negative amounts. `--money-positive` is RESERVED — defined in CSS, exposed via Tailwind, but NOT applied by `<Money>` (FR-013 explicitly defers its use to future features). |
| Will be used by (future) | Feature 007 (Dashboard income widget), Feature 008 (Budget surplus marker), Feature 015 (Charts gain series). |
| Applicable FRs | FR-007, FR-008, FR-013, FR-037 |

## What this section deliberately does NOT contain

- **SQL.** No CREATE TABLE, no ALTER, no migration script. (FR-038)
- **Indexes.** No new indexes. (FR-038)
- **Constraints.** No new constraints. (FR-038)
- **Decimal precision discussion.** Unchanged from feature 004's `NUMERIC(20, 8)` on `Account.startingBalance`. (FR-038)
- **Foreign keys.** None added; none modified. (FR-038)
- **Cross-user isolation rule.** Unchanged from feature 004's `where: { id, userId }` query shape; the welcome panel reads through the existing `listAccounts` action which already enforces it.
- **Data scoping discussion.** N/A — the chore adds no data and no queries.

## What gets cleaned up

Nothing. Feature 002's flat `navItems` export, feature 004's `accounts-list.tsx` direct call to `formatAmount`, the legacy `<Wallet>` brand icon in `components/shell/brand.tsx` and `components/marketing/marketing-header.tsx`, and the disabled "Add your first account" CTA + "future feature" caption on `/dashboard/page.tsx` are all REPLACED in place; nothing is deleted from the codebase that isn't being directly modified by a task in this chore.
