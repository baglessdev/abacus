"use client"

import type { AccountDTO } from "@/lib/accounts/serialize"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { AccountForm } from "./account-form"

type AccountFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit" | "edit-archived"
  account?: AccountDTO
}

const TITLES: Record<AccountFormSheetProps["mode"], string> = {
  create: "Add account",
  edit: "Edit account",
  "edit-archived": "Edit archived account",
}

const DESCRIPTIONS: Record<AccountFormSheetProps["mode"], string> = {
  create: "Fill in the details below to add a new account.",
  edit: "Update your account details below.",
  "edit-archived": "Only the account name is editable while archived.",
}

/**
 * Wraps <AccountForm> inside a shadcn Sheet.
 * Closes on successful form submission via onSuccess → onOpenChange(false).
 * FR-019 (side sheet; no detail page).
 */
export function AccountFormSheet({ open, onOpenChange, mode, account }: AccountFormSheetProps) {
  function handleSuccess() {
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>{TITLES[mode]}</SheetTitle>
          <SheetDescription>{DESCRIPTIONS[mode]}</SheetDescription>
        </SheetHeader>
        <AccountForm mode={mode} account={account} onSuccess={handleSuccess} />
      </SheetContent>
    </Sheet>
  )
}
