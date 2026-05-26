# Specification Quality Checklist: Budgets

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

- **No implementation details in spec**: references to "the lib/money/ helpers" and "the per-currency aggregation pattern from feature 007" are scope assertions ("don't reinvent these, reuse them") — not implementation directives. The spec talks about widgets, side sheets, progress bars, currency codes, period boundaries — all behavioural / UX, not file-paths or framework choices.
- **Three load-bearing decisions resolved inline (Clarifications section)**: (1) calendar-aligned periods (UTC), matching feature 008's cash-flow widget convention; (2) recurring rule, not per-period-row; (3) archiving a category does NOT auto-archive its budgets — they flag with "(archived category)" label. Each is documented with rationale so a future reader knows why the alternative was rejected.
- **Multi-currency rule is unambiguous**: FR-004, FR-019, FR-024, SC-004, SC-013 all assert per-currency isolation; never cross-currency aggregation; matches the feature-008 precedent.
- **Actuals semantics are unambiguous**: FR-010, FR-013 + multiple US2 acceptance scenarios + SC-002 (byte-for-byte against /dashboard/transactions filter); TRANSFER excluded explicitly; archived transactions excluded explicitly.
- **Uniqueness invariant is named twice** (FR-002 + SC-006): both at app layer (Zod boundary) AND schema layer (partial unique index). Race-condition handling explicitly addressed.
- **Empty states are exhaustive**: US5 (no budgets), US5 acceptance scenario 4 (no EXPENSE categories — special variant), edge cases ("All budgets archived", "Budget with endDate < today", "Budget with startDate > today").
- **Cross-user isolation asserted at all layers**: FR-022 (capability) + SC-005 (measurable outcome) + US1 acceptance scenario 6 (test scenario) + edge case ("Cross-user attempt").
- **Constitution Principle I named explicitly**: FR-019, FR-023, FR-024 (capability) + SC-003, SC-007, SC-008 (measurable + money-reviewer gate). The money-reviewer subagent gate is named in SC-008.
- **Scope guardrails are exhaustive** (FR-034 + Out of Scope section): 12 deferred items named with their target roadmap feature or "future polish" rationale.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- This spec went directly to validation-pass without [NEEDS CLARIFICATION] markers because the user's `/speckit-specify` prompt was unusually detailed (locked the EXPENSE-only / multi-currency / soft-delete / reuse-feature-007-aggregations / out-of-scope-list decisions inline), and the three remaining load-bearing decisions (calendar periods, recurring rule, archived-category handling) had strong defaults driven by either existing feature conventions (feature 008's UTC-calendar-month) OR competitor research baselines (all major personal-finance apps use recurring per-category-per-period budgets). The Clarifications section records the resolved decisions with rationale so the implementer and reader understand why.
- `/speckit-clarify` session on 2026-05-26 added 2 further clarifications: (Q1) near-budget threshold at 80% (matching Lunch Money / Copilot Money defaults — not 75% as initially drafted), and (Q2) default-currency suggestion in the create form (most-used by COUNT of non-archived EXPENSE transactions in last 90 days, fall back to first non-archived account's currency). FR-025, FR-028, and US1/US2 acceptance scenarios updated to reflect the locked values; Assumptions section updated to reference Q2.
