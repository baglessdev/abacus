import "server-only"

// Server-only barrel for lib/transactions/ — all exports here require a server context.
// Phase 3+ UI components import from this path.

export {
  createTransaction,
  createTransfer,
  updateTransaction,
  updateTransfer,
  archiveTransaction,
  unarchiveTransaction,
  listTransactions,
} from "@/lib/transactions/actions"

export type { TransactionDTO, TransferPairDTO } from "@/lib/transactions/serialize"

export type { TransactionErrorCode, TransactionErrorEnvelope } from "@/lib/transactions/errors"
