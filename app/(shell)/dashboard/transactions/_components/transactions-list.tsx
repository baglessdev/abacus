"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Archive, ArchiveRestore } from "lucide-react"

import type { TransactionDTO } from "@/lib/transactions/serialize"
import type { AccountDTO } from "@/lib/accounts/serialize"
import type { CategoryDTO } from "@/lib/categories/serialize"
import { unarchiveTransaction } from "@/lib/transactions/actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Money } from "@/components/money/money"
import { EmptyState } from "@/components/shell/empty-state"
import { AbacusIllustration } from "@/components/illustrations/abacus-illustration"
import { TransactionFormSheet } from "./transaction-form-sheet"
import { TransferFormSheet } from "./transfer-form-sheet"
import type { TransferGroupDTO } from "./transfer-form"
import { ArchiveConfirmDialog } from "./archive-confirm-dialog"
import { TransactionFilters } from "./transaction-filters"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionsListProps = {
  initialTransactions: TransactionDTO[]
  initialAccounts: AccountDTO[]
  initialCategories: CategoryDTO[]
}

type SheetMode = "create" | "edit" | "edit-archived"
type TransferSheetMode = "create" | "edit"

type ArchiveTarget = {
  id: string
  label: string
  isTransfer: boolean
}

// ---------------------------------------------------------------------------
// TransactionsList
// ---------------------------------------------------------------------------

/**
 * Client component owning the transactions list + create/edit sheets.
 * US1: expense create flow, three empty states, table render.
 * US3: "+ Add transfer" button wired to TransferFormSheet.
 * US4: row click → edit sheet; archive/unarchive buttons; "Show archived" switch (URL-driven).
 * US5: <TransactionFilters> wired above the table; all filters URL-driven.
 *
 * Three empty states (FR-019, FR-029):
 *   (a) NO ACCOUNTS — user has zero non-archived accounts → guide to create one first.
 *   (b) NO TRANSACTIONS — accounts exist but list is empty → prompt to add transaction.
 *   (c) LOADED — one or more transactions → render table.
 *
 * The list is already sorted by the server (listTransactionsForUser orderBy date desc,
 * createdAt desc — FR-020). Rendered in array order without re-sorting.
 *
 * No render cap in v1 (FR-026): the default 30-day date range is the natural ceiling.
 *
 * IMPORTANT: all sheets are mounted at root level (not inside branch returns) to preserve
 * their identity and animation state across state transitions.
 *
 * "Show archived" toggle is now URL-driven (?archived=1) for consistency with other
 * URL-driven filters (T040). The server re-renders with includeArchived based on the param.
 */
