/**
 * lib/categories/seed.ts
 *
 * Default category seed per FR-012.
 * Consumed by the signUp action in lib/auth/actions.ts (T014).
 *
 * MUST consist of exactly:
 *   - 7 top-level EXPENSE categories (Food, Housing, Transport, Utilities,
 *     Entertainment, Health, Other Expenses)
 *   - 2 top-level INCOME categories (Salary, Other Income)
 *   - 2 child EXPENSE under "Food" (Groceries, Restaurants)
 * Total = 11 rows seeded at signup.
 *
 * Children inherit kind: EXPENSE from their parent at seed time.
 * Import from this file directly (NOT from the barrel lib/categories/index.ts)
 * so the auth action can use it without the server-only guard.
 */

export type SeedChild = {
  readonly name: string
  readonly color: string
  readonly icon: string
}

export type SeedCategory = {
  readonly name: string
  readonly kind: "INCOME" | "EXPENSE"
  readonly color: string
  readonly icon: string
  readonly children?: readonly SeedChild[]
}

export const DEFAULT_CATEGORIES: ReadonlyArray<SeedCategory> = [
  // --- Top-level EXPENSE categories ---
  {
    name: "Food",
    kind: "EXPENSE",
    color: "red",
    icon: "Utensils",
    children: [
      { name: "Groceries", color: "blue", icon: "ShoppingBag" },
      { name: "Restaurants", color: "pink", icon: "UtensilsCrossed" },
    ],
  },
  {
    name: "Housing",
    kind: "EXPENSE",
    color: "orange",
    icon: "Home",
  },
  {
    name: "Transport",
    kind: "EXPENSE",
    color: "yellow",
    icon: "Car",
  },
  {
    name: "Utilities",
    kind: "EXPENSE",
    color: "lime",
    icon: "Plug",
  },
  {
    name: "Entertainment",
    kind: "EXPENSE",
    color: "teal",
    icon: "Film",
  },
  {
    name: "Health",
    kind: "EXPENSE",
    color: "cyan",
    icon: "HeartPulse",
  },
  {
    name: "Other Expenses",
    kind: "EXPENSE",
    color: "slate",
    icon: "MoreHorizontal",
  },
  // --- Top-level INCOME categories ---
  {
    name: "Salary",
    kind: "INCOME",
    color: "green",
    icon: "Coins",
  },
  {
    name: "Other Income",
    kind: "INCOME",
    color: "violet",
    icon: "Gift",
  },
] as const
