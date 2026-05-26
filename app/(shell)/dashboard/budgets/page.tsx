/**
 * app/(shell)/dashboard/budgets/page.tsx
 *
 * /dashboard/budgets — server component (no "use client").
 *
 * Flow:
 *   1. auth() — redirect on missing session.
 *   2. userId = session.user.id.
 *   3. Parallel fetch: listBudgets + listCategoriesForUser + listAccountsForUser +
 *      computeDefaultCurrencyForBudget.
 *   4. Build derived data: expenseCategories, currencies, categoriesById.
 *   5. Branch:
 *      (a) expenseCategories.length === 0 → US5 ac.4: "no EXPENSE categories" state.
 *      (b) budgets.length === 0 → render <BudgetsList> with empty initialBudgets (owns the US5
 *          empty-state markup including the sheet-wired CTA).
 *      (c) >= 1 budget → render <BudgetsList> with data.
 *
 * FR-022, FR-023, FR-025.
 */

import { redirect } from "next/navigation"
import Link from "next/link"

import { auth } from "@/lib/auth"
import { listBudgets } from "@/lib/budgets/actions"
import { computeDefaultCurrencyForBudget } from "@/lib/budgets/defaults"
import { listCategoriesForUser } from "@/lib/categories/queries"
import { listAccountsForUser } from "@/lib/accounts/queries"
import { serializeCategory } from "@/lib/categories/serialize"
import { Button } from "@/components/ui/button"
import { BudgetsList } from "./_components/budgets-list"

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ showArchived?: string }>
}) {
  // 1. Auth gate — defense-in-depth on top of middleware.ts.
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login?from=/dashboard/budgets")
  }
  const userId = session.user.id

  // Read the ?showArchived=1 query param (US3 / FR-020).
  // The client-side Switch in <BudgetsList> navigates to this URL param to trigger
  // a server-component re-fetch with includeArchived=true — no client-side action call needed.
  const resolvedSearchParams = await searchParams
  const includeArchived = resolvedSearchParams.showArchived === "1"

  // 2. Parallel data fetch.
  const [budgetsResult, categoryRows, accounts, defaultCurrency] = await Promise.all([
    listBudgets({ includeArchived }),
    listCategoriesForUser(userId, { includeArchived: false }),
    listAccountsForUser(userId, { includeArchived: false }),
    computeDefaultCurrencyForBudget(userId),
  ])

  // 3. Handle errors from the budgets action.
  if ("error" in budgetsResult) {
    if (budgetsResult.error.code === "unauthenticated") {
      redirect("/login?from=/dashboard/budgets")
    }
    throw new Error(`Failed to load budgets: ${budgetsResult.error.message}`)
  }

  const budgets = budgetsResult.data.budgets

  // 4. Build derived data.
  // Serialize Prisma Category rows to CategoryDTO.
  const categories = categoryRows.map(serializeCategory)
  const expenseCategories = categories.filter((c) => c.kind === "EXPENSE")
  const currencies = Array.from(new Set(accounts.map((a) => a.currency))).sort()
  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]))

  // 5a. No EXPENSE categories — US5 ac.4 special empty state.
  if (expenseCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You need at least one expense category to create a budget
        </h1>
        <p className="max-w-md text-muted-foreground">
          Create an expense category first, then come back here to set your spending targets.
        </p>
        <Button asChild>
          <Link href="/dashboard/categories">Go to Categories</Link>
        </Button>
      </div>
    )
  }

  // 5b & 5c. Render <BudgetsList> (handles its own empty state for the US5 main path).
  // We pass initialBudgets even if empty — <BudgetsList> owns the empty-state + sheet-open CTA.
  // This way the create sheet is naturally available from the empty state CTA (T027 design note).
  return (
    <BudgetsList
      initialBudgets={budgets}
      expenseCategories={expenseCategories}
      defaultCurrency={defaultCurrency}
      currencies={currencies}
      categoriesById={categoriesById}
      showArchived={includeArchived}
    />
  )
}
