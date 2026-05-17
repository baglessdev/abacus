"use client"

import { Check } from "lucide-react"

import { CATEGORY_COLORS, getCategoryColor } from "@/lib/categories/colors"
import { cn } from "@/lib/utils"

type ColorPickerProps = {
  value: string
  onChange: (token: string) => void
  name?: string
  disabled?: boolean
}

/**
 * Color palette picker — renders a grid of circular color swatches.
 * Keyboard-accessible (Tab + Enter/Space to select).
 * FR-007, FR-020.
 */
export function ColorPicker({ value, onChange, name, disabled = false }: ColorPickerProps) {
  const colorEntry = getCategoryColor(value)

  if (disabled) {
    const bgClass = colorEntry?.cssClass.replace("text-", "bg-") ?? "bg-muted"
    return (
      <div className="flex items-center gap-2">
        {name && <input type="hidden" name={name} value={value} />}
        <div
          className={cn("h-9 w-9 rounded-full", bgClass, "opacity-60")}
          aria-label={colorEntry?.label ?? value}
        />
        <span className="text-sm text-muted-foreground">{colorEntry?.label ?? value}</span>
        <span className="text-xs text-muted-foreground">(locked while archived)</span>
      </div>
    )
  }

  return (
    <div>
      {/* Hidden input for FormData submission */}
      {name && <input type="hidden" name={name} value={value} />}

      <div className="grid grid-cols-6 gap-2">
        {CATEGORY_COLORS.map((c) => {
          // Convert text-X-500 → bg-X-500 for the filled circle
          const bgClass = c.cssClass.replace("text-", "bg-")
          const isSelected = value === c.token

          return (
            <button
              key={c.token}
              type="button"
              onClick={() => onChange(c.token)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full ring-offset-background transition-all",
                bgClass,
                isSelected ? "ring-2 ring-foreground ring-offset-2" : "hover:opacity-80",
              )}
              aria-label={c.label}
              aria-pressed={isSelected}
            >
              {isSelected ? <Check className="h-4 w-4 text-white" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
