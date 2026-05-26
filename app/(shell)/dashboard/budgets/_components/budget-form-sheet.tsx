"use client"

/**
 * app/(shell)/dashboard/budgets/_components/budget-form-sheet.tsx
 *
 * Wraps <BudgetForm> inside a shadcn Sheet.
 * Mirrors <TransactionFormSheet> from feature 007.
 *
 * FR-021, FR-023.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { type BudgetWithActualsDTO } from "@/lib/budgets/serialize"
import { type CategoryDTO } from "@/lib/categories/serialize"
import { BudgetForm } from "./budget-form"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  budget?: BudgetWithActualsDTO
  expenseCategories: CategoryDTO[]
  defaultCurrency: string | null
  currencies: string[]
  /** Called after a successful form submission (before the sheet closes). */
  onSuccess: () => void
}

const TITLES: Record<"create" | "edit", string> = {
  create: "Add budget",
  edit: "Edit budget",
}

const DESCRIPTIONS: Record<"create" | "edit", string> = {
  create: "Set a spending target for an expense category.",
  edit: "Update your budget details below.",
}

// ---------------------------------------------------------------------------
// BudgetFormSheet
// ---------------------------------------------------------------------------

export function BudgetFormSheet({
  open,
  onOpenChange,
  mode,
  budget,
  expenseCategories,
  defaultCurrency,
  currencies,
  onSuccess,
}: BudgetFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>{TITLES[mode]}</SheetTitle>
          <SheetDescription>{DESCRIPTIONS[mode]}</SheetDescription>
        </SheetHeader>
        <BudgetForm
          mode={mode}
          budget={budget}
          expenseCategories={expenseCategories}
          defaultCurrency={defaultCurrency}
          currencies={currencies}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  )
}
