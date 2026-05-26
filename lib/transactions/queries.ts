/**
 * lib/transactions/queries.ts
 *
 * THIS IS THE ONLY FILE in the codebase that imports prisma.transaction.* directly.
 * (data-scoping convention, constitution v0.2.0, FR-003, plan.md §Data scoping)
 *
 * ONE DOCUMENTED EXCEPTION: lib/accounts/queries.ts imports `sumAmountsForAccountsBatch`
 * from this file for the live-balance computation on the accounts list. That call site
 * does NOT touch prisma.transaction.* directly; it consumes a function from this file.
 * (research.md R6, plan.md §Conventions check)
 *
 * Every helper takes `userId: string` as its FIRST positional argument — populated by the
 * calling server action from `session.user.id`, NEVER from request input (FR-003, FR-013).
 * Every Prisma `where:` clause includes `userId` so cross-user reads/writes collapse to
 * null or empty results, indistinguishable from "does not exist" (SC-010, FR-013).
 *
 * Atomicity guarantees (constitution Principle I):
 *   - createTransferForUser: prisma.$transaction — both legs or neither (FR-014)
 *   - updateTransferForUser: prisma.$transaction — both leg updates or neither (FR-016)
 *   - setArchivedAtForUser on TRANSFER: prisma.$transaction — both legs or neither (FR-018)
 */

import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { Money } from "@/lib/money/decimal"
import { getAccountForUser } from "@/lib/accounts/queries"
import {
  ArchivedAccountTransferBlockedError,
  CurrencyMismatchError,
  TransferCrossCurrencyError,
} from "@/lib/transactions/errors"
import { normalizeToUtcDay } from "@/lib/transactions/dates"
import {
  type CreateTransactionInput,
  type CreateTransferInput,
  type UpdateTransactionInput,
  type UpdateTransferInput,
} from "@/lib/transactions/schemas"

// ---------------------------------------------------------------------------
// listTransactionsForUser
// ---------------------------------------------------------------------------

/** Filters object for listTransactionsForUser. All fields are optional. */
export type ListTransactionsFilters = {
  dateFrom?: Date
  dateTo?: Date
  accountId?: string
  categoryId?: string
  type?: "INCOME" | "EXPENSE" | "TRANSFER"
  includeArchived?: boolean
  /** When set, limits the result to at most this many rows (applied via Prisma `take`). */
  limit?: number
}

/**
 * List transactions for the given user, applying optional filters.
 * Default sort: date DESC, createdAt DESC — deterministic, stable (FR-020).
 * Excludes archived rows unless includeArchived is true (FR-019).
 *
 * @param filters.limit — when set, applies Prisma `take: limit` to cap the result (feature 008,
 *   used by <RecentTransactionsWidget> with limit: 10). Absent or omitted → full result set
 *   returned, backward-compatible with all existing call sites from feature 007.
 */
export async function listTransactionsForUser(
  userId: string,
  filters: ListTransactionsFilters = {},
) {
  const where: Prisma.TransactionWhereInput = { userId }

  if (!filters.includeArchived) {
    where.archivedAt = null
  }
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    }
  }
  if (filters.accountId) {
    where.accountId = filters.accountId
  }
  if (filters.categoryId) {
    where.categoryId = filters.categoryId
  }
  if (filters.type) {
    where.type = filters.type
  }

  return prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    ...(filters.limit ? { take: filters.limit } : {}),
  })
}

// ---------------------------------------------------------------------------
// getTransactionForUser
// ---------------------------------------------------------------------------

/**
 * Fetch a single transaction owned by the given user, or null if not found / belongs
 * to another user. Cross-user reads collapse to null (SC-010, FR-013).
 */
export async function getTransactionForUser(userId: string, id: string) {
  return prisma.transaction.findFirst({
    where: { id, userId },
  })
}

// ---------------------------------------------------------------------------
// getTransferLegsForUser
// ---------------------------------------------------------------------------

