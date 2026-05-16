# Abacus Constitution

Abacus is a personal web app for tracking income and expenses. Built for single-user-first; multi-user-ready from day one. This document captures the non-negotiables. Keep it short — extend only when you've felt the pain.

## Core Principles

### I. Money math is non-negotiable
- All monetary amounts stored as `Decimal` (Prisma `Decimal` type), never `Float`/`Number`.
- Currency code stored alongside every monetary value (ISO 4217, e.g., `USD`).
- Display formatting happens at the UI edge; never round in the database or business logic.
- Transfers between accounts are atomic: a single transaction creates two ledger entries (debit + credit) in one DB transaction or it fails.

### II. Type safety end-to-end
- TypeScript strict mode. No `any`. No `@ts-ignore` without a one-line WHY comment.
- Zod schemas at every boundary: request bodies, env vars, external responses.
- Prisma is the single source of truth for the data model.

### III. Validate at boundaries, trust internally
- Every API route validates input with Zod before touching business logic.
- Internal functions trust their typed inputs — no defensive re-validation.
- Auth is checked at the route boundary, not sprinkled through helpers.

### IV. Test the money paths
- Unit tests (Vitest) required for: money math, transfer logic, recurring-transaction generation, category aggregation.
- E2E tests (Playwright) required for: signup → login → logout, create transaction, transfer between accounts.
- Other code: tests welcome, not required.

### V. Spec-driven development
- Every feature flows through Spec Kit: `spec.md` → `plan.md` → `tasks.md` → implementation.
- No code without an approved spec.
- One feature in flight at a time. No parallel branches in `.specify/specs/`.

## Technology Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Language:** TypeScript (strict)
- **Database:** PostgreSQL 16+
- **ORM:** Prisma
- **Auth:** Auth.js (NextAuth) with Credentials provider (email + password). OAuth deferred.
- **Password hashing:** Argon2id or bcrypt (min 12 rounds)
- **UI:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Validation:** Zod
- **Testing:** Vitest (unit) + Playwright (E2E)
- **Containerization:** Docker + docker-compose for local dev
- **Package manager:** pnpm

## Conventions

- **Folder layout:** `app/` (routes), `lib/` (business logic), `components/` (UI), `db/` (Prisma schema + migrations), `tests/`
- **Money helpers:** all monetary operations go through `lib/money/` — no direct arithmetic on amounts elsewhere.
- **Migrations:** every Prisma schema change ships with a generated migration. No `db push` against committed code.
- **Secrets:** `.env.local` only; never committed. `.env.example` documents required keys.
- **API responses:** consistent shape `{ data } | { error: { code, message } }`. HTTP status reflects outcome.
- **Dates/times:** stored UTC; rendered in user's timezone (from user profile).
- **CSV exports:** UTF-8, header row, ISO-8601 dates, decimal point (not locale-specific).

## Subagent Workflow

- **spec-writer** drafts `spec.md` (what + why, no how). Status: `READY_FOR_ARCH`.
- **architect** drafts `plan.md` (data model, API, file layout) against this constitution. Status: `READY_FOR_BUILD`.
- **implementer** executes one task at a time. Self-heals lint/typo failures, stops on real failures. Status: `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`.
- **money-reviewer** runs on any change touching `lib/money/`, `db/`, `prisma/`, or transaction logic. Returns `PASS / FAIL` with specifics.

## Governance

This constitution is a context anchor, not a bureaucracy. Update it when reality changes. No formal approval process — this is a personal project.

**Version**: 0.1.0 | **Ratified**: 2026-05-16 | **Last Amended**: 2026-05-16
