import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { listAccounts } from "@/lib/accounts/actions"
import { AccountsList } from "./_components/accounts-list"

/**
 * /dashboard/accounts — server component.
 * Defense-in-depth auth check (middleware already guards this route).
 * Fetches the user's active accounts and passes them to the client component.
 * FR-018 (replaces placeholder), FR-019 (side sheet), FR-010 (empty state).
 */
export default async function AccountsPage() {
  // Defense-in-depth: verify session (middleware already does this)
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login?from=/dashboard/accounts")
  }

  const result = await listAccounts({ includeArchived: false })

  if ("error" in result) {
    if (result.error.code === "unauthenticated") {
      redirect("/login?from=/dashboard/accounts")
    }
    // internal_error — bubble to error.tsx
    throw new Error(result.error.message)
  }

  return <AccountsList initialAccounts={result.data.accounts} />
}