/**
 * Fetch both legs of a transfer pair by transferGroupId + userId.
 * Returns an array of exactly 2 Transaction rows (or fewer if the invariant is broken).
 */
export async function getTransferLegsForUser(userId: string, transferGroupId: string) {
  return prisma.transaction.findMany({
    where: { userId, transferGroupId },
  })
}

// ---------------------------------------------------------------------------
// createTransactionForUser
// ---------------------------------------------------------------------------

/**
 * Insert a single INCOME or EXPENSE transaction.
 * Enforces:
 *   - Account exists and is owned by userId (cross-user reference collapses to not_found).
 *   - Account is not archived (ArchivedAccountTransferBlockedError).
 *   - currency === account.currency (CurrencyMismatchError).
 *
 * The `input.date` is already a `Date` object (normalized by the Zod schema's dateField).
 * The `input.amount` is a string (normalized by Zod but not yet a Money object).
 */
export async function createTransactionForUser(
  userId: string,
  input: CreateTransactionInput,
): Promise<Awaited<ReturnType<typeof prisma.transaction.create>>> {
  // Fetch and validate account (FR-005)
  const account = await getAccountForUser(userId, input.accountId)
  if (!account) {
    throw new CurrencyMismatchError("Account not found.")
  }
  if (account.archivedAt !== null) {
    throw new ArchivedAccountTransferBlockedError(
      `Account "${account.name}" is archived. Unarchive it before adding transactions.`,
    )
  }
  // Currency must match account (FR-007, research.md R2)
  if (input.currency !== account.currency) {
    throw new CurrencyMismatchError(
      `Transaction currency (${input.currency}) does not match account currency (${account.currency}).`,
    )
  }

  return prisma.transaction.create({
    data: {
      userId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      date: input.date,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      type: input.type,
      payee: input.payee ?? null,
      notes: input.notes ?? null,
      transferGroupId: null, // INCOME/EXPENSE never have a transferGroupId
    },
  })
}

// ---------------------------------------------------------------------------
// createTransferForUser
// ---------------------------------------------------------------------------

/**
 * Atomically insert two TRANSFER legs sharing a server-generated transferGroupId.
 * The `input.amount` is a positive magnitude string; the source leg is negated.
 *
 * Invariants enforced (FR-014, FR-015, research.md R3):
 *   - fromAccountId !== toAccountId
 *   - Both accounts exist, owned by userId, non-archived
 *   - Both accounts share the same currency (no cross-currency transfers in v1)
 *
 * Both rows are inserted inside prisma.$transaction so that EITHER BOTH persist OR NEITHER
 * does (constitution Principle I, FR-014).
 */
export async function createTransferForUser(
  userId: string,
  input: CreateTransferInput,
): Promise<{
  source: Awaited<ReturnType<typeof prisma.transaction.create>>
  destination: Awaited<ReturnType<typeof prisma.transaction.create>>
}> {
  // Guard: distinct accounts (FR-014)
  if (input.fromAccountId === input.toAccountId) {
    throw new TransferCrossCurrencyError("Source and destination accounts must be different.")
  }

  // Fetch both accounts (cross-user reference collapses to null → same as not_found)
  const [fromAccount, toAccount] = await Promise.all([
    getAccountForUser(userId, input.fromAccountId),
    getAccountForUser(userId, input.toAccountId),
  ])

  if (!fromAccount || fromAccount.archivedAt !== null) {
    throw new ArchivedAccountTransferBlockedError("Source account not found or archived.")
  }
  if (!toAccount || toAccount.archivedAt !== null) {
    throw new ArchivedAccountTransferBlockedError("Destination account not found or archived.")
  }
  // Currency invariant (FR-015)
  if (fromAccount.currency !== toAccount.currency) {
    throw new TransferCrossCurrencyError(
      `Cross-currency transfers are not supported. Source is ${fromAccount.currency}, destination is ${toAccount.currency}.`,
    )
  }

  const currency = fromAccount.currency
  const magnitude = new Money(input.amount)
  const date = normalizeToUtcDay(input.date)

  // Atomic two-leg insert (constitution Principle I, FR-014, research.md R3)
  return prisma.$transaction(async (tx) => {
    // server-generated UUID; never from client input (FR-012, data-model.md §transferGroupId choice)
    const transferGroupId = crypto.randomUUID()

    const source = await tx.transaction.create({
      data: {
        userId,
        accountId: input.fromAccountId,
        categoryId: null, // transfers have no category (FR-006)
        date,
        amount: magnitude.negated(), // source leg is negative
        currency,
        type: "TRANSFER",
        payee: null, // transfers have no payee (FR-024)
        notes: input.notes ?? null,
        transferGroupId,
      },
    })

    const destination = await tx.transaction.create({
      data: {
        userId,
        accountId: input.toAccountId,
        categoryId: null,
        date,
        amount: magnitude, // destination leg is positive
        currency,
        type: "TRANSFER",
        payee: null,
        notes: input.notes ?? null,
        transferGroupId,
      },
    })

    return { source, destination }
  })
}

