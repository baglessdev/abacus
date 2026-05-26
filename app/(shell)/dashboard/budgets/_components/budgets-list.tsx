"use client"

/**
 * app/(shell)/dashboard/budgets/_components/budgets-list.tsx
 *
 * Client component owning:
 *   - create / edit sheet open state
 *   - archive-target state (US3)
 *   - show-archived toggle state (US3)
 *
 * US1: create flow wired.
 * US3: edit click → opens sheet in "edit" mode; archive button → <ArchiveConfirmDialog>.
 *      "Show archived" toggle → navigate to ?showArchived=1 (handled in page.tsx).
 *      Archived rows render with <Badge variant="secondary">Archived</Badge> + "Unarchive" button.
 *
 * "Show archived" approach: pass ?showArchived=1 query param to the server-component page,
 * which reads it and passes includeArchived=true to listBudgets. This avoids a client-side
 * fetch of the action — the server component already owns the data-fetching path.
 *
 * On <BudgetForm> success: close sheet + refresh data via router.refresh().
 */

import { useState, useCallback, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { unarchiveBudget } from "@/lib/budgets/actions"
import { type BudgetWithActualsDTO } from "@/lib/budgets/serialize"
import { type CategoryDTO } from "@/lib/categories/serialize"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/shell/empty-state"
import { BudgetRow } from "./budget-row"
import { BudgetFormSheet } from "./budget-form-sheet"
import { ArchiveConfirmDialog } from "./archive-confirm-dialog"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetsListProps = {
  initialBudgets: BudgetWithActualsDTO[]
  expenseCategories: CategoryDTO[]
  defaultCurrency: string | null
  currencies: string[]
  categoriesById: Record<string, CategoryDTO>
  /** Whether archived budgets are currently being shown (set by page.tsx from ?showArchived=1). */
  showArchived?: boolean
}

// ---------------------------------------------------------------------------
// BudgetsList
// ---------------------------------------------------------------------------

export function BudgetsList(props: BudgetsListProps) {
  const {
    initialBudgets,
    expenseCategories,
    defaultCurrency,
    currencies,
    showArchived: initialShowArchived = false,
  } = props
  const router = useRouter()
  const searchParams = useSearchParams()

  // "Show archived" is driven by the ?showArchived=1 query param (server-side rendering).
  // The Switch below updates the URL, causing the server to re-fetch with includeArchived=true.
  const showArchived = initialShowArchived

  // Budget data comes directly from the server prop (router.refresh() triggers re-render
  // with fresh props — same pattern as TransactionsList in feature 007).
  const budgets = initialBudgets

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<"create" | "edit">("create")
  const [editingBudget, setEditingBudget] = useState<BudgetWithActualsDTO | undefined>(undefined)

  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<BudgetWithActualsDTO | null>(null)

  // Unarchive transition
  const [, startUnarchiveTransition] = useTransition()

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAddBudget = useCallback(() => {
    setSheetMode("create")
    setEditingBudget(undefined)
    setSheetOpen(true)
  }, [])

  const handleEditBudget = useCallback((budget: BudgetWithActualsDTO) => {
    setSheetMode("edit")
    setEditingBudget(budget)
    setSheetOpen(true)
  }, [])

  const handleArchiveBudget = useCallback((budget: BudgetWithActualsDTO) => {
    setArchiveTarget(budget)
    setArchiveDialogOpen(true)
  }, [])

  const handleArchived = useCallback(() => {
    setArchiveDialogOpen(false)
    setArchiveTarget(null)
    router.refresh()
  }, [router])

  const handleUnarchiveBudget = useCallback(
    (budget: BudgetWithActualsDTO) => {
      startUnarchiveTransition(async () => {
        const formData = new FormData()
        formData.set("id", budget.budget.id)
        await unarchiveBudget(null, formData)
        router.refresh()
      })
    },
    [router],
  )

  const handleSuccess = useCallback(() => {
    setSheetOpen(false)
    router.refresh()
  }, [router])

  // "Show archived" toggle — navigates to ?showArchived=1 or removes the param.
  // The server component reads this param and passes includeArchived to listBudgets.
  const handleShowArchivedToggle = useCallback(
    (checked: boolean) => {
      const params = new URLSearchParams(searchParams.toString())
      if (checked) {
        params.set("showArchived", "1")
      } else {
        params.delete("showArchived")
      }
      router.push(`/dashboard/budgets?${params.toString()}`)
    },
    [router, searchParams],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {/* Header strip */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <div className="flex items-center gap-4">
          {/* "Show archived" toggle (US3 / FR-020) */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived-toggle"
              checked={showArchived}
              onCheckedChange={handleShowArchivedToggle}
              aria-label="Show archived budgets"
              data-testid="show-archived-toggle"
            />
            <Label htmlFor="show-archived-toggle" className="cursor-pointer text-sm">
              Show archived
            </Label>
          </div>
          <Button
            type="button"
            variant="default"
            onClick={handleAddBudget}
            data-testid="add-budget-btn"
          >
            + Add budget
          </Button>
        </div>
      </div>

      {/* Empty state or budget list */}
      {budgets.length === 0 ? (
        <EmptyState
          title="Set spending targets for your expense categories"
          description="Create a budget to track your spending against your own limits."
          action={{
            label: "Create your first budget",
            onClick: handleAddBudget,
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {budgets.map((bwa) => {
            const isArchivedCategory = bwa.category.archivedAt !== null
            const isArchivedBudget = bwa.budget.archivedAt !== null

            if (isArchivedBudget) {
              // Archived budget row — render with Archived badge + Unarchive button
              return (
                <ArchivedBudgetRow
                  key={bwa.budget.id}
                  budget={bwa}
                  isArchivedCategory={isArchivedCategory}
                  onUnarchive={handleUnarchiveBudget}
                />
              )
            }

            return (
              <BudgetRow
                key={bwa.budget.id}
                budget={bwa}
                isArchivedCategory={isArchivedCategory}
                onEdit={handleEditBudget}
                onArchive={handleArchiveBudget}
              />
            )
          })}
        </div>
      )}

      {/* Sheet — mounted at the root of the component so sheet state is shared */}
      <BudgetFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        budget={editingBudget}
        expenseCategories={expenseCategories}
        defaultCurrency={defaultCurrency}
        currencies={currencies}
        onSuccess={handleSuccess}
      />

      {/* Archive confirm dialog — mounted once at root (US3 / T031) */}
      <ArchiveConfirmDialog
        budget={archiveTarget}
        categoryName={archiveTarget?.category.name ?? ""}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onArchived={handleArchived}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ArchivedBudgetRow — inline component for archived budget rows
// ---------------------------------------------------------------------------

/**
 * Renders an archived budget row with a Badge + Unarchive button.
 * Reuses the same card layout as <BudgetRow> but replaces the Archive
 * trailing button with an Unarchive button, and adds the Archived badge.
 */
function ArchivedBudgetRow({
  budget,
  isArchivedCategory,
  onUnarchive,
}: {
  budget: BudgetWithActualsDTO
  isArchivedCategory: boolean
  onUnarchive: (budget: BudgetWithActualsDTO) => void
}) {
  const { budget: b, category } = budget

  const periodLabel = b.period === "MONTHLY" ? "Monthly" : "Yearly"
  const categoryLabel = isArchivedCategory ? `${category.name} (archived category)` : category.name

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 opacity-60 shadow-sm">
      {/* Header: category name + period + badge + unarchive button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{categoryLabel}</span>
            <Badge variant="secondary" data-testid="archived-badge">
              Archived
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>

        {/* Unarchive button (trailing) */}
        <button
          type="button"
          onClick={() => onUnarchive(budget)}
          className="shrink-0 rounded text-xs text-muted-foreground underline hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={`Unarchive budget for ${categoryLabel}`}
          data-testid="unarchive-btn"
        >
          Unarchive
        </button>
      </div>
    </div>
  )
}
