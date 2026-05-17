"use client"

import { useState, useTransition } from "react"

import { archiveTransaction } from "@/lib/transactions/actions"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ArchiveConfirmDialogProps = {
  transactionId: string
  transactionLabel: string
  isTransfer: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onArchived: () => void
}

// ---------------------------------------------------------------------------
// ArchiveConfirmDialog
// ---------------------------------------------------------------------------

/**
 * AlertDialog that confirms archiving a transaction or transfer.
 * Uses useTransition (NOT useActionState) because Radix AlertDialog auto-closes
 * on action click before async resolution — useTransition keeps synchronous control.
 *
 * For TRANSFER rows, archiveTransaction auto-detects the type and archives BOTH legs
 * atomically via setArchivedAtForUser → updateMany where transferGroupId matches.
 * No special transfer handling needed in the UI (the action's queries layer handles it).
 *
 * On success: calls onArchived() then closes.
 * Mirrors categories ArchiveConfirmDialog pattern.
 * FR-017, FR-018, SC-005.
 */
export function ArchiveConfirmDialog({
  transactionId,
  transactionLabel,
  isTransfer,
  open,
  onOpenChange,
  onArchived,
}: ArchiveConfirmDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleArchive() {
    setErrorMessage(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", transactionId)
      const result = await archiveTransaction(null, formData)
      if ("data" in result) {
        onArchived()
        onOpenChange(false)
      } else {
        setErrorMessage(result.error.message)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isTransfer ? "Archive this transfer?" : "Archive this transaction?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Archive {transactionLabel}? You can unarchive it later. Account balances will update
            accordingly.
            {isTransfer && (
              <span className="mt-1 block text-sm">
                Both legs of the transfer will be archived together.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={isPending} onClick={handleArchive}>
            {isPending ? "Archiving…" : "Archive"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
