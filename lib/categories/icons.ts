/**
 * lib/categories/icons.ts
 *
 * Curated lucide-react icon allow-list for category icons.
 * FR-008: icon MUST be a member of this closed, version-controlled set.
 *
 * Coverage: 11 seed-category icons + 30 common personal-finance neighbors.
 * Each entry: { name, label, component }
 * - name      — machine identifier stored in the DB (VARCHAR 64); matches the Lucide export name
 * - label     — human-readable name surfaced in the icon picker
 * - component — the LucideIcon component (used to render the icon in UI)
 */

import type { LucideIcon } from "lucide-react"
import {
  Baby,
  Banknote,
  Beer,
  BookOpen,
  Briefcase,
  Car,
  Cat,
  Coins,
  Coffee,
  CreditCard,
  Dog,
  Dumbbell,
  Film,
  Gift,
  Heart,
  HeartPulse,
  Home,
  MoreHorizontal,
  PawPrint,
  PiggyBank,
  Pizza,
  Plane,
  Plug,
  Receipt,
  ShoppingBag,
  Smile,
  Tag,
  Tags,
  TrendingDown,
  TrendingUp,
  Utensils,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"

export type CategoryIcon = {
  name: string
  label: string
  component: LucideIcon
}

export const CATEGORY_ICONS: readonly CategoryIcon[] = [
  // --- Seed category icons (required by FR-012) ---
  { name: "Utensils", label: "Utensils", component: Utensils },
  { name: "UtensilsCrossed", label: "Utensils Crossed", component: UtensilsCrossed },
  { name: "ShoppingBag", label: "Shopping Bag", component: ShoppingBag },
  { name: "Home", label: "Home", component: Home },
  { name: "Car", label: "Car", component: Car },
  { name: "Plug", label: "Plug", component: Plug },
  { name: "Film", label: "Film", component: Film },
  { name: "HeartPulse", label: "Heart Pulse", component: HeartPulse },
  { name: "MoreHorizontal", label: "More", component: MoreHorizontal },
  { name: "Coins", label: "Coins", component: Coins },
  { name: "Gift", label: "Gift", component: Gift },

  // --- Common personal-finance neighbors ---
  { name: "Briefcase", label: "Briefcase", component: Briefcase },
  { name: "Plane", label: "Plane", component: Plane },
  { name: "BookOpen", label: "Book", component: BookOpen },
  { name: "Dumbbell", label: "Gym", component: Dumbbell },
  { name: "PawPrint", label: "Pets", component: PawPrint },
  { name: "Coffee", label: "Coffee", component: Coffee },
  { name: "Pizza", label: "Pizza", component: Pizza },
  { name: "Beer", label: "Beer", component: Beer },
  { name: "Receipt", label: "Receipt", component: Receipt },
  { name: "CreditCard", label: "Credit Card", component: CreditCard },
  { name: "Wallet", label: "Wallet", component: Wallet },
  { name: "PiggyBank", label: "Savings", component: PiggyBank },
  { name: "Banknote", label: "Banknote", component: Banknote },
  { name: "TrendingUp", label: "Trending Up", component: TrendingUp },
  { name: "TrendingDown", label: "Trending Down", component: TrendingDown },
  { name: "Tag", label: "Tag", component: Tag },
  { name: "Tags", label: "Tags", component: Tags },
  { name: "Heart", label: "Heart", component: Heart },
  { name: "Smile", label: "Smile", component: Smile },
  { name: "Baby", label: "Baby", component: Baby },
  { name: "Cat", label: "Cat", component: Cat },
  { name: "Dog", label: "Dog", component: Dog },
] as const

/** Set of valid icon name strings — used for O(1) membership testing at boundaries. */
export const CATEGORY_ICON_NAMES: ReadonlySet<string> = new Set(CATEGORY_ICONS.map((i) => i.name))

/**
 * Type guard — narrows an arbitrary string to a known icon name.
 * Used by the Zod schema refine in lib/categories/schemas.ts (FR-008).
 */
export function isCategoryIcon(name: string): boolean {
  return CATEGORY_ICON_NAMES.has(name)
}

/**
 * Look up a CategoryIcon by name. Returns undefined for unknown names.
 * Used by the UI to render the icon component.
 */
export function getCategoryIcon(name: string): CategoryIcon | undefined {
  return CATEGORY_ICONS.find((i) => i.name === name)
}
