"use client"

import { useState, useTransition } from "react"

import { archiveAccount } from "@/lib/accounts/actions"
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
  accountId: string
  accountName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onArchived: () => void
}

// ---------------------------------------------------------------------------
// ArchiveConfirmDialog
// ---------------------------------------------------------------------------

/**
 * AlertDialog that confirms archiving an account.
 * On success, calls onArchived() and closes.
 * FR-008, SC-005.
 */
export function ArchiveConfirmDialog({
  accountId,
  accountName,
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
      formData.set("id", accountId)
      const result = await archiveAccount(null, formData)
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
          <AlertDialogTitle>Archive this account?</AlertDialogTitle>
          <AlertDialogDescription>
            Archive {accountName}? You can unarchive it later — your data is not deleted.
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
