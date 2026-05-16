import { EmptyState } from "@/components/shell/empty-state"
import { BudgetsIllustration } from "@/components/illustrations/budgets-illustration"
import { Money } from "@/components/money/money"

export default function BudgetsPage() {
  return (
    <EmptyState
      illustration={<BudgetsIllustration className="h-32 w-32 text-primary" />}
      title="Budgets are coming soon"
      description="Cap your spending by category and stay on top of the limits you set."
      preview={
        <div className="mt-12 w-full max-w-md space-y-4 opacity-40">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">Groceries</span>
              <span className="text-muted-foreground">60% of $500</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/5 bg-primary" />
            </div>
          </div>
          <div className="border-t pt-3 text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Spent this month
            </div>
            <Money amount="300.00" currency="USD" prominent align="right" />
          </div>
        </div>
      }
    />
  )
}
