/**
 * Error code constants and canonical user-facing messages for account server actions.
 * Error catalog per plan.md §Error envelope and research.md R16.
 */

// Error code constants (lowercase snake_case per plan R16 final decision)
export const ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  VALIDATION_FAILED: "validation_failed",
  NOT_FOUND: "not_found",
  ARCHIVED_FIELD_LOCKED: "archived_field_locked",
  INTERNAL_ERROR: "internal_error",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// Canonical user-facing messages per code
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthenticated: "You must be signed in to manage accounts.",
  validation_failed: "Please fix the highlighted fields.",
  not_found: "Account not found.",
  archived_field_locked: "This field is locked while the account is archived.",
  internal_error: "Something went wrong. Please try again.",
}

// --- Error envelope types ---

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

type ArchivedFieldLockedEnvelope = {
  code: "archived_field_locked"
  message: string
  field: "type" | "startingBalance"
}

type InternalErrorEnvelope = {
  code: "internal_error"
  message: string
}

export type ErrorEnvelope =
  | UnauthenticatedEnvelope
  | ValidationFailedEnvelope
  | NotFoundEnvelope
  | ArchivedFieldLockedEnvelope
  | InternalErrorEnvelope

/**
 * Produces a typed `{ error: ErrorEnvelope }` response.
 * Accepts optional extra fields merged into the envelope (e.g., `field` for archived_field_locked,
 * `fieldErrors` for validation_failed).
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
  code: "archived_field_locked",
  opts: { field: "type" | "startingBalance"; message?: string },
): { error: ArchivedFieldLockedEnvelope }
export function errorEnvelope(
  code: "internal_error",
  opts?: Record<string, never>,
): { error: InternalErrorEnvelope }
export function errorEnvelope(
  code: ErrorCode,
  opts?: Record<string, unknown>,
): { error: ErrorEnvelope } {
  const message = (opts?.message as string | undefined) ?? ERROR_MESSAGES[code]
  return {
    error: {
      code,
      message,
      ...opts,
    } as ErrorEnvelope,
  }
}
