"use server"

/**
 * lib/budgets/actions.ts
 *
 * Server actions for the Budgets module.
 * Standard response envelope: { data } | { error: BudgetErrorEnvelope }
 *
 * Flow per action:
 *   1. await auth() — unauthenticated on missing session.
 *   2. Zod safeParse(formData) — validation_failed on failure.
 *   3. Call queries layer helper with session.user.id (data-scoping convention).
 *   4. Catch domain errors (BudgetExistsError, CategoryWrongKindError) → typed envelopes.
 *   5. Catch unknown Prisma errors → internal_error.
 *   6. On success: revalidatePath + return { data }.
 */

import { revalidatePath } from "next/cache"

import { auth } from "@/lib/auth"
import { errorEnvelope, BudgetExistsError, CategoryWrongKindError } from "@/lib/budgets/errors"
import {
  createBudgetSchema,
  updateBudgetSchema,
  archiveBudgetSchema,
  unarchiveBudgetSchema,
} from "@/lib/budgets/schemas"
import {
  createBudgetForUser,
  updateBudgetForUser,
  setArchivedAtForUser,
  listBudgetsWithActualsForUser,
} from "@/lib/budgets/queries"
import { serializeBudget, serializeBudgetWithActuals } from "@/lib/budgets/serialize"
import { type BudgetDTO, type BudgetWithActualsDTO } from "@/lib/budgets/serialize"
import { type BudgetErrorEnvelope } from "@/lib/budgets/errors"

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type BudgetResult = { data: { budget: BudgetDTO } } | { error: BudgetErrorEnvelope }
type ListBudgetsResult =
  | { data: { budgets: BudgetWithActualsDTO[] } }
  | { error: BudgetErrorEnvelope }

// ---------------------------------------------------------------------------
// createBudget
// ---------------------------------------------------------------------------

export async function createBudget(
  _prevState: BudgetResult | null,
  formData: FormData,
): Promise<BudgetResult> {
  const session = await auth()
  if (!session?.user?.id) return errorEnvelope("unauthenticated")

  const raw = {
    categoryId: formData.get("categoryId")?.toString() ?? "",
    period: formData.get("period")?.toString() ?? "",
    amount: formData.get("amount")?.toString() ?? "",
    currency: formData.get("currency")?.toString() ?? "",
    startDate: formData.get("startDate")?.toString() ?? "",
    endDate: formData.get("endDate")?.toString() ?? "",
  }

  const parsed = await createBudgetSchema.safeParseAsync(raw)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return errorEnvelope("validation_failed", { fieldErrors })
  }

  try {
    const row = await createBudgetForUser(session.user.id, parsed.data)
    revalidatePath("/dashboard/budgets")
    revalidatePath("/dashboard")
    return { data: { budget: serializeBudget(row) } }
  } catch (err) {
    if (err instanceof BudgetExistsError)
      return errorEnvelope("budget_exists", { message: err.message })
    if (err instanceof CategoryWrongKindError)
      return errorEnvelope("category_wrong_kind", { message: err.message })
    console.error("[createBudget]", err)
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// updateBudget
// ---------------------------------------------------------------------------

export async function updateBudget(
  _prevState: BudgetResult | null,
  formData: FormData,
): Promise<BudgetResult> {
  const session = await auth()
  if (!session?.user?.id) return errorEnvelope("unauthenticated")

  const raw = {
    id: formData.get("id")?.toString() ?? "",
    amount: formData.get("amount")?.toString() ?? "",
    startDate: formData.get("startDate")?.toString() ?? "",
    endDate: formData.get("endDate")?.toString() ?? "",
  }

  const parsed = await updateBudgetSchema.safeParseAsync(raw)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return errorEnvelope("validation_failed", { fieldErrors })
  }

  try {
    const row = await updateBudgetForUser(session.user.id, parsed.data.id, parsed.data)
    if (!row) return errorEnvelope("not_found")
    revalidatePath("/dashboard/budgets")
    revalidatePath("/dashboard")
    return { data: { budget: serializeBudget(row) } }
  } catch (err) {
    console.error("[updateBudget]", err)
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// archiveBudget
// ---------------------------------------------------------------------------

export async function archiveBudget(
  _prevState: BudgetResult | null,
  formData: FormData,
): Promise<BudgetResult> {
  const session = await auth()
  if (!session?.user?.id) return errorEnvelope("unauthenticated")

  const raw = { id: formData.get("id")?.toString() ?? "" }
  const parsed = archiveBudgetSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return errorEnvelope("validation_failed", { fieldErrors })
  }

  try {
    // archivedAt is always set server-side — never accept a timestamp from client (FR-008).
    const row = await setArchivedAtForUser(session.user.id, parsed.data.id, new Date())
    if (!row) return errorEnvelope("not_found")
    revalidatePath("/dashboard/budgets")
    revalidatePath("/dashboard")
    return { data: { budget: serializeBudget(row) } }
  } catch (err) {
    if (err instanceof BudgetExistsError)
      return errorEnvelope("budget_exists", { message: err.message })
    console.error("[archiveBudget]", err)
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// unarchiveBudget
// ---------------------------------------------------------------------------

export async function unarchiveBudget(
  _prevState: BudgetResult | null,
  formData: FormData,
): Promise<BudgetResult> {
  const session = await auth()
  if (!session?.user?.id) return errorEnvelope("unauthenticated")

  const raw = { id: formData.get("id")?.toString() ?? "" }
  const parsed = unarchiveBudgetSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    return errorEnvelope("validation_failed", { fieldErrors })
  }

  try {
    const row = await setArchivedAtForUser(session.user.id, parsed.data.id, null)
    if (!row) return errorEnvelope("not_found")
    revalidatePath("/dashboard/budgets")
    revalidatePath("/dashboard")
    return { data: { budget: serializeBudget(row) } }
  } catch (err) {
    if (err instanceof BudgetExistsError)
      return errorEnvelope("budget_exists", { message: err.message })
    console.error("[unarchiveBudget]", err)
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// listBudgets
// ---------------------------------------------------------------------------

/**
 * Read action — no Zod boundary (typed in-process options, Principle III).
 * Calls listBudgetsWithActualsForUser which issues at most 3 Prisma queries (R3).
 */
export async function listBudgets(
  opts: {
    includeArchived?: boolean
    limit?: number
    sortByStatusAndProgress?: boolean
  } = {},
): Promise<ListBudgetsResult> {
  const session = await auth()
  if (!session?.user?.id) return errorEnvelope("unauthenticated")

  try {
    const budgetsWithActuals = await listBudgetsWithActualsForUser(session.user.id, opts)
    const budgets = budgetsWithActuals.map(serializeBudgetWithActuals)
    return { data: { budgets } }
  } catch (err) {
    console.error("[listBudgets]", err)
    return errorEnvelope("internal_error")
  }
}
