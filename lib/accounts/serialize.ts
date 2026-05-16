import { type Account } from "@prisma/client"

/**
 * AccountDTO — the serializable shape returned over the React server-component boundary.
 * Decimal → canonical decimal string; Date → ISO-8601 UTC string.
 * Why string for startingBalance: research.md R2 (Decimal is not POJO-serializable).
 */
export type AccountDTO = {
  id: string
  userId: string
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT" | "CASH" | "INVESTMENT" | "OTHER"
  currency: string // ISO 4217 alpha-3
  startingBalance: string // canonical decimal string ("1250.00", "-500.00", "0")
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string // ISO 8601 UTC
  updatedAt: string // ISO 8601 UTC
}

/**
 * Converts a Prisma Account row to an AccountDTO.
 * No business logic — purely structural transformation.
 * FR-017: balance = startingBalance + sum(transactions). Transactions do not exist yet (feature 006),
 * so the displayed balance equals startingBalance. When feature 006 lands, it extends this serializer
 * or replaces the balance field without changing the rest of the DTO shape.
 */
export function serializeAccount(row: Account): AccountDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    currency: row.currency,
    // .toFixed() preserves precision and ensures trailing zeros per the currency's convention
    // are NOT forced here (the formatter in lib/money/format.ts handles display precision).
    // We use toString() to get the canonical decimal string; callers use formatAmount for display.
    startingBalance: row.startingBalance.toString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
