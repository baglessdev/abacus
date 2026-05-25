/**
 * app/(shell)/dashboard/_components/widget-card.tsx
 *
 * Shared visual shell for all dashboard widgets. Server component (no state, no async).
 * Wraps shadcn <Card> with a consistent header/content slot pattern.
 * Consumed by: NetWorthWidget, CashFlowWidget, RecentTransactionsWidget, WidgetErrorBoundary.
 *
 * FR-032: accessible label = the widget title (rendered in <CardTitle>).
 */

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface WidgetCardProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function WidgetCard({ title, children, className }: WidgetCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
