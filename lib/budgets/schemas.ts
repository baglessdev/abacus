/**
 * lib/budgets/schemas.ts
 *
 * Zod schemas for the 4 budget server actions.
 * Per Principle III: shape + per-field rules live here; cross-user / EXPENSE-kind checks
 * are enforced at the queries layer (lib/budgets/queries.ts) and in the action handler.
 *
 * Audit grep: `grep -rn 'from "@/lib/prisma"' lib/budgets/schemas.ts` → ZERO matches.
 */

import { z } from "zod"

import { isCurrencyCode } from "@/lib/money/currencies"
import { isISODateString, normalizeToUtcDay } from "@/lib/transactions/dates"
import { computeMonthRangeForDate, computeYearRangeForDate } from "@/lib/budgets/periods"

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

/** ISO 4217 currency field — normalizes to uppercase before allow-list check. */
const currencyField = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().refine(isCurrencyCode, { message: "Pick a valid ISO 4217 currency code" }))

/**
 * Amount field for budgets. Must be a positive decimal string with at most 8 decimal places.
 * The budget amount must be > 0 (FR-005). Stored unsigned (budgets are always positive).
 */
const budgetAmountField = z
  .string()
  .trim()
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && parseFloat(v) > 0, {
    message: "Enter a positive amount greater than zero",
  })
  .refine(
    (v) => {
      const dot = v.indexOf(".")
      return dot === -1 || v.length - dot - 1 <= 8
    },
    { message: "Amount can have at most 8 decimal places" },
  )

/** Date field — ISO string → normalized to UTC midnight. */
const dateField = z
  .string()
  .refine(isISODateString, { message: "Date must be in YYYY-MM-DD format" })
  .transform(normalizeToUtcDay)

/**
 * Optional end-date field — empty string or omitted → null; otherwise validated ISO date.
 * Uses z.preprocess to handle the empty-string-to-null transformation before piping.
 */
const endDateField = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === "") return null
    return val
  },
  z
    .string()
    .refine(isISODateString, { message: "End date must be in YYYY-MM-DD format" })
    .transform(normalizeToUtcDay)
    .nullable(),
)

// ---------------------------------------------------------------------------
// createBudgetSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the createBudget server action.
 *
 * startDate normalization (FR-006):
 *   - MONTHLY: normalized to the 1st of its containing month (UTC midnight)
 *   - YEARLY:  normalized to January 1st of its containing year (UTC midnight)
 *
 * EXPENSE-only enforcement is at the action handler (layer 3, R6) — not here.
 */
export const createBudgetSchema = z
  .object({
    categoryId: z.string().trim().min(1, "Category is required"),
    period: z.enum(["MONTHLY", "YEARLY"], { message: "Period must be MONTHLY or YEARLY" }),
    amount: budgetAmountField,
    currency: currencyField,
    startDate: dateField,
    endDate: endDateField,
  })
  .transform((v) => {
    // Normalize startDate to the period boundary (FR-006).
    const normalizedStart =
      v.period === "MONTHLY"
        ? computeMonthRangeForDate(v.startDate).dateFrom
        : computeYearRangeForDate(v.startDate).dateFrom
    return { ...v, startDate: normalizedStart }
  })
  .refine((v) => v.endDate === null || v.endDate.getTime() >= v.startDate.getTime(), {
    path: ["endDate"],
    message: "End date must be on or after start date",
  })

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>

// ---------------------------------------------------------------------------
// updateBudgetSchema
// ---------------------------------------------------------------------------

/**
 * Schema for the updateBudget server action.
 *
 * Only id, amount, startDate, endDate are editable (FR-005 from US3 ac.5).
 * categoryId, currency, period are read-only on edit — ignored or absent from this schema.
 */
export const updateBudgetSchema = z.object({
  id: z.string().trim().min(1, "Budget ID is required"),
  amount: budgetAmountField,
  startDate: dateField,
  endDate: endDateField,
})

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>

// ---------------------------------------------------------------------------
// archiveBudgetSchema
// ---------------------------------------------------------------------------

export const archiveBudgetSchema = z.object({
  id: z.string().trim().min(1, "Budget ID is required"),
})

export type ArchiveBudgetInput = z.infer<typeof archiveBudgetSchema>

// ---------------------------------------------------------------------------
// unarchiveBudgetSchema
// ---------------------------------------------------------------------------

export const unarchiveBudgetSchema = z.object({
  id: z.string().trim().min(1, "Budget ID is required"),
})

export type UnarchiveBudgetInput = z.infer<typeof unarchiveBudgetSchema>