export function TransactionsList({
  initialTransactions,
  initialAccounts,
  initialCategories,
}: TransactionsListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ---------------------------------------------------------------------------
  // Sheet state for transaction create/edit
  // ---------------------------------------------------------------------------
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<SheetMode>("create")
  const [editingTransaction, setEditingTransaction] = useState<TransactionDTO | undefined>(
    undefined,
  )

  // ---------------------------------------------------------------------------
  // Sheet state for transfer create/edit
  // ---------------------------------------------------------------------------
  const [transferSheetOpen, setTransferSheetOpen] = useState(false)
  const [transferSheetMode, setTransferSheetMode] = useState<TransferSheetMode>("create")
  const [editingTransferGroup, setEditingTransferGroup] = useState<TransferGroupDTO | undefined>(
    undefined,
  )

  // ---------------------------------------------------------------------------
  // Archive confirm dialog state
  // ---------------------------------------------------------------------------
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)

  // ---------------------------------------------------------------------------
  // Unarchive pending state
  // ---------------------------------------------------------------------------
  const [, startUnarchiveTransition] = useTransition()

  // ---------------------------------------------------------------------------
  // "Show archived" toggle — URL-driven (T040)
  // Reads from ?archived=1 param; toggling pushes a new URL.
  // ---------------------------------------------------------------------------

  const showArchived = searchParams?.get("archived") === "1"

  function handleShowArchivedChange(checked: boolean) {
    const next = new URLSearchParams(searchParams?.toString() ?? "")
    if (checked) {
      next.set("archived", "1")
    } else {
      next.delete("archived")
    }
    router.push(`/dashboard/transactions?${next.toString()}`)
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function openCreateSheet() {
    setSheetMode("create")
    setEditingTransaction(undefined)
    setSheetOpen(true)
  }

  function handleSheetSuccess() {
    setSheetOpen(false)
    router.refresh()
  }

  function handleTransferSheetSuccess() {
    setTransferSheetOpen(false)
    router.refresh()
  }

  function openTransferCreateSheet() {
    setTransferSheetMode("create")
    setEditingTransferGroup(undefined)
    setTransferSheetOpen(true)
  }

  /** Build a TransferGroupDTO from the transactions array (both legs). */
  function buildTransferGroup(tx: TransactionDTO): TransferGroupDTO | undefined {
    if (!tx.transferGroupId) return undefined
    const legs = initialTransactions.filter((t) => t.transferGroupId === tx.transferGroupId)
    const source = legs.find((l) => Number(l.amount) < 0)
    const destination = legs.find((l) => Number(l.amount) >= 0)
    if (!source || !destination) return undefined
    return { transferGroupId: tx.transferGroupId, source, destination }
  }

  /** Handle a table row click — opens the appropriate edit sheet. */
  function handleRowClick(tx: TransactionDTO) {
    if (tx.type === "TRANSFER") {
      const group = buildTransferGroup(tx)
      if (!group) return
      setEditingTransferGroup(group)
      setTransferSheetMode("edit")
      setTransferSheetOpen(true)
    } else {
      const mode: SheetMode = tx.archivedAt === null ? "edit" : "edit-archived"
      setEditingTransaction(tx)
      setSheetMode(mode)
      setSheetOpen(true)
    }
  }

  /** Handle the Archive icon button for a row. */
  function handleArchiveClick(e: React.MouseEvent, tx: TransactionDTO) {
    e.stopPropagation()
    const account = accountMap.get(tx.accountId)
    const label = tx.payee ?? account?.name ?? tx.type
    setArchiveTarget({ id: tx.id, label, isTransfer: tx.type === "TRANSFER" })
    setArchiveDialogOpen(true)
  }

  /** Handle the Unarchive icon button for a row. */
  function handleUnarchiveClick(e: React.MouseEvent, tx: TransactionDTO) {
    e.stopPropagation()
    startUnarchiveTransition(async () => {
      const formData = new FormData()
      formData.set("id", tx.id)
      await unarchiveTransaction(null, formData)
      router.refresh()
    })
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const noAccounts = initialAccounts.length === 0

  // Lookup maps for display
  const accountMap = new Map(initialAccounts.map((a) => [a.id, a]))
  const categoryMap = new Map(initialCategories.map((c) => [c.id, c]))

  // initialTransactions is already filtered server-side (includeArchived via URL param)
  const allDisplayed = initialTransactions

  const noTransactions = allDisplayed.length === 0

  // ---------------------------------------------------------------------------
  // Header strip — always rendered
  // ---------------------------------------------------------------------------

  const headerStrip = (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <div className="flex items-center gap-2">
        {/* "Show archived" toggle — URL-driven (T040) */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={handleShowArchivedChange}
          />
          <Label htmlFor="show-archived" className="cursor-pointer text-sm text-muted-foreground">
            Show archived
          </Label>
        </div>
        {/*
          "+ Add transfer" — enabled when accounts exist (FR-021).
          For v1 simplicity, the button is enabled whenever accounts exist; the form's account
          pickers will surface the issue if there's no valid same-currency pair (FR-015).
        */}
        <Button variant="outline" size="sm" onClick={openTransferCreateSheet} disabled={noAccounts}>
          + Add transfer
        </Button>
        {/*
          "+ Add transaction" — disabled when no accounts (FR-029).
        */}
        <Button size="sm" onClick={openCreateSheet} disabled={noAccounts}>
          + Add transaction
        </Button>
      </div>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Main content — varies by state
  // ---------------------------------------------------------------------------

  let content: React.ReactNode

  if (noAccounts) {
    /*
     * Empty state (a): NO ACCOUNTS
     * FR-029: when the user has no accounts, show a dedicated empty state guiding them
     * to create an account first. Both action buttons are already disabled in headerStrip.
     */
    content = (
      <EmptyState
        illustration={<AbacusIllustration className="h-32 w-32 text-primary" />}
        title="Create an account first"
        description="Transactions need an account to belong to. Add your first account to start tracking money."
        action={{ label: "Add an account", href: "/dashboard/accounts" }}
      />
    )
  } else if (noTransactions) {
    /*
     * Empty state (b): NO TRANSACTIONS (but accounts exist)
     * FR-019: accounts exist but no transactions recorded yet (or none in the current filter range).
     */
    content = (
      <EmptyState
        illustration={<AbacusIllustration className="h-32 w-32 text-primary" />}
        title="No transactions yet"
        description="Record your first income, expense, or transfer to get started."
        action={{ label: "Add transaction", onClick: openCreateSheet }}
      />
    )
  } else {
    /*
     * Loaded state (c): one or more transactions.
     * shadcn <Table> — columns: Date, Description (payee + notes), Category, Account, Amount, Actions.
     * Sorted by server (date desc, createdAt desc — FR-020); rendered in array order.
     * No render cap: the 30-day default date range is the natural ceiling (FR-026).
     */
    content = (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px]">Category</TableHead>
              <TableHead className="w-[140px]">Account</TableHead>
              <TableHead className="w-[120px] text-right">Amount</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allDisplayed.map((tx) => {
              const account = accountMap.get(tx.accountId)
              const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null
              const isArchived = tx.archivedAt !== null

              return (
                <TableRow
                  key={tx.id}
                  className={`cursor-pointer hover:bg-muted/50 ${isArchived ? "opacity-60" : ""}`}
                  onClick={() => handleRowClick(tx)}
                >
                  {/* Date */}
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {tx.date}
                  </TableCell>

                  {/* Description: payee (primary) + notes (secondary muted) + type badge for TRANSFER + archived badge */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tx.payee ? (
                          <span className="font-medium">{tx.payee}</span>
                        ) : tx.type === "TRANSFER" ? (
                          <span className="italic text-muted-foreground">Transfer</span>
                        ) : (
                          <span className="italic text-muted-foreground">No payee</span>
                        )}
                        {tx.type === "TRANSFER" && (
                          <Badge variant="outline" className="text-xs">
                            TRANSFER
                          </Badge>
                        )}
                        {isArchived && (
                          <Badge variant="secondary" className="text-xs">
                            Archived
                          </Badge>
                        )}
                      </div>
                      {tx.notes && (
                        <span className="text-xs text-muted-foreground">{tx.notes}</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Category: name or "Uncategorized" */}
                  <TableCell className="text-sm">
                    {category ? (
                      <span>{category.name}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Account: name */}
                  <TableCell className="text-sm">
                    {account ? (
                      <span>{account.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Unknown account</span>
                    )}
                  </TableCell>

                  {/* Amount: via <Money> — sign-aware color */}
                  <TableCell>
                    <Money amount={tx.amount} currency={tx.currency} align="right" />
                  </TableCell>

                  {/* Actions: Archive or Unarchive */}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {isArchived ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Unarchive"
                          onClick={(e) => handleUnarchiveClick(e, tx)}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Archive"
                          onClick={(e) => handleArchiveClick(e, tx)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render — single root element, all sheets always mounted at root level
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {headerStrip}
      {/* Filters — only shown when accounts exist (no point filtering an empty list) */}
      {!noAccounts && <TransactionFilters />}
      {content}
      {/*
        TransactionFormSheet — always mounted at root level to preserve identity.
      */}
      <TransactionFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        transaction={editingTransaction}
        onSuccess={handleSheetSuccess}
      />
      {/*
        TransferFormSheet — always mounted at root level.
      */}
      <TransferFormSheet
        open={transferSheetOpen}
        onOpenChange={setTransferSheetOpen}
        mode={transferSheetMode}
        transferGroup={editingTransferGroup}
        onSuccess={handleTransferSheetSuccess}
      />
      {/*
        ArchiveConfirmDialog — always mounted at root level.
      */}
      {archiveTarget && (
        <ArchiveConfirmDialog
          transactionId={archiveTarget.id}
          transactionLabel={archiveTarget.label}
          isTransfer={archiveTarget.isTransfer}
          open={archiveDialogOpen}
          onOpenChange={setArchiveDialogOpen}
          onArchived={() => {
            setArchiveDialogOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
