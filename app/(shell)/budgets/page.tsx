import { PieChart } from "lucide-react"

import { EmptyState } from "@/components/shell/empty-state"

export default function BudgetsPage() {
  return (
    <EmptyState
      title="No budgets yet"
      description="Budgets help you cap spending by category. This feature is pending."
      icon={PieChart}
    />
  )
}
