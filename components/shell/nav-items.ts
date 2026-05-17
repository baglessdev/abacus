import {
  ArrowLeftRight,
  LayoutDashboard,
  PieChart,
  Settings,
  Tags,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

const dashboard: NavItem = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }
const accounts: NavItem = { href: "/dashboard/accounts", label: "Accounts", icon: Wallet }
const transactions: NavItem = {
  href: "/dashboard/transactions",
  label: "Transactions",
  icon: ArrowLeftRight,
}
const budgets: NavItem = { href: "/dashboard/budgets", label: "Budgets", icon: PieChart }
const categories: NavItem = { href: "/dashboard/categories", label: "Categories", icon: Tags }
const settings: NavItem = { href: "/dashboard/settings", label: "Settings", icon: Settings }

export const navGroups: readonly NavGroup[] = [
  { label: "TRACK", items: [dashboard, accounts, transactions] },
  { label: "MANAGE", items: [budgets, categories, settings] },
] as const

// Back-compat: flat list for any caller that needs it.
export const navItems: readonly NavItem[] = navGroups.flatMap((g) => g.items)
