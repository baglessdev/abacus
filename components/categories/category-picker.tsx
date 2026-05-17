"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Tag } from "lucide-react"

import { listCategories } from "@/lib/categories/actions"
import type { CategoryDTO } from "@/lib/categories/serialize"
import { CATEGORY_COLORS, getCategoryColor } from "@/lib/categories/colors"
import { getCategoryIcon } from "@/lib/categories/icons"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CategoryPickerProps = {
  /** The currently-selected category id, or null for "no selection". */
  value: string | null
  /** Called when the user picks a category (or clears the selection). */
  onChange: (categoryId: string | null) => void
  /**
   * Optional filter — when set to "INCOME" or "EXPENSE", only that kind
   * is listed. Default "any" shows both kinds grouped by kind.
   */
  kind?: "INCOME" | "EXPENSE" | "any"
  /** When true, archived categories are listed. Default: false (FR-011). */
  includeArchived?: boolean
  /** Category ids to exclude from the list. */
  excludeIds?: readonly string[]
  /** When true, the picker trigger is non-interactive. */
  disabled?: boolean
  /** Placeholder text when value is null. Default: "Pick a category". */
  placeholder?: string
  /** Accessibility label. Default: "Category". */
  ariaLabel?: string
  /**
   * When true, render a "(none)" option at the top of the list.
   * Calls onChange(null) — useful for "no parent" in the category form.
   */
  allowNone?: boolean
}

// ---------------------------------------------------------------------------
// Color helper
// ---------------------------------------------------------------------------

function getColorClass(token: string): string {
  return getCategoryColor(token)?.cssClass ?? "text-muted-foreground"
}

// ---------------------------------------------------------------------------
// Sorted hierarchy builder
// ---------------------------------------------------------------------------

/**
 * Build a flat ordered list: for each top-level category (alpha),
 * emit parent then its children (alpha). Used inside the picker to
 * render the correct visual hierarchy.
 */
