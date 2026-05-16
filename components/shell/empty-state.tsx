import type { ReactNode } from "react"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type EmptyStateAction = {
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
}

type EmptyStateProps = {
  /** Headline. Always rendered. */
  title: string
  /** Subtitle / supporting copy. Optional. */
  description?: string
  /**
   * NEW: brand-consistent illustration slot. When provided, this is what the
   * component renders above the title. Takes precedence over `icon` when both
   * are passed. ReactNode so callers can pass any of the components from
   * `components/illustrations/` or any inline SVG.
   */
  illustration?: ReactNode
  /**
   * PRESERVED for back-compat. The feature-002 / feature-004 call sites
   * (`(shell)/error.tsx`, accounts zero-state) pass an icon here. This prop
   * continues to work; when `illustration` is also provided, `illustration`
   * wins. Now optional instead of required.
   */
  icon?: LucideIcon
  /** Primary call-to-action button. Optional. */
  action?: EmptyStateAction
  /**
   * NEW: decorative preview slot. When provided, rendered below the action
   * (so the action stays above the fold on short viewports). The preview is
   * wrapped in `<div aria-hidden="true" tabIndex={-1}>` and excluded from the
   * accessibility tree and the keyboard tab order. Callers MUST treat this
   * as decorative-only: no interactive elements inside.
   */
  preview?: ReactNode
}

export function EmptyState({
  title,
  description,
  illustration,
  icon: Icon,
  action,
  preview,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      {/* Illustration or icon slot — illustration takes precedence over icon */}
      {illustration ? (
        illustration
      ) : Icon ? (
        <Icon className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="max-w-md text-muted-foreground">{description}</p>}
      {action && renderAction(action)}
      {/* Preview slot: decorative only, excluded from accessibility tree */}
      {preview && (
        <div aria-hidden="true" tabIndex={-1}>
          {preview}
        </div>
      )}
    </div>
  )
}

function renderAction(action: EmptyStateAction) {
  if (action.href) {
    return (
      <Button asChild disabled={action.disabled}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    )
  }
  return (
    <Button onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  )
}
