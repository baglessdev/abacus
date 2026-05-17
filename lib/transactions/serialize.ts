import { type Transaction } from "@prisma/client"

/**
 * TransactionDTO — the serializable shape returned over the React server-component boundary.
 * Decimal → canonical decimal string; Date → ISO string.
 * Matches the DTO shape documented in contracts/README.md.
 *
 * Why string for amount: same reasoning as AccountDTO.startingBalance (research.md R2):
 * Prisma.Decimal is not POJO-serializable; strings cross the RSC boundary safely.
 */
export type TransactionDTO = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  date: string // ISO 8601 date-only ("2026-05-17") — calendar-day
  amount: string // canonical signed decimal string ("-87.43", "3200.00", "-500.00", "500.00")
  currency: string // ISO 4217 alpha-3, uppercase
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  payee: string | null
  notes: string | null
  transferGroupId: string | null // null for INCOME/EXPENSE; non-null for TRANSFER legs
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string // ISO 8601 UTC, full precision
  updatedAt: string // ISO 8601 UTC, full precision
}

/**
 * Transfer pair DTO — both legs returned together from createTransfer / updateTransfer.
 * source: amount < 0 (from-account leg)
 * destination: amount > 0 (to-account leg)
 */
export type TransferPairDTO = {
  source: TransactionDTO
  destination: TransactionDTO
}

/**
 * Converts a Prisma Transaction row to a TransactionDTO.
 * No business logic — purely structural transformation (FR-028 pattern).
 *
 * Decimal → .toString() for canonical decimal string (same pattern as serializeAccount).
 * date (DATE column, returned as Date object) → toISOString().slice(0, 10) for "YYYY-MM-DD".
 * createdAt / updatedAt → .toISOString() for full UTC timestamp.
 */
export function serializeTransaction(row: Transaction): TransactionDTO {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    // @db.Date is returned by Prisma as a Date object at UTC midnight. Slice to "YYYY-MM-DD".
    date: row.date.toISOString().slice(0, 10),
    amount: row.amount.toString(),
    currency: row.currency,
    type: row.type,
    payee: row.payee,
    notes: row.notes,
    transferGroupId: row.transferGroupId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
