# UI Contract — `<EmptyState>` (upgraded)

The empty-state contract surface, **extended** from the feature-002 primitive. Two new optional slots: an `illustration` slot for brand-consistent SVG illustrations (takes precedence over the existing `icon` prop when both are provided), and a decorative `preview` slot for the faded mocks shown on the not-yet-shipped routes. The existing `icon: LucideIcon` prop continues to work — feature 002's `app/(shell)/error.tsx` (which passes `icon={CircleAlert}`) renders unchanged after the upgrade.

## Location

`components/shell/empty-state.tsx` (existing file, MODIFIED — not a new file)

## Signature

### Before (feature 002 / 004)

```ts
type EmptyStateProps = {
  title: string
  description: string
  icon: LucideIcon          // REQUIRED
  action?: EmptyStateAction
}
```

### After (this chore)

```ts
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

type EmptyStateAction = {
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
}

type EmptyStateProps = {
  /** Headline. Always rendered. */
  title: string
  /** Subtitle / supporting copy. Optional. */
  description?: string
  /**
   * NEW: brand-consistent illustration slot. When provided, this is what the
   * component renders above the title. Takes precedence over `icon` when both
   * are passed. ReactNode so callers can pass any of the components from
   * `components/illustrations/` or any inline SVG.
   */
  illustration?: ReactNode
  /**
   * PRESERVED for back-compat. The feature-002 / feature-004 call sites
   * (`(shell)/error.tsx`, accounts zero-state) pass an icon here. This prop
   * continues to work; when `illustration` is also provided, `illustration`
   * wins. Now optional instead of required.
   */
  icon?: LucideIcon
  /** Primary call-to-action button. Optional. */
  action?: EmptyStateAction
  /**
   * NEW: decorative preview slot. When provided, rendered below the action
   * (so the action stays above the fold on short viewports). The preview is
   * wrapped in `<div aria-hidden="true" tabIndex={-1}>` and excluded from the
   * accessibility tree and the keyboard tab order. Callers MUST treat this
   * as decorative-only: no interactive elements inside.
   */
  preview?: ReactNode
}

export function EmptyState(props: EmptyStateProps): JSX.Element
```

## Render contract

Render order (top-to-bottom):

1. **Illustration or icon** — render `illustration` if provided; otherwise render the `icon` (using the existing 12×12 muted-foreground treatment from feature 002); otherwise render nothing for this slot.
2. **Title** — always rendered. Heading, 2xl-equivalent size, semibold, tight tracking.
3. **Description** — rendered only if provided. Max-width prose, muted-foreground.
4. **Action** — rendered only if provided. Same render rules as feature 002: an `<a>` (via `<Button asChild>`) if `href` is set; otherwise a `<button>` with `onClick`; honors `disabled`.
5. **Preview** — rendered only if provided. Wrapped in `<div aria-hidden="true" tabIndex={-1}>`. The wrapper's children are at the implementer's discretion (typically a faded, opacity-reduced mock of the loaded experience — see FR-024, FR-025).

The component MUST:

- Render `title` always.
- Honor the precedence rule: `illustration ?? <Icon />`. If both are provided, `illustration` wins; no warning is logged.
- Wrap `preview` in `aria-hidden="true" tabIndex={-1}` exactly. The wrapper's class/style is up to the implementer (the existing `<div>` flex column from feature 002 is acceptable).
- Not introduce additional interactivity. The component has no internal state.

The component MUST NOT:

