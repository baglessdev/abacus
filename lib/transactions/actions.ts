"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/lib/auth"
import {
  errorEnvelope,
  type TransactionErrorEnvelope,
  CurrencyMismatchError,
  TransferCrossCurrencyError,
  ArchivedAccountTransferBlockedError,
} from "@/lib/transactions/errors"
import {
  createTransactionSchema,
  createTransferSchema,
  updateTransactionSchema,
  updateTransferSchema,
  archiveTransactionSchema,
  unarchiveTransactionSchema,
} from "@/lib/transactions/schemas"
import {
  listTransactionsForUser,
  getTransactionForUser,
  createTransactionForUser,
  createTransferForUser,
  updateTransactionForUser,
  updateTransferForUser,
  setArchivedAtForUser,
  type ListTransactionsFilters,
} from "@/lib/transactions/queries"
import {
  serializeTransaction,
  type TransactionDTO,
  type TransferPairDTO,
} from "@/lib/transactions/serialize"

/**
 * lib/transactions/actions.ts
 *
 * Seven "use server" server actions for the Transactions module.
 * Per-action flow (Principle III, FR-027):
 *   1. await auth() → on missing session return unauthenticated
 *   2. Zod safeParse(formData) → on failure return validation_failed with fieldErrors
 *   3. Call the relevant queries helper with session.user.id
 *   4. Catch domain errors → convert to typed envelopes
 *   5. On success → revalidatePath both /dashboard/transactions AND /dashboard/accounts
 *      (account balances change on every transaction mutation)
 *
 * userId is ALWAYS from session.user.id — NEVER from request input (FR-003).
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type CreateTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: TransactionErrorEnvelope }

type CreateTransferResult =
  | { data: { transfer: TransferPairDTO } }
  | { error: TransactionErrorEnvelope }

type UpdateTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: TransactionErrorEnvelope }

type UpdateTransferResult =
  | { data: { transfer: TransferPairDTO } }
  | { error: TransactionErrorEnvelope }

type ArchiveTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: TransactionErrorEnvelope }

type UnarchiveTransactionResult =
  | { data: { transaction: TransactionDTO } }
  | { error: TransactionErrorEnvelope }

type ListTransactionsResult =
  | { data: { transactions: TransactionDTO[] } }
  | { error: TransactionErrorEnvelope }

/** Paths revalidated after every successful transaction mutation. */
const TRANSACTIONS_PATH = "/dashboard/transactions"
const ACCOUNTS_PATH = "/dashboard/accounts"

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

/**
 * Create a single INCOME or EXPENSE transaction for the session's user.
 * FR-001, FR-003..FR-013, FR-027, FR-028.
 */
