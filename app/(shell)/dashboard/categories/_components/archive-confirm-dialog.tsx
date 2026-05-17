"use client"

import { useState, useTransition } from "react"

import { archiveCategory } from "@/lib/categories/actions"
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
  categoryId: string
  categoryName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onArchived: () => void
}

// ---------------------------------------------------------------------------
// ArchiveConfirmDialog
// ---------------------------------------------------------------------------

/**
 * AlertDialog that confirms archiving a category.
 * Uses useTransition (NOT useActionState) because Radix AlertDialog auto-closes
 * on action click before async resolution — useTransition keeps synchronous control.
 * On success: calls onArchived() then closes.
 * Mirrors accounts feature archive-confirm-dialog pattern.
 * FR-010, SC-005.
 */
export function ArchiveConfirmDialog({
  categoryId,
  categoryName,
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
      formData.set("id", categoryId)
      const result = await archiveCategory(null, formData)
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
          <AlertDialogTitle>Archive this category?</AlertDialogTitle>
          <AlertDialogDescription>
            Archive {categoryName}? You can unarchive it later — your data is not deleted.
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
