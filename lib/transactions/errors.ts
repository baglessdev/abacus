/**
 * lib/transactions/errors.ts
 *
 * Error code constants, canonical user-facing messages, error-envelope helper, and custom
 * Error subclasses for the Transactions module.
 *
 * Error catalog per contracts/README.md and plan.md §Error envelope.
 * FR-027: all transaction API endpoints MUST conform to { data } | { error: { code, message } }.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const TRANSACTION_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  VALIDATION_FAILED: "validation_failed",
  NOT_FOUND: "not_found",
  CURRENCY_MISMATCH: "currency_mismatch",
  SIGN_MISMATCH: "sign_mismatch",
  TRANSFER_CROSS_CURRENCY: "transfer_cross_currency",
  TRANSFER_SAME_ACCOUNT: "transfer_same_account",
  TRANSFER_LEG_ISOLATED: "transfer_leg_isolated",
  ARCHIVED_ACCOUNT_BLOCKED: "archived_account_blocked",
  INTERNAL_ERROR: "internal_error",
} as const

export type TransactionErrorCode =
  (typeof TRANSACTION_ERROR_CODES)[keyof typeof TRANSACTION_ERROR_CODES]

// Canonical user-facing messages per code
const ERROR_MESSAGES: Record<TransactionErrorCode, string> = {
  unauthenticated: "Sign in to manage transactions.",
  validation_failed: "Please fix the highlighted fields.",
  not_found: "Transaction not found.",
  currency_mismatch:
    "The transaction currency does not match the account currency. Change the account or the currency.",
  sign_mismatch: "The amount sign does not match the transaction type.",
  transfer_cross_currency: "Cross-currency transfers are not supported in this version.",
  transfer_same_account: "Source and destination accounts must be different.",
  transfer_leg_isolated:
    "This row is part of a transfer pair — use the transfer edit form to edit both legs together.",
  archived_account_blocked:
    "The selected account is archived. Unarchive it before creating or editing transactions against it.",
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

type CurrencyMismatchEnvelope = {
  code: "currency_mismatch"
  message: string
  field: "currency" | "accountId" | "fromAccountId" | "toAccountId"
}

type SignMismatchEnvelope = {
  code: "sign_mismatch"
  message: string
  field: "amount"
}

type TransferCrossCurrencyEnvelope = {
  code: "transfer_cross_currency"
  message: string
  field: "toAccountId"
}

type TransferSameAccountEnvelope = {
  code: "transfer_same_account"
  message: string
  field: "toAccountId"
}

type TransferLegIsolatedEnvelope = {
  code: "transfer_leg_isolated"
  message: string
}

type ArchivedAccountBlockedEnvelope = {
  code: "archived_account_blocked"
  message: string
  field: "accountId" | "fromAccountId" | "toAccountId"
}

type InternalErrorEnvelope = {
  code: "internal_error"
  message: string
}

export type TransactionErrorEnvelope =
  | UnauthenticatedEnvelope
  | ValidationFailedEnvelope
  | NotFoundEnvelope
  | CurrencyMismatchEnvelope
  | SignMismatchEnvelope
  | TransferCrossCurrencyEnvelope
  | TransferSameAccountEnvelope
  | TransferLegIsolatedEnvelope
  | ArchivedAccountBlockedEnvelope
  | InternalErrorEnvelope

// ---------------------------------------------------------------------------
// Custom Error subclasses (thrown by queries.ts, caught by actions.ts)
// ---------------------------------------------------------------------------

/**
 * Thrown when a transaction's currency does not match its parent account's currency.
 * (FR-007, research.md R2)
 */
export class CurrencyMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CurrencyMismatchError"
  }
}

/**
 * Thrown when a transfer is attempted between two accounts of different currencies.
 * (FR-015, research.md R2)
 */
export class TransferCrossCurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransferCrossCurrencyError"
  }
}

/**
 * Thrown when a transfer-archive operation finds that one or both legs are already archived
 * in an inconsistent state (defensive guard for the impossible-state case).
 */
export class TransferArchivedLegError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransferArchivedLegError"
  }
}

/**
 * Thrown when a create or update targets an archived account.
 * (FR-005, FR-022)
 */
export class ArchivedAccountTransferBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ArchivedAccountTransferBlockedError"
  }
}

// ---------------------------------------------------------------------------
// errorEnvelope helper
// ---------------------------------------------------------------------------

/**
 * Produces a typed `{ error: TransactionErrorEnvelope }` response.
 * Mirrors the shape established by lib/categories/errors.ts for consistency.
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
  code: "currency_mismatch",
  opts?: { message?: string; field?: "currency" | "accountId" | "fromAccountId" | "toAccountId" },
): { error: CurrencyMismatchEnvelope }
export function errorEnvelope(
  code: "sign_mismatch",
  opts?: { message?: string },
): { error: SignMismatchEnvelope }
export function errorEnvelope(
  code: "transfer_cross_currency",
  opts?: { message?: string },
): { error: TransferCrossCurrencyEnvelope }
export function errorEnvelope(
  code: "transfer_same_account",
  opts?: { message?: string },
): { error: TransferSameAccountEnvelope }
export function errorEnvelope(
  code: "transfer_leg_isolated",
  opts?: { message?: string },
): { error: TransferLegIsolatedEnvelope }
export function errorEnvelope(
  code: "archived_account_blocked",
  opts?: { message?: string; field?: "accountId" | "fromAccountId" | "toAccountId" },
): { error: ArchivedAccountBlockedEnvelope }
export function errorEnvelope(
  code: "internal_error",
  opts?: Record<string, never>,
): { error: InternalErrorEnvelope }
export function errorEnvelope(
  code: TransactionErrorCode,
  opts?: Record<string, unknown>,
): { error: TransactionErrorEnvelope } {
  const message = (opts?.message as string | undefined) ?? ERROR_MESSAGES[code]

  if (code === "currency_mismatch") {
    return {
      error: {
        code,
        message,
        field:
          (opts?.field as "currency" | "accountId" | "fromAccountId" | "toAccountId" | undefined) ??
          "accountId",
      } as CurrencyMismatchEnvelope,
    }
  }

  if (code === "sign_mismatch") {
    return {
      error: { code, message, field: "amount" } as SignMismatchEnvelope,
    }
  }

  if (code === "transfer_cross_currency") {
    return {
      error: { code, message, field: "toAccountId" } as TransferCrossCurrencyEnvelope,
    }
  }

  if (code === "transfer_same_account") {
    return {
      error: { code, message, field: "toAccountId" } as TransferSameAccountEnvelope,
    }
  }

  if (code === "archived_account_blocked") {
    return {
      error: {
        code,
        message,
        field:
          (opts?.field as "accountId" | "fromAccountId" | "toAccountId" | undefined) ?? "accountId",
      } as ArchivedAccountBlockedEnvelope,
    }
  }

  return {
    error: {
      code,
      message,
      ...(opts as Record<string, unknown>),
    } as TransactionErrorEnvelope,
  }
}
