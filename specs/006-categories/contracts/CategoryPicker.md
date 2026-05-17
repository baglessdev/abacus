# UI Contract — `<CategoryPicker>`

The canonical reusable category-picker primitive. Locked here so future features 006 (Transactions) and 008 (Budgets) can mount it without renegotiating its shape (FR-018, SC-009).

## Location

`components/categories/category-picker.tsx`. **Outside** any route-bound `_components/` directory, so consumers in other features can import it. Marked `"use client"`.

## Props

```ts
type CategoryPickerProps = {
  /**
   * The currently-selected category id, or null for "no selection".
   * The picker is a controlled component — the parent owns this state.
   */
  value: string | null

  /**
   * Called when the user picks a category (or clears the selection).
   * Receives the picked category's stable id, or null if cleared.
   */
  onChange: (categoryId: string | null) => void

  /**
   * Optional filter — when set, only categories of this kind are listed.
   * Default: "any" (both kinds shown).
   *
   * Used by:
   *  - This feature's CategoryForm — passes the form's chosen kind so the
   *    parent picker only shows same-kind candidates (FR-009 / US2 scenario 4).
   *  - Feature 006's transaction form — passes the transaction's kind.
   *  - Feature 008's budget form — passes "EXPENSE" (budgets target spending).
   */
  kind?: "INCOME" | "EXPENSE" | "any"

  /**
   * When true, archived categories are listed.
   * Default: false (FR-011).
   *
   * This feature does not currently expose a true-value caller — the v1 picker
   * is consumed only by the create/edit form which never wants archived rows.
   * The prop exists so a future feature MAY surface archived rows (e.g., a
   * "show historical" toggle in Reports).
   */
  includeArchived?: boolean

  /**
   * Category ids to exclude from the list. Used by the edit form to prevent
   * setting a category as its own parent.
   *
   * In v1 with single-level hierarchy this is structurally redundant for
   * top-level categories (a top-level category can never be a candidate
   * parent of itself by FR-006 — you can't pick a row that has children
   * because picking it would be reset to top-level). But the prop is
   * forward-compatible for a future multi-level world where descendants
   * must also be excluded to break cycles.
   */
  excludeIds?: readonly string[]

  /** When true, the picker trigger is disabled (read-only display). */
  disabled?: boolean

  /** Placeholder text in the trigger button when value is null. Default: "Pick a category". */
  placeholder?: string

  /** Accessibility label for screen readers. Default: "Category". */
  ariaLabel?: string
}
```

## Render contract

### Trigger

A `Button` (variant `outline`) showing:

- When `value === null`: the placeholder text, plus a chevron-down icon on the right.
- When `value` is set and the matching category is known: the category's icon glyph (resolved via `getCategoryIcon(category.icon)`, with the category's color applied), then the category's name, then a chevron-down icon on the right.
- When `value` is set but the matching category is not (loading, stale, or excluded): the placeholder text (the picker degrades gracefully).

The trigger has `aria-haspopup="listbox"`, `aria-expanded={open}`, and `aria-label={ariaLabel ?? "Category"}`.

### Popover content

Clicking the trigger opens a `Popover` (Radix). Inside the popover lives a `Command` (cmdk):

```
┌─────────────────────────────────┐
│ 🔍 Search categories...         │  ← Command.Input
├─────────────────────────────────┤
│ EXPENSE                          │  ← Command.Group label
│   🍴  Food                       │
│       🛒  Groceries              │  ← child, indented
│       🍴  Restaurants            │  ← child, indented
│   🏠  Housing                    │
│   🚗  Transport                  │
│   …                              │
├─────────────────────────────────┤
│ INCOME                           │  ← Command.Group label
│   💼  Salary                     │
│   🪙  Other Income               │
└─────────────────────────────────┘
```

