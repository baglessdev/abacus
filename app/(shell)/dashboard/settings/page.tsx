import { EmptyState } from "@/components/shell/empty-state"
import { SettingsIllustration } from "@/components/illustrations/settings-illustration"

export default function SettingsPage() {
  return (
    <EmptyState
      illustration={<SettingsIllustration className="h-32 w-32 text-primary" />}
      title="Settings are coming soon"
      description="Update your profile, change your password, and manage your preferences."
    />
  )
}
