"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/lib/auth"
import { errorEnvelope } from "@/lib/accounts/errors"
import { type ErrorEnvelope } from "@/lib/accounts/errors"
import {
  createAccountSchema,
  makeUpdateActiveAccountSchema,
  updateArchivedAccountSchema,
  archiveAccountSchema,
  unarchiveAccountSchema,
} from "@/lib/accounts/schemas"
import {
  listAccountsForUser,
  getAccountForUser,
  createAccountForUser,
  updateAccountForUser,
  setArchivedAtForUser,
} from "@/lib/accounts/queries"
import { serializeAccount, type AccountDTO } from "@/lib/accounts/serialize"

// --- Result types ---

type CreateAccountResult = { data: { account: AccountDTO } } | { error: ErrorEnvelope }
type UpdateAccountResult = { data: { account: AccountDTO } } | { error: ErrorEnvelope }
type ArchiveAccountResult = { data: { account: AccountDTO } } | { error: ErrorEnvelope }
type UnarchiveAccountResult = { data: { account: AccountDTO } } | { error: ErrorEnvelope }
type ListAccountsResult = { data: { accounts: AccountDTO[] } } | { error: ErrorEnvelope }

/** Re-usable path that every mutation revalidates after success. */
const ACCOUNTS_PATH = "/dashboard/accounts"

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

/**
 * Create a new account for the session's user.
 * FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-014, FR-015, FR-016, FR-021.
 */
export async function createAccount(
  _prevState: CreateAccountResult | null,
  formData: FormData,
): Promise<CreateAccountResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const parsed = createAccountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    startingBalance: formData.get("startingBalance"),
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Step 3: Persist
  try {
    const row = await createAccountForUser(session.user.id, parsed.data)
    revalidatePath(ACCOUNTS_PATH)
    return { data: { account: serializeAccount(row) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

/**
 * Update an existing account owned by the session's user.
 * Branches on the pre-fetched row's archivedAt to pick the right Zod schema (FR-009a).
 * Currency is never accepted from input (FR-007 — the schema omits it structurally).
 * FR-002..004, FR-006, FR-007, FR-009a, FR-013..016, FR-021.
 */
export async function updateAccount(
  _prevState: UpdateAccountResult | null,
  formData: FormData,
): Promise<UpdateAccountResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Extract id
  const rawId = formData.get("id")
  if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
    return errorEnvelope("validation_failed", {
      fieldErrors: { id: ["Missing account id"] },
    })
  }

  // Step 3: Pre-fetch the row to determine archivedAt and currency
  const row = await getAccountForUser(session.user.id, rawId.trim())
  if (!row) {
    return errorEnvelope("not_found")
  }

  // Step 4: Check for archived-field-locked violations before Zod parse
  // (so we return the dedicated error code rather than a generic validation_failed)
  if (row.archivedAt !== null) {
    const typeValue = formData.get("type")
    const balanceValue = formData.get("startingBalance")
    if (typeValue && typeValue !== row.type) {
      return errorEnvelope("archived_field_locked", { field: "type" })
    }
    if (balanceValue && balanceValue !== row.startingBalance.toString()) {
      return errorEnvelope("archived_field_locked", { field: "startingBalance" })
    }
  }

  // Step 5: Pick schema and parse
  if (row.archivedAt !== null) {
    // Archived account — name-only schema (FR-009a)
    const parsed = updateArchivedAccountSchema.safeParse({
      id: rawId.trim(),
      name: formData.get("name"),
    })

    if (!parsed.success) {
      return errorEnvelope("validation_failed", {
        fieldErrors: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const updated = await updateAccountForUser(session.user.id, rawId.trim(), {
        name: parsed.data.name,
      })
      if (!updated) return errorEnvelope("not_found")
      revalidatePath(ACCOUNTS_PATH)
      return { data: { account: serializeAccount(updated) } }
    } catch {
      return errorEnvelope("internal_error")
    }
  } else {
    // Active account — full schema with currency bound from the pre-fetched row
    const schema = makeUpdateActiveAccountSchema(row.currency)
    const parsed = schema.safeParse({
      id: rawId.trim(),
      name: formData.get("name"),
      type: formData.get("type"),
      startingBalance: formData.get("startingBalance"),
    })

    if (!parsed.success) {
      return errorEnvelope("validation_failed", {
        fieldErrors: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const updated = await updateAccountForUser(session.user.id, rawId.trim(), parsed.data)
      if (!updated) return errorEnvelope("not_found")
      revalidatePath(ACCOUNTS_PATH)
      return { data: { account: serializeAccount(updated) } }
    } catch {
      return errorEnvelope("internal_error")
    }
  }
}

// ---------------------------------------------------------------------------
// archiveAccount
// ---------------------------------------------------------------------------

/**
 * Set archivedAt = new Date() for an account owned by the session's user.
 * The timestamp is ALWAYS set server-side — never accepted from the client (FR-008).
 * FR-002, FR-003, FR-008, FR-013..015, FR-021.
 */
export async function archiveAccount(
  _prevState: ArchiveAccountResult | null,
  formData: FormData,
): Promise<ArchiveAccountResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const parsed = archiveAccountSchema.safeParse({
    id: formData.get("id"),
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Step 3: Archive — server-side timestamp (FR-008)
  try {
    const updated = await setArchivedAtForUser(session.user.id, parsed.data.id, new Date())
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(ACCOUNTS_PATH)
    return { data: { account: serializeAccount(updated) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// unarchiveAccount
// ---------------------------------------------------------------------------

/**
 * Clear archivedAt (set to null) for an account owned by the session's user.
 * FR-002, FR-003, FR-008, FR-013..015, FR-021.
 */
export async function unarchiveAccount(
  _prevState: UnarchiveAccountResult | null,
  formData: FormData,
): Promise<UnarchiveAccountResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const parsed = unarchiveAccountSchema.safeParse({
    id: formData.get("id"),
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Step 3: Unarchive
  try {
    const updated = await setArchivedAtForUser(session.user.id, parsed.data.id, null)
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(ACCOUNTS_PATH)
    return { data: { account: serializeAccount(updated) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// listAccounts
// ---------------------------------------------------------------------------

/**
 * List all accounts for the session's user.
 * No Zod boundary — input is a typed in-process object, not request-shaped (Principle III).
 * FR-002, FR-003, FR-009, FR-010, FR-012, FR-012a, FR-013..015, FR-021.
 */
export async function listAccounts(
  opts: { includeArchived?: boolean } = {},
): Promise<ListAccountsResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Query (no mutation → no revalidatePath)
  try {
    const rows = await listAccountsForUser(session.user.id, {
      includeArchived: opts.includeArchived ?? false,
    })
    return { data: { accounts: rows.map(serializeAccount) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}
