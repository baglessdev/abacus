import { auth } from "@/lib/auth"
import { listAccounts } from "@/lib/accounts"
import { AbacusIllustration } from "@/components/illustrations/abacus-illustration"
import { EmptyState } from "@/components/shell/empty-state"

/**
 * WelcomePanel — server component for the /dashboard home route.
 * Fetches the session and account count, then renders the upgraded EmptyState
 * with the AbacusIllustration and personalised copy (FR-022).
 *
 * No "use client" directive — this MUST remain a Server Component so it can
 * await auth() and listAccounts(...) at render time. The middleware already
 * guards /dashboard/* so session null is handled defensively, not normally.
 */
export async function WelcomePanel() {
  // Fetch session — middleware guarantees a session here, but we handle null defensively.
  const session = await auth()
  const displayName = session?.user?.email?.split("@")[0] ?? "there"

  // Fetch account count — fall through gracefully on error.
  const result = await listAccounts({ includeArchived: false })
  const accountCount = "error" in result ? 0 : result.data.accounts.length
  const hasAccounts = !("error" in result) && accountCount > 0

  const description = hasAccounts
    ? `You're tracking ${accountCount} account${accountCount === 1 ? "" : "s"}. Transactions, budgets, and reports are on the way.`
    : "Track your accounts, set budgets, and see where your money goes. Add your first account to get started."

  const actionLabel = hasAccounts ? "Manage your accounts" : "Add your first account"

  return (
    <EmptyState
      illustration={<AbacusIllustration className="h-32 w-32 text-primary" />}
      title={`Welcome to Abacus, ${displayName}`}
      description={description}
      action={{ label: actionLabel, href: "/dashboard/accounts" }}
    />
  )
}