- Render `preview` above the action. The ordering rationale: keep the action above the fold on short viewports. (Research.md R12 documents this.)
- Make `preview` focusable, interactive, or screen-reader-accessible. The `aria-hidden="true"` + `tabIndex={-1}` wrapper is the structural guarantee.
- Render anything if `title` is missing. (Runtime invariant; TypeScript's required-prop rule already enforces this at compile time.)
- Strip or modify children of the `preview` ReactNode. Whatever the caller passes is rendered verbatim inside the aria-hidden wrapper.
- Apply illustration / icon sizing inconsistently. The existing `h-12 w-12 text-muted-foreground` treatment is preserved for the `icon` fallback; `illustration` slot accepts ReactNode at the caller's sizing.

## Accessibility contract

- **Title** is rendered as a heading element (`<h1>` or `<h2>` — the existing primitive uses `<h1>`). When the empty-state is the page's only content, `<h1>` is the right semantic level.
- **Illustration / icon** must be decorative when paired with a visible title. The illustration slot's caller is responsible for the SVG's `aria-hidden`; the icon fallback applies `aria-hidden="true"` automatically (as the existing primitive does today).
- **Description** is plain text inside a `<p>`; no special a11y.
- **Action** uses the shadcn `<Button>` primitive, which is already a11y-compliant (keyboard activation via Enter/Space, focus ring, `disabled` state propagated).
- **Preview** is **always** `aria-hidden="true"` (no exceptions). The wrapper is `tabIndex={-1}` to prevent focus traversal from landing inside it. FR-021 binds this.
- Color contrast inside the preview (which may be opacity-reduced for visual fade) is intentionally not held to WCAG AA, because the preview is not part of the accessibility tree. Screen-reader users do not perceive it; sighted users perceive it as decoration only.

## Callers

### Current chore

| File | Usage |
|---|---|
| `app/(shell)/error.tsx` | UNCHANGED. Continues to pass `icon={CircleAlert}` + `title` + `description`. Back-compat preserved. |
| `app/(shell)/dashboard/accounts/_components/accounts-list.tsx` | Zero-state. Migrated to pass `illustration={<AccountsIllustration />}` instead of `icon={Wallet}`. `title`, `description`, `action` unchanged. |
| `app/(shell)/dashboard/transactions/page.tsx` | Coming-soon. Passes `illustration={<TransactionsIllustration />}`, route-specific `title` ("Transactions are coming soon"), one-line `description` (no roadmap number, no commitment), `preview={<TransactionsPreview />}`, NO `action`. |
| `app/(shell)/dashboard/budgets/page.tsx` | Coming-soon. Passes `illustration={<BudgetsIllustration />}`, route-specific `title`, one-line `description`, `preview={<BudgetsPreview />}`, NO `action`. |
| `app/(shell)/dashboard/settings/page.tsx` | Coming-soon. Passes `illustration={<SettingsIllustration />}`, route-specific `title`, one-line `description`. **NO `preview`** (FR-026). NO `action`. |
| `components/shell/welcome-panel.tsx` | Dashboard home. Passes `illustration={<AbacusIllustration />}`, `title="Welcome to Abacus"`, multi-feature `description`, `action={{ label: "View accounts", href: "/dashboard/accounts" }}`. NO `preview`. |

### Future

This is the canonical empty-state surface across the app (assumption "The existing `EmptyState` primitive from feature 002 is the single empty-state contract surface across the app" from spec). Future features extend this contract by:

- Using it directly with the existing prop set (the common case).
- Proposing additional slots in a future plan if a need arises (e.g., a secondary action). The chore deliberately does NOT pre-add slots that no current FR requires.

## Applicable FRs

- **FR-020** — Upgrade `EmptyState` to support an `illustration` slot in addition to `icon`. ✓ (New slot added; `icon` preserved.)
- **FR-021** — Decorative `preview` slot, announced as decorative to AT, not in keyboard tab order. ✓ (Wrapper applies `aria-hidden="true"` + `tabIndex={-1}`.)
- **FR-022** — `/dashboard` welcome panel uses the upgraded primitive with the abacus mark as illustration. ✓ (Via `<WelcomePanel>` caller.)
- **FR-023** — `/dashboard/accounts` zero-state migrated to upgraded primitive with brand-consistent illustration; CTA behavior preserved. ✓ (`<AccountsIllustration>` + unchanged `openCreateSheet` action.)
- **FR-024** — `/dashboard/transactions` coming-soon with illustration + headline + one-line description + decorative preview; no CTA. ✓ (Caller usage codifies.)
- **FR-025** — `/dashboard/budgets` coming-soon with same shape. ✓
- **FR-026** — `/dashboard/settings` coming-soon: illustration + headline + one-line description; **no preview**; no CTA. ✓ (Caller usage codifies the "no preview" rule.)
- **FR-027** — All illustrations static, monochrome with one accent, stroke-based, no third-party library, no animation library. ✓ (Per-route illustration components honor this; the primitive itself imposes no constraint on the illustration ReactNode, but the caller — and the chore — supplies illustrations that satisfy the constraint.)
