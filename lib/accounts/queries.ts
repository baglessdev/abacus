/**
 * lib/accounts/queries.ts
 *
 * This is the ONLY file in the codebase that imports prisma.account.* (data-scoping convention,
 * constitution v0.2.0, research.md R15, FR-003, FR-013).
 *
 * Every helper takes `userId: string` as its FIRST positional argument — populated by the
 * calling server action from `session.user.id`, never from request input (FR-013, plan §Cross-user
 * isolation pattern). Every Prisma `where:` clause includes `userId`, so cross-user attempts
 * collapse to `null` indistinguishably from "row does not exist" (SC-008, FR-013).
 *
 * Feature 007 (T020): `listAccountsForUser` now calls `sumAmountsForAccountsBatch` from
 * `lib/transactions/queries` in a SINGLE additional round-trip to compute live balances.
 * This is the DOCUMENTED cross-module exception: this file consumes a FUNCTION from the
 * canonical transaction-owner module — it does NOT touch prisma.transaction.* directly.
 * (research.md R6, plan.md §Conventions check, data-model.md §Data-scoping enforcement)
 */

import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { Money } from "@/lib/money/decimal"
// Documented cross-module exception: importing a function (not prisma.transaction.*) from
// the canonical transaction-owner module for the live-balance computation (research.md R6).
import { sumAmountsForAccountsBatch } from "@/lib/transactions/queries"

import { type CreateAccountInput, type UpdateActiveAccountInput } from "@/lib/accounts/schemas"
import { serializeAccount } from "@/lib/accounts/serialize"

/** List all accounts owned by the given user. Optionally includes archived rows.
 *
 * Feature 007 (T020): computes live balances via a single sumAmountsForAccountsBatch
 * call (one groupBy round-trip for all accounts). The returned array now includes
 * serialized AccountDTOs with balance = startingBalance + Σ(non-archived amounts).
 *
 * FR-017, FR-019a: balance = startingBalance + Σ(non-archived transaction amounts).
 */
export async function listAccountsForUser(userId: string, opts: { includeArchived: boolean }) {
  const accounts = await prisma.account.findMany({
    where: opts.includeArchived ? { userId } : { userId, archivedAt: null },
    orderBy: { name: "asc" },
  })

  // One groupBy round-trip for all accounts (N+1 mitigation, research.md R7).
  const accountIds = accounts.map((a) => a.id)
  const deltaMap = await sumAmountsForAccountsBatch(userId, accountIds)

  // Attach live balance to each account (FR-017, FR-019a, constitution Principle I).
  // balance = startingBalance + Σ(non-archived amounts for that account)
  return accounts.map((a) => {
    const startingBalance = new Money(a.startingBalance)
    const delta = deltaMap.get(a.id) ?? new Money(0)
    const balance = startingBalance.plus(delta)
    return serializeAccount(a, balance.toString())
  })
}

/** Fetch a single account owned by the given user, or null if not found / belongs to another user. */
export async function getAccountForUser(userId: string, accountId: string) {
  return prisma.account.findFirst({
    where: { id: accountId, userId },
  })
}

/** Insert a new account row for the given user. */
export async function createAccountForUser(userId: string, input: CreateAccountInput) {
  return prisma.account.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      startingBalance: new Prisma.Decimal(input.startingBalance),
    },
  })
}

/**
 * Apply a patch to an active account owned by the given user.
 * Returns null if the account does not exist or belongs to another user.
 */
export async function updateAccountForUser(
  userId: string,
  accountId: string,
  patch: UpdateActiveAccountInput | { name: string },
) {
  // Build the data payload — only include fields present in the patch.
  const data: Prisma.AccountUpdateInput = { name: patch.name }

  if ("type" in patch && "startingBalance" in patch) {
    data.type = patch.type
    data.startingBalance = new Prisma.Decimal(patch.startingBalance)
  }

  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data,
  })

  if (result.count === 0) return null

  return prisma.account.findFirst({ where: { id: accountId, userId } })
}

/**
 * Set or clear `archivedAt` for an account owned by the given user.
 * Returns null if the account does not exist or belongs to another user.
 * Used by both archiveAccount (value = new Date()) and unarchiveAccount (value = null).
 */
export async function setArchivedAtForUser(
  userId: string,
  accountId: string,
  archivedAt: Date | null,
) {
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archivedAt },
  })

  if (result.count === 0) return null

  return prisma.account.findFirst({ where: { id: accountId, userId } })
}
