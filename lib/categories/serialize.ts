import { type Category } from "@prisma/client"

/**
 * CategoryDTO — the serializable shape returned over the React server-component boundary.
 * Date → ISO-8601 UTC string; no Decimal fields (categories store no money, FR-022).
 */
export type CategoryDTO = {
  id: string
  userId: string
  parentId: string | null
  name: string
  kind: "INCOME" | "EXPENSE"
  color: string // a token from CATEGORY_COLORS
  icon: string // a name from CATEGORY_ICONS
  archivedAt: string | null // ISO 8601 UTC, or null
  createdAt: string // ISO 8601 UTC
  updatedAt: string // ISO 8601 UTC
}

/**
 * Converts a Prisma Category row to a CategoryDTO.
 * No business logic — purely structural transformation.
 * FR-009, FR-015: shape conforms to the response envelope contract.
 */
export function serializeCategory(row: Category): CategoryDTO {
  return {
    id: row.id,
    userId: row.userId,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind,
    color: row.color,
    icon: row.icon,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