export async function createTransaction(
  _prevState: CreateTransactionResult | null,
  formData: FormData,
): Promise<CreateTransactionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  const parsed = createTransactionSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") ?? "",
    date: formData.get("date"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    type: formData.get("type"),
    payee: formData.get("payee") ?? "",
    notes: formData.get("notes") ?? "",
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  try {
    const row = await createTransactionForUser(session.user.id, parsed.data)
    revalidatePath(TRANSACTIONS_PATH)
    revalidatePath(ACCOUNTS_PATH)
    return { data: { transaction: serializeTransaction(row) } }
  } catch (err) {
    if (err instanceof ArchivedAccountTransferBlockedError) {
      return errorEnvelope("archived_account_blocked", { field: "accountId" })
    }
    if (err instanceof CurrencyMismatchError) {
      return errorEnvelope("currency_mismatch", { field: "accountId" })
    }
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// createTransfer
// ---------------------------------------------------------------------------

/**
 * Atomically create two TRANSFER legs sharing a server-generated transferGroupId.
 * FR-003, FR-005, FR-006, FR-012, FR-014, FR-015, FR-027, FR-028.
 */
export async function createTransfer(
  _prevState: CreateTransferResult | null,
  formData: FormData,
): Promise<CreateTransferResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  const parsed = createTransferSchema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    notes: formData.get("notes") ?? "",
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  try {
    const { source, destination } = await createTransferForUser(session.user.id, parsed.data)
    revalidatePath(TRANSACTIONS_PATH)
    revalidatePath(ACCOUNTS_PATH)
    return {
      data: {
        transfer: {
          source: serializeTransaction(source),
          destination: serializeTransaction(destination),
        },
      },
    }
  } catch (err) {
    if (err instanceof TransferCrossCurrencyError) {
      // Covers both "distinct accounts" and "cross-currency" errors from the queries layer
      const msg = err.message
      if (msg.includes("different")) {
        return errorEnvelope("transfer_same_account")
      }
      return errorEnvelope("transfer_cross_currency")
    }
    if (err instanceof ArchivedAccountTransferBlockedError) {
      return errorEnvelope("archived_account_blocked", { field: "fromAccountId" })
    }
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// updateTransaction
// ---------------------------------------------------------------------------

/**
 * Update a single INCOME or EXPENSE transaction owned by the session's user.
 * Rejects TRANSFER rows (use updateTransfer for those).
 * FR-002..FR-011, FR-013, FR-016, FR-027.
 */
export async function updateTransaction(
  _prevState: UpdateTransactionResult | null,
  formData: FormData,
): Promise<UpdateTransactionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  const parsed = updateTransactionSchema.safeParse({
    id: formData.get("id"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") ?? "",
    date: formData.get("date"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    type: formData.get("type"),
    payee: formData.get("payee") ?? "",
    notes: formData.get("notes") ?? "",
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Pre-fetch to check ownership
  const existing = await getTransactionForUser(session.user.id, parsed.data.id)
  if (!existing) {
    return errorEnvelope("not_found")
  }

  try {
    const { id, ...patch } = parsed.data
    const updated = await updateTransactionForUser(session.user.id, id, { id, ...patch })
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(TRANSACTIONS_PATH)
    revalidatePath(ACCOUNTS_PATH)
    return { data: { transaction: serializeTransaction(updated) } }
  } catch (err) {
    if (err instanceof ArchivedAccountTransferBlockedError) {
      return errorEnvelope("archived_account_blocked", { field: "accountId" })
    }
    if (err instanceof CurrencyMismatchError) {
      return errorEnvelope("currency_mismatch", { field: "accountId" })
    }
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// updateTransfer
// ---------------------------------------------------------------------------

/**
 * Atomically update both legs of an existing TRANSFER pair.
 * FR-003, FR-005, FR-007, FR-012, FR-015, FR-016, FR-027.
 */
export async function updateTransfer(
  _prevState: UpdateTransferResult | null,
  formData: FormData,
): Promise<UpdateTransferResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  const parsed = updateTransferSchema.safeParse({
    id: formData.get("id"),
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    notes: formData.get("notes") ?? "",
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Pre-fetch to check ownership
  const existing = await getTransactionForUser(session.user.id, parsed.data.id)
  if (!existing) {
    return errorEnvelope("not_found")
  }

  try {
    const result = await updateTransferForUser(session.user.id, parsed.data.id, parsed.data)
    if (!result) return errorEnvelope("not_found")
    revalidatePath(TRANSACTIONS_PATH)
    revalidatePath(ACCOUNTS_PATH)
    return {
      data: {
        transfer: {
          source: serializeTransaction(result.source),
          destination: serializeTransaction(result.destination),
        },
      },
    }
  } catch (err) {
    if (err instanceof TransferCrossCurrencyError) {
      const msg = err.message
      if (msg.includes("different")) {
        return errorEnvelope("transfer_same_account")
      }
      return errorEnvelope("transfer_cross_currency")
    }
    if (err instanceof ArchivedAccountTransferBlockedError) {
      return errorEnvelope("archived_account_blocked", { field: "fromAccountId" })
    }
    if (err instanceof CurrencyMismatchError) {
      return errorEnvelope("currency_mismatch", { field: "fromAccountId" })
    }
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// archiveTransaction
// ---------------------------------------------------------------------------

/**
 * Soft-archive a transaction (or transfer pair, cascading to both legs atomically).
 * archivedAt is set server-side — NEVER accepted from the client (FR-017, FR-018).
 * FR-003, FR-017, FR-018, FR-027.
 */
export async function archiveTransaction(
  _prevState: ArchiveTransactionResult | null,
  formData: FormData,
): Promise<ArchiveTransactionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  const parsed = archiveTransactionSchema.safeParse({
    id: formData.get("id"),
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  try {
    // Server-side timestamp — never from client (FR-017)
    const updated = await setArchivedAtForUser(session.user.id, parsed.data.id, new Date())
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(TRANSACTIONS_PATH)
    revalidatePath(ACCOUNTS_PATH)
    return { data: { transaction: serializeTransaction(updated) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// unarchiveTransaction
// ---------------------------------------------------------------------------

/**
 * Clear archivedAt for a transaction (or transfer pair, cascading to both legs atomically).
 * FR-003, FR-017, FR-018, FR-027.
 */
export async function unarchiveTransaction(
  _prevState: UnarchiveTransactionResult | null,
  formData: FormData,
): Promise<UnarchiveTransactionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  const parsed = unarchiveTransactionSchema.safeParse({
    id: formData.get("id"),
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  try {
    const updated = await setArchivedAtForUser(session.user.id, parsed.data.id, null)
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(TRANSACTIONS_PATH)
    revalidatePath(ACCOUNTS_PATH)
    return { data: { transaction: serializeTransaction(updated) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// listTransactions
// ---------------------------------------------------------------------------

/**
 * List transactions for the session's user with optional filters.
 * No Zod boundary for the typed in-process options object (Principle III).
 * FR-003, FR-019, FR-019a, FR-020, FR-026, FR-026a.
 */
export async function listTransactions(
  opts: ListTransactionsFilters = {},
): Promise<ListTransactionsResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  try {
    const rows = await listTransactionsForUser(session.user.id, opts)
    return { data: { transactions: rows.map(serializeTransaction) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}
