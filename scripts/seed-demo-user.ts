/**
 * scripts/seed-demo-user.ts
 *
 * Creates a populated demo user for verifying the deployed app end-to-end.
 *
 * What it creates (atomic per-step):
 *   - 1 User (Argon2id-hashed password; mirrors the signUp action's transaction)
 *   - 11 default categories (mirrors lib/auth/actions.ts's signup seed)
 *   - 4 accounts (Checking, Savings, Credit Card, Cash) — diverse types
 *   - ~20 single-leg transactions across the last 30 days
 *   - 3 transfers (each a 2-leg atomic pair inside prisma.$transaction)
 *
 * Run locally:
 *   pnpm seed:demo-user
 *
 * Run against production (Neon):
 *   DATABASE_URL='<neon pooled url>' pnpm seed:demo-user
 *
 * Idempotency: if the demo user already exists, the script logs and exits
 * without re-creating. To re-seed, delete the user first (CASCADE removes
 * all their data automatically):
 *   pnpm db:studio  → Users table → delete row with demo@abacus.test
 */

// Load .env.local before importing anything that consumes env vars.
// Use Node's built-in process.loadEnvFile (Node 20+) — no dotenv dep needed.
// Skip silently if the file doesn't exist (production runs set DATABASE_URL
// directly in the shell).
try {
  process.loadEnvFile(".env.local")
} catch {
  // .env.local not present; rely on shell-provided DATABASE_URL.
}

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Prisma } from "@prisma/client"
import { hash } from "@node-rs/argon2"

import { DEFAULT_CATEGORIES } from "../lib/categories/seed"

// --- Configuration ---

const DEMO_EMAIL = "demo@abacus.test"
const DEMO_PASSWORD = "demo-password-2026!"

// --- Prisma client (matches lib/prisma.ts) ---

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("DATABASE_URL is not set. Aborting.")
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// --- Helpers ---

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function pad(s: string, n: number): string {
  return s.padEnd(n)
}

function padNum(s: string, n: number): string {
  return s.padStart(n)
}

// --- Main ---

