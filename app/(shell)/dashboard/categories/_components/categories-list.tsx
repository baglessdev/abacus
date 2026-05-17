"use client"

import { useState, useTransition } from "react"

import { listCategories, unarchiveCategory } from "@/lib/categories/actions"
import type { CategoryDTO } from "@/lib/categories/serialize"
import { getCategoryIcon } from "@/lib/categories/icons"
import { getCategoryColor } from "@/lib/categories/colors"
import { Archive, RotateCcw, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/shell/empty-state"
import { CategoriesIllustration } from "@/components/illustrations/categories-illustration"
import { CategoryFormSheet } from "./category-form-sheet"
import { ArchiveConfirmDialog } from "./archive-confirm-dialog"

type CategoriesListProps = {
  initialCategories: CategoryDTO[]
}

type SheetMode = "create" | "edit" | "edit-archived"

type ArchiveTarget = {
  id: string
  name: string
}

/**
 * Client component that owns the categories list + create/edit sheet + archive flow.
 * Initialized from server-rendered initialCategories prop.
 * After any successful mutation, re-fetches from the server via listCategories.
 * US1: renders the seeded categories grouped by kind (EXPENSE / INCOME) with hierarchy.
 * US2: enables the "+ Add category" button and mounts <CategoryFormSheet>.
 * US3: row click → edit sheet; archive/unarchive trailing actions; archived badge + toggle.
 * FR-016, FR-019, FR-020.
 */
export function CategoriesList({ initialCategories }: CategoriesListProps) {
  const [categories, setCategories] = useState<CategoryDTO[]>(initialCategories)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<SheetMode>("create")
  const [editingCategory, setEditingCategory] = useState<CategoryDTO | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function refetch(includeArchived: boolean) {
    const result = await listCategories({ includeArchived })
    if ("data" in result) {
      setCategories(result.data.categories)
    }
  }

  async function handleShowArchivedChange(checked: boolean) {
    setShowArchived(checked)
    await refetch(checked)
  }

  function handleAddCategory() {
    setEditingCategory(undefined)
    setSheetMode("create")
    setSheetOpen(true)
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open)
  }

  // Called by CategoryFormSheet after successful form submission.
  async function handleFormSuccess() {
    setSheetOpen(false)
    await refetch(showArchived)
  }

  // Row click — opens edit sheet (edit or edit-archived)
  function handleRowClick(category: CategoryDTO) {
    setEditingCategory(category)
    setSheetMode(category.archivedAt === null ? "edit" : "edit-archived")
    setSheetOpen(true)
  }

  // Archive button click — open confirm dialog
  function handleArchiveClick(category: CategoryDTO) {
    setArchiveTarget({ id: category.id, name: category.name })
    setArchiveDialogOpen(true)
  }

  // Called after archive confirmed
  async function handleArchived() {
    await refetch(showArchived)
  }

  // ---------------------------------------------------------------------------
  // Derived state — group + sort by kind, build hierarchy
  // ---------------------------------------------------------------------------

  // Filter by archived state
  const visibleCategories = showArchived
    ? categories
    : categories.filter((c) => c.archivedAt === null)

  // Separate EXPENSE and INCOME
  const expenseCategories = visibleCategories.filter((c) => c.kind === "EXPENSE")
  const incomeCategories = visibleCategories.filter((c) => c.kind === "INCOME")

  /**
   * Build a hierarchical list: top-level items first (alphabetical by name,
   * already ordered by the server), immediately followed by their children.
   */
  function buildHierarchyList(
    items: CategoryDTO[],
  ): Array<{ category: CategoryDTO; isChild: boolean }> {
    const topLevel = items.filter((c) => c.parentId === null)
    const children = items.filter((c) => c.parentId !== null)

    const result: Array<{ category: CategoryDTO; isChild: boolean }> = []
    for (const parent of topLevel) {
      result.push({ category: parent, isChild: false })
      const myChildren = children.filter((c) => c.parentId === parent.id)
      for (const child of myChildren) {
        result.push({ category: child, isChild: true })
      }
    }
    return result
  }

  const expenseList = buildHierarchyList(expenseCategories)
  const incomeList = buildHierarchyList(incomeCategories)

  const isEmpty = visibleCategories.length === 0

  // parentOptions: top-level non-archived categories (single-level rule)
  const parentOptions = categories.filter((c) => c.parentId === null && !c.archivedAt)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const headerStrip = (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <div className="flex items-center gap-4">
        {/* Show archived toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={handleShowArchivedChange}
          />
          <Label htmlFor="show-archived" className="cursor-pointer text-sm">
            Show archived
          </Label>
        </div>
        {/* Add category button */}
        <Button size="sm" onClick={handleAddCategory}>
          + Add category
        </Button>
      </div>
    </div>
  )

  if (isEmpty) {
    return (
      <>
        {headerStrip}
        <EmptyState
          illustration={<CategoriesIllustration className="h-32 w-32 text-primary" />}
          title="No categories yet"
          description="Add your first category to get started."
          action={{ label: "Add category", onClick: handleAddCategory }}
        />
        <CategoryFormSheet
          open={sheetOpen}
          onOpenChange={handleSheetOpenChange}
          mode={sheetMode}
          category={editingCategory}
          parentOptions={parentOptions}
          onSuccess={handleFormSuccess}
        />
        <ArchiveConfirmDialog
          categoryId={archiveTarget?.id ?? ""}
          categoryName={archiveTarget?.name ?? ""}
          open={archiveDialogOpen}
          onOpenChange={setArchiveDialogOpen}
          onArchived={handleArchived}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header strip */}
      {headerStrip}

      {/* Grouped sections */}
      <div className="flex flex-col gap-8">
        {/* EXPENSE section */}
        {expenseList.length > 0 && (
          <section aria-label="Expense categories">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              EXPENSE
            </h2>
            <ul className="flex flex-col gap-1">
              {expenseList.map(({ category: c, isChild }) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  isChild={isChild}
                  onRowClick={handleRowClick}
                  onArchiveClick={handleArchiveClick}
                  onUnarchived={() => refetch(showArchived)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* INCOME section */}
        {incomeList.length > 0 && (
          <section aria-label="Income categories">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              INCOME
            </h2>
            <ul className="flex flex-col gap-1">
              {incomeList.map(({ category: c, isChild }) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  isChild={isChild}
                  onRowClick={handleRowClick}
                  onArchiveClick={handleArchiveClick}
                  onUnarchived={() => refetch(showArchived)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* CategoryFormSheet — mounted at bottom, controlled by sheetOpen */}
      <CategoryFormSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        mode={sheetMode}
        category={editingCategory}
        parentOptions={parentOptions}
        onSuccess={handleFormSuccess}
      />

      {/* ArchiveConfirmDialog */}
      <ArchiveConfirmDialog
        categoryId={archiveTarget?.id ?? ""}
        categoryName={archiveTarget?.name ?? ""}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onArchived={handleArchived}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// CategoryRow — individual row in the list
// ---------------------------------------------------------------------------

type CategoryRowProps = {
  category: CategoryDTO
  isChild: boolean
  onRowClick: (category: CategoryDTO) => void
  onArchiveClick: (category: CategoryDTO) => void
  onUnarchived: () => void
}

function CategoryRow({
  category: c,
  isChild,
  onRowClick,
  onArchiveClick,
  onUnarchived,
}: CategoryRowProps) {
  const [isUnarchiving, startUnarchiveTransition] = useTransition()
  const iconEntry = getCategoryIcon(c.icon)
  const IconComponent = iconEntry?.component ?? Tag
  const colorEntry = getCategoryColor(c.color)
  const colorClass = colorEntry?.cssClass ?? "text-muted-foreground"
  const isArchived = c.archivedAt !== null

  function handleUnarchive(e: React.MouseEvent) {
    e.stopPropagation()
    startUnarchiveTransition(async () => {
      const formData = new FormData()
      formData.set("id", c.id)
      const result = await unarchiveCategory(null, formData)
      if ("data" in result) {
        onUnarchived()
      }
    })
  }

  return (
    <li
      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 ${isChild ? "pl-8" : "pl-3"} ${isArchived ? "opacity-60" : ""}`}
      onClick={() => onRowClick(c)}
      tabIndex={0}
      aria-label={`Edit ${c.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onRowClick(c)
        }
      }}
    >
      <IconComponent className={`h-5 w-5 shrink-0 ${colorClass}`} aria-hidden="true" />
      <span className="flex-1 font-medium">{c.name}</span>
      {isArchived && <Badge variant="secondary">Archived</Badge>}

      {/* Trailing action buttons */}
      <div className="ml-auto flex items-center gap-1">
        {isArchived ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isUnarchiving}
            onClick={handleUnarchive}
            aria-label={`Unarchive ${c.name}`}
            data-testid={`unarchive-btn-${c.id}`}
          >
            <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
            {isUnarchiving ? "Unarchiving…" : "Unarchive"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onArchiveClick(c)
            }}
            aria-label={`Archive ${c.name}`}
            data-testid={`archive-btn-${c.id}`}
          >
            <Archive className="mr-1 h-4 w-4" aria-hidden="true" />
            Archive
          </Button>
        )}
      </div>
    </li>
  )
}