// ---------------------------------------------------------------------------
// updateTransactionForUser
// ---------------------------------------------------------------------------

/**
 * Update a single INCOME or EXPENSE transaction.
 * Rejects TRANSFER rows (use updateTransferForUser instead — FR-016).
 * Enforces same account + currency rules as create.
 */
export async function updateTransactionForUser(
  userId: string,
  id: string,
  input: UpdateTransactionInput,
) {
  // Fetch existing row to verify ownership + type
  const existing = await getTransactionForUser(userId, id)
  if (!existing) return null

  // Reject TRANSFER rows (data-model.md §Data lifecycle)
  if (existing.type === "TRANSFER") {
    throw new CurrencyMismatchError(
      "This row is part of a transfer pair — use updateTransfer to edit both legs together.",
    )
  }

  // Validate account (same rules as create)
  const account = await getAccountForUser(userId, input.accountId)
  if (!account) {
    throw new CurrencyMismatchError("Account not found.")
  }
  if (account.archivedAt !== null) {
    throw new ArchivedAccountTransferBlockedError(
      `Account "${account.name}" is archived. Unarchive it before editing transactions against it.`,
    )
  }
  if (input.currency !== account.currency) {
    throw new CurrencyMismatchError(
      `Transaction currency (${input.currency}) does not match account currency (${account.currency}).`,
    )
  }

  // Belt-and-braces defense (per money-reviewer audit note (a)): explicitly require
  // existing.type !== "TRANSFER" in the where clause AND reject input.type === "TRANSFER".
  // The pre-fetch above already guards against editing a transfer leg via this path;
  // this layer prevents a tampered payload from relabeling a single-leg row as TRANSFER
  // (which would leave transferGroupId=null + type=TRANSFER, violating FR-012's invariant).
  if (input.type === "TRANSFER") {
    throw new CurrencyMismatchError(
      "Cannot change a single-leg transaction's type to TRANSFER. Use createTransfer instead.",
    )
  }

  const result = await prisma.transaction.updateMany({
    where: { id, userId, type: { not: "TRANSFER" } },
    data: {
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      date: input.date,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      type: input.type,
      payee: input.payee ?? null,
      notes: input.notes ?? null,
    },
  })

  if (result.count === 0) return null
  return prisma.transaction.findFirst({ where: { id, userId } })
}

// ---------------------------------------------------------------------------
// updateTransferForUser
// ---------------------------------------------------------------------------

/**
 * Atomically update both legs of an existing TRANSFER pair.
 * Identifies the row by `id` (either leg), then fetches both via transferGroupId.
 * Both leg updates are wrapped in prisma.$transaction (FR-016, research.md R3).
 */
