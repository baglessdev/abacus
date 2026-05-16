import { Compass } from "lucide-react"

import { AppShell } from "@/components/shell/app-shell"
import { EmptyState } from "@/components/shell/empty-state"

export default function NotFound() {
  return (
    <AppShell>
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        icon={Compass}
        action={{ label: "Back to dashboard", href: "/" }}
      />
    </AppShell>
  )
}
