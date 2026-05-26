"use client"

/**
 * app/(shell)/dashboard/budgets/_components/archive-confirm-dialog.tsx
 *
 * AlertDialog that confirms archiving a budget.
 * Uses useTransition (NOT useActionState) — keeps synchronous control over
 * dialog close sequencing (same pattern as feature-007 ArchiveConfirmDialog).
 *
 * On success: calls onArchived() then closes via onOpenChange(false).
 * On error: surfaces inline in the dialog body.
 *
 * FR-018, FR-008, US3 ac.4.
 */

import { useState, useTransition } from "react"

import { archiveBudget } from "@/lib/budgets/actions"
import { type BudgetWithActualsDTO } from "@/lib/budgets/serialize"
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
  /** The budget to archive — null when the dialog is not open. */
  budget: BudgetWithActualsDTO | null
  /** Display name for the category (used in the dialog copy). */
  categoryName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onArchived: () => void
}

// ---------------------------------------------------------------------------
// ArchiveConfirmDialog
// ---------------------------------------------------------------------------

export function ArchiveConfirmDialog({
  budget,
  categoryName,
  open,
  onOpenChange,
  onArchived,
}: ArchiveConfirmDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleArchive() {
    if (!budget) return
    setErrorMessage(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", budget.budget.id)
      const result = await archiveBudget(null, formData)
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
          <AlertDialogTitle>Archive this budget?</AlertDialogTitle>
          <AlertDialogDescription>
            Archive the {categoryName} budget? You can unarchive it later. Your transactions in{" "}
            {categoryName} are unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}

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
