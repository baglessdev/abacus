import { z } from "zod"

import { isCategoryColor } from "@/lib/categories/colors"
import { isCategoryIcon } from "@/lib/categories/icons"

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

const nameField = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be at most 80 characters")

const kindField = z.enum(["INCOME", "EXPENSE"] as const, {
  message: "Kind must be INCOME or EXPENSE",
})

const colorField = z
  .string()
  .refine(isCategoryColor, { message: "Pick a valid color from the palette" })

const iconField = z
  .string()
  .refine(isCategoryIcon, { message: "Pick a valid icon from the curated set" })

/**
 * parentId: empty string is coerced to null (the form posts "" when the picker is cleared).
 * Structural rules (single-level depth, kind-match, no-self-parent) are enforced at the
 * queries layer (T011), not in this schema — per FR-014 and plan.md §Trust-internally rule.
 */
const parentIdField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().nullable())
  .optional()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Schema for the createCategory action.
 * FR-004, FR-005, FR-007, FR-008, FR-009, FR-014, FR-021.
 */
export const createCategorySchema = z.object({
  name: nameField,
  kind: kindField,
  color: colorField,
  icon: iconField,
  parentId: parentIdField,
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>

/**
 * Schema for the updateCategory action.
 * id is required; all other fields are optional (partial update).
 * FR-004, FR-005, FR-007, FR-008, FR-009, FR-014, FR-021.
 */
export const updateCategorySchema = z.object({
  id: z.string().min(1, "Missing category id"),
  name: nameField.optional(),
  kind: kindField.optional(),
  color: colorField.optional(),
  icon: iconField.optional(),
  parentId: parentIdField,
})

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

/**
 * Schema for the archiveCategory action — just the category id.
 * FR-010, FR-014, FR-021.
 */
export const archiveCategorySchema = z.object({
  id: z.string().min(1, "Missing category id"),
})

export type ArchiveCategoryInput = z.infer<typeof archiveCategorySchema>

/**
 * Schema for the unarchiveCategory action — just the category id.
 * FR-010, FR-014, FR-021.
 */
export const unarchiveCategorySchema = z.object({
  id: z.string().min(1, "Missing category id"),
})

export type UnarchiveCategoryInput = z.infer<typeof unarchiveCategorySchema>

/**
 * Schema for the listCategories options.
 * No Zod boundary needed for typed in-process options (Principle III),
 * but provided here for completeness and for tests.
 */
export const listCategoriesSchema = z.object({
  includeArchived: z.boolean().optional(),
})

export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>
