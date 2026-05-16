# Specification Quality Checklist: Accounts

**Purpose**: Validate spec.md for feature 004 — Accounts against the standard speckit quality bar before handing off to `/speckit-plan`.
**Created**: 2026-05-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] CHK001 No implementation details (no API shapes, no Prisma schema, no library choices, no file paths beyond the conventional `lib/money/` and `/dashboard/accounts` references).
- [x] CHK002 Focused on user value and business needs (every story is framed from the user's POV; rationale precedes mechanics).
- [x] CHK003 Written for non-technical stakeholders (gherkin scenarios, plain prose, no jargon beyond the unavoidable `userId` / ISO 4217 / Decimal terms which are defined in context).
- [x] CHK004 All mandatory sections completed (Why; Clarifications; User Scenarios & Testing with Edge Cases; Requirements with FRs and Key Entities; Success Criteria; Assumptions; Out of Scope; Open Questions).
- [x] CHK005 Feature branch frontmatter set to `004-accounts`, Created `2026-05-16`, Status `Draft`, Input quote `"Accounts" (Tier 1, feature 004)`.

## Requirement Completeness

- [x] CHK006 At most 3 `[NEEDS CLARIFICATION]` markers placed and resolved, each genuinely load-bearing (3 placed in initial draft, all 3 resolved on 2026-05-16).
- [x] CHK007 Requirements are testable and unambiguous (each FR is a single observable behavior; each scenario is a binary pass/fail Given/When/Then).
- [x] CHK008 Success criteria are measurable (every SC has a numeric or 100%-of-attempts threshold or a binary observation).
- [x] CHK009 Success criteria are technology-agnostic (no mention of Prisma, Zod, Next.js, shadcn, Tailwind, Vitest, Playwright in the SC section).
- [x] CHK010 All acceptance scenarios are defined (each user story has 3+ scenarios; edge cases enumerated separately).
- [x] CHK011 Edge cases identified (cross-user access, duplicate names, whitespace-only names, zero balance, negative balance on credit, currency case-normalization, zero/three-decimal currencies, archiving last account, missing delete affordance, scale up to dozens of accounts, unauthenticated access, forged-session tampering).
- [x] CHK012 Scope is clearly bounded (Out of Scope enumerates 14+ items, each with a one-line reason or roadmap pointer).
- [x] CHK013 Dependencies and assumptions identified (Assumptions section calls out reliance on feature 003's auth boundary, current empty schema, new `lib/money/` module, side-sheet edit UX, archive-only deletion).

## Constitution Alignment

- [x] CHK014 Principle I (money math) explicitly bound — FR-001 (Decimal column), FR-006 (Decimal + currency-aware decimal places + no float), FR-011 (currency always rendered with amount), FR-016 (all monetary arithmetic through `lib/money/`), FR-017 (balance computation formula future-proofed for transactions).
- [x] CHK015 Principle II (type safety) bound — FR-021 (strict TS, no `any`, Zod schemas at boundaries).
- [x] CHK016 Principle III (validate at boundaries) bound — FR-014 (Zod at boundary before business logic; internal helpers trust typed inputs).
- [x] CHK017 Principle IV (test the money paths) bound — FR-022 (unit tests for Decimal handling, decimal-place rule, negative-balance rule, formatter); SC-010 (money-correctness suite passes).
- [x] CHK018 Principle V (spec-driven development) — this artifact exists; spec is being written before the plan; no implementation in scope.
- [x] CHK019 Data-scoping convention (FR-025 from feature 003) actually implemented — FR-002 (cascade FK), FR-003 (every query scoped to session userId; route never trusts userId from input), FR-013 (cross-user ops return not-found, no leak), SC-003 (two users' lists are independent), SC-008 (cross-user error envelope on all four operations).
- [x] CHK020 API envelope convention (`{ data } | { error: { code, message } }`) bound — FR-015 and FR-013.
- [x] CHK021 Migration convention (no `db push`) bound — FR-001 mentions migration explicitly.
- [x] CHK022 `lib/money/` lands here per the constitution's "Money helpers" convention — FR-016 + Assumptions.

## Structural Parity with feature 003 spec.md

- [x] CHK023 Prose-first user stories with Why-this-priority + Independent Test + 2-3 Given/When/Then scenarios per story (US1 has 4, US2 has 8, US3 has 4, US4 has 7).
- [x] CHK024 Functional Requirements numbered FR-001 onward (FR-001…FR-024 in this spec).
- [x] CHK025 Success Criteria numbered SC-001 onward and tech-agnostic (SC-001…SC-013).
- [x] CHK026 Assumptions section present and calls out the load-bearing decisions made by the spec-writer in the absence of explicit input (side-sheet edit UX, alphabetical sort, filter-toggle for archived, no FX, zero-default starting balance).
- [x] CHK027 Key Entities section present with full prose description of `Account` and its relationships; calls out forward-only references (Transaction) without speccing them.
- [x] CHK028 Edge cases enumerated as a sub-section under User Scenarios & Testing (not inline in stories).
- [x] CHK029 Out of Scope section present and cross-references roadmap features (006, 008, 005, 010/014, 020, 007, 015, 021).
- [x] CHK030 Clarifications section captures the locked decisions from this session (currency policy, archive vs delete, negative-balance rule, edit UX, sort order, archived-filter toggle, no per-user limit, no icon/color, no drag-reorder).

## Hand-off Readiness

- [x] CHK031 Zero open questions remain. All 3 `[NEEDS CLARIFICATION]` markers resolved in the 2026-05-16 clarification session (Q1: full ISO 4217 active list; Q2: no per-currency subtotals in v1; Q3: name-only editability on archived accounts).
- [x] CHK032 All locked decisions documented in either the Clarifications session log or the Assumptions section so the architect can plan against them without re-deriving.
- [x] CHK033 No implementation choices baked into the spec that should belong to the plan (e.g., no commitment to a specific Decimal library, no specific shadcn component names, no specific server-action vs route-handler choice).
- [x] CHK034 Spec is internally consistent (currency immutability in FR-007 is consistent with the Clarifications entry; archive semantics in FR-008/FR-009 are consistent with US2 scenarios 5-7 and SC-005; cross-user behavior in FR-013 is consistent with SC-008 and the edge-case entry).

## Notes

- Overall pass/fail: **PASS** — all 34 quality bars met. The spec is ready for `/speckit-plan`.
- Count summary: 4 user stories (P1, P1, P2, P2), 26 functional requirements (FR-001 … FR-024 plus FR-009a and FR-012a added during clarification), 15 success criteria (SC-001 … SC-015), 0 `[NEEDS CLARIFICATION]` markers remaining.
- Clarification session 2026-05-16 resolved all three originally-flagged questions: Q1 currency allow-list scope → full ISO 4217 active list; Q2 per-currency subtotals → none in v1, ship with feature 020; Q3 archived-row editability → name only, type/startingBalance frozen while archived.