export async function updateTransferForUser(
  userId: string,
  id: string,
  input: UpdateTransferInput,
) {
  // Fetch the anchor leg (either leg of the pair)
  const existing = await getTransactionForUser(userId, id)
  if (!existing) return null

  if (existing.type !== "TRANSFER" || !existing.transferGroupId) {
    throw new CurrencyMismatchError(
      "This row is not a transfer pair — use updateTransaction for single-leg edits.",
    )
  }

  // Fetch both legs
  const legs = await getTransferLegsForUser(userId, existing.transferGroupId)
  if (legs.length !== 2) {
    throw new Error(
      `Transfer pair invariant violated: expected 2 legs for transferGroupId=${existing.transferGroupId}, found ${legs.length}.`,
    )
  }

  // Validate both new accounts
  if (input.fromAccountId === input.toAccountId) {
    throw new TransferCrossCurrencyError("Source and destination accounts must be different.")
  }

  const [fromAccount, toAccount] = await Promise.all([
    getAccountForUser(userId, input.fromAccountId),
    getAccountForUser(userId, input.toAccountId),
  ])

  if (!fromAccount || fromAccount.archivedAt !== null) {
    throw new ArchivedAccountTransferBlockedError("Source account not found or archived.")
  }
  if (!toAccount || toAccount.archivedAt !== null) {
    throw new ArchivedAccountTransferBlockedError("Destination account not found or archived.")
  }
  // Currency invariant (the existing transfer's currency is the constraint — cannot swap
  // to a different-currency account even if both new accounts share the same currency)
  if (fromAccount.currency !== existing.currency) {
    throw new CurrencyMismatchError(
      `Cannot change to a different-currency account. Transfer currency is ${existing.currency}.`,
    )
  }
  if (toAccount.currency !== existing.currency) {
    throw new CurrencyMismatchError(
      `Cannot change to a different-currency account. Transfer currency is ${existing.currency}.`,
    )
  }
  if (fromAccount.currency !== toAccount.currency) {
    throw new TransferCrossCurrencyError(
      "Cross-currency transfers are not supported in this version.",
    )
  }

  const magnitude = new Money(input.amount)
  const date = normalizeToUtcDay(input.date)

  // Identify source (negative amount) and destination (positive amount) legs
  const sourceLeg = legs.find((l) => new Money(l.amount).isNegative())
  const destLeg = legs.find((l) => !new Money(l.amount).isNegative())

  if (!sourceLeg || !destLeg) {
    throw new Error(
      "Transfer pair invariant violated: cannot identify source and destination legs.",
    )
  }

  return prisma.$transaction(async (tx) => {
    const updatedSource = await tx.transaction.update({
      where: { id: sourceLeg.id },
      data: {
        accountId: input.fromAccountId,
        amount: magnitude.negated(),
        date,
        notes: input.notes ?? null,
        // currency / type / transferGroupId / categoryId / userId / payee are NEVER changed
      },
    })

    const updatedDest = await tx.transaction.update({
      where: { id: destLeg.id },
      data: {
        accountId: input.toAccountId,
        amount: magnitude,
        date,
        notes: input.notes ?? null,
      },
    })

    return { source: updatedSource, destination: updatedDest }
  })
}

// ---------------------------------------------------------------------------
// setArchivedAtForUser
// ---------------------------------------------------------------------------

/**
 * Set or clear `archivedAt` for a transaction owned by the given user.
 * Auto-detects: if the row is a TRANSFER, archives BOTH legs atomically via the
 * shared transferGroupId inside prisma.$transaction (FR-018, research.md R13).
 * If not a TRANSFER, updates just the single row.
 */
export async function setArchivedAtForUser(userId: string, id: string, value: Date | null) {
  const row = await getTransactionForUser(userId, id)
  if (!row) return null

  if (row.type === "TRANSFER" && row.transferGroupId) {
    // Archive / unarchive BOTH transfer legs atomically (FR-018)
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { userId, transferGroupId: row.transferGroupId },
        data: { archivedAt: value },
      })
    })
    // Return the anchor row after the update
    return prisma.transaction.findFirst({ where: { id, userId } })
  }

  // Single-leg archive (INCOME or EXPENSE)
  const result = await prisma.transaction.updateMany({
    where: { id, userId },
    data: { archivedAt: value },
  })

  if (result.count === 0) return null
  return prisma.transaction.findFirst({ where: { id, userId } })
}

