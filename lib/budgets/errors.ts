/**
 * lib/budgets/errors.ts
 *
 * Error code constants, canonical user-facing messages, error-envelope helper, and custom
 * Error subclasses for the Budgets module.
 *
 * Mirrors the shape of lib/transactions/errors.ts and lib/categories/errors.ts.
 * All actions in lib/budgets/actions.ts return { data } | { error: BudgetErrorEnvelope }.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const BUDGET_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  VALIDATION_FAILED: "validation_failed",
  NOT_FOUND: "not_found",
  BUDGET_EXISTS: "budget_exists",
  CATEGORY_WRONG_KIND: "category_wrong_kind",
  INTERNAL_ERROR: "internal_error",
} as const

export type BudgetErrorCode = (typeof BUDGET_ERROR_CODES)[keyof typeof BUDGET_ERROR_CODES]

// Canonical user-facing messages per code
const ERROR_MESSAGES: Record<BudgetErrorCode, string> = {
  unauthenticated: "Sign in to manage budgets.",
  validation_failed: "Please fix the highlighted fields.",
  not_found: "Budget not found.",
  budget_exists:
    "You already have an active budget for this category, currency, and period. Edit the existing one or pick a different combination.",
  category_wrong_kind:
    "Budgets are for expense categories. Income tracking is coming in a future feature.",
  internal_error: "Something went wrong. Please try again.",
}

// ---------------------------------------------------------------------------
// Error envelope types
// ---------------------------------------------------------------------------

type UnauthenticatedEnvelope = {
  code: "unauthenticated"
  message: string
}

type ValidationFailedEnvelope = {
  code: "validation_failed"
  message: string
  fieldErrors: Partial<Record<string, string[]>>
}

type NotFoundEnvelope = {
  code: "not_found"
  message: string
}

type BudgetExistsEnvelope = {
  code: "budget_exists"
  message: string
  field: "categoryId"
}

type CategoryWrongKindEnvelope = {
  code: "category_wrong_kind"
  message: string
  field: "categoryId"
}

type InternalErrorEnvelope = {
  code: "internal_error"
  message: string
}

export type BudgetErrorEnvelope =
  | UnauthenticatedEnvelope
  | ValidationFailedEnvelope
  | NotFoundEnvelope
  | BudgetExistsEnvelope
  | CategoryWrongKindEnvelope
  | InternalErrorEnvelope

// ---------------------------------------------------------------------------
// Custom Error subclasses (thrown by queries.ts, caught by actions.ts)
// ---------------------------------------------------------------------------

/**
 * Thrown when a create or unarchive would violate the partial unique index:
 * (userId, categoryId, currency, period) WHERE archivedAt IS NULL.
 * Also thrown on a caught Prisma P2002 (unique-index race — see R7).
 */
export class BudgetExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BudgetExistsError"
  }
}

/**
 * Thrown when a budget is attempted for a non-EXPENSE category (R6 layer 3).
 */
export class CategoryWrongKindError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CategoryWrongKindError"
  }
}

// ---------------------------------------------------------------------------
// errorEnvelope helper
// ---------------------------------------------------------------------------

/** Produces a typed { error: BudgetErrorEnvelope } response. */
export function errorEnvelope(
  code: "unauthenticated",
  opts?: Record<string, never>,
): { error: UnauthenticatedEnvelope }
export function errorEnvelope(
  code: "validation_failed",
  opts: { fieldErrors: Partial<Record<string, string[]>>; message?: string },
): { error: ValidationFailedEnvelope }
export function errorEnvelope(
  code: "not_found",
  opts?: Record<string, never>,
): { error: NotFoundEnvelope }
export function errorEnvelope(
  code: "budget_exists",
  opts?: { message?: string },
): { error: BudgetExistsEnvelope }
export function errorEnvelope(
  code: "category_wrong_kind",
  opts?: { message?: string },
): { error: CategoryWrongKindEnvelope }
export function errorEnvelope(
  code: "internal_error",
  opts?: Record<string, never>,
): { error: InternalErrorEnvelope }
export function errorEnvelope(
  code: BudgetErrorCode,
  opts?: Record<string, unknown>,
): { error: BudgetErrorEnvelope } {
  const message = (opts?.message as string | undefined) ?? ERROR_MESSAGES[code]

  if (code === "budget_exists") {
    return { error: { code, message, field: "categoryId" } as BudgetExistsEnvelope }
  }
  if (code === "category_wrong_kind") {
    return { error: { code, message, field: "categoryId" } as CategoryWrongKindEnvelope }
  }
  if (code === "validation_failed") {
    return {
      error: {
        code,
        message,
        fieldErrors: (opts?.fieldErrors as Partial<Record<string, string[]>> | undefined) ?? {},
      } as ValidationFailedEnvelope,
    }
  }

  return { error: { code, message } as BudgetErrorEnvelope }
}
