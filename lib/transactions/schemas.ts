import { z } from "zod"

import { isCurrencyCode, validateTransactionAmount } from "@/lib/money"
import { isISODateString, normalizeToUtcDay } from "@/lib/transactions/dates"

/**
 * lib/transactions/schemas.ts
 *
 * Zod schemas for the 7 transaction server actions.
 *
 * Boundary rules per plan.md §Validate at boundaries:
 *   - Shape + per-field rules: enforced HERE in the schema.
 *   - Cross-field rules that require Prisma (account ownership, currency-must-match-account,
 *     category ownership, transfer-same-currency, transfer-archived-account): enforced at the
 *     QUERIES layer (lib/transactions/queries.ts), not in the schemas. (Principle III)
 *
 * amount field uses validateTransactionAmount from lib/money via superRefine (FR-008, FR-009).
 * date field: z.string().refine(isISODateString).transform(normalizeToUtcDay) (FR-004).
 * currency field: uppercase-trim-refine (isCurrencyCode) pattern from feature 004 (FR-007).
 */

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

/** INCOME / EXPENSE / TRANSFER enum */
export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const
export type TransactionTypeValue = (typeof TRANSACTION_TYPES)[number]

const transactionTypeField = z.enum(TRANSACTION_TYPES, {
  message: "Type must be INCOME, EXPENSE, or TRANSFER",
})

/**
 * Currency field — normalizes to uppercase before allow-list validation.
 * Same pattern as feature 004 (lib/accounts/schemas.ts).
 */
const currencyField = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().refine(isCurrencyCode, { message: "Pick a valid ISO 4217 currency code" }))

/**
 * Date field — ISO string → normalized to UTC midnight Date.
 * Rejects non-YYYY-MM-DD strings at the Zod boundary (FR-004).
 */
const dateField = z
  .string()
  .refine(isISODateString, { message: "Date must be in YYYY-MM-DD format" })
  .transform(normalizeToUtcDay)

/**
 * Amount field for INCOME / EXPENSE transactions.
 * Raw string; sign-must-match-type is validated via superRefine on the parent schema
 * (the type is needed to validate the sign, so it can't be done as a standalone field rule).
 */
const amountStringField = z.string().trim().min(1, "Amount is required")

/**
 * Amount field for TRANSFER forms — user enters a positive magnitude.
 * The queries layer assigns the signs (source leg negative, destination leg positive).
 * Must be a positive decimal greater than zero.
 */
const transferAmountField = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && parseFloat(v) > 0, {
    message: "Enter a positive amount greater than zero",
  })

/** payee: optional, max 120 chars; empty string → null */
const payeeField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().max(120, "Payee must be at most 120 characters").nullable())
  .optional()
  .default("")

/** notes: optional, max 500 chars; empty string → null */
const notesField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().max(500, "Notes must be at most 500 characters").nullable())
  .optional()
  .default("")

// ---------------------------------------------------------------------------
// createTransactionSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the createTransaction action (single INCOME or EXPENSE row).
 * Cross-field rules (currency-must-match-account, category-kind-match, account-archived check)
 * are enforced at the queries layer. (Principle III)
 *
 * FR-001, FR-004, FR-007, FR-008, FR-009, FR-010, FR-011, FR-013.
 */
export const createTransactionSchema = z
  .object({
    accountId: z.string().min(1, "Account is required"),
    categoryId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.string().nullable())
      .optional()
      .default(""),
    date: dateField,
    amount: amountStringField,
    currency: currencyField,
    type: transactionTypeField,
    payee: payeeField,
    notes: notesField,
  })
  .superRefine((value, ctx) => {
    // Sign-must-match-type validation via validateTransactionAmount.
    const result = validateTransactionAmount({
      type: value.type,
      amount: value.amount,
      currency: value.currency,
    })
    if (!result.ok) {
      ctx.addIssue({
        path: ["amount"],
        code: "custom",
        message: result.message,
        params: { errorCode: result.code },
      })
    }
  })

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

// ---------------------------------------------------------------------------
// createTransferSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the createTransfer action (two-leg atomic TRANSFER).
 * amount is a positive magnitude; the queries layer signs both legs.
 * Cross-field rules (distinct accounts, same currency, non-archived, magnitude validation
 * against the account's currency) are enforced at the queries layer (Principle III).
 *
 * FR-005, FR-006, FR-012, FR-014, FR-015, FR-024.
 */
export const createTransferSchema = z.object({
  fromAccountId: z.string().min(1, "Source account is required"),
  toAccountId: z.string().min(1, "Destination account is required"),
  date: dateField,
  // Transfer amount is a positive magnitude (the user enters one number; the system signs both legs).
  amount: transferAmountField,
  notes: notesField,
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>

// ---------------------------------------------------------------------------
// updateTransactionSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the updateTransaction action (single INCOME or EXPENSE row).
 * id is required. Same per-field rules as create. (FR-002..FR-011, FR-013)
 */
export const updateTransactionSchema = z
  .object({
    id: z.string().min(1, "Missing transaction id"),
    accountId: z.string().min(1, "Account is required"),
    categoryId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.string().nullable())
      .optional()
      .default(""),
    date: dateField,
    amount: amountStringField,
    currency: currencyField,
    type: transactionTypeField,
    payee: payeeField,
    notes: notesField,
  })
  .superRefine((value, ctx) => {
    const result = validateTransactionAmount({
      type: value.type,
      amount: value.amount,
      currency: value.currency,
    })
    if (!result.ok) {
      ctx.addIssue({
        path: ["amount"],
        code: "custom",
        message: result.message,
        params: { errorCode: result.code },
      })
    }
  })

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>

// ---------------------------------------------------------------------------
// updateTransferSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the updateTransfer action (both legs updated atomically).
 * id: the id of EITHER leg — the queries layer fetches both via transferGroupId.
 * amount is a positive magnitude.
 *
 * FR-005, FR-007, FR-012, FR-015, FR-016, FR-024.
 */
export const updateTransferSchema = z.object({
  id: z.string().min(1, "Missing transaction id"),
  fromAccountId: z.string().min(1, "Source account is required"),
  toAccountId: z.string().min(1, "Destination account is required"),
  date: dateField,
  amount: transferAmountField,
  notes: notesField,
})

export type UpdateTransferInput = z.infer<typeof updateTransferSchema>

// ---------------------------------------------------------------------------
// archiveTransactionSchema / unarchiveTransactionSchema
// ---------------------------------------------------------------------------

/** Schema for archive / unarchive — just the transaction id (FR-017, FR-018). */
export const archiveTransactionSchema = z.object({
  id: z.string().min(1, "Missing transaction id"),
})

export type ArchiveTransactionInput = z.infer<typeof archiveTransactionSchema>

export const unarchiveTransactionSchema = z.object({
  id: z.string().min(1, "Missing transaction id"),
})

export type UnarchiveTransactionInput = z.infer<typeof unarchiveTransactionSchema>

// ---------------------------------------------------------------------------
// listTransactionsSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the listTransactions action (URL search params).
 * All fields are optional; defaults applied at the action level.
 * FR-019, FR-019a, FR-020, FR-026, FR-026a.
 */
export const listTransactionsSchema = z.object({
  dateFrom: z
    .string()
    .refine(isISODateString, { message: "dateFrom must be YYYY-MM-DD" })
    .transform(normalizeToUtcDay)
    .optional(),
  dateTo: z
    .string()
    .refine(isISODateString, { message: "dateTo must be YYYY-MM-DD" })
    .transform(normalizeToUtcDay)
    .optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: transactionTypeField.optional(),
  includeArchived: z.boolean().optional().default(false),
})

export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>
