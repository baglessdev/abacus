# Feature 005 — Quickstart

Local-run delta for a developer who has features 001–004 already working. If you do not, run those feature quickstarts in order first, then return here.

This chore is rendering-only — no schema change, no new env vars, no new runtime dependencies. The setup steps are correspondingly small; the bulk of this document is the **visual verification checklist** that completes the audit task.

## 1. Pull and install

```bash
git fetch && git checkout branded-ui-polish
pnpm install
```

`pnpm install` should report no changes — this chore introduces **zero new runtime dependencies** (FR-039). Inter ships via `next/font/google` (built into Next.js); the OG image via `next/og` (built in); the favicon via `app/icon.tsx` (built in). If `pnpm install` reports new packages, something has gone wrong with the chore — investigate before proceeding.

## 2. No environment changes

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` from features 001–003 are all that's needed. Verify with:

```bash
cat .env.local
```

`pnpm dev` will still fail fast with a Zod error if any required var is missing.

## 3. No migration

Skip `pnpm db:migrate`. This chore introduces **no Prisma migration** (FR-038). The database from feature 004 is unchanged.

## 4. Start the dev server

```bash
pnpm dev
```

Visit `http://localhost:3000`.

## 5. Visual verification checklist

The visual scope is small — one favicon, one OG image, the marketing surface, and five authenticated routes — so manual review covers the chore's audit bar (research.md R20). Walk this checklist after every significant change set.

### 5a. Marketing surface (`/`)

Open `/` in a fresh incognito window.

- [ ] **Brand mark in marketing header**: an abacus (frame + rods + beads), violet beads, replacing the previous `lucide Wallet` icon.
- [ ] **Wordmark "Abacus"** rendered next to the mark in the Inter typeface.
- [ ] **Inter loaded**: page body text, hero headline, feature card titles, and changelog dates all use Inter. Compare to system sans-serif if you're unsure — Inter has narrower, more uniform letters than Apple's `-apple-system`.
- [ ] **No flash of unstyled text** on initial load. Hard-refresh (Cmd+Shift+R) and watch for a visible swap from a fallback font; the swap should be subtle and fast.
- [ ] **Hero typography refresh**: headline reads in tightened line-height + larger size; "Learn more" outline button is present below the existing CTAs, with `href="#changelog"`. Clicking smoothly scrolls to the changelog.
- [ ] **Feature grid icons framed**: each of the three card icons is inside a small rounded square with the violet primary tint (`bg-primary/10 text-primary`).
- [ ] **Changelog beads**: each entry's bullet on the left rail is bead-shaped (a small horizontal rod-stub + filled circle), not a plain circle.
- [ ] **Marketing footer**: refreshed to lead with the new brand mark + wordmark on the same line as the copyright. Same links as before (copy preserved per FR-034).

### 5b. Favicon

- [ ] **Browser tab favicon**: an abacus mark at 16×16. Check at the actual tab size — open `/` in a tab and look at the tab strip; the favicon should be recognisable as an abacus (you should be able to make out the frame and beads).
- [ ] **Direct URL**: visit `http://localhost:3000/icon.png`. You should see a 32×32 PNG of the abacus mark with transparent background. (This is the file Next.js generates from `app/icon.tsx`.)
- [ ] **Apple icon**: visit `http://localhost:3000/apple-icon.png`. You should see a 180×180 PNG. (This is from `app/apple-icon.tsx`.)
- [ ] **Safari pinned tab**: open the site in Safari, pin the tab (Cmd+drag-to-favorites or right-click → Pin Tab). The pinned tab should show the abacus mark, not the generic globe icon.

### 5c. Open Graph image

