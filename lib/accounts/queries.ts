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
 */

import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"

import { type CreateAccountInput, type UpdateActiveAccountInput } from "@/lib/accounts/schemas"

/** List all accounts owned by the given user. Optionally includes archived rows. */
export async function listAccountsForUser(userId: string, opts: { includeArchived: boolean }) {
  return prisma.account.findMany({
    where: opts.includeArchived ? { userId } : { userId, archivedAt: null },
    orderBy: { name: "asc" },
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
