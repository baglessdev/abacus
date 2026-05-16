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
  title: string
  description: string
  icon: LucideIcon
  action?: EmptyStateAction
}

export function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <Icon className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-muted-foreground">{description}</p>
      {action && renderAction(action)}
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
