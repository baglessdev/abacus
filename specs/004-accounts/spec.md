# Feature Specification: Accounts

**Feature Branch**: `004-accounts`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "Accounts" (Tier 1, feature 004)

## Why

Accounts are the financial containers that hold a user's money: a checking account, a savings account, a credit card, a cash envelope, a brokerage account. Until Abacus knows about a user's accounts, there is nowhere for transactions to live, no balance to compute, no net worth to show. Feature 003 established that every domain row carries a `userId` and is queried strictly within the current session's user; feature 004 is the first feature to actually exercise that scoping convention. It is also the first feature that touches money, so it is where constitution Principle I (Decimal everywhere, currency stored alongside, no float math) leaves the page and enters the codebase. Getting this right with a simple, transaction-free model is the foundation every later money-touching feature (transactions, transfers, budgets, dashboards, reports) will stack on top of.

## Clarifications

### Session 2026-05-16

- Q: Currency support — single fixed currency per user, or multi-currency from day one? → A: Multi-currency from day one. A user may own accounts denominated in any ISO 4217 currency. Currency is selected at account creation and is locked for the lifetime of the account (changing it would invalidate `startingBalance` and every transaction's amount). Cross-currency aggregation into a single "primary currency total" is OUT OF SCOPE for this feature (it lives in roadmap feature 020); for now, balances and totals are displayed in their native currency, grouped by currency where a total would otherwise be misleading.
- Q: Delete or archive? → A: Archive only. An account is never hard-deleted from the UI. "Archive" sets `archivedAt` to the current timestamp; "Unarchive" clears it. Archive is reversible. Archived accounts are hidden from the default list view but reachable via an in-list toggle. They are excluded from any aggregate (e.g., net worth) when those aggregates land in feature 007. Future transactions retain referential integrity because no row is ever removed.
- Q: Negative starting balance — allowed for which account types? → A: Allowed for `CREDIT` accounts (a credit card with $500 of debt has a starting balance of `-500.00`), allowed for `OTHER` (escape hatch), and not allowed for `CHECKING`, `SAVINGS`, `CASH`, or `INVESTMENT` (those should be zero or positive at the moment tracking begins). Zero is always allowed for every type. Validation is enforced at the boundary on both create and edit.
- Q: Edit experience — separate detail page, modal dialog, or side sheet/drawer? → A: Side sheet/drawer from the list. The accounts list is the canonical surface for this feature. Clicking an account row (or its "Edit" action) opens a side sheet with the editable form. There is no separate `/dashboard/accounts/[id]` detail page in this feature — a future feature (transactions per account) can introduce one. Creating an account opens the same sheet in "create" mode.
- Q: Default sort order for the list? → A: Alphabetical by name, case-insensitive, ascending. Stable across reloads. The user does not get drag-to-reorder in this feature.
- Q: Archived accounts — separate tab or filter toggle? → A: Filter toggle. A single accounts list with a "Show archived" toggle (off by default). Archived rows render with a muted/dimmed treatment and a clear "Archived" badge; their primary actions are limited to "Unarchive" and "Edit" (the latter for fixing a typo on a now-archived account).
- Q: Per-user account limit? → A: No hard limit in this feature. The UI is designed to remain usable up to a few dozen accounts (a realistic personal-finance ceiling); a defensive upper bound (e.g., "more than 200 accounts") is a future concern, not a v1 constraint.
- Q: Icon or color per account in v1? → A: No. Account rows show only `name`, `type`, `currency`, and balance in v1. Per-account icon/color is a polish item that can land later without a data-model change beyond an optional column; this feature does not introduce it to keep the schema and UX tight.
- Q: Drag-to-reorder accounts in v1? → A: No. Sort is alphabetical-by-name (deterministic). User-defined ordering is a future feature.
- Q: Currency allow-list scope for v1 — full ISO 4217 active list, or a curated subset? → A: Full ISO 4217 active list (~170 codes). Bundled as static data in the codebase. The currency picker is a searchable combobox; the validation allow-list accepts any active ISO 4217 code. No "curated subset" or per-deployment extension mechanism is introduced in v1 — adding currencies requires updating the bundled list and shipping a release (which is also how new ISO 4217 codes enter circulation in practice).
- Q: Per-currency subtotals in the accounts list when ≥2 currencies are present? → A: No subtotals in v1. The list is strictly row-level. Per-currency subtotals and cross-currency aggregation both arrive together in feature 020. Rationale: subtotals are an aggregation (just at the per-currency level), adding them now means designing a second display surface twice (once here, once in 020); keep the v1 list clean.
- Q: Editability of fields on an archived account? → A: Name-only. On an archived account row, the only editable field is `name` (so a user can still fix a typo on a closed account); `type` and `startingBalance` MUST be read-only while archived. "Unarchive" remains available and is the path back to full editability. Rationale: `type` and `startingBalance` are semantically loaded — they shape the balance computation feature 006 will plug into — so freezing them while archived prevents "ghost edits" on data that is meant to be a historical record. `name` is a pure display label with no downstream semantics, so allowing typo fixes there is safe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create the first account from empty state (Priority: P1)

As a newly-signed-up user with no financial data yet, I open the accounts page, see a friendly empty state explaining what an account is and why I need at least one, click a primary CTA to add my first account, fill in a short form (name, type, currency, starting balance), submit, and immediately see that account in the list with its starting balance displayed alongside its currency.

**Why this priority**: This is the on-ramp. Without it, no first-time user gets past the empty `/dashboard/accounts` placeholder and no later money-touching feature has anywhere to attach. The very first thing a user must be able to do in Abacus is tell the app where their money lives.

**Independent Test**: From a freshly-signed-up account with zero accounts, navigate to `/dashboard/accounts`. The page shows an empty state and a single primary call-to-action. Activate the CTA, fill in the form with valid values (name, type, currency, starting balance), submit. The empty state is replaced by a list containing exactly one row — the account just created — with its name, type, and starting balance displayed together with the currency.

**Acceptance Scenarios**:

1. **Given** an authenticated user with zero accounts, **When** they open `/dashboard/accounts`, **Then** the page renders an empty state with a short explanation of what an account is and a single primary CTA to create the first account. No account list is rendered.
2. **Given** the user has activated the create CTA, **When** they submit a valid form (e.g., `Chase Checking`, `CHECKING`, `USD`, `1250.00`), **Then** the new account is persisted, the side sheet closes, the empty state is replaced by a list, and the new account appears in that list with its name, type, currency, and starting balance shown together with its currency.
3. **Given** the user has just created their first account, **When** they reload the page, **Then** the same account is still listed in the same form (the data persisted, scoped to this user).
4. **Given** a SECOND authenticated user has signed up and is on `/dashboard/accounts`, **When** the first user's account was created in scenario 2, **Then** the second user's accounts page is empty — they see only the empty state and see none of the first user's accounts.

---

### User Story 2 - Manage existing accounts: rename, edit, archive, unarchive (Priority: P1)

As a user with at least one account already, I can open an existing account from the list, change its name, change its type, adjust its starting balance, archive it when I close the underlying real-world account, and later unarchive it if I made a mistake. The list updates immediately to reflect each change.

**Why this priority**: Personal finances are not static. Bank account labels change, the starting balance from when I began tracking may need correction, accounts get closed and sometimes get re-opened. Without edit and archive, the create-only flow from US1 becomes a one-way trap. P1 because the create flow alone is not a viable MVP — users would have no way to correct a typo on their first attempt.

**Independent Test**: With a user account that already owns at least one account, click an existing account in the list. A side sheet opens in "edit" mode pre-populated with the current values. Change the name, save, and the list immediately reflects the new name. Open the same account again, click "Archive", confirm. The row leaves the default list. Activate "Show archived". The row reappears with an "Archived" badge. Open it, click "Unarchive". The row returns to the default list without the badge.

**Acceptance Scenarios**:

1. **Given** the user has at least one account, **When** they click that account in the list, **Then** a side sheet opens in "edit" mode pre-populated with the account's current name, type, currency, and starting balance. Currency is rendered as read-only (FR-007).
2. **Given** the edit sheet is open, **When** the user changes the name to a valid new value and submits, **Then** the account's name updates, the sheet closes, and the list shows the new name in the row.
3. **Given** the edit sheet is open, **When** the user changes the type (e.g., `CHECKING` → `SAVINGS`) to a valid value and submits, **Then** the type updates and the row reflects the new type. The currency does not change as a result.
4. **Given** the edit sheet is open, **When** the user changes the starting balance to a value valid for the account's type (per FR-006) and submits, **Then** the starting balance updates and the displayed balance on the row reflects the new value (currency unchanged).
5. **Given** the edit sheet is open, **When** the user activates "Archive" and confirms, **Then** `archivedAt` is set, the sheet closes, and the row disappears from the default list view.
6. **Given** the user has at least one archived account, **When** they enable the "Show archived" toggle, **Then** the archived row appears in the list with an "Archived" badge and a muted treatment. The active rows remain visible above.
7. **Given** an archived account's edit sheet is open, **When** the sheet renders, **Then** the `name` field is editable; the `type` and `startingBalance` fields are read-only; the `currency` field is read-only as always; and the "Unarchive" action is exposed (FR-009a).
8. **Given** an archived account's edit sheet is open, **When** the user changes the name to a valid new value and submits, **Then** the name updates, the sheet closes, and the row in the list (when "Show archived" is on) shows the new name. The `archivedAt` status is unchanged.
9. **Given** an archived account is visible (toggle on), **When** the user opens it and activates "Unarchive", **Then** `archivedAt` is cleared, the row returns to the default list view (the "Archived" badge is removed), and on the next edit-sheet open the `type` and `startingBalance` fields are editable again.
10. **Given** the user has multiple accounts, **When** an account belongs to that user, **Then** they MUST be able to edit/archive/unarchive only their own accounts; attempting to operate on an account belonging to another user MUST fail (FR-013).

---

### User Story 3 - Multi-currency accounts coexist in one list (Priority: P2)

As a user who keeps money in more than one currency (e.g., a USD checking account and a EUR savings account), I can create each account in its native currency, see each account's balance displayed with its own currency code, and trust that Abacus is never silently mixing currencies or converting them behind my back.

**Why this priority**: Multi-currency is what separates Abacus from single-currency apps and is one of its positioning differentiators (per the roadmap's competitive landscape). P2 because US1+US2 work for a single-currency user (the common case), but day-one support for multi-currency avoids a painful schema migration later and is cheap to ship now: it is mostly a "don't infer, always store" discipline.

**Independent Test**: As a user with two accounts in two different currencies, the list shows each account's balance rendered with its own currency code (e.g., `$1,250.00` and `€800.00`, or whichever format the spec leaves to the plan). No "total" widget that sums across currencies appears anywhere in this feature. The create form's currency picker offers any valid ISO 4217 code, and the form refuses to submit if the currency is missing or invalid.

**Acceptance Scenarios**:

1. **Given** the user opens the create form, **When** they pick a currency, **Then** the picker accepts any valid ISO 4217 three-letter code and refuses any value that is not a valid ISO 4217 code (FR-005).
2. **Given** the user has created two accounts with different currencies (e.g., USD and EUR), **When** they view the list, **Then** each row displays its account's balance together with its own currency code or symbol. The two currencies are never silently summed into a single total.
3. **Given** an account exists with currency `USD`, **When** the user opens its edit sheet, **Then** the currency field is shown but is read-only and cannot be changed (FR-007). The disabled control has a short inline explanation of why ("currency is locked at creation to keep balances consistent" or equivalent).
4. **Given** the user has accounts in three currencies, **When** the list renders, **Then** there is no aggregated "all-accounts total" widget and no per-currency subtotal line displayed in this feature. The list is strictly row-level. Cross-currency aggregation AND per-currency subtotals both land together in roadmap feature 020.

---

### User Story 4 - Validation surfaces actionable errors (Priority: P2)

As a user filling out the create or edit form for an account, if I submit invalid input — a blank name, a currency that is not an ISO 4217 code, a starting balance that is negative for a `CHECKING` account, a starting balance with too many decimal places, an extremely long name — the form rejects the submission, shows me a clear field-scoped error explaining what is wrong, and keeps my other entered values intact so I can fix the one offending field and try again.

**Why this priority**: Without per-field validation feedback, the form becomes opaque on the very first interaction with this feature. P2 because US1 and US2 functionally pass without polished validation messages, but the UX gap is jarring on a money-touching surface where users need to trust the input model.

**Independent Test**: Submitting the create or edit form with each of the following invalid inputs surfaces a clear, field-scoped error and does NOT persist any change: blank name, name longer than the maximum length, missing currency, currency that is not three letters or not an ISO 4217 code, missing type, type not in the allowed enum, missing starting balance, starting balance with more decimal places than the currency supports, negative starting balance on a non-credit/non-other account.

**Acceptance Scenarios**:

1. **Given** the create form is open, **When** the user submits with a blank or whitespace-only name, **Then** the form shows an actionable name-field error and does not create the account.
2. **Given** the create form is open, **When** the user submits with a name longer than the allowed maximum (FR-004), **Then** the form shows an actionable length-error and does not create the account.
3. **Given** the create form is open, **When** the user submits with a currency that is not a valid ISO 4217 three-letter code, **Then** the form shows an actionable currency-field error and does not create the account.
4. **Given** the create or edit form is open, **When** the user submits a negative starting balance for an account whose type is `CHECKING`, `SAVINGS`, `CASH`, or `INVESTMENT`, **Then** the form shows an actionable starting-balance error explaining that this account type cannot start negative, and does not persist.
5. **Given** the create or edit form is open, **When** the user submits a starting balance with more decimal places than the chosen currency supports (e.g., 3+ decimal places for a USD/EUR-style two-decimal currency), **Then** the form shows an actionable starting-balance error and does not persist.
6. **Given** the form has just been rejected on the server, **When** the form re-renders, **Then** the entered values are preserved for the still-valid fields, the offending field is focused, and the user can correct it and re-submit.
7. **Given** the user is editing an existing account, **When** any of the validation rules above fail on submit, **Then** the existing persisted account is NOT modified (atomic save: all-or-nothing).

---

### Edge Cases

- **A user attempts to view, edit, or archive an account that belongs to another user** (e.g., by guessing or tampering with an `id` in a request) — the operation MUST fail with a not-found-style response (FR-013). The system MUST NOT distinguish "account belongs to another user" from "account does not exist" in any user-visible response, log line, or response timing.
- **A user creates two accounts with the exact same name** (e.g., two "Cash" envelopes) — this is allowed. Names are display labels, not identifiers; the system MUST NOT enforce per-user name uniqueness. The list MAY render a discreet hint (e.g., creation date as a secondary line) but is not required to.
- **A user submits the create or edit form with a name containing only whitespace** — the form rejects this as if the name were blank (FR-004 covers this).
- **A user submits a starting balance of `0`** — valid for every account type. A balance of literal `0.00` is the documented default in the create form (FR-006).
- **A user submits a starting balance of `-100.00` on a `CREDIT` account** — valid; this represents `$100.00` of debt at the moment tracking begins (FR-006). The list displays the balance with its sign and currency.
- **A user submits a currency code that is uppercase vs. lowercase** (e.g., `usd` vs `USD`) — the form normalizes to uppercase at the boundary before validation; both inputs are accepted and stored canonically as uppercase (FR-005).
- **A user submits a currency code that is real ISO 4217 but unusual** (e.g., `JPY`, which conventionally has zero decimal places, or `BHD`, which conventionally has three) — the form accepts it; the decimal-place validation in scenario 5 of US4 is currency-aware (FR-006). Currencies with zero decimal places refuse fractional input; currencies with three decimal places permit a third decimal.
- **A user archives the only account they have** — allowed. The user returns to the empty-state experience from US1 (default list view is empty) until they create another account or unarchive the archived one. The empty state's CTA copy is unchanged.
- **A user attempts to "delete" an account** — there is no delete affordance in this feature. The only destructive-feeling action is "Archive", which is reversible (FR-008). The plan stage is free to omit a hard-delete API entirely.
- **A user attempts to change `type` or `startingBalance` on an archived account** — rejected at the Zod boundary (FR-009a). The path forward is "Unarchive first, edit, then re-Archive". Only `name` is editable while `archivedAt` is non-null.
- **A user creates many accounts** — the list remains usable up to a few dozen accounts (the realistic personal-finance ceiling). There is no enforced hard limit in v1.
- **A user with no session attempts to reach `/dashboard/accounts`** — covered by feature 003's auth boundary (FR-008 of feature 003); the request is redirected to `/login` with the path preserved. This feature inherits that behavior and does not re-implement it.
- **A user with a session attempts to reach an accounts endpoint as a different user via a forged session payload** — the session is the canonical "who is this request for" surface (feature 003 FR-015); the route boundary trusts the session-provided `userId` and never accepts a `userId` from request input (FR-013). Tampered request bodies that try to specify a different `userId` are ignored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST introduce an `Account` domain model as the first money-touching entity. At minimum the model MUST include a unique identifier, the owning user's identifier (foreign key to `User`), a user-visible name, a type, a currency code, a starting balance, an optional archived-at timestamp, and creation/updated-at timestamps. The model MUST land via a generated Prisma migration (no `db push` against committed code, per the constitution).
- **FR-002**: Every `Account` row MUST carry a `userId` foreign key referencing `User.id` with cascade-on-delete semantics, so that removing a user removes their accounts in a single referential step. This is the first feature to actually implement feature 003's FR-025 data-scoping convention.
- **FR-003**: Every query against `Account` (list, read-by-id, update, archive, unarchive) MUST be scoped to the current session's `userId` at the route boundary. No route handler MAY accept a `userId` parameter from request input; the session is the sole source of truth for the requesting user's identity. Cross-user reads and writes MUST be impossible to perform through the product surface.
- **FR-004**: The `name` field MUST be a non-empty, whitespace-trimmed string between 1 and a documented maximum length (no shorter than 1 character after trimming, no longer than 80 characters). Validation MUST run at the Zod boundary before any persistence.
- **FR-005**: The `currency` field MUST be a three-letter uppercase ISO 4217 currency code. The system MUST normalize submitted values to uppercase at the boundary, then validate that the normalized value is a member of the bundled allow-list of ALL currently-active ISO 4217 codes (approximately 170 entries). The allow-list MUST be a static, version-controlled file in the codebase, not a runtime lookup. Unrecognized codes (including obsolete codes such as `DEM`, `FRF`, `XEU`) MUST be rejected at the Zod boundary with an actionable error. The currency picker MUST be a searchable combobox that lists every code in the allow-list.
- **FR-006**: The `startingBalance` field MUST be a Decimal value (constitution Principle I — never `Float`/`Number`). It MUST be stored as Postgres `NUMERIC`. The number of fractional digits accepted MUST match the convention for the chosen currency (e.g., 2 for USD/EUR/GBP, 0 for JPY/KRW, 3 for BHD/KWD/JOD); submitting more fractional digits than the currency supports MUST be rejected at the Zod boundary. A starting balance of `0` MUST be valid for every account type and MUST be the default in the create form. A negative starting balance MUST be valid for `CREDIT` and `OTHER` types and MUST be rejected for `CHECKING`, `SAVINGS`, `CASH`, and `INVESTMENT` at the Zod boundary.
- **FR-007**: The `currency` of an existing account MUST be immutable after creation. The edit form MUST render the currency control as read-only. Any submitted edit payload that attempts to change the currency MUST be rejected at the Zod boundary with a clear error. This restriction exists because the `startingBalance` and (in feature 006) every future transaction is denominated in this account's currency; changing it after the fact would silently invalidate every amount.
- **FR-008**: Archive is a soft state, not a delete. The system MUST expose an "Archive" action that sets `archivedAt` to the current server timestamp, and an "Unarchive" action that clears `archivedAt`. Both actions MUST be reversible an arbitrary number of times. The system MUST NOT expose any product surface that hard-deletes an account row. Foreign-key dependents (future transactions, etc.) are therefore guaranteed to remain referentially intact.
- **FR-009**: The default accounts list view MUST exclude rows where `archivedAt` is non-null. A "Show archived" filter toggle (default off) MUST make archived rows visible alongside active rows. Archived rows MUST be visually distinguished (e.g., muted treatment + "Archived" badge).
- **FR-009a**: On an archived account, the ONLY editable field MUST be `name`. The `type` and `startingBalance` fields MUST be rendered as read-only in the edit sheet while `archivedAt` is non-null. The `currency` field is already read-only at all times (FR-007). The "Unarchive" action MUST remain available on archived rows; once unarchived, all editable fields return to their normal mutability per FR-006 and FR-007. Any submitted edit payload that attempts to change `type` or `startingBalance` on an archived account MUST be rejected at the Zod boundary with an actionable error.
- **FR-010**: When a user has zero accounts (active and archived, after applying the current filter toggle's "default off" state), the accounts page MUST render an empty state. The empty state MUST include a short explanation of what an account is and a single primary CTA that opens the create form (the same side sheet used in edit, opened in "create" mode). The empty state MUST NOT render a degraded list table with no rows.
- **FR-011**: Every monetary value displayed in this feature (the `startingBalance` shown on each row in the list, the value shown in the edit sheet) MUST be rendered together with its currency code or symbol. The system MUST NOT display a bare amount without a currency. Display formatting (separators, decimal symbol) happens at the UI edge; the stored Decimal MUST NOT be rounded.
- **FR-012**: The accounts list MUST be sorted by name, case-insensitive, ascending, as a deterministic default. Stable across reloads. User-defined sort or drag-to-reorder is out of scope for this feature.
- **FR-012a**: The accounts list MUST be strictly row-level in this feature. The list MUST NOT render an aggregated "all-accounts total" widget AND MUST NOT render per-currency subtotal lines, even when the user has accounts in multiple currencies. Both aggregation surfaces land together in roadmap feature 020.
- **FR-013**: Operations on an account that does not belong to the session's user (read-by-id, update, archive, unarchive) MUST return a not-found-style error envelope (`{ error: { code, message } }` per the constitution). The system MUST NOT distinguish "this account belongs to another user" from "this account does not exist" in any user-visible response, log entry, or response-timing channel.
- **FR-014**: All Account API endpoints (server actions or route handlers) MUST validate input with Zod at the boundary before touching business logic or persistence, per constitution Principle III. Once validated, internal helpers MUST trust their typed inputs and MUST NOT re-validate.
- **FR-015**: All Account API endpoints MUST conform to the constitution's response envelope: success returns `{ data }`, failure returns `{ error: { code, message } }`. HTTP status reflects outcome (2xx success, 4xx client error, 5xx server error). Plaintext input is never echoed in an error message beyond what is needed for the user to fix it.
- **FR-016**: All monetary arithmetic introduced by this feature MUST go through a `lib/money/` module (this is the feature in which `lib/money/` lands per the constitution's "money helpers" convention). At minimum the module MUST expose a typed Decimal value with its currency and a formatter that renders the value together with its currency for display. No file outside `lib/money/` MUST perform direct arithmetic on monetary amounts. (The actual list of helpers and their signatures is plan-level; the spec only locks the boundary rule.)
- **FR-017**: The per-account "balance" rendered in the list MUST be computed as `startingBalance + sum(transactions for this account)`. Because transactions do not exist yet (feature 006), the implementation in this feature MUST treat the sum as zero, so the displayed balance equals `startingBalance`. The computation formula MUST be documented in such a way that feature 006 (Transactions + Transfers) can plug into it without changing this feature's display contract.
- **FR-018**: The feature MUST replace the existing placeholder page at `/dashboard/accounts`. After this feature ships, that route is the canonical accounts surface inside the authenticated shell (under the same shell chrome established by features 002 and 003).
- **FR-019**: The form (create + edit) MUST be a side sheet rendered from the accounts list. There is no separate per-account detail page in this feature. Future features (e.g., transactions per account) MAY introduce a detail page; this feature does not.
- **FR-020**: The list MUST be operable by keyboard alone. Form fields MUST have associated labels; error messages MUST be programmatically associated with their fields. Color MUST NOT be the sole carrier of meaning (e.g., the "Archived" badge MUST also have a text label). The empty state's primary CTA MUST be reachable via Tab and activatable via Enter/Space.
- **FR-021**: All new code MUST satisfy TypeScript strict mode with no use of `any` (constitution Principle II). All boundary schemas MUST be defined with Zod (constitution Principle II and III).
- **FR-022**: Unit tests MUST cover the money-correctness paths introduced by this feature: the Decimal value abstraction, the currency-aware decimal-place validation, the negative-balance rule per account type, and the per-currency display formatter. These are constitution Principle IV deliverables.
- **FR-023**: This feature MUST NOT introduce transactions, transfers, budgets, categories, CSV import/export, charts, FX conversion, account icons, account colors, per-account ordering, account sharing across users, or any per-user "primary currency" / aggregated total display. Each is explicitly deferred to a later roadmap feature.
- **FR-024**: This feature MUST NOT introduce any per-user account limit. The UI is designed for usability up to a few dozen accounts; defensive upper bounds are a future concern.

### Key Entities

- **Account** — A single financial container belonging to one user (a checking account, a savings account, a credit card, a cash envelope, a brokerage account, etc.). Identified by a stable unique identifier. Attributes:
  - `userId` — the owning user's identifier; the row is unreachable to any other user; cascade-deletes with the user.
  - `name` — a short user-visible label (1–80 chars after trim) such as "Chase Checking" or "Vacation Savings". Not required to be unique per user.
  - `type` — one of a closed enum: `CHECKING`, `SAVINGS`, `CREDIT`, `CASH`, `INVESTMENT`, `OTHER`. Editable any time.
  - `currency` — a three-letter uppercase ISO 4217 currency code (e.g., `USD`, `EUR`, `JPY`). Locked at creation; never changes for the lifetime of the account.
  - `startingBalance` — a Decimal value in the account's `currency`, representing the balance at the moment the user begins tracking this account in Abacus. Stored as Postgres `NUMERIC` (never float). May be negative for `CREDIT` and `OTHER`; must be zero-or-positive for `CHECKING`, `SAVINGS`, `CASH`, and `INVESTMENT`. Number of fractional digits matches the convention of the chosen currency.
  - `archivedAt` — nullable timestamp. Non-null means the account is archived (hidden from the default list, excluded from future aggregates, retained for referential integrity). Reversible.
  - `createdAt`, `updatedAt` — standard timestamps, stored UTC.
  - Relationship: every `Account` belongs to exactly one `User`. A `User` may own zero or many `Accounts`. There is no shared-account model; an `Account` is never owned by two users.
- **(Future-only references — NOT created in this feature)** — `Transaction` (feature 006) will carry an `accountId` referencing `Account.id` and the `Account.currency` will be the denomination of every related transaction's `amount`. This feature does NOT add `Transaction` and MUST NOT presume its shape beyond "transactions, when they land, will reference this account by id and inherit its currency."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the empty state, a newly-signed-up user can create their first account (open the create form, fill name + type + currency + starting balance, submit, see the row appear in the list) in under 30 seconds of interaction time.
- **SC-002**: After creating an account, reloading `/dashboard/accounts` shows the same account in the list in 100% of attempts. The data persisted is scoped to the creating user.
- **SC-003**: A second user signing up and visiting `/dashboard/accounts` sees the empty state — none of the first user's accounts — in 100% of attempts. This is the data-scoping convention from feature 003 FR-025 actually exercised for the first time.
- **SC-004**: Editing any field on an existing account (name, type, starting balance) reflects the change in the list row within one normal interaction (submit → list updates) in 100% of attempts.
- **SC-005**: Archiving an account hides the row from the default list in 100% of attempts. Toggling "Show archived" reveals the archived row with a visible "Archived" indicator in 100% of attempts. Unarchiving the same account restores it to the default list in 100% of attempts.
- **SC-006**: No monetary value is ever displayed anywhere in this feature without an accompanying currency code or symbol — measured across the list view and the create/edit sheet, in 100% of rendered states. There is no "bare number" surface.
- **SC-007**: Submitting an invalid payload (blank name, name beyond max length, unrecognized currency, missing type, type not in the enum, negative starting balance on a non-credit/non-other account, more fractional digits than the currency supports) is rejected at the Zod boundary and never reaches persistence in 100% of attempts. The list state on the page is unchanged after such a rejection.
- **SC-008**: Cross-user access attempts (reading, updating, archiving, or unarchiving an account belonging to a different user) MUST return a not-found-style error envelope in 100% of attempts. No user-visible distinction between "not yours" and "does not exist" is exposed in response body, response headers, or response timing.
- **SC-009**: The `currency` field of an existing account cannot be modified through any product surface in this feature, in 100% of attempts. Submitting an edit payload that attempts to change the currency is rejected with an actionable error and the persisted account is unchanged.
- **SC-010**: The full money-correctness unit suite for this feature (Decimal value handling, currency-aware decimal-place rule, per-type negative-balance rule, display formatter) passes on a clean checkout in 100% of runs. This is the constitution Principle IV bar for this feature.
- **SC-011**: A multi-currency user (two or more accounts in two or more currencies) sees each balance rendered in its own currency, never silently aggregated into a single number, in 100% of rendered list states.
- **SC-012**: A type-check of all new code passes with strict mode enabled and zero uses of `any`. No file outside `lib/money/` performs direct arithmetic on monetary amounts.
- **SC-013**: The accounts list and the create/edit form are operable end-to-end with the keyboard alone (tab into list, activate "edit" or "create" on a focused row/CTA, fill form, submit) in 100% of attempts.
- **SC-014**: On an archived account's edit sheet, the `name` field is editable and the `type` + `startingBalance` fields are read-only in 100% of rendered states. Submitting an edit payload that attempts to change `type` or `startingBalance` on an archived account is rejected at the Zod boundary in 100% of attempts.
- **SC-015**: The accounts list contains no aggregated total widget and no per-currency subtotal lines in 100% of rendered states, regardless of how many distinct currencies the user holds.

## Assumptions

- Feature 003's auth boundary is in place: every `/dashboard/*` route requires a session; the session is the canonical source of the requesting user's identity (`userId`); cross-user access is prevented at the route boundary, not in helpers. This feature builds on that boundary without re-implementing it.
- The Prisma schema currently contains only the `User` model from feature 003. This feature owns the first migration that adds a money-touching domain model (`Account`) and the first migration to wire a `userId` foreign key with cascade-on-delete semantics.
- `lib/money/` does not yet exist. This feature is the one that creates it. The plan stage will decide the exact shape of the helpers (likely a Decimal wrapper or a thin facade over a vetted decimal library, plus a currency-aware formatter); the spec only locks the boundary rule (no monetary arithmetic outside `lib/money/`) and the constitution-mandated unit-test coverage.
- The canonical "is this currency valid?" source is a bundled, version-controlled list of all currently-active ISO 4217 codes (~170 entries). The plan stage decides where in the codebase the file lives and the exact format; the spec only locks the rule: the full active set, not a curated subset, and updates to the list ship with code releases (no runtime fetch). Obsolete ISO 4217 codes (e.g., `DEM`, `FRF`) are excluded.
- The edit experience is a side sheet/drawer opened from the list; there is no separate `/dashboard/accounts/[id]` detail page in this feature. Future features may introduce one when there is a real reason (e.g., per-account transaction list).
- The accounts list is the only product surface for this feature. There is no dashboard widget, no chart, no per-account drill-down in this feature; those land with features 007 and 015.
- Multi-currency aggregation into a single "primary currency" total is OUT OF SCOPE for this feature and is roadmap feature 020. For now, balances are shown in their native currency. Per-currency subtotals are also out of scope and land together with full cross-currency aggregation in feature 020.
- Account `name` is a display label, not an identifier. The system does not enforce per-user uniqueness on `name`.
- A starting balance of `0` is the default value pre-filled in the create form. The user can change it before submitting.
- Currency-aware decimal-place rules are based on the conventional fractional-digit count for each ISO 4217 code (USD/EUR/GBP → 2, JPY/KRW → 0, BHD/KWD/JOD → 3, etc.). The plan stage chooses the canonical source; the spec only locks the rule.
- "Archive" is the only destructive-feeling action exposed in this feature. There is no UI for hard deletion. A future feature MAY introduce a hard-delete flow for accounts that have never had a transaction; this feature does not.
- The Playwright E2E surface for this feature is plan-level. The constitution-mandated E2E for "create transaction, transfer between accounts" lives in feature 006, not 004. This feature's required automated coverage is the unit-level money-correctness suite (SC-010).

## Out of Scope

- **Transactions** — adding, editing, deleting, or listing transactions against an account. Lands in feature 006.
- **Transfers** — atomic two-ledger-entry transfers between accounts. Lands in feature 006.
- **Budgets** — capping spending by category against an account. Lands in feature 008.
- **Categories** — the income/expense classification model. Lands in feature 005.
- **CSV import / CSV export** — bulk-loading transactions from a bank file and exporting them. Lands in features 010 and 014.
- **FX conversion / multi-currency aggregation** — converting account balances to a single "primary currency" for a net-worth-style total. Lands in feature 020.
- **Account icons / colors / custom badges** — per-account visual customization. Future polish, not in this feature.
- **User-defined account ordering / drag-to-reorder** — sort is alphabetical-by-name only in this feature.
- **Hard delete of accounts** — only archive is exposed. A future feature MAY introduce hard delete with safeguards.
- **Per-user account limits or quotas** — no enforced upper bound in this feature.
- **Account-level permissions / sharing across users** — Abacus has no shared workspaces per feature 003. An account belongs to exactly one user and is never visible to another user.
- **Bank syncing / Plaid / open banking integrations** — deliberately deferred (see roadmap "Deliberately deferred").
- **Per-account detail page** — the side sheet from the list is the only edit surface in this feature. A detail page may land with feature 006's per-account transaction list.
- **Dashboard widgets that surface account data** (net worth, per-account balance card) — those land in feature 007.
- **Charts of account balance over time** — Recharts lands in feature 015.
- **Audit log of who changed which account when** — roadmap feature 021.

## Open Questions

All scope-load-bearing questions have been resolved via `/speckit-clarify` (see the Clarifications section). No open questions remain. The spec is ready for `/speckit-plan`.
