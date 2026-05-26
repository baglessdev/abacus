/**
 * lib/budgets/index.ts
 *
 * Server-only barrel re-exporting the public surfaces of the Budgets module.
 * Import from here in server components and server actions outside this module.
 */

import "server-only"

// Server actions
export {
  createBudget,
  updateBudget,
  archiveBudget,
  unarchiveBudget,
  listBudgets,
} from "@/lib/budgets/actions"

// DTOs and serialization types
export { type BudgetDTO, type BudgetWithActualsDTO } from "@/lib/budgets/serialize"

// Error types
export { type BudgetErrorCode, type BudgetErrorEnvelope } from "@/lib/budgets/errors"

// BudgetPeriod (re-export from Prisma for convenience)
export { BudgetPeriod } from "@prisma/client"
