"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { AccountPicker } from "@/components/accounts/account-picker"
import { CategoryPicker } from "@/components/categories/category-picker"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangePicker } from "./date-range-picker"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"

// Sentinel value for "uncategorized" filter (FR-026a)
export const UNCATEGORIZED_SENTINEL = "__none__"

// ---------------------------------------------------------------------------
// URL helper
// ---------------------------------------------------------------------------

/**
 * Build a new URLSearchParams by merging the current params with the given patch.
 * Setting a value to undefined removes that param.
 */
function buildSearchParams(
  current: ReturnType<typeof useSearchParams>,
  patch: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current?.toString() ?? "")
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") {
      next.delete(key)
    } else {
      next.set(key, value)
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// TransactionFilters
// ---------------------------------------------------------------------------

/**
 * URL-driven filter bar for the transactions list.
 * Each filter change pushes a new URL via useRouter + useSearchParams.
 * The server component (page.tsx) re-renders with the updated params.
 *
 * Filters (FR-026a):
 *   - Date range (from / to YYYY-MM-DD)
 *   - Account (accountId)
 *   - Category (categoryId — use UNCATEGORIZED_SENTINEL for null)
 *   - Type (INCOME | EXPENSE | TRANSFER | undefined)
 *
 * US5, T038.
 */
export function TransactionFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ---------------------------------------------------------------------------
  // Read current filter values from URL
  // ---------------------------------------------------------------------------

  const fromStr = searchParams?.get("from") ?? null
  const toStr = searchParams?.get("to") ?? null
  const accountId = searchParams?.get("accountId") ?? null
  const categoryId = searchParams?.get("categoryId") ?? null
  const typeParam = searchParams?.get("type") ?? null

  // Parse date strings back to Date objects for the picker
  const fromDate = fromStr ? parseDateParam(fromStr) : null
  const toDate = toStr ? parseDateParam(toStr) : null

  // ---------------------------------------------------------------------------
  // URL update helper
  // ---------------------------------------------------------------------------

  function updateUrl(patch: Record<string, string | undefined>) {
    const next = buildSearchParams(searchParams, patch)
    router.push(`/dashboard/transactions?${next.toString()}`)
  }

  // ---------------------------------------------------------------------------
  // Handler: date range
  // ---------------------------------------------------------------------------

  function handleDateChange(from: Date | null, to: Date | null) {
    updateUrl({
      from: from ? toISODateString(from) : undefined,
      to: to ? toISODateString(to) : undefined,
    })
  }

  // ---------------------------------------------------------------------------
  // Handler: account
  // ---------------------------------------------------------------------------

  function handleAccountChange(id: string | null) {
    updateUrl({ accountId: id ?? undefined })
  }

  // ---------------------------------------------------------------------------
  // Handler: category
  // ---------------------------------------------------------------------------

  function handleCategoryChange(id: string | null) {
    // null from picker means "no category" (uncategorized sentinel in URL)
    if (id === null) {
      updateUrl({ categoryId: UNCATEGORIZED_SENTINEL })
    } else {
      updateUrl({ categoryId: id })
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: type
  // ---------------------------------------------------------------------------

  function handleTypeChange(value: string) {
    updateUrl({ type: value === "ALL" ? undefined : value })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date range filter */}
      <DateRangePicker from={fromDate} to={toDate} onChange={handleDateChange} />

      {/* Account filter */}
      <div className="flex items-center gap-1">
        <div className="w-[200px]">
          <AccountPicker
            value={accountId}
            onChange={handleAccountChange}
            allowNone={true}
            placeholder="All accounts"
          />
        </div>
        {accountId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Clear account filter"
            onClick={() => updateUrl({ accountId: undefined })}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1">
        <div className="w-[200px]">
          <CategoryPicker
            value={categoryId === UNCATEGORIZED_SENTINEL ? null : categoryId}
            onChange={handleCategoryChange}
            allowNone={true}
            placeholder="All categories"
            ariaLabel="Category filter"
          />
        </div>
        {categoryId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Clear category filter"
            onClick={() => updateUrl({ categoryId: undefined })}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1">
        <Select value={typeParam ?? "ALL"} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[140px]" aria-label="Transaction type filter">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
        {typeParam && typeParam !== "ALL" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Clear type filter"
            onClick={() => updateUrl({ type: undefined })}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Clear all filters */}
      {hasActiveFilters(fromStr, toStr, accountId, categoryId, typeParam) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() =>
            updateUrl({
              from: undefined,
              to: undefined,
              accountId: undefined,
              categoryId: undefined,
              type: undefined,
            })
          }
        >
          Clear all
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Date to YYYY-MM-DD string (local calendar day). */
function toISODateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parse a YYYY-MM-DD string to a local Date (midnight local time). */
function parseDateParam(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!match || !match[1] || !match[2] || !match[3]) return null
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  return new Date(year, month, day)
}

function hasActiveFilters(
  fromStr: string | null | undefined,
  toStr: string | null | undefined,
  accountId: string | null | undefined,
  categoryId: string | null | undefined,
  typeParam: string | null | undefined,
): boolean {
  return !!(fromStr || toStr || accountId || categoryId || typeParam)
}

// Export the type-safe list of transaction type values for consumers
export type { TransactionType }
