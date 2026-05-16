import { ArrowLeftRight } from "lucide-react"

import { EmptyState } from "@/components/shell/empty-state"

export default function TransactionsPage() {
  return (
    <EmptyState
      title="No transactions yet"
      description="Transactions record money moving in or out of an account. This feature is pending."
      icon={ArrowLeftRight}
    />
  )
}
