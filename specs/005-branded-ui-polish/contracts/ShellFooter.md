# UI Contract — `<ShellFooter>`

The authenticated-shell footer. Mounted once inside `(shell)/layout.tsx` (via `app-shell.tsx`) so every authenticated route inherits it without per-route wiring. The footer is content-minimal — a brand reaffirmation, not a navigation surface — per FR-017. Sticky-bottom on short pages via flex layout (not `position: fixed`) so it never visually conflicts with the mobile drawer (FR-018).

## Location

`components/shell/shell-footer.tsx`

## Signature

```ts
export function ShellFooter(): JSX.Element
```

No props. The component is a pure layout artefact with invariant content across every authenticated route.

## Render contract

The component renders a single `<footer>` element containing:

1. `<AbacusIcon>` — small (header-size, 20 px) with `accent="primary"` and `aria-hidden="true"` (the wordmark next to it provides the accessible name).
2. The wordmark **"Abacus"** rendered as text (not as an image; not as a separate component) using the brand typeface (Inter) at small size and semibold weight, with `tracking-tight`.
3. A short attribution line — at minimum a copyright statement (`© <year> Abacus`). The implementer MAY include a build-time version string sourced from `process.env` (e.g., `Build abc123`); if no version source is wired, the version line is omitted entirely.

The footer MUST NOT:

- Replicate the marketing footer's full link farm. (FR-017 — "a brand reaffirmation, not a navigation surface.")
- Include a theme toggle. The theme toggle stays in the header (research.md R14; the toggle remains reachable on every authenticated route via the existing header location).
- Include user-account controls (logout, profile, settings). Those stay in the header's user menu.
- Include navigation links to other routes inside the dashboard.
- Render any link that opens a modal or triggers a client-side action.

Allowed (small footprint):

- A static link to `/` (marketing home) wrapped around the brand-mark + wordmark lockup. Optional — the implementer's choice. If included, it does NOT count as a navigation surface (it's the same single brand reaffirmation).

The footer MUST appear:

- On every authenticated route (`/dashboard`, `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`) at every supported viewport width (320–2560 px). FR-016 + SC-002.
- At the bottom of the viewport on pages whose content is shorter than the viewport (sticky-bottom behavior). FR-018.
- At the natural end of scrollable content on pages whose content exceeds the viewport. FR-018.

The sticky-bottom behavior is achieved via flex layout in `app-shell.tsx`:

```tsx
<div className="flex min-h-screen flex-1 flex-col">
  <Header onOpenMobileNav={...} user={user} />
  <main ref={mainRef} tabIndex={-1} className="flex-1 p-6 outline-none md:p-8">
    {children}
  </main>
  <ShellFooter />
</div>
```

The `<main>` has `flex-1` which pushes `<ShellFooter>` to the flex-end (bottom of the viewport on short pages). This is NOT `position: fixed`; the footer scrolls naturally with the page on long content.

## Accessibility contract

- The root element is a `<footer>` (HTML5 landmark). Screen readers and keyboard users navigating by landmarks find the footer naturally.
- The brand-mark icon is `aria-hidden="true"` because the wordmark next to it provides the accessible name.
- The copyright text is plain inline text; no special a11y treatment needed.
- The footer is part of the document flow, not `position: fixed`, so it does not overlay content and does not conflict with the mobile drawer's focus trap (when the drawer is open, focus stays inside the drawer per feature 002; the footer is in the underlying document, blocked from interaction while the drawer's overlay is active).
- The footer is keyboard-reachable in source order — Tab from the last focusable element in `<main>` reaches the footer's internal focusable elements (e.g., the optional `/` link, if rendered).
- The footer respects the user's reduced-motion preference; no animations are introduced.

## Callers

### Current chore

| File | Usage |
|---|---|
| `components/shell/app-shell.tsx` | Mounted once. The only caller in the chore. |

### Future

The component is intentionally restrictive — no props, no variants. Future features that need a different footer treatment on a specific route should NOT extend this component; they should establish a separate contract. This contract is "the authenticated-shell footer" — singular.

## Applicable FRs

- **FR-016** — Footer rendered at the bottom of every authenticated route. ✓ (Mounted once in `app-shell.tsx`; appears via shell composition on every route.)
- **FR-017** — Content-minimal: at least brand mark + wordmark + attribution line. ✓ (Render contract codifies this minimum.)
- **FR-018** — Pinned to bottom on short pages (sticky-bottom); natural-end on long pages; does not conflict with mobile drawer. ✓ (Flex layout achieves this without `position: fixed`.)
- **FR-019** — Theme toggle remains reachable from every authenticated route. ✓ (Toggle stays in the header per research.md R14; the footer does not host the toggle, but the requirement is met because the header continues to host it on every route.)
- **SC-002** — Renders on every authenticated route at every supported viewport width in 100% of states. ✓ (Single-mount in shell layout ensures this structurally.)
