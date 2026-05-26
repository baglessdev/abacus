/**
 * lib/budgets/queries.ts
 *
 * THIS IS THE ONLY FILE in lib/budgets/ that imports prisma directly.
 * Owns ALL prisma.budget.* access for the Budgets module.
 *
 * Every helper takes `userId: string` as its FIRST positional argument — populated by the
 * calling server action from `session.user.id`, NEVER from request input (FR-022).
 * Every Prisma `where:` clause includes `userId` so cross-user reads/writes collapse to
 * null or empty results (SC-005, FR-022).
 *
 * Uniqueness invariant (R7):
 *   - App-level pre-check via findExistingActiveBudgetForUser before insert.
 *   - Schema-level partial unique index catches the race (P2002 → BudgetExistsError).
 *
 * Audit grep: `grep -rn 'from "@/lib/prisma"' lib/budgets/` → ONLY this file.
 */

import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { Money } from "@/lib/money/decimal"
import { getCategoryForUser } from "@/lib/categories/queries"
import { sumExpenseByCategoryForBudgetsForUser } from "@/lib/transactions/queries"
import { attachActualsToBudgets, sortBudgetsByStatusAndProgress } from "@/lib/budgets/aggregations"
import { computeCurrentPeriodRange } from "@/lib/budgets/periods"
import { BudgetExistsError, CategoryWrongKindError } from "@/lib/budgets/errors"
import { type CreateBudgetInput, type UpdateBudgetInput } from "@/lib/budgets/schemas"

// ---------------------------------------------------------------------------
// listBudgetsForUser
// ---------------------------------------------------------------------------

/**
 * List all budgets owned by the given user.
 * By default excludes archived rows. Pass `includeArchived: true` to include them.
 * Includes the joined category (via include: { category: true }) so the UI can
 * surface the "(archived category)" label (R8).
 */
export async function listBudgetsForUser(userId: string, opts: { includeArchived?: boolean } = {}) {
  const { includeArchived = false } = opts
  return prisma.budget.findMany({
    where: includeArchived ? { userId } : { userId, archivedAt: null },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  })
}

// ---------------------------------------------------------------------------
// getBudgetForUser
// ---------------------------------------------------------------------------

/**
 * Fetch a single budget owned by the given user, or null if not found / cross-user.
 * Includes the joined category.
 */
export async function getBudgetForUser(userId: string, budgetId: string) {
  return prisma.budget.findFirst({
    where: { id: budgetId, userId },
    include: { category: true },
  })
}

// ---------------------------------------------------------------------------
// findExistingActiveBudgetForUser — uniqueness pre-check (R7)
// ---------------------------------------------------------------------------

/**
 * Check whether an active budget already exists for the given (userId, categoryId, currency, period)
 * tuple. Returns the existing budget row (truthy) or null (no conflict).
 *
 * Called by createBudgetForUser and unarchiveBudgetForUser before the mutating write.
 */
export async function findExistingActiveBudgetForUser(
  userId: string,
  categoryId: string,
  currency: string,
  period: "MONTHLY" | "YEARLY",
) {
  return prisma.budget.findFirst({
    where: { userId, categoryId, currency, period, archivedAt: null },
  })
}

// ---------------------------------------------------------------------------
// createBudgetForUser
// ---------------------------------------------------------------------------

/**
 * Insert a new budget row for the given user.
 *
 * Enforces (R7):
 *   1. App-level uniqueness pre-check via findExistingActiveBudgetForUser.
 *   2. EXPENSE-only category check (R6 layer 3).
 *   3. Catches Prisma P2002 (partial-unique-index race) → BudgetExistsError.
 */
