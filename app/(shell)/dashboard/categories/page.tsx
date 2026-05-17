import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { listCategories } from "@/lib/categories"

import { CategoriesList } from "./_components/categories-list"

/**
 * /dashboard/categories — server component.
 * Defense-in-depth auth check (middleware already guards this route).
 * Fetches the user's active categories and passes them to the client component.
 * FR-016, FR-017, FR-019.
 */
export default async function CategoriesPage() {
  const session = await auth()
  if (!session?.user) redirect("/login?from=/dashboard/categories")

  const result = await listCategories({ includeArchived: false })
  if ("error" in result) {
    if (result.error.code === "unauthenticated") {
      redirect("/login?from=/dashboard/categories")
    }
    throw new Error(`Failed to load categories: ${result.error.message}`)
  }

  return <CategoriesList initialCategories={result.data.categories} />
}
