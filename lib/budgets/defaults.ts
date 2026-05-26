/**
 * lib/budgets/defaults.ts
 *
 * Default-currency helper for the create-budget form. Does NOT import prisma — consumes
 * function exports from lib/transactions/queries.ts and lib/accounts/queries.ts.
 *
 * Audit grep: `grep -rn 'from "@/lib/prisma"' lib/budgets/defaults.ts` → ZERO matches.
 */

import { listAccountsForUser } from "@/lib/accounts/queries"
import { getMostUsedExpenseCurrencyForUser } from "@/lib/transactions/queries"

/**
 * Determine the best default currency for a new budget for the given user.
 *
 * Algorithm (Clarification Q2, R4):
 *   1. Most-frequently-used (by COUNT) EXPENSE transaction currency in the last 90 days.
 *      Frequency is used rather than amount — one large payment shouldn't outvote many
 *      small daily-life transactions.
 *   2. Fall back to the user's first non-archived account currency (ordered by createdAt asc,
 *      ties broken by id asc). The listAccountsForUser helper orders by name asc; we resort
 *      here to the createdAt-then-id rule from Clarification Q2.
 *   3. Fall through to null if the user has neither EXPENSE transactions nor accounts.
 *
 * @param userId - must come from session.user.id (data-scoping convention)
 */
export async function computeDefaultCurrencyForBudget(userId: string): Promise<string | null> {
  // Step 1: most-used by COUNT in the last 90 days.
  const fromExpenses = await getMostUsedExpenseCurrencyForUser(userId, 90)
  if (fromExpenses) return fromExpenses

  // Step 2: first non-archived account's currency (createdAt asc, then id asc tie-break).
  const accounts = await listAccountsForUser(userId, { includeArchived: false })
  const sorted = [...accounts].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    if (aTime !== bTime) return aTime - bTime
    return a.id.localeCompare(b.id)
  })
  if (sorted.length > 0) return sorted[0]!.currency

  // Step 3: no data — the form will ask the user to pick manually.
  return null
}