export async function createBudgetForUser(userId: string, input: CreateBudgetInput) {
  // App-level uniqueness pre-check (R7 step 1).
  const existing = await findExistingActiveBudgetForUser(
    userId,
    input.categoryId,
    input.currency,
    input.period,
  )
  if (existing) {
    throw new BudgetExistsError(
      `You already have an active ${input.currency} ${input.period.toLowerCase()} budget for this category. Edit the existing one or pick a different currency or period.`,
    )
  }

  // R6 layer 3: EXPENSE-only check.
  const cat = await getCategoryForUser(userId, input.categoryId)
  if (!cat) {
    throw new CategoryWrongKindError("Category not found.")
  }
  if (cat.kind !== "EXPENSE") {
    throw new CategoryWrongKindError(
      "Budgets are for expense categories. Income tracking is coming in a future feature.",
    )
  }

  try {
    return await prisma.budget.create({
      data: {
        userId,
        categoryId: input.categoryId,
        period: input.period,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        archivedAt: null,
      },
    })
  } catch (err) {
    // P2002 — schema-level partial unique violation (race condition guard per R7).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BudgetExistsError(
        "You already have an active budget for this category, currency, and period.",
      )
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// updateBudgetForUser
// ---------------------------------------------------------------------------

/**
 * Apply a patch to an existing budget owned by the given user.
 * Only mutates amount, startDate, endDate (categoryId, currency, period are read-only — US3 ac.5).
 * Returns null if the budget does not exist or belongs to another user.
 */
export async function updateBudgetForUser(
  userId: string,
  budgetId: string,
  input: UpdateBudgetInput,
) {
  const result = await prisma.budget.updateMany({
    where: { id: budgetId, userId },
    data: {
      amount: new Prisma.Decimal(input.amount),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    },
  })

  if (result.count === 0) return null
  return prisma.budget.findFirst({ where: { id: budgetId, userId }, include: { category: true } })
}

// ---------------------------------------------------------------------------
// setArchivedAtForUser
// ---------------------------------------------------------------------------

/**
 * Set or clear `archivedAt` for a budget owned by the given user.
 * Uses updateMany for the cross-user-collapses-to-null pattern (count=0 → null).
 * Returns null if the budget does not exist or belongs to another user.
 */
export async function setArchivedAtForUser(userId: string, budgetId: string, value: Date | null) {
  // For unarchive: pre-check that no active budget exists for the same tuple (R7).
  if (value === null) {
    const budget = await getBudgetForUser(userId, budgetId)
    if (!budget) return null

    const existing = await findExistingActiveBudgetForUser(
      userId,
      budget.categoryId,
      budget.currency,
      budget.period,
    )
    if (existing && existing.id !== budgetId) {
      throw new BudgetExistsError(
        "An active budget already exists for this category, currency, and period.",
      )
    }
  }

  try {
    const result = await prisma.budget.updateMany({
      where: { id: budgetId, userId },
      data: { archivedAt: value },
    })

    if (result.count === 0) return null
    return prisma.budget.findFirst({ where: { id: budgetId, userId }, include: { category: true } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BudgetExistsError(
        "An active budget already exists for this category, currency, and period.",
      )
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// listBudgetsWithActualsForUser — composite query (the main read path)
// ---------------------------------------------------------------------------

/**
 * Fetch budgets + compute actuals + sort + limit in one composite call.
 * Issues at most 3 Prisma queries: 1 budget list + at most 2 actuals fan-out (R3).
 */
export async function listBudgetsWithActualsForUser(
  userId: string,
  opts: {
    includeArchived?: boolean
    limit?: number
    sortByStatusAndProgress?: boolean
  } = {},
) {
  const { includeArchived = false, limit, sortByStatusAndProgress = false } = opts

  // Step 1: fetch budgets with their categories.
  const budgets = await prisma.budget.findMany({
    where: includeArchived ? { userId } : { userId, archivedAt: null },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  })

  if (budgets.length === 0) return []

  // Step 2: compute current period windows.
  const monthlyWindow = computeCurrentPeriodRange("MONTHLY")
  const yearlyWindow = computeCurrentPeriodRange("YEARLY")

  // Step 3: group budgets by period type for batched actuals fan-out (R3).
  const monthlyBudgets = budgets.filter((b) => b.period === "MONTHLY")
  const yearlyBudgets = budgets.filter((b) => b.period === "YEARLY")

  const monthCategoryIds = [...new Set(monthlyBudgets.map((b) => b.categoryId))]
  const monthCurrencies = [...new Set(monthlyBudgets.map((b) => b.currency))]
  const yearCategoryIds = [...new Set(yearlyBudgets.map((b) => b.categoryId))]
  const yearCurrencies = [...new Set(yearlyBudgets.map((b) => b.currency))]

  // Step 4: fire at most 2 groupBy queries in parallel (R3).
  const [monthlyRows, yearlyRows] = await Promise.all([
    monthlyBudgets.length > 0
      ? sumExpenseByCategoryForBudgetsForUser(
          userId,
          monthlyWindow.dateFrom,
          monthlyWindow.dateTo,
          monthCategoryIds,
          monthCurrencies,
        )
      : Promise.resolve([]),
    yearlyBudgets.length > 0
      ? sumExpenseByCategoryForBudgetsForUser(
          userId,
          yearlyWindow.dateFrom,
          yearlyWindow.dateTo,
          yearCategoryIds,
          yearCurrencies,
        )
      : Promise.resolve([]),
  ])

  // Step 5: build actuals Map keyed by `${period}::${categoryId}::${currency}`.
  // .abs() applied here because EXPENSE sums are negative in storage (FR-010).
  const actualsMap = new Map<string, Money>()
  for (const r of monthlyRows) {
    actualsMap.set(`MONTHLY::${r.categoryId}::${r.currency}`, r._sum.amount.abs())
  }
  for (const r of yearlyRows) {
    actualsMap.set(`YEARLY::${r.categoryId}::${r.currency}`, r._sum.amount.abs())
  }

  // Step 6: attach actuals + compute status/remaining/progressRatio.
  const periodWindows = { MONTHLY: monthlyWindow, YEARLY: yearlyWindow }
  let withActuals = attachActualsToBudgets(budgets, actualsMap, periodWindows)

  // Step 7: optional sort.
  if (sortByStatusAndProgress) {
    withActuals = sortBudgetsByStatusAndProgress(withActuals)
  }

  // Step 8: optional limit.
  if (limit !== undefined) {
    withActuals = withActuals.slice(0, limit)
  }

  return withActuals
}
