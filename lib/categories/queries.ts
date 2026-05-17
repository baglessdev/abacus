/**
 * lib/categories/queries.ts
 *
 * This is the ONLY file in the codebase that imports prisma.category.* (data-scoping convention,
 * constitution v0.2.0, FR-003, FR-013). Exception: lib/auth/actions.ts uses tx.category.createMany
 * inside the signup transaction — the documented seed exception.
 *
 * Every helper takes `userId: string` as its FIRST positional argument — populated by the
 * calling server action from `session.user.id`, never from request input (FR-013, plan §Cross-user
 * isolation pattern). Every Prisma `where:` clause includes `userId`, so cross-user attempts
 * collapse to `null` indistinguishably from "row does not exist" (SC-007, FR-013).
 */

import prisma from "@/lib/prisma"

import { HierarchyViolationError, KindChangeBlockedError } from "@/lib/categories/errors"
import { type CreateCategoryInput, type UpdateCategoryInput } from "@/lib/categories/schemas"

// ---------------------------------------------------------------------------
// listCategoriesForUser
// ---------------------------------------------------------------------------

/**
 * List all categories owned by the given user.
 * Sorted alphabetically by name (asc) per FR-019.
 * Optionally includes archived rows.
 */
export async function listCategoriesForUser(
  userId: string,
  opts: { includeArchived: boolean } = { includeArchived: false },
) {
  return prisma.category.findMany({
    where: opts.includeArchived ? { userId } : { userId, archivedAt: null },
    orderBy: { name: "asc" },
  })
}

// ---------------------------------------------------------------------------
// getCategoryForUser
// ---------------------------------------------------------------------------

/**
 * Fetch a single category owned by the given user, or null if not found /
 * belongs to another user.
 * Cross-user reads collapse to null — indistinguishable from "does not exist" (FR-013).
 */
export async function getCategoryForUser(userId: string, categoryId: string) {
  return prisma.category.findFirst({
    where: { id: categoryId, userId },
  })
}

// ---------------------------------------------------------------------------
// hasChildrenForUser
// ---------------------------------------------------------------------------

/**
 * Returns true if the given category (owned by userId) has at least one child.
 * Used by updateCategoryForUser to enforce the kind-change-blocked rule (FR-005).
 */
export async function hasChildrenForUser(userId: string, categoryId: string): Promise<boolean> {
  const count = await prisma.category.count({
    where: { userId, parentId: categoryId },
  })
  return count > 0
}

// ---------------------------------------------------------------------------
// createCategoryForUser
// ---------------------------------------------------------------------------

/**
 * Insert a new category row for the given user.
 * Enforces:
 *   - parent exists and is owned by the same user (cross-user reference collapses to not_found)
 *   - parent is top-level (parent.parentId === null) — FR-006 single-level rule
 *   - parent.kind === input.kind — FR-009 kind-match rule
 * All violations throw HierarchyViolationError (caught by actions.ts and converted to envelope).
 */
export async function createCategoryForUser(userId: string, input: CreateCategoryInput) {
  if (input.parentId != null) {
    const parent = await getCategoryForUser(userId, input.parentId)

    if (!parent) {
      // Cross-user reference or non-existent parent — collapses to not_found (FR-013)
      throw new HierarchyViolationError("Parent category not found.")
    }
    if (parent.parentId !== null) {
      // Would create a grandchild — FR-006 single-level rule
      throw new HierarchyViolationError("Parent must be a top-level category.")
    }
    if (parent.kind !== input.kind) {
      // Kind mismatch between parent and child — FR-009
      throw new HierarchyViolationError("Parent and child must share the same kind.")
    }
  }

  return prisma.category.create({
    data: {
      userId,
      name: input.name,
      kind: input.kind,
      color: input.color,
      icon: input.icon,
      parentId: input.parentId ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// updateCategoryForUser
// ---------------------------------------------------------------------------

/**
 * Apply a patch to a category owned by the given user.
 * Returns null if the category does not exist or belongs to another user.
 * Enforces:
 *   - no self-parent (parentId === id) — FR-006
 *   - parent validation (same rules as create) — FR-006, FR-009
 *   - kind-change-blocked when the category has children — FR-005
 */
export async function updateCategoryForUser(
  userId: string,
  categoryId: string,
  input: Omit<UpdateCategoryInput, "id">,
) {
  // Fetch the existing row first to validate kind-change rule
  const existing = await getCategoryForUser(userId, categoryId)
  if (!existing) return null

  // FR-006: no self-parent (only meaningful on update — the id exists)
  if (input.parentId === categoryId) {
    throw new HierarchyViolationError("A category cannot be its own parent.")
  }

  // FR-005: kind-change blocked on categories with children
  if (input.kind !== undefined && input.kind !== existing.kind) {
    const hasChildren = await hasChildrenForUser(userId, categoryId)
    if (hasChildren) {
      throw new KindChangeBlockedError(
        "Cannot change kind while this category has children. Move or archive the children first.",
      )
    }
  }

  // Parent validation (same rules as create)
  if (input.parentId != null) {
    const parent = await getCategoryForUser(userId, input.parentId)
    if (!parent) {
      throw new HierarchyViolationError("Parent category not found.")
    }
    if (parent.parentId !== null) {
      throw new HierarchyViolationError("Parent must be a top-level category.")
    }
    // Use the incoming kind if provided, otherwise use the existing kind
    const effectiveKind = input.kind ?? existing.kind
    if (parent.kind !== effectiveKind) {
      throw new HierarchyViolationError("Parent and child must share the same kind.")
    }
  }

  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
      // Allow explicit null to clear parentId; undefined means "don't change"
      ...(input.parentId !== undefined && { parentId: input.parentId }),
    },
  })

  if (result.count === 0) return null

  return prisma.category.findFirst({ where: { id: categoryId, userId } })
}

// ---------------------------------------------------------------------------
// setArchivedAtForUser
// ---------------------------------------------------------------------------

/**
 * Set or clear `archivedAt` for a category owned by the given user.
 * Returns null if the category does not exist or belongs to another user.
 * Used by archiveCategory (value = new Date()) and unarchiveCategory (value = null).
 * Archiving a parent does NOT cascade to its children (FR-010).
 */
export async function setArchivedAtForUser(
  userId: string,
  categoryId: string,
  archivedAt: Date | null,
) {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { archivedAt },
  })

  if (result.count === 0) return null

  return prisma.category.findFirst({ where: { id: categoryId, userId } })
}
