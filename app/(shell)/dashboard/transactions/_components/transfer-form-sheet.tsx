"use client"

import type { TransferGroupDTO } from "./transfer-form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { TransferForm } from "./transfer-form"

type TransferFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  transferGroup?: TransferGroupDTO
  /** Called after a successful form submission (before the sheet closes). */
  onSuccess: () => void
}

const TITLES: Record<TransferFormSheetProps["mode"], string> = {
  create: "Add transfer",
  edit: "Edit transfer",
}

const DESCRIPTIONS: Record<TransferFormSheetProps["mode"], string> = {
  create: "Transfer money between two same-currency accounts.",
  edit: "Update the transfer details. Both legs will be updated atomically.",
}

/**
 * Wraps <TransferForm> inside a shadcn Sheet.
 * Closes on successful form submission via onSuccess.
 * Mirrors <TransactionFormSheet> pattern.
 * FR-021, FR-024, FR-025.
 */
export function TransferFormSheet({
  open,
  onOpenChange,
  mode,
  transferGroup,
  onSuccess,
}: TransferFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>{TITLES[mode]}</SheetTitle>
          <SheetDescription>{DESCRIPTIONS[mode]}</SheetDescription>
        </SheetHeader>
        <TransferForm mode={mode} transferGroup={transferGroup} onSuccess={onSuccess} />
      </SheetContent>
    </Sheet>
  )
}
