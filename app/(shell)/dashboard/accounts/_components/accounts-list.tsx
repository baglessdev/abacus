"use client"

import { useState, useTransition } from "react"

import { listAccounts, unarchiveAccount } from "@/lib/accounts/actions"
import type { AccountDTO } from "@/lib/accounts/serialize"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/shell/empty-state"
import { Money } from "@/components/money/money"
import { AccountsIllustration } from "@/components/illustrations/accounts-illustration"
import { AccountFormSheet } from "./account-form-sheet"
import { ArchiveConfirmDialog } from "./archive-confirm-dialog"

type AccountsListProps = {
  initialAccounts: AccountDTO[]
}

type SheetMode = "create" | "edit" | "edit-archived"

/**
 * Client component that owns the accounts table + create/edit sheet + archive flow.
 * Initialized from server-rendered initialAccounts prop.
 * After any successful mutation, re-fetches from the server via listAccounts.
 * FR-008, FR-009, FR-009a, FR-010, FR-011, FR-012, FR-012a, FR-018, FR-019, FR-020.
 */
export function AccountsList({ initialAccounts }: AccountsListProps) {
  const [accounts, setAccounts] = useState<AccountDTO[]>(initialAccounts)
  const [showArchived, setShowArchived] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<SheetMode>("create")
  const [editingAccount, setEditingAccount] = useState<AccountDTO | undefined>(undefined)
  // Track whether the user has ever had accounts (to decide whether to show toggle in empty state)
  // We derive: show the toggle whenever showArchived=true OR we started with accounts OR
  // after any mutation. Simple rule: always show the toggle and "+ Add account" in the
  // top bar; only the body area changes between empty CTA and table.
  const [hadAccounts, setHadAccounts] = useState(initialAccounts.length > 0)

  // Archive confirm dialog state
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null)

  // Transition for unarchive (pending state)
  const [, startTransition] = useTransition()

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function refetch(includeArchived: boolean) {
    const result = await listAccounts({ includeArchived })
    if ("data" in result) {
      setAccounts(result.data.accounts)
      if (result.data.accounts.length > 0) setHadAccounts(true)
    }
  }

  function openCreateSheet() {
    setEditingAccount(undefined)
    setSheetMode("create")
    setSheetOpen(true)
  }

  function openEditSheet(account: AccountDTO) {
    setEditingAccount(account)
    setSheetMode(account.archivedAt !== null ? "edit-archived" : "edit")
    setSheetOpen(true)
  }

  async function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      await refetch(showArchived)
    }
  }

  async function handleShowArchivedChange(checked: boolean) {
    setShowArchived(checked)
    await refetch(checked)
  }

  function handleArchiveClick(account: AccountDTO, e: React.MouseEvent) {
    e.stopPropagation()
    setArchiveTarget({ id: account.id, name: account.name })
  }

  function handleUnarchiveClick(account: AccountDTO, e: React.MouseEvent) {
    e.stopPropagation()
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", account.id)
      const result = await unarchiveAccount(null, formData)
      if ("data" in result) {
        await refetch(showArchived)
      }
    })
  }

  function handleArchived() {
    setArchiveTarget(null)
    refetch(showArchived)
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  // True empty state: never had any account (fresh user), showArchived=false, 0 accounts.
  // Once the user has had any account (hadAccounts=true), we always show the top bar
  // with the toggle — they may have archived everything.
  const showTopBar = hadAccounts || showArchived

  // The table body area: empty CTA vs table rows
  const isTrulyEmpty = !showArchived && accounts.length === 0

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {!showTopBar ? (
        // Pure empty state with CTA — fresh user with no accounts ever (FR-010)
        <EmptyState
          title="No accounts yet"
          description="An account is where Abacus tracks the money you hold — a checking account, a savings account, a credit card. Add your first one to get started."
          illustration={<AccountsIllustration className="h-32 w-32 text-primary" />}
          action={{
            label: "Add your first account",
            onClick: openCreateSheet,
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Header bar — always visible once the user has had any account */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
            <div className="flex items-center gap-4">
              {/* Show archived toggle (FR-009) */}
              <div className="flex items-center gap-2">
                <Switch
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={handleShowArchivedChange}
                />
                <Label htmlFor="show-archived" className="cursor-pointer text-sm">
                  Show archived
                </Label>
              </div>
              <Button onClick={openCreateSheet} size="sm">
                + Add account
              </Button>
            </div>
          </div>

          {/* Body area */}
          {isTrulyEmpty ? (
            // All accounts archived or none created yet — but user has had accounts
            <p className="text-sm text-muted-foreground">
              No active accounts. Use the toggle to see archived accounts.
            </p>
          ) : showArchived && accounts.length === 0 ? (
            // showArchived=true but nothing archived
            <p className="text-sm text-muted-foreground">No archived accounts.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const isArchived = account.archivedAt !== null
                  return (
                    <TableRow
                      key={account.id}
                      className={`cursor-pointer ${isArchived ? "text-muted-foreground opacity-60" : ""}`}
                      onClick={() => openEditSheet(account)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {account.name}
                          {isArchived && <Badge variant="secondary">Archived</Badge>}
                        </span>
                      </TableCell>
                      <TableCell>{account.type}</TableCell>
                      <TableCell>{account.currency}</TableCell>
                      <TableCell className="text-right">
                        {/* Live balance = startingBalance + Σ(non-archived transactions). Feature 007 T020. */}
                        <Money
                          amount={account.balance}
                          currency={account.currency}
                          prominent
                          align="right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {isArchived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleUnarchiveClick(account, e)}
                          >
                            Unarchive
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleArchiveClick(account, e)}
                          >
                            Archive
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Edit / Create sheet */}
      <AccountFormSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        mode={sheetMode}
        account={editingAccount}
      />

      {/* Archive confirm dialog */}
      {archiveTarget && (
        <ArchiveConfirmDialog
          accountId={archiveTarget.id}
          accountName={archiveTarget.name}
          open={archiveTarget !== null}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null)
          }}
          onArchived={handleArchived}
        />
      )}
    </>
  )
}
