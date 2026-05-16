# Feature 005 — UI Contracts

This directory documents the four UI contract surfaces introduced or upgraded by the Branded UI Polish chore. **There are no HTTP-endpoint contracts in this chore** — the chore is rendering-only, no API routes are added or modified, and no server action is added or modified.

A UI contract surface is a component whose props, render contract, and accessibility behavior are stable enough that downstream callers can depend on them across features. Each contract file follows the same structure:

1. **Location** — where the file lives in the source tree.
2. **Props** — TypeScript signature sketch (no implementation).
3. **Render contract** — what the component renders, and what it MUST NOT render.
4. **Accessibility contract** — ARIA, keyboard, focus behavior.
5. **Callers** — which files import this contract (current + planned future).
6. **Applicable FRs** — the spec functional requirements this contract satisfies.

## Files

- [`AbacusIcon.md`](./AbacusIcon.md) — the single brand-mark contract surface. Consumed everywhere the Abacus mark appears (marketing header, marketing footer, shell sidebar, shell footer, favicon, OG image, dashboard welcome illustration). FR-001, FR-002, FR-003, FR-004, FR-006, FR-009.
- [`Money.md`](./Money.md) — the single monetary-display contract surface going forward. Internally consumes `formatAmount` from `lib/money/format.ts`; never performs arithmetic. Sign-aware color; tabular numerals; currency always shown. FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-036.
- [`ShellFooter.md`](./ShellFooter.md) — the authenticated-shell footer contract. Mounted once inside the shell layout; appears on every authenticated route. FR-016, FR-017, FR-018, FR-019.
- [`EmptyState.md`](./EmptyState.md) — the empty-state contract (extension of the existing feature-002 primitive). New `illustration` slot + new `preview` slot; existing `icon` prop preserved for back-compat. FR-020, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027.

## What is NOT a contract here

- **Per-route illustration components** (`<AbacusIllustration>`, `<AccountsIllustration>`, `<TransactionsIllustration>`, `<BudgetsIllustration>`, `<SettingsIllustration>`) — these are concrete consumers of the brand-mark aesthetic and the empty-state contract, not contracts in their own right. They are documented in [`../data-model.md`](../data-model.md).
- **`<WelcomePanel>`** — a single-purpose call site of `<EmptyState>` + `<AbacusIllustration>`, not a contract; documented in [`../data-model.md`](../data-model.md).
- **`navGroups` data export** — a typed data shape, not a component contract; documented in [`../data-model.md`](../data-model.md).
- **CSS color tokens (`--money-positive`, `--money-negative`)** — token definitions, documented in [`../data-model.md`](../data-model.md) and `research.md` R6.
- **`app/icon.tsx` / `app/apple-icon.tsx` / `app/opengraph-image.tsx`** — Next.js framework conventions; they consume `<AbacusIcon>` (via inline-style transcription, since `ImageResponse` doesn't accept Tailwind classes) but are not themselves contracts other code imports.

## Convention

Contract files are named after the component (PascalCase, no file extension): `AbacusIcon.md`, `Money.md`, `ShellFooter.md`, `EmptyState.md`. Per-surface contracts MUST be stable for cross-feature use — when feature 006 (Transactions) lands, it can rely on `<Money>` and `<EmptyState>` exactly as documented here without re-reading the implementation. Future contract additions in later features extend this directory.
