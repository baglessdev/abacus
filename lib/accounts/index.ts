import "server-only"

// Server-only barrel for lib/accounts/ — all exports here require a server context.
// Phase 3 UI components import from this path.

export {
  createAccount,
  updateAccount,
  archiveAccount,
  unarchiveAccount,
  listAccounts,
} from "@/lib/accounts/actions"

export type { AccountDTO } from "@/lib/accounts/serialize"

export type { ErrorCode, ErrorEnvelope } from "@/lib/accounts/errors"

export { ACCOUNT_TYPES } from "@/lib/accounts/schemas"
export type { AccountTypeValue } from "@/lib/accounts/schemas"