async function main() {
  console.log(`\nSeeding demo user against:`)
  console.log(`  ${maskDatabaseUrl(connectionString!)}\n`)

  // 1. Check for existing user
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
  })
  if (existing) {
    console.log(`User ${DEMO_EMAIL} already exists (id: ${existing.id}).`)
    console.log(`To re-seed, delete the user first (CASCADE will remove their data).`)
    console.log(`\nLog in as:`)
    console.log(`  Email:    ${DEMO_EMAIL}`)
    console.log(`  Password: ${DEMO_PASSWORD}\n`)
    return
  }

  // 2. Hash the password (Argon2id, OWASP-recommended cost — matches lib/auth/password.ts)
  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })

  // 3. Create user + 11 default categories atomically (mirrors signUp action)
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { email: DEMO_EMAIL, passwordHash },
    })

    // Top-level categories
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        userId: newUser.id,
        name: c.name,
        kind: c.kind,
        color: c.color,
        icon: c.icon,
        parentId: null,
      })),
    })

    // Children under "Food"
    const foodParent = await tx.category.findFirst({
      where: { userId: newUser.id, name: "Food", parentId: null },
    })
    const foodChildren = DEFAULT_CATEGORIES.find((c) => c.name === "Food")?.children ?? []
    if (foodParent && foodChildren.length > 0) {
      await tx.category.createMany({
        data: foodChildren.map((c) => ({
          userId: newUser.id,
          name: c.name,
          kind: "EXPENSE" as const,
          color: c.color,
          icon: c.icon,
          parentId: foodParent.id,
        })),
      })
    }

    return newUser
  })

  console.log(`✓ Created user ${user.email} (id: ${user.id})`)
  console.log(`  Seeded 11 default categories`)

  // 4. Look up category ids by name
  const categories = await prisma.category.findMany({ where: { userId: user.id } })
  const catByName = new Map(categories.map((c) => [c.name, c]))

  // 5. Create 4 accounts
  const checking = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: new Prisma.Decimal("5000.00"),
    },
  })
  const savings = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Savings",
      type: "SAVINGS",
      currency: "USD",
      startingBalance: new Prisma.Decimal("10000.00"),
    },
  })
  const creditCard = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Chase Credit Card",
      type: "CREDIT",
      currency: "USD",
      startingBalance: new Prisma.Decimal("-450.00"),
    },
  })
  const cash = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Wallet (Cash)",
      type: "CASH",
      currency: "USD",
      startingBalance: new Prisma.Decimal("200.00"),
    },
  })
  console.log(`✓ Created 4 accounts`)

  // 6. Create ~20 single-leg transactions
  type TxData = {
    account: { id: string }
    date: Date
    amount: string
    type: "INCOME" | "EXPENSE"
    categoryName: string | null
    payee: string | null
    notes: string | null
  }

  const singleTxs: TxData[] = [
    // --- INCOME ---
    { account: checking, date: daysAgo(28), amount: "4200.00", type: "INCOME", categoryName: "Salary", payee: "Acme Corp", notes: "Bi-weekly salary" },
    { account: checking, date: daysAgo(14), amount: "4200.00", type: "INCOME", categoryName: "Salary", payee: "Acme Corp", notes: "Bi-weekly salary" },
    { account: checking, date: daysAgo(10), amount: "125.00", type: "INCOME", categoryName: "Other Income", payee: "Friend", notes: "Owed money returned" },
    // --- HOUSING ---
    { account: checking, date: daysAgo(27), amount: "-1800.00", type: "EXPENSE", categoryName: "Housing", payee: "Landlord", notes: "Monthly rent" },
    // --- UTILITIES ---
    { account: checking, date: daysAgo(18), amount: "-145.00", type: "EXPENSE", categoryName: "Utilities", payee: "Con Edison", notes: "Electricity" },
    { account: checking, date: daysAgo(12), amount: "-65.00", type: "EXPENSE", categoryName: "Utilities", payee: "Verizon", notes: "Internet" },
    // --- GROCERIES (Food → Groceries child) ---
    { account: creditCard, date: daysAgo(25), amount: "-127.43", type: "EXPENSE", categoryName: "Groceries", payee: "Whole Foods", notes: null },
    { account: creditCard, date: daysAgo(20), amount: "-89.12", type: "EXPENSE", categoryName: "Groceries", payee: "Trader Joe's", notes: null },
    { account: creditCard, date: daysAgo(13), amount: "-145.78", type: "EXPENSE", categoryName: "Groceries", payee: "Whole Foods", notes: null },
    { account: creditCard, date: daysAgo(6), amount: "-95.34", type: "EXPENSE", categoryName: "Groceries", payee: "Trader Joe's", notes: null },
    // --- RESTAURANTS (Food → Restaurants child) ---
    { account: creditCard, date: daysAgo(22), amount: "-45.50", type: "EXPENSE", categoryName: "Restaurants", payee: "Local Diner", notes: null },
    { account: creditCard, date: daysAgo(15), amount: "-78.20", type: "EXPENSE", categoryName: "Restaurants", payee: "Sushi Place", notes: null },
    { account: cash, date: daysAgo(8), amount: "-22.00", type: "EXPENSE", categoryName: "Restaurants", payee: "Coffee Shop", notes: null },
    // --- TRANSPORT ---
    { account: creditCard, date: daysAgo(19), amount: "-45.00", type: "EXPENSE", categoryName: "Transport", payee: "MTA", notes: "Monthly metro pass" },
    { account: creditCard, date: daysAgo(9), amount: "-32.50", type: "EXPENSE", categoryName: "Transport", payee: "Uber", notes: null },
    // --- ENTERTAINMENT ---
    { account: creditCard, date: daysAgo(16), amount: "-15.99", type: "EXPENSE", categoryName: "Entertainment", payee: "Netflix", notes: null },
    { account: creditCard, date: daysAgo(7), amount: "-12.99", type: "EXPENSE", categoryName: "Entertainment", payee: "Spotify", notes: null },
    { account: creditCard, date: daysAgo(4), amount: "-58.00", type: "EXPENSE", categoryName: "Entertainment", payee: "Movie Theater", notes: "Date night" },
    // --- HEALTH ---
    { account: creditCard, date: daysAgo(11), amount: "-30.00", type: "EXPENSE", categoryName: "Health", payee: "CVS Pharmacy", notes: "Allergy meds" },
    // --- OTHER EXPENSES (uncategorized example would use null) ---
    { account: cash, date: daysAgo(5), amount: "-15.00", type: "EXPENSE", categoryName: "Other Expenses", payee: "Tip jar", notes: null },
  ]

  for (const tx of singleTxs) {
    const categoryId = tx.categoryName ? (catByName.get(tx.categoryName)?.id ?? null) : null
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: tx.account.id,
        categoryId,
        date: tx.date,
        amount: new Prisma.Decimal(tx.amount),
        currency: "USD",
        type: tx.type,
        payee: tx.payee,
        notes: tx.notes,
        transferGroupId: null,
      },
    })
  }
  console.log(`✓ Created ${singleTxs.length} single-leg transactions`)

  // 7. Create 3 transfers — each an atomic 2-leg pair inside prisma.$transaction
  type TransferData = {
    from: { id: string; currency: string }
    to: { id: string }
    date: Date
    amount: string
    notes: string | null
  }

  const transfers: TransferData[] = [
    { from: checking, to: savings, date: daysAgo(27), amount: "500.00", notes: "Monthly savings transfer" },
    { from: checking, to: creditCard, date: daysAgo(15), amount: "450.00", notes: "Credit card payment" },
    { from: checking, to: cash, date: daysAgo(7), amount: "100.00", notes: "Cash withdrawal at ATM" },
  ]

  for (const t of transfers) {
    const transferGroupId = crypto.randomUUID()
    const magnitude = new Prisma.Decimal(t.amount)
    await prisma.$transaction(async (tx) => {
      // Source leg — negative
      await tx.transaction.create({
        data: {
          userId: user.id,
          accountId: t.from.id,
          categoryId: null,
          date: t.date,
          amount: magnitude.negated(),
          currency: t.from.currency,
          type: "TRANSFER",
          payee: null,
          notes: t.notes,
          transferGroupId,
        },
      })
      // Destination leg — positive
      await tx.transaction.create({
        data: {
          userId: user.id,
          accountId: t.to.id,
          categoryId: null,
          date: t.date,
          amount: magnitude,
          currency: t.from.currency, // same-currency-only in v1; enforced upstream
          type: "TRANSFER",
          payee: null,
          notes: t.notes,
          transferGroupId,
        },
      })
    })
  }
  console.log(`✓ Created ${transfers.length} transfers (${transfers.length * 2} legs, all atomic)`)

  // 8. Compute and display balances (mirrors lib/accounts/queries.ts)
  console.log(`\nFinal balances:`)
  console.log(
    `  ${pad("Account", 22)} ${padNum("Starting", 12)} ${padNum("Δ (transactions)", 18)} ${padNum("Balance", 12)}`,
  )
  console.log(`  ${"─".repeat(72)}`)
  for (const account of [checking, savings, creditCard, cash]) {
    const sum = await prisma.transaction.aggregate({
      where: { userId: user.id, accountId: account.id, archivedAt: null },
      _sum: { amount: true },
    })
    const delta = sum._sum.amount ?? new Prisma.Decimal(0)
    const balance = account.startingBalance.plus(delta)
    console.log(
      `  ${pad(account.name, 22)} ${padNum("$" + account.startingBalance.toFixed(2), 12)} ${padNum("$" + delta.toFixed(2), 18)} ${padNum("$" + balance.toFixed(2), 12)}`,
    )
  }

  // 9. Transaction summary
  const txCount = await prisma.transaction.count({ where: { userId: user.id } })
  const transferCount = await prisma.transaction.count({
    where: { userId: user.id, type: "TRANSFER" },
  })
  const incomeCount = await prisma.transaction.count({
    where: { userId: user.id, type: "INCOME" },
  })
  const expenseCount = await prisma.transaction.count({
    where: { userId: user.id, type: "EXPENSE" },
  })
  console.log(`\nTransaction breakdown:`)
  console.log(`  Total:    ${txCount}`)
  console.log(`  INCOME:   ${incomeCount}`)
  console.log(`  EXPENSE:  ${expenseCount}`)
  console.log(`  TRANSFER: ${transferCount} (${transferCount / 2} pairs)`)

  console.log(`\n✓ Done. Log in as:`)
  console.log(`  Email:    ${DEMO_EMAIL}`)
  console.log(`  Password: ${DEMO_PASSWORD}\n`)
}

function maskDatabaseUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = "****"
    return u.toString()
  } catch {
    return "[unparseable DATABASE_URL]"
  }
}

main()
  .catch((e) => {
    console.error("\n✗ Seed failed:")
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
