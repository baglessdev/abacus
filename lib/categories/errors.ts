/**
 * lib/categories/errors.ts
 *
 * Error code constants and canonical user-facing messages for category server actions.
 * Error catalog per plan.md §Error envelope and research.md R16.
 * FR-015: all category API endpoints MUST conform to { data } | { error: { code, message } }.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const CATEGORY_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  VALIDATION_FAILED: "validation_failed",
  NOT_FOUND: "not_found",
  HIERARCHY_VIOLATION: "hierarchy_violation",
  KIND_CHANGE_BLOCKED: "kind_change_blocked",
  INTERNAL_ERROR: "internal_error",
} as const

export type CategoryErrorCode = (typeof CATEGORY_ERROR_CODES)[keyof typeof CATEGORY_ERROR_CODES]

// Canonical user-facing messages per code
const ERROR_MESSAGES: Record<CategoryErrorCode, string> = {
  unauthenticated: "You must be signed in to manage categories.",
  validation_failed: "Please fix the highlighted fields.",
  not_found: "Category not found.",
  hierarchy_violation: "Parent must be a top-level category (single-level hierarchy only).",
  kind_change_blocked:
    "Cannot change kind while this category has children. Move or archive the children first.",
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

type HierarchyViolationEnvelope = {
  code: "hierarchy_violation"
  message: string
  field: "parentId"
}

type KindChangeBlockedEnvelope = {
  code: "kind_change_blocked"
  message: string
  field: "kind"
}

type InternalErrorEnvelope = {
  code: "internal_error"
  message: string
}

export type CategoryErrorEnvelope =
  | UnauthenticatedEnvelope
  | ValidationFailedEnvelope
  | NotFoundEnvelope
  | HierarchyViolationEnvelope
  | KindChangeBlockedEnvelope
  | InternalErrorEnvelope

// ---------------------------------------------------------------------------
// Custom error classes (thrown by queries.ts, caught by actions.ts)
// ---------------------------------------------------------------------------

/**
 * Thrown when a parentId reference violates the single-level hierarchy rule
 * or the kind-mismatch rule (FR-006, FR-009).
 */
export class HierarchyViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HierarchyViolationError"
  }
}

/**
 * Thrown when an update attempts to change the kind of a category
 * that has at least one child (FR-005).
 */
export class KindChangeBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "KindChangeBlockedError"
  }
}

// ---------------------------------------------------------------------------
// errorEnvelope helper
// ---------------------------------------------------------------------------

/**
 * Produces a typed `{ error: CategoryErrorEnvelope }` response.
 * Mirrors the shape established by lib/accounts/errors.ts for consistency.
 */
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
  code: "hierarchy_violation",
  opts?: { message?: string },
): { error: HierarchyViolationEnvelope }
export function errorEnvelope(
  code: "kind_change_blocked",
  opts?: { message?: string },
): { error: KindChangeBlockedEnvelope }
export function errorEnvelope(
  code: "internal_error",
  opts?: Record<string, never>,
): { error: InternalErrorEnvelope }
export function errorEnvelope(
  code: CategoryErrorCode,
  opts?: Record<string, unknown>,
): { error: CategoryErrorEnvelope } {
  const message = (opts?.message as string | undefined) ?? ERROR_MESSAGES[code]

  if (code === "hierarchy_violation") {
    return {
      error: {
        code,
        message,
        field: "parentId",
      } as HierarchyViolationEnvelope,
    }
  }

  if (code === "kind_change_blocked") {
    return {
      error: {
        code,
        message,
        field: "kind",
      } as KindChangeBlockedEnvelope,
    }
  }

  return {
    error: {
      code,
      message,
      ...opts,
    } as CategoryErrorEnvelope,
  }
}