// ---------------------------------------------------------------------------
// sumIncomeExpenseByCurrencyForUser
// ---------------------------------------------------------------------------

/**
 * Aggregate INCOME and EXPENSE transaction amounts by currency for the given user
 * within the provided date range [dateFrom, dateTo).
 *
 * TRANSFER rows are excluded at the SQL WHERE level (FR-010, FR-015).
 * Archived rows are excluded (FR-013, archivedAt: null).
 *
 * Returns one row per (currency, type) combination. Each row's _sum.amount is lifted
 * from Prisma Decimal|null to Money at the boundary (null → new Money(0)).
 *
 * Consumed by: <CashFlowWidget> via buildCashFlowShape() from lib/dashboard/aggregations.ts.
 *
 * @param userId - must come from session.user.id (data-scoping convention)
 * @param dateFrom - UTC midnight of the 1st of the target calendar month (inclusive)
 * @param dateTo - UTC midnight of the 1st of the next calendar month (exclusive)
 */
export async function sumIncomeExpenseByCurrencyForUser(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<CashFlowAggregateRow[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["currency", "type"],
    where: {
      userId,
      type: { in: ["INCOME", "EXPENSE"] },
      archivedAt: null,
      date: { gte: dateFrom, lt: dateTo },
    },
    _sum: { amount: true },
  })

  return rows.map((r) => ({
    currency: r.currency,
    type: r.type as "INCOME" | "EXPENSE",
    _sum: { amount: r._sum.amount != null ? new Money(r._sum.amount) : new Money(0) },
  }))
}

/** Row shape returned by sumIncomeExpenseByCurrencyForUser and consumed by buildCashFlowShape. */
export type CashFlowAggregateRow = {
  currency: string
  type: "INCOME" | "EXPENSE"
  _sum: { amount: Money }
}

// ---------------------------------------------------------------------------
// sumAmountsForAccount
// ---------------------------------------------------------------------------

/**
 * Compute the aggregate SUM of non-archived transaction amounts for a single account.
 * Returns Money(0) when there are no matching transactions.
 *
 * Used by the balance computation: balance = startingBalance + sumAmountsForAccount(...)
 * (FR-019a, data-model.md §Balance computation formula)
 *
 * N+1 note: for lists of accounts, prefer sumAmountsForAccountsBatch (single round-trip).
 */
export async function sumAmountsForAccount(userId: string, accountId: string): Promise<Money> {
  const result = await prisma.transaction.aggregate({
    where: { userId, accountId, archivedAt: null },
    _sum: { amount: true },
  })
  // _sum.amount is null when there are no matching rows — default to zero (FR-019a)
  return result._sum.amount != null ? new Money(result._sum.amount) : new Money(0)
}

// ---------------------------------------------------------------------------
// getMostUsedExpenseCurrencyForUser (feature 009 — budget default-currency helper)
// ---------------------------------------------------------------------------

/**
 * Returns the most-frequently-used currency of non-archived EXPENSE transactions
 * in the last `sinceDays` days for the given user. Used by the create-budget form
 * to suggest a sensible default currency (R4, Clarification Q2).
 *
 * Tie-break: alphabetically-first currency wins (deterministic via orderBy currency asc).
 *
 * @param userId - must come from session.user.id (data-scoping convention)
 * @param sinceDays - defaults to 90 per Clarification Q2
 */
