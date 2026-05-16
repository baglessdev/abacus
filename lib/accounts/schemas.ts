import { z } from "zod"

import { isCurrencyCode, validateStartingBalance } from "@/lib/money"

// Shared account types (the six valid values from the AccountType enum)
export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT",
  "CASH",
  "INVESTMENT",
  "OTHER",
] as const

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number]

// --- Shared field definitions ---

const nameField = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be at most 80 characters")

const typeField = z.enum(ACCOUNT_TYPES, { message: "Select a valid account type" })

/**
 * Currency field — normalizes to uppercase at the boundary before allow-list validation.
 * This handles "usd", " USD ", and "USD" identically (FR-005, spec edge case line 118).
 */
const currencyField = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().refine(isCurrencyCode, { message: "Pick a valid ISO 4217 currency code" }))

const startingBalanceField = z
  .string()
  .trim()
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { message: "Enter a valid amount (e.g., 1250.00)" })

// --- Schemas ---

/**
 * Schema for the createAccount action.
 * Currency is normalized to uppercase and validated against the allow-list.
 * Starting balance is validated for decimal-place count and sign per the account type (FR-006).
 */
export const createAccountSchema = z
  .object({
    name: nameField,
    type: typeField,
    currency: currencyField,
    startingBalance: startingBalanceField,
  })
  .superRefine((value, ctx) => {
    const result = validateStartingBalance({
      type: value.type,
      currency: value.currency,
      amount: value.startingBalance,
    })
    if (!result.ok) {
      ctx.addIssue({
        path: ["startingBalance"],
        code: "custom",
        message: result.message,
      })
    }
  })

export type CreateAccountInput = z.infer<typeof createAccountSchema>

/**
 * Schema for updating an active (non-archived) account.
 * Currency is intentionally ABSENT — it is immutable after creation (FR-007).
 * Any posted `currency` key is silently stripped by Zod's default .strip() behavior.
 * Starting balance is validated using the row's currency (passed via the `currency` closure arg).
 */
export function makeUpdateActiveAccountSchema(rowCurrency: string) {
  return z
    .object({
      id: z.string().min(1, "Missing account id"),
      name: nameField,
      type: typeField,
      startingBalance: startingBalanceField,
    })
    .superRefine((value, ctx) => {
      const result = validateStartingBalance({
        type: value.type,
        currency: rowCurrency,
        amount: value.startingBalance,
      })
      if (!result.ok) {
        ctx.addIssue({
          path: ["startingBalance"],
          code: "custom",
          message: result.message,
        })
      }
    })
}

export type UpdateActiveAccountInput = {
  id: string
  name: string
  type: AccountTypeValue
  startingBalance: string
}

/**
 * Schema for updating an archived account — name-only (FR-009a).
 * type and startingBalance are NOT accepted; currency is always absent (FR-007).
 */
export const updateArchivedAccountSchema = z.object({
  id: z.string().min(1, "Missing account id"),
  name: nameField,
})

export type UpdateArchivedAccountInput = z.infer<typeof updateArchivedAccountSchema>

/**
 * Schema for the archiveAccount action — just the account id.
 */
export const archiveAccountSchema = z.object({
  id: z.string().min(1, "Missing account id"),
})

/**
 * Schema for the unarchiveAccount action — just the account id.
 */
export const unarchiveAccountSchema = z.object({
  id: z.string().min(1, "Missing account id"),
})
