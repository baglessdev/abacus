import { type Account } from "@prisma/client"

/**
 * AccountDTO — the serializable shape returned over the React server-component boundary.
 * Decimal → canonical decimal string; Date → ISO-8601 UTC string.
 * Why string for startingBalance: research.md R2 (Decimal is not POJO-serializable).
 *
 * Feature 007 (T020): adds `balance` field — the live computed balance:
 *   balance = startingBalance + Σ(non-archived transaction amounts)
 * Computation happens in lib/accounts/queries.ts using sumAmountsForAccountsBatch.
 * This field replaces the deferred promise from feature 004 FR-017.
 */
export type AccountDTO = {
  id: string
  userId: string
  name: string
  type: "CHECKING" | "SAVINGS" | "CREDIT" | "CASH" | "INVESTMENT" | "OTHER"
  currency: string // ISO 4217 alpha-3
  startingBalance: string // canonical decimal string ("1250.00", "-500.00", "0")
  balance: string // live computed balance: startingBalance + Σ(non-archived amounts) — feature 007 FR-017/FR-019a
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string // ISO 8601 UTC
  updatedAt: string // ISO 8601 UTC
}

/**
 * Converts a Prisma Account row to an AccountDTO, optionally with a computed balance.
 * No business logic — purely structural transformation.
 *
 * balance: if provided (computed by listAccountsForUser via sumAmountsForAccountsBatch),
 *   it is the live balance string. If not provided, falls back to startingBalance
 *   (preserving backward compatibility for any call sites that don't pass a balance).
 *
 * FR-017/FR-019a: balance = startingBalance + Σ(non-archived transaction amounts).
 */
export function serializeAccount(row: Account, computedBalance?: string): AccountDTO {
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
    // Live balance: provided by the queries layer after the sumAmountsForAccountsBatch round-trip.
    // Falls back to startingBalance for backward compatibility (zero-transaction accounts = same value).
    balance: computedBalance ?? row.startingBalance.toString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
