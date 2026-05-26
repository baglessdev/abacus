/**
 * app/(shell)/dashboard/budgets/_components/progress-bar.tsx
 *
 * Accessible progress bar server component. Used by both the /dashboard/budgets
 * page rows AND the <BudgetsWidget> on /dashboard.
 *
 * Accessibility:
 *   - role="progressbar" with aria-valuenow, aria-valuemin, aria-valuemax per FR-031.
 *   - aria-valuenow reflects the true percentage (may exceed 100% for over-budget — useful
 *     for screen readers to communicate "over by X%"). The visual fill is capped at 100%.
 *   - Non-color secondary signal (FR-025 non-color rule, FR-030 keyboard rule):
 *     - "under":  no icon (neutral)
 *     - "near":   AlertTriangle icon (warning)
 *     - "over":   Ban icon (negative)
 *
 * Status → Tailwind fill class:
 *   - "under": bg-foreground/30 (neutral)
 *   - "near":  bg-amber-500 (warning)
 *   - "over":  bg-destructive (negative; uses the same token as negative Money values)
 */

import { AlertTriangle, Ban } from "lucide-react"
import { cn } from "@/lib/utils"

type ProgressBarProps = {
  /** Progress value (0..∞). Typically progressRatio from BudgetWithActualsDTO. */
  value: number
  /** Maximum value for percentage calculation. Defaults to 1.0 (i.e., 100%). */
  max?: number
  /** Budget status — determines fill color and secondary icon. */
  status: "under" | "near" | "over"
  className?: string
}

const STATUS_FILL_CLASS: Record<"under" | "near" | "over", string> = {
  under: "bg-foreground/30",
  near: "bg-amber-500",
  over: "bg-destructive",
}

function StatusIcon({ status }: { status: "under" | "near" | "over" }) {
  if (status === "near") {
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-amber-500"
        aria-label="Near budget limit"
      />
    )
  }
  if (status === "over") {
    return <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Over budget" />
  }
  return null
}

export function ProgressBar({ value, max = 1.0, status, className }: ProgressBarProps) {
  // Visual fill capped at 100%; aria-valuenow reflects the true ratio (may exceed 100 for over-budget).
  const truePercent = (value / max) * 100
  const fillPercent = Math.min(truePercent, 100)

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Accessible progress bar container */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(truePercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget progress"
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        {/* Colored fill bar — capped visually at 100% */}
        <div
          className={cn("h-full rounded-full transition-all", STATUS_FILL_CLASS[status])}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {/* Non-color secondary signal: icon for near/over (FR-025, FR-030) */}
      <StatusIcon status={status} />
    </div>
  )
}