function buildOrderedList(
  categories: CategoryDTO[],
): Array<{ category: CategoryDTO; isChild: boolean }> {
  const topLevel = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name))
  const children = categories.filter((c) => c.parentId !== null)

  const result: Array<{ category: CategoryDTO; isChild: boolean }> = []
  for (const parent of topLevel) {
    result.push({ category: parent, isChild: false })
    const myChildren = children
      .filter((c) => c.parentId === parent.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const child of myChildren) {
      result.push({ category: child, isChild: true })
    }
  }
  // Orphaned children (whose parent was excluded) — append at end
  for (const child of children) {
    if (!result.some((r) => r.category.id === child.id)) {
      result.push({ category: child, isChild: true })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// CategoryPicker
// ---------------------------------------------------------------------------

/**
 * Reusable category-picker primitive (FR-018, SC-009).
 * Contract surface for features 006 (Transactions) and 008 (Budgets).
 * Lives at components/categories/ (NOT under a route-bound _components/).
 */
export function CategoryPicker({
  value,
  onChange,
  kind,
  includeArchived = false,
  excludeIds,
  disabled = false,
  placeholder = "Pick a category",
  ariaLabel = "Category",
  allowNone = false,
}: CategoryPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [categories, setCategories] = React.useState<CategoryDTO[]>([])
  const [loadError, setLoadError] = React.useState(false)

  // Fetch categories on mount + when includeArchived changes.
  React.useEffect(() => {
    let cancelled = false
    void listCategories({ includeArchived }).then((result) => {
      if (cancelled) return
      if ("data" in result) {
        setCategories(result.data.categories)
        setLoadError(false)
      } else {
        setLoadError(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [includeArchived])

  // Derive the selected category from local state.
  const selectedCategory = value ? categories.find((c) => c.id === value) : null

  // Apply kind filter + excludeIds filter.
  const effectiveKind = kind === "any" || kind === undefined ? undefined : kind
  const filtered = categories.filter((c) => {
    if (effectiveKind && c.kind !== effectiveKind) return false
    if (excludeIds && excludeIds.includes(c.id)) return false
    return true
  })

  // Partition by kind for rendering.
  const expenseCategories = filtered.filter((c) => c.kind === "EXPENSE")
  const incomeCategories = filtered.filter((c) => c.kind === "INCOME")

  // ---------------------------------------------------------------------------
  // Disabled: read-only display
  // ---------------------------------------------------------------------------

  if (disabled) {
    const colorClass = selectedCategory
      ? getColorClass(selectedCategory.color)
      : "text-muted-foreground"
    const iconEntry = selectedCategory ? getCategoryIcon(selectedCategory.icon) : undefined
    const IconComponent = iconEntry?.component ?? Tag

    return (
      <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
        {selectedCategory ? (
          <>
            <IconComponent className={cn("h-4 w-4 shrink-0", colorClass)} aria-hidden="true" />
            <span>{selectedCategory.name}</span>
          </>
        ) : (
          <span>{placeholder}</span>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Row renderer helper
  // ---------------------------------------------------------------------------

  function renderItems(
    items: Array<{ category: CategoryDTO; isChild: boolean }>,
    showHeading: boolean,
    heading: string,
  ) {
    if (items.length === 0) return null

    return (
      <CommandGroup heading={showHeading ? heading : undefined}>
        {items.map(({ category: c, isChild }) => {
          const iconEntry = getCategoryIcon(c.icon)
          const IconComponent = iconEntry?.component ?? Tag
          const colorClass = getColorClass(c.color)
          const parentCategory = isChild ? categories.find((p) => p.id === c.parentId) : null

          return (
            <CommandItem
              key={c.id}
              value={`${c.name} ${parentCategory ? parentCategory.name : ""}`}
              onSelect={() => {
                onChange(c.id)
                setOpen(false)
              }}
              className={cn(isChild ? "pl-8" : "pl-2")}
            >
              <IconComponent
                className={cn("mr-2 h-4 w-4 shrink-0", colorClass)}
                aria-hidden="true"
              />
              <span className="flex-1">
                {c.name}
                {isChild && parentCategory && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({parentCategory.name})
                  </span>
                )}
              </span>
              {value === c.id && <Check className="ml-auto h-4 w-4 shrink-0" />}
            </CommandItem>
          )
        })}
      </CommandGroup>
    )
  }

  // Trigger label
  const triggerContent = (() => {
    if (!selectedCategory) return <span className="text-muted-foreground">{placeholder}</span>
    const iconEntry = getCategoryIcon(selectedCategory.icon)
    const IconComponent = iconEntry?.component ?? Tag
    const colorClass = getColorClass(selectedCategory.color)
    return (
      <>
        <IconComponent className={cn("mr-2 h-4 w-4 shrink-0", colorClass)} aria-hidden="true" />
        <span>{selectedCategory.name}</span>
      </>
    )
  })()

  const showGroupHeaders = !effectiveKind

  const expenseOrdered = buildOrderedList(expenseCategories)
  const incomeOrdered = buildOrderedList(incomeCategories)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center">{triggerContent}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            {loadError ? (
              <CommandEmpty>Failed to load categories.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No categories found.</CommandEmpty>

                {/* (none) option */}
                {allowNone && (
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        onChange(null)
                        setOpen(false)
                      }}
                    >
                      <span className="text-muted-foreground">No parent (top-level)</span>
                      {value === null && <Check className="ml-auto h-4 w-4 shrink-0" />}
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* EXPENSE group */}
                {expenseOrdered.length > 0 &&
                  renderItems(expenseOrdered, showGroupHeaders, "EXPENSE")}

                {/* INCOME group */}
                {incomeOrdered.length > 0 && renderItems(incomeOrdered, showGroupHeaders, "INCOME")}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Re-export colors helper for consumers
export { CATEGORY_COLORS, getColorClass }
