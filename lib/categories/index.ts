import "server-only"

// Server-only barrel for lib/categories/ — all exports here require a server context.
// Phase 3 UI components import from this path.

export {
  createCategory,
  updateCategory,
  archiveCategory,
  unarchiveCategory,
  listCategories,
} from "@/lib/categories/actions"

export type { CategoryDTO } from "@/lib/categories/serialize"

export type { CategoryErrorCode, CategoryErrorEnvelope } from "@/lib/categories/errors"
