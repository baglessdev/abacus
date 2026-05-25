/**
 * app/(shell)/dashboard/_components/recent-transactions-widget.tsx
 *
 * Async server component — Recent transactions widget (US2).
 * Props: { userId: string }
 *
 * Fetches the 10 most recent non-archived transactions via listTransactionsForUser,
 * then resolves account and category names via separate listAccounts / listCategories
 * calls (approach (b) from T015: lower-coupling lookup maps, avoids modifying
 * listTransactionsForUser's findMany include clause and risking feature-007 regressions).
 *
 * Each row is a keyboard-focusable Link navigating to /dashboard/transactions (FR-021,
 * FR-029). Transfer legs render as 2 separate rows (FR-018). The hard cap is the
 * query-layer limit: 10 (FR-017) — no in-widget render cap.
 *
 * Constitution Principle I: NO inline formatAmount, NO arithmetic — amounts render
 * exclusively through <Money>.
 * FR-026: <Money> is the only rendering primitive.
 * FR-027: no arithmetic outside lib/money/.
 * FR-031 + R5: server component — no use-client directive.
 */

import Link from "next/link"

import { listTransactionsForUser } from "@/lib/transactions/queries"
import { listAccounts } from "@/lib/accounts"
import { listCategories } from "@/lib/categories"
import { Money } from "@/components/money/money"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { WidgetCard } from "./widget-card"
import { EmptyCell } from "./empty-cell"

interface RecentTransactionsWidgetProps {
  /** The authenticated user's id — sourced from session.user.id in the page server component. */
  userId: string
}

export async function RecentTransactionsWidget({ userId }: RecentTransactionsWidgetProps) {
  // Fetch the 10 most recent non-archived transactions (FR-017, T003).
  // limit is passed inside the filters object (the signature from T003).
  const transactions = await listTransactionsForUser(userId, { limit: 10 })

  /*
   * Approach (b): fetch account + category lookup maps separately.
   * This avoids modifying the findMany `include` clause in listTransactionsForUser
   * (which would change the return type and risk regressing feature-007's existing
   * call sites that rely on the plain Transaction shape).
   *
   * We include archived accounts/categories so that a transaction tied to a since-archived
   * account or category still renders its name correctly (not "Unknown").
   */
  const [accountsResult, categoriesResult] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listCategories({ includeArchived: true }),
  ])

  const accountMap = new Map(
    "error" in accountsResult ? [] : accountsResult.data.accounts.map((a) => [a.id, a.name]),
  )
  const categoryMap = new Map(
    "error" in categoriesResult ? [] : categoriesResult.data.categories.map((c) => [c.id, c.name]),
  )

  return (
    <WidgetCard title="Recent transactions">
      {transactions.length === 0 ? (
        // FR-020: empty state when the user has no transactions yet.
        <EmptyCell message="No transactions yet — start by adding one" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[110px]">Category</TableHead>
                  <TableHead className="w-[130px]">Account</TableHead>
                  <TableHead className="w-[110px] text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  // Resolve display names from lookup maps.
                  const accountName = accountMap.get(tx.accountId) ?? "Unknown account"
                  const categoryName = tx.categoryId ? (categoryMap.get(tx.categoryId) ?? "—") : "—"

                  // Format date string (already "YYYY-MM-DD" from the Prisma DATE column).
                  const dateStr = tx.date.toISOString().slice(0, 10)
                  const amountStr = tx.amount.toString()

                  return (
                    /*
                     * Row click / keyboard navigation: each row is wrapped such that every
                     * cell's content is an independent Link to /dashboard/transactions (FR-021,
                     * FR-029). Pattern (ii): wrap each cell's content in a <Link> — used because
                     * shadcn <TableRow> does not support asChild, so pattern (i) is not available
                     * without patching the primitive.
                     *
                     * All links in a row share the same href ("/dashboard/transactions") so the
                     * row behaves as a single navigational unit from the user's perspective.
                     * SC-007 / FR-021: no deep-link to the specific transaction — navigates to
                     * the top of the list.
                     */
                    <TableRow key={tx.id} className="hover:bg-muted/50">
                      {/* Date */}
                      <TableCell className="p-0">
                        <Link
                          href="/dashboard/transactions"
                          className="block px-4 py-2 text-sm tabular-nums text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {dateStr}
                        </Link>
                      </TableCell>

                      {/* Description (payee / Transfer / —) */}
                      <TableCell className="p-0">
                        <Link
                          href="/dashboard/transactions"
                          className="block px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          {tx.payee ? (
                            <span className="font-medium">{tx.payee}</span>
                          ) : tx.type === "TRANSFER" ? (
                            <span className="italic text-muted-foreground">Transfer</span>
                          ) : (
                            <span className="italic text-muted-foreground">—</span>
                          )}
                        </Link>
                      </TableCell>

                      {/* Category */}
                      <TableCell className="p-0">
                        <Link
                          href="/dashboard/transactions"
                          className="block px-4 py-2 text-sm text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          {categoryName}
                        </Link>
                      </TableCell>

                      {/* Account */}
                      <TableCell className="p-0">
                        <Link
                          href="/dashboard/transactions"
                          className="block px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          {accountName}
                        </Link>
                      </TableCell>

                      {/* Amount — only rendered via <Money> (FR-026, no formatAmount) */}
                      <TableCell className="p-0">
                        <Link
                          href="/dashboard/transactions"
                          className="block px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <Money currency={tx.currency} amount={amountStr} align="right" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* FR-021: "See all" link to the full transactions list. */}
          <div className="text-right">
            <Link
              href="/dashboard/transactions"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              See all transactions →
            </Link>
          </div>
        </div>
      )}
    </WidgetCard>
  )
}
