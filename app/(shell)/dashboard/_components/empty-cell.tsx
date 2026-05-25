/**
 * app/(shell)/dashboard/_components/empty-cell.tsx
 *
 * Tiny inline "no data" cell rendered INSIDE a widget when its underlying data is empty
 * but valid (e.g., "No income or expense this month yet" inside <CashFlowWidget>).
 *
 * Server component. No state, no async.
 *
 * NOT to be confused with the page-level <EmptyState> from components/shell/empty-state.tsx
 * (that one replaces the entire dashboard for the no-accounts case — US5).
 */

interface EmptyCellProps {
  message: string
}

export function EmptyCell({ message }: EmptyCellProps) {
  return <p className="text-sm text-muted-foreground">{message}</p>
}