- The two `Command.Group` headers (`EXPENSE` first, then `INCOME`, matching the list page convention per research R13).
- Within each group: top-level categories alphabetical, children alphabetical and indented (left padding) under their parent.
- Each row shows: the icon glyph (rendered with the category's `color` HSL value), the category name, and (for child rows) a small parent name hint to disambiguate same-named children.
- cmdk provides type-ahead filtering across visible rows — typing "gro" filters to "Groceries". The filter searches `name`; children's parent names are searchable too (typing "food" surfaces "Groceries" and "Restaurants" under "Food").

### Filtering rules

The picker calls `listCategories({ includeArchived, kind })` on mount and stores the result in component state. The local filter logic then:

1. Excludes any row whose `id` is in `excludeIds`.
2. If `kind` is `"INCOME"` or `"EXPENSE"`, the other-kind `Command.Group` is omitted entirely.
3. If `includeArchived` is `false`, archived rows are NOT in the result set (the server-side helper already excluded them).
4. If `includeArchived` is `true`, archived rows render with reduced opacity and a small "Archived" tag inline, but ARE pickable.

### Selection

Pressing Enter on a focused row, or clicking a row, calls `onChange(category.id)` and closes the popover. There is a "Clear selection" affordance at the top of the popover (a Command.Item with text "No category" or similar) that calls `onChange(null)` and closes — useful when the picker is used as an optional parent selector in the edit form.

### Stale-data behavior

After a successful mutation elsewhere on the page (e.g., the user creates a new category in the form, then immediately wants to pick it as a parent for the next category), the parent component re-mounts the picker with a fresh `key` prop, OR the picker re-fetches on next open. The plan picks **re-mount on key prop** because it's simpler and the categories page re-renders the form completely on every sheet open. Future consumers (transaction form, budget form) can use the same re-mount-on-success strategy.

## Accessibility contract (binding)

- Trigger button is keyboard-focusable (`tabindex` not overridden); pressing Enter or Space opens the popover.
- Popover open state is mirrored on the trigger via `aria-expanded`.
- The popover container has `role="listbox"`.
- Each picker row has `role="option"` (provided by cmdk) and `aria-selected` reflects whether it matches `value`.
- Arrow Up / Arrow Down moves focus among visible options; Home / End jumps to first / last; type-ahead filters; Escape closes the popover and returns focus to the trigger.
- The category color is NEVER the sole carrier of identity in the rendered row — every row shows icon + name + (for children) parent hint, so a color-blind user can read it (FR-020, SC-011).

## Callers

| Caller | Where | When | `kind` prop | `includeArchived` |
|---|---|---|---|---|
| `CategoryForm` (this feature) | `app/(shell)/dashboard/categories/_components/category-form.tsx` | Mounted as the "parent" field of the create/edit form | matches the form's chosen kind | `false` |
| Transaction form (future, feature 006) | feature 006 owns the path | Mounted as the "category" field of the transaction form | matches the transaction's kind (or `"any"` if uncategorized is allowed) | `false` |
| Budget form (future, feature 008) | feature 008 owns the path | Mounted as the "category" field of the budget form | `"EXPENSE"` | `false` |

All three consumers receive the picked `categoryId` via `onChange` and store it in their own form state. The picker has zero opinions about how the consumer persists.

## Internal data fetch

The picker calls the `listCategories` server action from `lib/categories/actions.ts` (per the `listCategories.md` contract). It does NOT touch Prisma directly; it does NOT hold its own Zod schema; it does NOT enforce data-scoping rules — those are all upstream guarantees from the server action.

If `listCategories` returns `{ error: ... }`, the picker renders a single non-interactive popover option saying "Failed to load categories." and disables selection until the next mount.

## Out of scope for this contract (deferred to future features)

- A "create new category from inside the picker" affordance (would require an inline form; complicates the picker's prop surface). Deferred.
- A "recent / favorite" section at the top of the popover. Deferred.
- Drag-to-reorder within the picker. Out of scope per spec FR-019.
- Multi-select. Deferred — every known consumer is single-select.

## Applicable FRs

FR-002, FR-003, FR-010, FR-011, FR-013, FR-018, FR-020, FR-021.

## Applicable SCs

SC-003, SC-007, SC-009, SC-010, SC-011, SC-014.
