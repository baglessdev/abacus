import { Settings } from "lucide-react"

import { EmptyState } from "@/components/shell/empty-state"

export default function SettingsPage() {
  return (
    <EmptyState
      title="Settings"
      description="Profile, preferences, and data export will land in a future feature."
      icon={Settings}
    />
  )
}
