# Specification Quality Checklist: Categories

**Purpose**: Validate spec.md for feature 005 — Categories (spec dir `006-categories`) against the standard speckit quality bar before handing off to `/speckit-plan`.
**Created**: 2026-05-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] CHK001 No implementation details (no API shapes, no Prisma schema, no library choices for color/icon, no file paths beyond the conventional `/dashboard/categories` route reference and the inherited `<EmptyState>` primitive name from feature 005's polish).
- [x] CHK002 Focused on user value and business needs (every story is framed from the user's POV; rationale precedes mechanics; the seed exists because a freshly-signed-up user needs a non-empty surface, not because the data model is more convenient that way).
- [x] CHK003 Written for non-technical stakeholders (gherkin scenarios, plain prose, no jargon beyond the unavoidable `userId` / `parentId` / `kind` terms which are defined in context in Key Entities).
- [x] CHK004 All mandatory sections completed (Why; Clarifications; User Scenarios & Testing with Edge Cases; Requirements with FRs and Key Entities; Success Criteria; Assumptions; Out of Scope; Open Questions).
- [x] CHK005 Feature frontmatter set: Feature Branch `006-categories`, Created `2026-05-17`, Status `Draft`, Input `"Categories now" (kicked off via /speckit-specify after the branded-UI chore merged)`. A numbering note at the top of the spec calls out that the spec-dir number (006) differs from the roadmap-slot number (005 — Categories) because the branded-UI polish chore consumed the 005 dir slot.

## Requirement Completeness

- [x] CHK006 At most 3 `[NEEDS CLARIFICATION]` markers placed and resolved, each genuinely load-bearing. 3 markers were placed and all 3 resolved on 2026-05-17: Q1 hierarchy depth (single level); Q2 route location (top-level `/dashboard/categories`); Q3 default seed (eleven categories, seeded inside the signup transaction, exact composition documented).
- [x] CHK007 Requirements are testable and unambiguous. Each FR is a single observable behavior; each acceptance scenario is a binary pass/fail Given/When/Then. Validation rules are field-scoped (FR-004 / FR-005 / FR-006 / FR-007 / FR-008 / FR-009 each cover exactly one concern).
- [x] CHK008 Success criteria are measurable. Every SC has a 100%-of-attempts threshold, a binary observation, or a specific time bound (SC-001's 5-second seed visibility; SC-002's 30-second create flow).
- [x] CHK009 Success criteria are technology-agnostic. The SC section contains no mention of Prisma, Zod, Next.js, React, shadcn, Tailwind, Vitest, or Playwright. SC-013 references "Vitest unit test and Playwright e2e test" by NAME only because they describe the pre-existing test suites that MUST keep passing, not new ones this feature ships.
- [x] CHK010 All acceptance scenarios are defined. US1 has 5, US2 has 6, US3 has 10, US4 has 6, US5 has 10. Edge cases enumerated separately (14 cases).
- [x] CHK011 Edge cases identified: cross-user access, duplicate names, whitespace trimming, missing hard delete, archiving a parent with children, archiving every category, self-parent on create vs edit, would-be-cycle (proved impossible by construction under FR-006), kind change on a category with children, parent change that would orphan children (proved impossible by construction), failed signup-seed rollback, unauthenticated access, forged session/userId payload, scale up to dozens of categories.
- [x] CHK012 Scope is clearly bounded. Out of Scope enumerates 16 items, each with a one-line reason or roadmap pointer (006 / 008 / 010 / 012 / 014 / 016 / a future polish bucket / explicit "not a feature").
- [x] CHK013 Dependencies and assumptions identified. Assumptions section calls out reliance on feature 003's auth boundary, feature 004's `Account` patterns being on `main`, feature 005's branded UI being on `main`, the seed write riding the same DB transaction as user creation, plan-level deferral of the exact color palette and icon set, the absence of a current `/dashboard/categories` placeholder, and the explicit non-use of `lib/money/` in this feature.

## Constitution Alignment

- [x] CHK014 Principle I (money math) — explicitly NOT in scope for this feature; categories have no `currency` field and no `amount` field. Spec says so in Assumptions. Constitution Principle I is therefore neither violated nor exercised here.
- [x] CHK015 Principle II (type safety) bound — FR-021 (strict TS, no `any`, Zod schemas at boundaries); SC-012 (type-check passes with strict mode and zero `any`).
- [x] CHK016 Principle III (validate at boundaries) bound — FR-014 (Zod at boundary before business logic; internal helpers trust typed inputs); FR-021 (no validation outside the boundary).
- [x] CHK017 Principle IV (test the money paths) — not directly applicable (no money math here), but the spirit is honored: SC-013 requires new unit tests for the parent-validation rules (FR-006, FR-009), kind-mismatch and would-be-grandchild rules, and seed contents, AND requires every existing 105 Vitest + 17 Playwright test to continue passing.
- [x] CHK018 Principle V (spec-driven development) — this artifact exists; spec is being written before the plan; no implementation is in scope.
- [x] CHK019 Data-scoping convention (constitution Conventions + feature 003 FR-025 + feature 004 FR-002 / FR-003 / FR-013) actually implemented — FR-002 (cascade FK to `User`, indexed by `userId` and by `(userId, archivedAt)`); FR-003 (every query scoped to session `userId`; route never trusts `userId` from input); FR-013 (cross-user ops, including cross-user `parentId` references, return not-found, no leak); SC-003 (two newly-seeded users' lists are independent); SC-007 (cross-user error envelope on all four operations PLUS the parent-reference path).
- [x] CHK020 API envelope convention (`{ data } | { error: { code, message } }`) bound — FR-015 and FR-013.
- [x] CHK021 Migration convention (no `db push`) bound — FR-001 mentions migration explicitly.

## Structural Parity with feature 004 spec.md

- [x] CHK022 Prose-first user stories with Why-this-priority + Independent Test + 2-3+ Given/When/Then scenarios per story. This spec: US1 has 5 scenarios, US2 has 6, US3 has 10, US4 has 6, US5 has 10. Feature 004 had 4, 8, 4, 7 — this spec is in the same shape band.
- [x] CHK023 Functional Requirements numbered FR-001 onward (FR-001 … FR-022 in this spec, organized by subsection: Data model, Field rules, Archive, Seed, Error & validation contract, Surfaces, Quality).
- [x] CHK024 Success Criteria numbered SC-001 onward and tech-agnostic (SC-001 … SC-014).
- [x] CHK025 Assumptions section present and calls out load-bearing decisions made by the spec-writer (seed-in-signup-transaction, palette + icon set deferred to plan, no `/dashboard/categories` placeholder currently exists, this feature does not touch `lib/money/`).
- [x] CHK026 Key Entities section present with full prose description of `Category` and its relationships; calls out forward-only references (`Transaction` from feature 006 and `Budget` from feature 008) without speccing them.
- [x] CHK027 Edge cases enumerated as a sub-section under User Scenarios & Testing (not inline in stories).
- [x] CHK028 Out of Scope section present and cross-references roadmap features (006, 008, 010, 012, 014, 016).
- [x] CHK029 Clarifications section captures the locked decisions from this session (hierarchy depth = single level; route = top-level; seed = eleven categories with the exact list documented).

## Hand-off Readiness

- [x] CHK030 Zero open questions remain. All 3 `[NEEDS CLARIFICATION]` candidates resolved in the 2026-05-17 clarification session.
- [x] CHK031 All locked decisions documented in either the Clarifications section log or the Assumptions section so the architect can plan against them without re-deriving.
- [x] CHK032 No implementation choices baked into the spec that should belong to the plan. Specifically: the exact color-token format (hex vs named vs indexed) is plan-level; the exact icon library / icon identifier strings are plan-level; the exact picker rendering and keyboard model are plan-level; the choice of server actions vs route handlers is plan-level; the placement of the seed write within the auth signup helper vs the category module is plan-level (the spec only locks "one DB transaction").
- [x] CHK033 Spec is internally consistent. Single-level depth (FR-006) is consistent with "parent must be top-level" (FR-009). Kind-must-match-parent (FR-005) is consistent with US2 scenario 4 (kind becomes read-only once a parent is selected) and US3 scenario 5 (kind change blocked on a parent with children). Seed in same DB transaction as user (FR-012) is consistent with SC-008 (signup rollback on seed failure). Picker hides archived by default (FR-011) is consistent with US4 scenario 4. Archive does not cascade (FR-010) is consistent with SC-005 and the edge case on archiving a parent with children.

## Notes

- Overall pass/fail: **PASS** — all 33 quality bars met. The spec is ready for `/speckit-plan`.
- Count summary: 5 user stories (P1, P1, P1, P2, P2), 22 functional requirements (FR-001 … FR-022, organized by subsection), 14 success criteria (SC-001 … SC-014), 14 edge cases enumerated, 16 out-of-scope items, 0 `[NEEDS CLARIFICATION]` markers remaining.
- Clarification session 2026-05-17 resolved all three originally-flagged questions:
  - **Q1 (most load-bearing)** — hierarchy depth → single level. This decision drives FR-005 (parent/child kind match), FR-006 (no grandchildren, no self-parent), FR-009 (parent must itself be top-level), the absence of any cycle-detection requirement, US2 scenario 4 (kind inherited from parent), and the simplification of US3 scenarios 5 and 6 (kind change blocked when children exist; parent reassign limited to top-level parents). It is the schema decision that locks downstream features 006 (Transactions) and 008 (Budgets) and was the most consequential of the three.
  - Q2 — route location → top-level `/dashboard/categories`. Drives FR-016 (sidebar placement in MANAGE group) and matches feature 004's discoverability pattern for Accounts.
  - Q3 — default seed → eleven specific categories, written inside the signup transaction. Drives FR-012 (seed contents and atomicity), SC-001 (5-second visibility), SC-008 (rollback on seed failure), and US1 (the entire on-ramp user story).
- The spec-dir number (`006-categories`) intentionally differs from the roadmap-slot number (`005 — Categories`). The branded-UI polish chore consumed spec-dir `005-branded-ui-polish` before this feature was authored. The numbering note at the top of the spec.md frontmatter calls this out so neither the architect nor a future reader confuses "feature 005" (categories, on the roadmap) with "spec-dir 005" (branded UI, already shipped).
