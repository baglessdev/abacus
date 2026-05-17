"use client"

import type { TransactionDTO } from "@/lib/transactions/serialize"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { TransactionForm } from "./transaction-form"

type TransactionFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit" | "edit-archived"
  transaction?: TransactionDTO
  /** Called after a successful form submission (before the sheet closes). */
  onSuccess: () => void
}

const TITLES: Record<TransactionFormSheetProps["mode"], string> = {
  create: "Add transaction",
  edit: "Edit transaction",
  "edit-archived": "Edit archived transaction",
}

const DESCRIPTIONS: Record<TransactionFormSheetProps["mode"], string> = {
  create: "Fill in the details below to record a new transaction.",
  edit: "Update your transaction details below.",
  "edit-archived": "Only notes and payee can be edited while archived.",
}

/**
 * Wraps <TransactionForm> inside a shadcn Sheet.
 * Closes on successful form submission via onSuccess.
 * Mirrors <CategoryFormSheet> pattern from feature 005.
 * FR-021, FR-023, FR-025.
 */
export function TransactionFormSheet({
  open,
  onOpenChange,
  mode,
  transaction,
  onSuccess,
}: TransactionFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>{TITLES[mode]}</SheetTitle>
          <SheetDescription>{DESCRIPTIONS[mode]}</SheetDescription>
        </SheetHeader>
        <TransactionForm mode={mode} transaction={transaction} onSuccess={onSuccess} />
      </SheetContent>
    </Sheet>
  )
}
