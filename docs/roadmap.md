# Abacus Roadmap

A living plan for what to build, in what order, and why. Not a spec — specs live under `specs/<NNN>-<slug>/` and are the binding contract for any given feature. This document is the upstream "what's coming next" reference.

**Last updated**: 2026-05-16 (post-feature 003).

---

## What's shipped

| Feature                                  | Status     | What it gave us                                                                                                                               |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 — Project scaffolding                | ✅ on main | Next.js 16 + React 19 + TS strict + Prisma 7 + shadcn + Vitest + Playwright + health endpoint + theme toggle.                                 |
| 002 — App shell                          | ✅ on main | Fixed sidebar (≥md), mobile drawer (<md), 5 placeholder routes, violet brand, loading/error/not-found, focus-on-route-change, e2e walk.       |
| 003 — Auth (multi-user + marketing home) | ✅ on main | Auth.js v5 Credentials + JWT, Argon2id via @node-rs/argon2, public marketing `/`, authenticated app under `/dashboard/*`, full e2e auth flow. |
| chore — CI on GitHub Actions             | ✅ on main | 3 parallel jobs (static / unit / e2e), Postgres 16 service, Playwright artifacts uploaded, per-job markdown summaries.                        |
| chore — Deploy to Vercel + Neon          | ✅ on main | Production-deployed; vercel.json + deploy runbook live.                                                                                       |

---

## Competitive landscape (research baseline)

| App               | Model                 | Distinctive                                                                            |
| ----------------- | --------------------- | -------------------------------------------------------------------------------------- |
| YNAB              | $14.99/mo SaaS        | Zero-based "every dollar has a job" envelope budgeting. Strong philosophy. Plaid sync. |
| Copilot Money     | $13/mo (iOS-first)    | Best UX. AI categorization. Investment tracking. Bills detection.                      |
| Monarch Money     | $14.99/mo SaaS        | Net worth + investments + real estate. Partner sharing. Replaced Mint.                 |
| Lunch Money       | $10/mo SaaS           | Multi-currency, strong API, manual + Plaid hybrid. Power-user friendly.                |
| **Actual Budget** | Free, self-host (OSS) | YNAB-style envelopes. Local-first, sync-server optional. Closest analog.               |
| Firefly III       | Free, self-host (OSS) | Double-entry accounting. Rules engine. Heavyweight.                                    |
| Empower           | Free (advisor upsell) | Investment + net worth focused. Light on budgeting.                                    |
| Quicken Simplifi  | $5.99/mo              | Cheap, decent breadth, lukewarm UX.                                                    |

### Universal features (every app has)

- Accounts (multiple, typed: checking / savings / credit / cash / investment)
- Transactions (date, amount, category, payee, account, notes)
- Categories (usually hierarchical)
- Budgets (monthly, by category)
- Dashboard (net worth, recent activity, this-month)
- Reports (spending by category, cash flow over time)

### Mid-tier features (most have)

Transfers (atomic, two ledger entries) · recurring transactions / bills · multi-currency · search / filter · CSV import + export · auto-categorization rules · tags · attachments (receipts).

### Premium differentiators (paid apps)

Bank syncing via Plaid · investment performance · bill/subscription detection · AI categorization · family sharing · native mobile apps.

---

## Abacus's positioning

- **Self-hostable / open** (closer to Actual Budget / Firefly III than YNAB / Copilot).
- **Money correctness over fancy AI** (Decimal everywhere, atomic transfers, currency-aware — locked in the constitution).
- **Modern stack & UX** where Firefly III feels like 2015 Bootstrap, Abacus is 2026 shadcn.
- **No bank sync** (Plaid is expensive + compliance-heavy; manual + CSV is the sweet spot).
- **Multi-user from day one, but no shared workspaces** — each user is their own tenant (locked in constitution v0.2.0 + feature 003 spec).

**Closest analog**: Actual Budget with a Next.js / shadcn frontend, multi-user out of the box, money-correctness guarantees codified.

---

## Roadmap

Each tier unlocks something usable. Each feature is one Spec Kit cycle (spec → clarify → plan → tasks → implement).

### Tier 1 — MVP foundation

Without these the app is empty. Estimate: ~2–3 focused days for all four.

#### 004 — Accounts (4–6 hrs)

- `Account` model: `id, userId, name, type (CHECKING|SAVINGS|CREDIT|CASH|INVESTMENT|OTHER), currency (ISO 4217), startingBalance (Decimal), archivedAt`.
- CRUD UI on `/dashboard/accounts`.
- Account total = `startingBalance + sum(transactions)` (computed, not stored).
- **First feature that exercises constitution Principle I** (money math). Decimal column, currency stored alongside.
- `lib/money/` lands here (or in 006).

#### 005 — Categories (3–4 hrs)

- `Category` model: `id, userId, name, parentId, kind (INCOME|EXPENSE), color, icon`.
- Hierarchical.
- Default seed on first signup ("Food", "Housing", "Transport", "Salary", "Other Income"...).

#### 006 — Transactions + Transfers (8–12 hrs — the big one)