export async function getMostUsedExpenseCurrencyForUser(
  userId: string,
  sinceDays = 90,
): Promise<string | null> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - sinceDays)
  since.setUTCHours(0, 0, 0, 0)

  const rows = await prisma.transaction.groupBy({
    by: ["currency"],
    where: {
      userId,
      type: "EXPENSE",
      archivedAt: null,
      date: { gte: since },
    },
    _count: { _all: true },
    orderBy: [
      { _count: { currency: "desc" } }, // most COUNT first
      { currency: "asc" }, // tie-break: alphabetical
    ],
    take: 1,
  })

  return rows[0]?.currency ?? null
}

// ---------------------------------------------------------------------------
// sumExpenseByCategoryForBudgetsForUser (feature 009 — batched actuals aggregation)
// ---------------------------------------------------------------------------

/** Row shape returned by sumExpenseByCategoryForBudgetsForUser. */
export type BudgetActualsRow = {
  categoryId: string
  currency: string
  /** Lifted from Prisma Decimal|null to Money at the boundary. EXPENSE sums are negative per signed-amount convention. */
  _sum: { amount: Money }
}

/**
 * Aggregate EXPENSE actuals per (categoryId, currency) over a date range.
 * Used by the budgets module to compute actuals for all budgets sharing the same
 * period window in a SINGLE Prisma groupBy round-trip (R3).
 *
 * Short-circuits if categoryIds or currencies is empty (no round-trip).
 *
 * NOTE: The returned _sum.amount carries the stored negative sign for EXPENSE rows.
 * The CALLER applies .abs() before storing in the actuals Map (FR-010 second sentence).
 *
 * @param userId - must come from session.user.id (data-scoping convention)
 * @param dateFrom - UTC midnight (inclusive)
 * @param dateTo - UTC midnight of first-of-next-period (exclusive)
 * @param categoryIds - restrict to these budgeted categories
 * @param currencies - restrict to these budgeted currencies
 */
export async function sumExpenseByCategoryForBudgetsForUser(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  categoryIds: string[],
  currencies: string[],
): Promise<BudgetActualsRow[]> {
  if (categoryIds.length === 0 || currencies.length === 0) return []

  const rows = await prisma.transaction.groupBy({
    by: ["categoryId", "currency"],
    where: {
      userId,
      type: "EXPENSE",
      archivedAt: null,
      date: { gte: dateFrom, lt: dateTo },
      categoryId: { in: categoryIds },
      currency: { in: currencies },
    },
    _sum: { amount: true },
  })

  return rows
    .filter((r) => r.categoryId !== null)
    .map((r) => ({
      categoryId: r.categoryId as string,
      currency: r.currency,
      _sum: {
        amount: r._sum.amount != null ? new Money(r._sum.amount) : new Money(0),
      },
    }))
}

// ---------------------------------------------------------------------------
// sumAmountsForAccountsBatch
// ---------------------------------------------------------------------------

/**
 * Compute the aggregate SUM of non-archived transaction amounts for a SET of accounts
 * in a single Prisma groupBy round-trip (N+1 mitigation, research.md R7).
 *
 * Returns a Map<accountId, Money>. Accounts not present in the result map had zero
 * matching transactions — callers should use `deltaMap.get(id) ?? new Money(0)`.
 *
 * Consumed by lib/accounts/queries.ts for the live-balance computation on the accounts list.
 * This is the DOCUMENTED cross-module exception: lib/accounts/queries.ts calls this helper
 * (a function from the canonical-owner module), NOT prisma.transaction.* directly.
 * (research.md R6, plan.md §Conventions check, data-model.md §Data-scoping enforcement)
 */
export async function sumAmountsForAccountsBatch(
  userId: string,
  accountIds: string[],
): Promise<Map<string, Money>> {
  if (accountIds.length === 0) return new Map()

  const rows = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: {
      userId,
      accountId: { in: accountIds },
      archivedAt: null,
    },
    _sum: { amount: true },
  })

  const deltaMap = new Map<string, Money>()
  for (const row of rows) {
    deltaMap.set(row.accountId, row._sum.amount != null ? new Money(row._sum.amount) : new Money(0))
  }
  return deltaMap
}
