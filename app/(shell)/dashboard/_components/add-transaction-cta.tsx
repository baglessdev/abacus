/**
 * app/(shell)/dashboard/_components/add-transaction-cta.tsx
 *
 * Server component — pure-render, no async dependency (FR-035, FR-036).
 *
 * Props:
 *   disabled?: boolean — when true, renders a disabled button + helper text
 *                        pointing the user to /dashboard/accounts (FR-024).
 *
 * Disabled-state notes:
 *   In v1, the dashboard page server component always passes disabled={false}
 *   (or omits the prop entirely) because the no-accounts code path renders
 *   <WelcomePanel /> INSTEAD OF the four-widget layout (FR-003). The four-widget
 *   layout — which includes this CTA — is only reached when accountCount > 0.
 *   Therefore the disabled={true} branch is structurally unreachable in the current
 *   page composition. It exists for future-flexibility per the dashboard-page contract
 *   (e.g., a future inline-form mode or a mid-render account-count mismatch).
 *
 * FR-022, FR-023, FR-024, FR-029, FR-032, FR-035, FR-036.
 */

import Link from "next/link"
import { Button } from "@/components/ui/button"

interface AddTransactionCtaProps {
  disabled?: boolean
}

/**
 * Primary "Add transaction" call-to-action for the dashboard.
 *
 * Enabled (default): a primary-styled link-button navigating to /dashboard/transactions.
 * Disabled: a non-interactive disabled button + helper text linking to /dashboard/accounts.
 *           (Structurally unreachable in v1 — see module-level note above.)
 */
export function AddTransactionCta({ disabled = false }: AddTransactionCtaProps) {
  if (disabled) {
    return (
      <div className="flex flex-col gap-1.5">
        {/* Disabled button — not wrapping a <Link> since a disabled button must not navigate */}
        <Button disabled aria-disabled="true">
          + Add transaction
        </Button>
        <p className="text-sm text-muted-foreground">
          Add an account first —{" "}
          <Link href="/dashboard/accounts" className="underline underline-offset-4">
            go to accounts
          </Link>
        </p>
      </div>
    )
  }

  // Enabled path: primary-styled link. The underlying <Link> is naturally keyboard-focusable
  // and the shadcn <Button> styling preserves the project's focus ring (FR-029).
  return (
    <Button asChild>
      <Link href="/dashboard/transactions">+ Add transaction</Link>
    </Button>
  )
}
