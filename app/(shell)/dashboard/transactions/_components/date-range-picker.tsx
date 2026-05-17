"use client"

import * as React from "react"
import { CalendarIcon, X } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DateRangePickerProps = {
  from: Date | null
  to: Date | null
  onChange: (from: Date | null, to: Date | null) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Date format helpers (native — no date-fns dependency)
// ---------------------------------------------------------------------------

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function formatShort(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`
}

function formatLong(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Preset helpers
// ---------------------------------------------------------------------------

function getPresetRange(preset: "7d" | "30d" | "month"): { from: Date; to: Date } {
  const to = new Date()
  const from = new Date()

  if (preset === "7d") {
    from.setDate(from.getDate() - 7)
  } else if (preset === "30d") {
    from.setDate(from.getDate() - 30)
  } else {
    // "month" — first day of current month to today
    from.setDate(1)
  }

  return { from, to }
}

// ---------------------------------------------------------------------------
// DateRangePicker
// ---------------------------------------------------------------------------

/**
 * Date range picker — shadcn <Calendar> in range mode inside a <Popover>.
 * Presets: "Last 7 days", "Last 30 days", "This month".
 * Used by <TransactionFilters> for the date range filter (US5, T037).
 * FR-026, FR-026a.
 *
 * Controlled component: `from` and `to` are the source of truth (driven by URL params).
 * Internal `localRange` only tracks partial selections during calendar interaction.
 */
export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Track partial selections in the calendar (only used while popover is open).
  // When closed, always derive from props.
  const [localRange, setLocalRange] = React.useState<DateRange | undefined>(undefined)

  // Effective calendar selection: while open use localRange if mid-selection, else use props
  const propsRange: DateRange | undefined =
    from && to ? { from, to } : from ? { from, to: undefined } : undefined

  const calendarRange = open && localRange !== undefined ? localRange : propsRange

  // Format the trigger label
  const triggerLabel = (() => {
    if (!from && !to) return "Pick a date range"
    if (from && to) {
      // Same year — omit year from "from" label
      if (from.getFullYear() === to.getFullYear()) {
        return `${formatShort(from)} – ${formatLong(to)}`
      }
      return `${formatLong(from)} – ${formatLong(to)}`
    }
    if (from) return `${formatLong(from)} –`
    return "Pick a date range"
  })()

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      // Reset local partial range when popover closes
      setLocalRange(undefined)
    }
  }

  function handleRangeSelect(newRange: DateRange | undefined) {
    setLocalRange(newRange)
    if (newRange?.from && newRange?.to) {
      onChange(newRange.from, newRange.to)
      setOpen(false)
      setLocalRange(undefined)
    } else {
      // Partial selection — propagate from only (to = null) so the URL doesn't break
      onChange(newRange?.from ?? null, null)
    }
  }

  function applyPreset(preset: "7d" | "30d" | "month") {
    const { from: pFrom, to: pTo } = getPresetRange(preset)
    onChange(pFrom, pTo)
    setLocalRange(undefined)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null, null)
  }

  const hasValue = from !== null || to !== null

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-[240px] justify-start text-left font-normal",
              !from && !to && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Preset buttons */}
          <div className="flex gap-1 border-b p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => applyPreset("7d")}
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => applyPreset("30d")}
            >
              Last 30 days
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => applyPreset("month")}
            >
              This month
            </Button>
          </div>
          <Calendar
            mode="range"
            selected={calendarRange}
            onSelect={handleRangeSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Clear button — only shown when a range is set */}
      {hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Clear date range"
          onClick={handleClear}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