- [ ] **Direct URL**: visit `http://localhost:3000/opengraph-image.png`. You should see a 1200×630 image showing the abacus mark (large) + "Abacus" wordmark + "Personal finance, finally clear" tagline on a violet gradient background.
- [ ] **Slack preview**: paste `http://localhost:3000/` into a Slack DM (to yourself or a test channel). The preview should render the OG image, the page title, and the description.
- [ ] **iMessage preview** (if on macOS): send `http://localhost:3000/` to yourself. The link preview should show the OG image. (If you're tunneling localhost via something like ngrok or a local network share, point iMessage at the public URL.)
- [ ] **Twitter validator** (optional): paste the URL into `cards-dev.twitter.com/validator` (if accessible). Card preview should render at `summary_large_image` size.

### 5d. Authenticated shell — sign-in flow

Sign in (or sign up a fresh user) and land at `/dashboard`.

- [ ] **Sidebar brand area**: shows the new `<AbacusIcon>` + the "Abacus" wordmark.
- [ ] **Sidebar grouping**: the nav items are in two groups:
  - **TRACK** — Dashboard, Accounts, Transactions
  - **MANAGE** — Budgets, Settings
  - A visible separator sits between the two groups. Section labels are rendered in uppercase, letter-spaced, small, muted-foreground.
- [ ] **Active route highlight** still works: navigate between routes and confirm the current route gets the highlighted background (`bg-primary text-primary-foreground` from feature 002).
- [ ] **Footer present on every route**: visit `/dashboard`, `/dashboard/accounts`, `/dashboard/transactions`, `/dashboard/budgets`, `/dashboard/settings`. Each route shows the `<ShellFooter>` at the bottom of the viewport.
  - On a short page (e.g., empty dashboard), the footer is pinned to the bottom of the viewport.
  - On a long page (e.g., accounts with many rows), scroll down — the footer sits at the natural end of the scrollable content.
- [ ] **Footer content**: brand mark + wordmark + a copyright line (and optionally a build version). NO theme toggle in the footer. NO link farm. NO user controls.
- [ ] **Theme toggle still works**: the toggle stays in the header (research.md R14). Click it; Light / Dark / System options appear; switching modes propagates correctly to the dashboard background and the brand-mark colors.

### 5e. `/dashboard` welcome panel

- [ ] The page no longer shows the legacy "Add your first account (disabled)" placeholder + the "Account creation lands in a future feature" caption.
- [ ] The welcome panel renders with `<AbacusIllustration>` as the large illustration.
- [ ] Copy mentions Accounts is shipped and Transactions / Budgets are coming.
- [ ] Primary CTA "View accounts" (or equivalent) links to `/dashboard/accounts`.
- [ ] If the user has at least one account, the copy does NOT imply "you have no accounts" (spec edge case).

### 5f. `/dashboard/accounts`

With at least three accounts (mix of positive, zero, and negative balances; at least two currencies).

- [ ] **Balance column right-aligned**: column header "Balance" sits right-aligned; every row's balance value is right-aligned.
- [ ] **Tabular numerals**: digits in different rows align vertically. (Easiest check: stack two rows like `$1,250.00` over `$50.00` — the `0` characters at the end should line up vertically.)
- [ ] **Sign-aware color**:
  - Positive balances render in default `text-foreground` (NOT green).
  - Zero balances render in `text-muted-foreground`.
  - Negative balances render in `text-money-negative` (a desaturated red, NOT the fully saturated `text-destructive`).
- [ ] **Currency always shown** with the amount (e.g., `$1,250.00`, `€800.00`).
- [ ] **Balance column most prominent**: the column reads heavier / larger than Name, Type, Currency.
- [ ] **Zero-accounts empty state** (test by deleting all accounts or signing in as a fresh user): the upgraded `<EmptyState>` renders with `<AccountsIllustration>`, the existing copy, and the "Add your first account" CTA. The CTA still opens the create side sheet.

### 5g. `/dashboard/transactions` (coming-soon)

- [ ] Upgraded `<EmptyState>` renders with `<TransactionsIllustration>`.
- [ ] Headline reads "Transactions are coming soon" (or close equivalent).
- [ ] One-line description names what the feature WILL DO — concept, not timeline (e.g., "Track every dollar in and out of your accounts, categorise them, and see where your money goes"). **No roadmap feature number. No external link. No release-cadence promise.**
- [ ] **Preview slot present**: a faded mock of two transaction rows (date column + description column + amount column) appears below the description.
- [ ] **Preview is decorative**: open browser DevTools, inspect the preview wrapper — it has `aria-hidden="true"` and `tabIndex="-1"`.
- [ ] **Keyboard tab order**: Tab through the page; focus does NOT land inside the preview.
- [ ] **No CTA button** is rendered.

### 5h. `/dashboard/budgets` (coming-soon)

- [ ] Upgraded `<EmptyState>` with `<BudgetsIllustration>`.
- [ ] Headline e.g. "Budgets are coming soon".
- [ ] One-line description naming what the feature WILL DO ("Cap your spending by category and stay on top of the limits you set").
- [ ] **Preview slot present**: a faded progress-bar widget mock appears below the description.
- [ ] Preview wrapper has `aria-hidden="true"` + `tabIndex="-1"`.
- [ ] No CTA button.

### 5i. `/dashboard/settings` (coming-soon)

- [ ] Upgraded `<EmptyState>` with `<SettingsIllustration>`.
- [ ] Headline e.g. "Settings are coming soon".
- [ ] One-line description naming what the feature WILL DO ("Update your profile, change your password, and manage your preferences").
- [ ] **NO preview slot rendered** (FR-026 — settings is intentionally preview-less).
- [ ] No CTA button.

### 5j. Mobile drawer

Resize the browser to a narrow width (e.g., 375 px wide — iPhone size), open the hamburger menu.

- [ ] Drawer renders with the same TRACK / MANAGE grouping as the desktop sidebar.
- [ ] Same section labels, same separator between groups.
- [ ] Active-route highlight still works.
- [ ] Tab through nav items inside the drawer; focus skips the section labels (they are `aria-hidden`).

### 5k. Dark mode

Toggle to dark mode via the theme toggle. Walk steps 5d–5j again. Confirm:

- [ ] Brand mark contrasts on dark background.
- [ ] Inter still renders.
- [ ] Sign-aware color on the accounts list still passes WCAG AA on dark background (use browser DevTools' contrast checker on a negative balance row to confirm — see step 6).
- [ ] Sidebar grouping, footer, empty states all render correctly in dark mode.

### 5l. JavaScript-disabled fallback

Disable JS in browser DevTools (Network tab → "Disable cache" + Settings → "Disable JavaScript") and refresh `/`.

- [ ] Marketing page still renders the brand mark + wordmark + hero text.
- [ ] Page is readable (no blank screen).
- [ ] Theme toggle and mobile drawer obviously don't work (acceptable degradation per edge case).

## 6. WCAG contrast verification (new tokens)

Manual contrast measurement for the two new tokens, per FR-037 + research.md R6. **Do NOT install `pa11y-ci` or `axe-core` or any other contrast-checking dep** — FR-039 forbids new runtime / build deps. Use the browser's built-in tools.

### 6a. `--money-negative` against background

- Open `/dashboard/accounts` with a row that has a negative balance.
- Open DevTools → Elements → click the negative-balance `<span>`.
- In the Styles panel, find the computed `color` value (should be `hsl(0, 55%, 45%)` light / `hsl(0, 55%, 65%)` dark).
- Chrome/Edge: hover the color swatch in the Styles panel; the contrast ratio against the background renders inline. Confirm it shows **≥ 4.5** in both themes.

### 6b. `--money-positive` (reserved but contrast-verified)

The token is defined but NOT applied by any code in this chore. To verify contrast:

- Open `app/globals.css` and copy the HSL value (light: `145 50% 35%`; dark: `145 50% 60%`).
- Use any online contrast tool (e.g., `contrast-ratio.com`) — these are not deps; they're external websites you visit in a browser — and paste the HSL values against the appropriate background.
- Both should clear **≥ 4.5:1** for normal text.

### 6c. Brand accent on OG image

- Open `/opengraph-image.png`.
- The tagline text against the violet gradient must be readable. Use DevTools' eye-dropper or any pixel-color tool to spot-check the text vs background contrast at the location where the tagline reads. The bar is reasonable readability for a marketing surface, not strictly AA (OG images are previewed at small sizes; the WCAG bar is applied to in-page UI tokens per FR-037).

## 7. Run the test suites

Every existing test from features 001–004 must continue to pass. FR-040 binds this; SC-007 makes it measurable.

### Unit (Vitest)

```bash
pnpm test
```

Expected: every existing unit test green, no new tests.

- `tests/unit/env.test.ts` (feature 001) — unchanged.
- `tests/unit/auth-password.test.ts` + `auth-schemas.test.ts` (feature 003) — unchanged.
- `tests/unit/money-decimal.test.ts` + `money-currencies.test.ts` + `money-validate.test.ts` + `money-format.test.ts` (feature 004) — unchanged.

### E2E (Playwright)

```bash
pnpm test:e2e
```

Expected: every existing E2E spec green, no new specs.

- `tests/e2e/health.spec.ts` — unchanged.
- `tests/e2e/auth.spec.ts` (feature 003) — unchanged. The signup / login / logout flow must still navigate `/signup`, `/login`, `/dashboard` correctly; the brand-mark-in-header change and the grouped sidebar are visual and do not change the DOM landmarks or text assertions the spec depends on.
- `tests/e2e/accounts.spec.ts` (feature 004) — unchanged. The balance column's content text is identical to before (the `<Money>` primitive renders the same formatted string `$1,250.00`), so text-content assertions continue to pass. The `<Money>` wrapper is a `<span>` inside the same `<TableCell>`, so any `[role="cell"]`-style queries continue to work.

If any test fails:

- First confirm the failure is not a flake (re-run once).
- Re-read the chore's modifications to the relevant file (e.g., for `auth.spec.ts`, check what changed in `(marketing)/page.tsx` and the `<MarketingHeader>` — text content should be unchanged).
- The chore's audit step (research.md R20) requires all existing E2E green; a failure here is a chore-internal regression and must be fixed before the chore ships.

## 8. Type-check, lint, format

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

All three must pass clean. FR-035 binds zero use of `any`; the implementer should `grep -rn ': any' components/` and `grep -rn ' as any' components/` to confirm no escape hatches were introduced.

## 9. Money-boundary audit

Confirm no arithmetic was introduced outside `lib/money/`:

```bash
grep -rEn '(Decimal\.|new Decimal|\.plus\(|\.minus\(|\.times\(|\.div\()' components/ app/
```

Expected: only matches inside test files or comments. Real new code that performs arithmetic on `Decimal` is a chore violation — the `<Money>` primitive is rendering-only.

## 10. File map for this feature

After implementation, the new and modified paths are:

```text
abacus/
├── app/
│   ├── layout.tsx                                # MODIFIED — Inter via next/font/google
│   ├── icon.tsx                                  # NEW — 32×32 favicon
│   ├── apple-icon.tsx                            # NEW — 180×180 iOS icon
│   ├── opengraph-image.tsx                       # NEW — 1200×630 OG image
│   ├── globals.css                               # MODIFIED — --money-positive + --money-negative
│   └── (shell)/
│       ├── layout.tsx                            # unchanged
│       └── dashboard/
│           ├── page.tsx                          # MODIFIED — uses <WelcomePanel>
│           ├── accounts/_components/
│           │   └── accounts-list.tsx             # MODIFIED — balance column uses <Money>; zero-state uses illustration
│           ├── transactions/page.tsx             # MODIFIED — upgraded empty state with preview, no CTA
│           ├── budgets/page.tsx                  # MODIFIED — upgraded empty state with preview, no CTA
│           └── settings/page.tsx                 # MODIFIED — upgraded empty state, no preview, no CTA
├── components/
│   ├── brand/
│   │   └── abacus-icon.tsx                       # NEW — brand-mark contract
│   ├── money/
│   │   └── money.tsx                             # NEW — money-display contract
│   ├── illustrations/
│   │   ├── abacus-illustration.tsx               # NEW
│   │   ├── accounts-illustration.tsx             # NEW
│   │   ├── transactions-illustration.tsx         # NEW
│   │   ├── budgets-illustration.tsx              # NEW
│   │   └── settings-illustration.tsx             # NEW
│   ├── shell/
│   │   ├── app-shell.tsx                         # MODIFIED — mount <ShellFooter>
│   │   ├── brand.tsx                             # MODIFIED — use <AbacusIcon>
│   │   ├── shell-footer.tsx                      # NEW — authenticated-shell footer
│   │   ├── sidebar.tsx                           # MODIFIED — consume navGroups
│   │   ├── mobile-nav.tsx                        # MODIFIED — consume navGroups
│   │   ├── nav-items.ts                          # MODIFIED — export navGroups
│   │   ├── empty-state.tsx                       # MODIFIED — illustration + preview slots
│   │   └── welcome-panel.tsx                     # NEW — dashboard home welcome
│   └── marketing/
│       ├── marketing-header.tsx                  # MODIFIED — use <AbacusIcon>
│       ├── marketing-footer.tsx                  # MODIFIED — use <AbacusIcon>
│       ├── hero.tsx                              # MODIFIED — "Learn more" link + typography
│       ├── feature-grid.tsx                      # MODIFIED — framed icons
│       └── changelog.tsx                         # MODIFIED — bead-shaped bullets
└── tailwind.config.ts                            # MODIFIED — money-* tokens + font-sans via var(--font-inter)
```

## What changed since feature 004

| Aspect | Before (004) | After (005) |
|---|---|---|
| Brand mark | lucide `Wallet` icon | Custom `<AbacusIcon>` (SVG; frame + 3 rods + 6 beads) |
| Typeface | System sans-serif | Inter via `next/font/google` |
| Favicon | Default Next.js icon | Generated from `app/icon.tsx` |
| OG image | None | Generated from `app/opengraph-image.tsx` |
| Money rendering | Bare `formatAmount(...)` in `<TableCell>` | `<Money>` primitive (tabular nums, sign-aware color) |
| Sidebar | Flat list of 5 nav items | Two groups: TRACK + MANAGE |
| Shell footer | None | `<ShellFooter>` on every authenticated route |
| Dashboard home | "Add your first account (disabled)" + caption | `<WelcomePanel>` with `<AbacusIllustration>` + CTA |
| Empty states | Icon + title + description | Illustration + title + description + (optional) preview |
| `money-positive` / `money-negative` tokens | none | both defined; `money-negative` applied to negatives; `money-positive` reserved |
| New runtime deps | 4 (cmdk + 3 Radix) | **0** (FR-039) |
| New Prisma migration | 1 (`add_account`) | **0** (FR-038) |
| New domain entity | 1 (`Account`) | **0** (FR-038) |
| New tests | Vitest x 4 + Playwright x 1 | **0** (FR-040 preserves existing) |
