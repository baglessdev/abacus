import { Wallet } from "lucide-react"

import { EmptyState } from "@/components/shell/empty-state"

export default function AccountsPage() {
  return (
    <EmptyState
      title="No accounts yet"
      description="Accounts are how Abacus knows where your money lives. This feature is pending — check back in a future release."
      icon={Wallet}
    />
  )
}