- `Transaction` model: `id, userId, accountId, categoryId, date, amount (Decimal), currency, type (INCOME|EXPENSE|TRANSFER), payee, notes, createdAt, updatedAt`.
- Transfers: atomic single `prisma.$transaction` creating debit + credit pair (constitution-mandated).
- Add / edit / delete + list with date-range filter.
- `lib/money/` cemented here if not in 004.
- **money-reviewer agent** runs on this PR.
- Constitution Principle IV E2E: create transaction, transfer between accounts.

#### 007 — Real dashboard (3–4 hrs)

- Replace the empty "Welcome to Abacus" with real content.
- Net worth widget (sum of account balances).
- This-month cash flow (income − expenses).
- Recent 10 transactions.
- Quick "Add transaction" CTA.

**After Tier 1**: the app is usable for a single user manually tracking finances.

---

### Tier 2 — Makes it sticky

#### 008 — Budgets (5–7 hrs)

- `Budget` model: `id, userId, categoryId, period (MONTHLY|YEARLY), amount (Decimal), currency, startDate, endDate`.
- Compare actuals (sum transactions in category, period) vs budget.
- Progress bars + over-budget warnings on dashboard.
- Replaces empty `/dashboard/budgets`.

#### 009 — Search & filter (3–4 hrs)

- Transactions list: search by payee / notes, filter by category / account / date range / amount range.
- URL-driven (shareable filtered views).

#### 010 — CSV import (6–8 hrs)

- Upload CSV from bank.
- Column-mapping UI (date / amount / payee → bank's column names).
- Dedupe by hash of (date, amount, payee, account).
- Preview before commit.
- First feature that gives 100× value over manual entry.

---

### Tier 3 — Quality of life

#### 011 — Recurring transactions (5–7 hrs)

- Schedule (monthly rent, weekly groceries).
- Cron-style or simple "next due date" generator.
- Edit / skip individual occurrences.
- **Constitution Principle IV E2E**: recurring-transaction generation.

#### 012 — Rules / auto-categorization (5–7 hrs)

- Rule: `{ matcher: (payee LIKE "Whole Foods*"), action: { categoryId: "groceries" } }`.
- Auto-apply on CSV import or manual entry.
- Replaces 80% of the categorization friction.

#### 013 — Tags (3–4 hrs)

- Many-to-many on transactions, orthogonal to categories.
- Use case: "vacation 2026", "reimbursable", "tax-deductible".
- Filter by tag in lists.

#### 014 — CSV export (2–3 hrs)

- Constitution-defined format (UTF-8, header, ISO dates, decimal point, not locale-specific).
- For taxes, accountant, archive.

---

### Tier 4 — Reports

#### 015 — Charts (6–8 hrs)

- Recharts lands here.
- Spending by category (pie).
- Cash flow over time (stacked area).
- Net worth over time (line).
- Budget vs actual (bar).

#### 016 — Reports page (3–4 hrs)

- Date range picker.
- Aggregated views by category, by payee, by month.
- Drill-down to underlying transactions.

---

### Tier 5 — Settings & polish

#### 017 — Settings: profile + preferences (4–6 hrs)

- Primary currency.
- Timezone (stored UTC, rendered per profile per constitution).
- Email change, password change.
- Account deletion (with confirmation).
- Replaces empty `/dashboard/settings`.

#### 018 — Attachments (6–10 hrs)

- Upload receipt to a transaction.
- Storage: local FS for dev, S3-compatible (R2 / B2) for production.
- New env vars, new constitution implication (file storage).

---

### Tier 6 — Differentiators (truly optional)

- **019 — Savings goals**: target amount + date, progress tracker.
- **020 — Multi-currency conversion**: FX rate snapshot per transaction, display in primary currency.
- **021 — Audit log**: who edited what when.
- **022 — API tokens**: power-user automation.
- **023 — Net-worth-over-time snapshots**: nightly cron writes a `NetWorthSnapshot` row.

---

## Deliberately deferred (or never)

- **Bank sync via Plaid** — costs $0.30/account/month + compliance. The differentiator IS that Abacus doesn't need it.
- **Investment performance tracking** — different domain (price history, dividends, splits). Separate product.
- **Mobile native apps** — Next.js is mobile-friendly via responsive design; native apps are 10× the engineering surface.
- **Family / shared workspaces** — explicitly out of scope per feature-003 spec ("multi-user means many independent single-tenant users, NOT shared workspaces").
- **AI auto-categorization** — rule engine (012) gets 80% there at 0% the complexity. Revisit if rules prove insufficient.

---

## Next up

**Feature 004 — Accounts.**

Why this specifically:

1. First feature that exercises constitution Principle I (money math). Better to get the pattern right with a simple model before stacking transactions on top.
2. Unblocks every later feature — can't have transactions without accounts.
3. Small enough (4–6 hrs) to validate the architect → implementer → money-reviewer subagent loop on a money-touching feature.
4. UI is shadcn data-table territory — exercises the shell's app vocabulary.

Kick off via `/speckit-specify "Accounts"` when ready.
