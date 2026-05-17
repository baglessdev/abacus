"use client"

import type { CategoryDTO } from "@/lib/categories/serialize"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CategoryForm } from "./category-form"

type CategoryFormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit" | "edit-archived"
  category?: CategoryDTO
  parentOptions: CategoryDTO[]
  /** Called after a successful form submission (before the sheet closes). */
  onSuccess: () => void
}

const TITLES: Record<
  Omit<CategoryFormSheetProps, "open" | "onOpenChange" | "parentOptions" | "onSuccess">["mode"],
  string
> = {
  create: "Add category",
  edit: "Edit category",
  "edit-archived": "Edit archived category",
}

const DESCRIPTIONS: Record<
  Omit<CategoryFormSheetProps, "open" | "onOpenChange" | "parentOptions" | "onSuccess">["mode"],
  string
> = {
  create: "Fill in the details below to add a new category.",
  edit: "Update your category details below.",
  "edit-archived": "Only the category name is editable while archived.",
}

/**
 * Wraps <CategoryForm> inside a shadcn Sheet.
 * Closes on successful form submission via onSuccess.
 * FR-017 (side-sheet edit UX), FR-018.
 */
export function CategoryFormSheet({
  open,
  onOpenChange,
  mode,
  category,
  parentOptions,
  onSuccess,
}: CategoryFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>{TITLES[mode]}</SheetTitle>
          <SheetDescription>{DESCRIPTIONS[mode]}</SheetDescription>
        </SheetHeader>
        <CategoryForm
          mode={mode}
          category={category}
          onSuccess={onSuccess}
          parentOptions={parentOptions}
        />
      </SheetContent>
    </Sheet>
  )
}
