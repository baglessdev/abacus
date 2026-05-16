# Specification Quality Checklist: Branded UI Polish

**Purpose**: Validate spec.md for the branded UI polish chore against the standard speckit quality bar before handing off to `/speckit-plan` (or back to `/speckit-clarify` to resolve open questions).
**Created**: 2026-05-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] CHK001 No implementation details (no Tailwind class names, no React API names, no library names beyond unavoidable references; contract surfaces named only where the codebase already exposes them or where the spec is locking a single rendering primitive's identity — `AbacusIcon`, `Money`, `ShellFooter`, `EmptyState`).
- [x] CHK002 Focused on user value and business needs (every user story is framed from the user's POV; every FR ties back to a perception or trust outcome, not a code-shape outcome).
- [x] CHK003 Written for non-technical stakeholders (plain prose, Given/When/Then scenarios, no jargon beyond unavoidable terms such as Open Graph, WCAG AA, ISO 4217 — each of which is given enough context that a non-engineer can reason about it).
- [x] CHK004 All mandatory sections completed (Why; Clarifications; User Scenarios & Testing with Edge Cases; Requirements with FRs and Key Entities; Success Criteria; Assumptions; Out of Scope; Open Questions).
- [x] CHK005 Feature branch frontmatter set to `branded-ui-polish` (not numbered — this is a chore, per the task brief), Created `2026-05-17`, Status `Draft`, Input quote describes the chore scope.

## Requirement Completeness

- [x] CHK006 At most 3 `[NEEDS CLARIFICATION]` markers placed and each genuinely load-bearing (2 placed in initial draft, both resolved on 2026-05-17: positive-amount color treatment → foreground default, money-positive reserved; coming-soon copy specificity → descriptive but not date-committal).
- [x] CHK007 Requirements are testable and unambiguous (each FR is a single observable behavior; each scenario is a binary pass/fail Given/When/Then; rendering bars are quantified — e.g., "frame + at least two rods + at least four beads" at 16px).
- [x] CHK008 Success criteria are measurable (every SC has a 100%-of-attempts threshold, a binary observation, or a quantified contrast/size threshold).
- [x] CHK009 Success criteria are technology-agnostic (no mention of Next.js, Tailwind class names, React component names beyond contract surfaces, shadcn, Inter, Lucide, Vitest, Playwright — except SC-007 which references Playwright by name as the existing E2E surface from prior features, consistent with feature 004's treatment).
- [x] CHK010 All acceptance scenarios are defined (US1 has 4 scenarios, US2 has 5, US3 has 5, US4 has 5, US5 has 4 — 23 scenarios total; edge cases enumerated separately).
- [x] CHK011 Edge cases identified (JS-disabled fallback, font load failure, Safari pinned-tab favicon, favicon at 16px recognisability, OG image cross-platform behavior, dark-mode contrast on money-positive, mobile drawer + footer interaction, dashboard zero-accounts and with-accounts variants, theme toggle in footer on mobile, existing E2E tests must pass, coming-soon CTA behavior).
- [x] CHK012 Scope is clearly bounded (Out of Scope enumerates 13 explicit items, each with a one-line reason or a roadmap pointer to the feature that owns it).
- [x] CHK013 Dependencies and assumptions identified (Assumptions calls out reliance on features 002, 003, 004 being on `main`; the existing violet brand from 002; the existing `lib/money/` from 004; the existing `EmptyState` from 002; the existing `next-themes` toggle from 002; the no-new-runtime-dependency rule).

## Constitution Alignment

- [x] CHK014 Principle I (money math) explicitly bound — FR-010 (rendering primitive does not arithmetic), FR-012 (currency always rendered with amount, no suppression configuration), FR-036 (Decimal never rounded by the rendering primitive). SC-003 and SC-010 lock the visible bar.
- [x] CHK015 Principle II (type safety) bound — FR-035 (strict TS, no `any` across all chore code).
- [x] CHK016 Principle III (validate at boundaries) — not directly applicable since this chore introduces no new validation boundaries; the existing `lib/money/` formatter and the existing Zod schemas from feature 004 are unchanged. The chore is rendering-layer only and explicitly defers to the existing arithmetic boundary (FR-036 and Assumptions).
- [x] CHK017 Principle IV (test the money paths) — Existing money-correctness unit tests from feature 004 are preserved unchanged (FR-040 / SC-007); the chore does not introduce new money arithmetic and therefore does not introduce new money-correctness unit-test requirements. The chore's perceptual bars (tabular numerals, sign-aware color, currency-adjacency, WCAG AA contrast) are testable via the existing E2E surface plus FR-040's "all existing E2E tests pass" rule.
- [x] CHK018 Principle V (spec-driven development) — this artifact exists; spec is being written before the plan; no implementation in scope.
- [x] CHK019 Data-scoping convention (constitution + feature 003 FR-025) — N/A; this chore introduces no new data, no new query, and therefore no new scoping surface. Existing scoping behavior from features 003 and 004 is preserved by FR-040.
- [x] CHK020 API envelope convention — N/A; this chore introduces no new API endpoints.
- [x] CHK021 Migration convention — N/A; FR-038 explicitly forbids a new migration.
- [x] CHK022 `lib/money/` convention preserved — FR-010 explicitly separates the rendering primitive from the arithmetic layer; FR-036 reaffirms that the rendering primitive does not round; the Assumptions section reaffirms `lib/money/` is unchanged.

## Structural Parity with feature 004 spec.md

- [x] CHK023 Prose-first user stories with Why-this-priority + Independent Test + multiple Given/When/Then scenarios per story (US1 has 4, US2 has 5, US3 has 5, US4 has 5, US5 has 4 — meeting the "2–3+ scenarios per story" bar from feature 004's pattern).
- [x] CHK024 Functional Requirements numbered FR-001 onward, organised into named sub-sections (Brand identity, Money typography, Dashboard footer, Empty states, Sidebar grouping, Marketing polish, Non-functional constraints) — 40 FRs total (FR-001 … FR-040).
- [x] CHK025 Success Criteria numbered SC-001 onward and tech-agnostic (SC-001 … SC-013; 13 criteria).
- [x] CHK026 Assumptions section present and calls out load-bearing decisions made by the spec-writer in the absence of explicit input (violet as primary brand retained, Inter as typeface choice, framework-built-in OG and favicon conventions, `lib/money/` arithmetic layer unchanged, `EmptyState` extended rather than replaced, no `/styleguide` route, no new theme variants).
- [x] CHK027 Key Entities section present and explicitly states no domain entities are introduced (consistent with chore-not-feature framing); names the UI contract surfaces (`AbacusIcon`, `Money`, `ShellFooter`, upgraded `EmptyState`, per-route illustrations) so the planner knows what surfaces the spec considers binding.
- [x] CHK028 Edge cases enumerated as a sub-section under User Scenarios & Testing, not inline in stories (12 edge cases).
- [x] CHK029 Out of Scope section present and cross-references roadmap features (007 Real dashboard, 008 Budgets, 015 Charts) and explicitly defers visual-regression infrastructure and `/styleguide` documentation surface.
- [x] CHK030 Clarifications section captures the open questions the spec is asking the user to lock (positive-amount color treatment; coming-soon copy specificity); a Session 2026-05-17 entry is in place for any future locked answers.

## Hand-off Readiness

- [x] CHK031 Zero open questions remain. Both `[NEEDS CLARIFICATION]` markers resolved on 2026-05-17 via `/speckit-clarify`: Q1 positive-amount color → foreground default for positive, `money-positive` token reserved for explicit income/gain semantics in future features; Q2 coming-soon copy → descriptive (name what the feature will do) but not date-committal, no roadmap-feature-number references, no external links, no primary call-to-action button on the three coming-soon empty states.
- [x] CHK032 All locked decisions documented in either the Clarifications session log or the Assumptions section so the architect can plan against them without re-deriving (font self-hosting rule, single-source brand-mark rule, footer-on-every-authenticated-route rule, two-group sidebar with named groups TRACK/MANAGE, no new runtime dependency rule, no new domain entity rule, existing E2E suite passes unchanged).
- [x] CHK033 No implementation choices baked into the spec that should belong to the plan (no commitment to a specific React component file path, no commitment to a specific Tailwind plugin, no commitment to a specific font-display value — `swap` vs `optional` is explicitly called out as plan-level, no commitment to a specific OG-image rendering library — `next/og` vs `@vercel/og` is explicitly called out as plan-level, no commitment to a specific SVG-vs-inline-component representation for the brand mark).
- [x] CHK034 Spec is internally consistent (FR-011/FR-012/FR-014 are mutually consistent on money rendering; FR-016/FR-018/FR-019 are mutually consistent on shell footer behavior; FR-020/FR-021/FR-022/FR-023/FR-024/FR-025/FR-026 are mutually consistent on empty-state behavior across the five dashboard routes; FR-028/FR-029/FR-030 are mutually consistent on sidebar grouping across desktop and mobile).
- [x] CHK035 The chore framing is consistent throughout the document — `branded-ui-polish` (no roadmap number), no new domain entity, no new roadmap-numbered feature consumed, every Out-of-Scope item correctly attributed to a future numbered feature on the roadmap.

## Notes

- Overall pass/fail: **PASS** — all 35 quality bars met. Spec is ready for `/speckit-plan`.
- Count summary: 5 user stories (P1, P1, P1, P2, P2), 40 functional requirements (FR-001 … FR-040, organised into 7 sub-sections), 13 success criteria (SC-001 … SC-013), 0 `[NEEDS CLARIFICATION]` markers remaining, 12 edge cases, 13 out-of-scope items.
- Clarification session 2026-05-17 resolved both originally-flagged questions: Q1 positive-amount color → foreground default for positive, `money-positive` token reserved for income/gain semantics in future features (007 Dashboard, 015 Charts, 008 Budget surplus); Q2 coming-soon copy → descriptive ("what the feature will do") but not date-committal, no feature numbers, no external links, no primary CTA buttons on the three coming-soon empty states.
- The chore does not consume a roadmap number; roadmap features 005 Categories, 006 Transactions, 007 Real dashboard, 008 Budgets, 015 Charts, and 017 Settings retain their existing numbering and scope.
