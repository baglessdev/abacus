"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/lib/auth"
import {
  errorEnvelope,
  type CategoryErrorEnvelope,
  HierarchyViolationError,
  KindChangeBlockedError,
} from "@/lib/categories/errors"
import {
  createCategorySchema,
  updateCategorySchema,
  archiveCategorySchema,
  unarchiveCategorySchema,
} from "@/lib/categories/schemas"
import {
  listCategoriesForUser,
  getCategoryForUser,
  createCategoryForUser,
  updateCategoryForUser,
  setArchivedAtForUser,
} from "@/lib/categories/queries"
import { serializeCategory, type CategoryDTO } from "@/lib/categories/serialize"

// --- Result types ---

type CreateCategoryResult = { data: { category: CategoryDTO } } | { error: CategoryErrorEnvelope }
type UpdateCategoryResult = { data: { category: CategoryDTO } } | { error: CategoryErrorEnvelope }
type ArchiveCategoryResult = { data: { category: CategoryDTO } } | { error: CategoryErrorEnvelope }
type UnarchiveCategoryResult =
  | { data: { category: CategoryDTO } }
  | { error: CategoryErrorEnvelope }
type ListCategoriesResult =
  | { data: { categories: CategoryDTO[] } }
  | { error: CategoryErrorEnvelope }

/** Re-usable path that every mutation revalidates after success. */
const CATEGORIES_PATH = "/dashboard/categories"

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------

/**
 * Create a new category for the session's user.
 * FR-001..009, FR-014..016, FR-021.
 */
export async function createCategory(
  _prevState: CreateCategoryResult | null,
  formData: FormData,
): Promise<CreateCategoryResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color"),
    icon: formData.get("icon"),
    parentId: formData.get("parentId") ?? "",
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Step 3: Persist (hierarchy validation happens inside the query helper)
  try {
    const row = await createCategoryForUser(session.user.id, parsed.data)
    revalidatePath(CATEGORIES_PATH)
    return { data: { category: serializeCategory(row) } }
  } catch (err) {
    if (err instanceof HierarchyViolationError) {
      return errorEnvelope("hierarchy_violation")
    }
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// updateCategory
// ---------------------------------------------------------------------------

/**
 * Update an existing category owned by the session's user.
 * FR-002..009, FR-013..016, FR-021.
 */
export async function updateCategory(
  _prevState: UpdateCategoryResult | null,
  formData: FormData,
): Promise<UpdateCategoryResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const rawId = formData.get("id")
  if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
    return errorEnvelope("validation_failed", {
      fieldErrors: { id: ["Missing category id"] },
    })
  }

  const parsed = updateCategorySchema.safeParse({
    id: rawId.trim(),
    name: formData.get("name") ?? undefined,
    kind: formData.get("kind") ?? undefined,
    color: formData.get("color") ?? undefined,
    icon: formData.get("icon") ?? undefined,
    parentId: formData.get("parentId") ?? undefined,
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Step 3: Pre-fetch to verify ownership
  const existing = await getCategoryForUser(session.user.id, parsed.data.id)
  if (!existing) {
    return errorEnvelope("not_found")
  }

  // Step 4: Update (hierarchy + kind-change validation happens inside the query helper)
  try {
    const { id, ...patch } = parsed.data
    const updated = await updateCategoryForUser(session.user.id, id, patch)
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(CATEGORIES_PATH)
    return { data: { category: serializeCategory(updated) } }
  } catch (err) {
    if (err instanceof KindChangeBlockedError) {
      return errorEnvelope("kind_change_blocked")
    }
    if (err instanceof HierarchyViolationError) {
      return errorEnvelope("hierarchy_violation")
    }
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// archiveCategory
// ---------------------------------------------------------------------------

/**
 * Set archivedAt = new Date() for a category owned by the session's user.
 * The timestamp is ALWAYS set server-side — never accepted from the client (FR-010).
 * FR-002, FR-003, FR-010, FR-013..015, FR-021.
 */
export async function archiveCategory(
  _prevState: ArchiveCategoryResult | null,
  formData: FormData,
): Promise<ArchiveCategoryResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const parsed = archiveCategorySchema.safeParse({
    id: formData.get("id"),
  })

  if (!parsed.success) {
    return errorEnvelope("validation_failed", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }

  // Step 3: Archive — server-side timestamp (FR-010)
  try {
    const updated = await setArchivedAtForUser(session.user.id, parsed.data.id, new Date())
    if (!updated) return errorEnvelope("not_found")
    revalidatePath(CATEGORIES_PATH)
    return { data: { category: serializeCategory(updated) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// unarchiveCategory
// ---------------------------------------------------------------------------

/**
 * Clear archivedAt (set to null) for a category owned by the session's user.
 * FR-002, FR-003, FR-010, FR-013..015, FR-021.
 */
export async function unarchiveCategory(
  _prevState: UnarchiveCategoryResult | null,
  formData: FormData,
): Promise<UnarchiveCategoryResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Zod parse
  const parsed = unarchiveCategorySchema.safeParse({
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
    revalidatePath(CATEGORIES_PATH)
    return { data: { category: serializeCategory(updated) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}

// ---------------------------------------------------------------------------
// listCategories
// ---------------------------------------------------------------------------

/**
 * List all categories for the session's user.
 * No Zod boundary — input is a typed in-process options object (Principle III).
 * FR-002, FR-003, FR-010, FR-011, FR-013..015, FR-019, FR-021.
 */
export async function listCategories(
  opts: { includeArchived?: boolean } = {},
): Promise<ListCategoriesResult> {
  // Step 1: Auth
  const session = await auth()
  if (!session?.user?.id) {
    return errorEnvelope("unauthenticated")
  }

  // Step 2: Query (no mutation → no revalidatePath)
  try {
    const rows = await listCategoriesForUser(session.user.id, {
      includeArchived: opts.includeArchived ?? false,
    })
    return { data: { categories: rows.map(serializeCategory) } }
  } catch {
    return errorEnvelope("internal_error")
  }
}
