import { Wallet } from "lucide-react"

import { EmptyState } from "@/components/shell/empty-state"

export default function DashboardPage() {
  return (
    <div className="flex flex-col">
      <EmptyState
        title="Welcome to Abacus"
        description="Track your accounts, transactions, and budgets. Get started by adding your first account."
        icon={Wallet}
        action={{ label: "Add your first account", disabled: true }}
      />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Account creation lands in a future feature.
      </p>
    </div>
  )
}
