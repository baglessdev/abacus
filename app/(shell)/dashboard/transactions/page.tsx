import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { listTransactions } from "@/lib/transactions/actions"
import { listAccounts } from "@/lib/accounts/actions"
import { listCategories } from "@/lib/categories/actions"
import { isISODateString, normalizeToUtcDay } from "@/lib/transactions/dates"
import { TRANSACTION_TYPES } from "@/lib/transactions/schemas"
import { UNCATEGORIZED_SENTINEL } from "./_components/transaction-filters"
import { TransactionsList } from "./_components/transactions-list"

/**
 * /dashboard/transactions — server component.
 * Defense-in-depth auth check (middleware already guards this route).
 * Fetches transactions, accounts, and categories in parallel and passes them
 * to the TransactionsList client component.
 *
 * Default date range: last 30 days (FR-026).
 * US5 URL-driven filters: from, to, accountId, categoryId, type, archived (T039).
 * FR-003, FR-019, FR-020, FR-026, FR-026a, SC-018.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    accountId?: string
    categoryId?: string
    type?: string
    archived?: string
  }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login?from=/dashboard/transactions")

  const params = await searchParams

  // ---------------------------------------------------------------------------
  // Parse date range — defaults to last 30 days
  // ---------------------------------------------------------------------------

  const todayDate = new Date()

  // `to` — default: today
  let dateTo: Date
  if (params.to && isISODateString(params.to)) {
    dateTo = normalizeToUtcDay(params.to)
  } else {
    dateTo = normalizeToUtcDay(
      `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`,
    )
  }

  // `from` — default: 30 days before today
  let dateFrom: Date
  if (params.from && isISODateString(params.from)) {
    dateFrom = normalizeToUtcDay(params.from)
  } else {
    const d = new Date(todayDate)
    d.setDate(d.getDate() - 30)
    dateFrom = normalizeToUtcDay(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    )
  }

  // ---------------------------------------------------------------------------
  // Parse optional filters
  // ---------------------------------------------------------------------------

  // accountId — undefined means no filter
  const accountId =
    params.accountId && params.accountId.trim() !== "" ? params.accountId : undefined

  // categoryId — UNCATEGORIZED_SENTINEL maps to null (filter for uncategorized rows)
  //              otherwise pass through as-is (or undefined)
  let categoryId: string | null | undefined
  if (!params.categoryId || params.categoryId.trim() === "") {
    categoryId = undefined
  } else if (params.categoryId === UNCATEGORIZED_SENTINEL) {
    categoryId = null
  } else {
    categoryId = params.categoryId
  }

  // type — must be one of the enum values; otherwise undefined
  type TxType = "INCOME" | "EXPENSE" | "TRANSFER"
  const typeParam = params.type?.toUpperCase()
  const txType: TxType | undefined = TRANSACTION_TYPES.includes(typeParam as TxType)
    ? (typeParam as TxType)
    : undefined

  // archived — "1" → true; anything else (including "0" and undefined) → false
  const includeArchived = params.archived === "1"

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const [txResult, accResult, catResult] = await Promise.all([
    listTransactions({
      dateFrom,
      dateTo,
      accountId,
      ...(categoryId !== undefined ? { categoryId: categoryId ?? undefined } : {}),
      type: txType,
      includeArchived,
    }),
    listAccounts({ includeArchived: false }),
    listCategories({ includeArchived: false }),
  ])

  // Auth re-check from action results
  if ("error" in txResult && txResult.error.code === "unauthenticated") {
    redirect("/login?from=/dashboard/transactions")
  }
  if ("error" in accResult && accResult.error.code === "unauthenticated") {
    redirect("/login?from=/dashboard/transactions")
  }
  if ("error" in catResult && catResult.error.code === "unauthenticated") {
    redirect("/login?from=/dashboard/transactions")
  }

  // Non-auth errors — surface as a thrown Error (Next.js error boundary catches it)
  if ("error" in txResult) {
    throw new Error(`Failed to load transactions: ${txResult.error.message}`)
  }
  if ("error" in accResult) {
    throw new Error(`Failed to load accounts: ${accResult.error.message}`)
  }
  if ("error" in catResult) {
    throw new Error(`Failed to load categories: ${catResult.error.message}`)
  }

  return (
    <TransactionsList
      initialTransactions={txResult.data.transactions}
      initialAccounts={accResult.data.accounts}
      initialCategories={catResult.data.categories}
    />
  )
}
