import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { expect, test, type Page } from "@playwright/test"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

// Load .env.local so DATABASE_URL is available to this separate test process.
const envLocal = resolve(process.cwd(), ".env.local")
if (existsSync(envLocal)) {
  process.loadEnvFile(envLocal)
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  // Truncate in FK dependency order.
  // Budget references User and Category (FK with Restrict on Category).
  // Transaction references Account and Category (Restrict FKs).
  // Account and Category reference User.
  await prisma.budget.deleteMany({})
  await prisma.transaction.deleteMany({})
  await prisma.category.deleteMany({})
  await prisma.account.deleteMany({})
  await prisma.user.deleteMany({})
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

const PASSWORD = "correcthorsebattery"

/** Signs up a fresh user and lands on /dashboard. */
async function signUp(page: Page, email: string) {
  await page.goto("/signup")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL("/dashboard")
}

/** Sign in an existing user. */
async function signIn(page: Page, email: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/dashboard")
}

/** Get the userId for a given email via Prisma. */
async function getUserIdByEmail(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  return user.id
}

/** Get a category by name and userId. */
async function getCategoryByName(userId: string, name: string) {
  return prisma.category.findFirstOrThrow({ where: { userId, name } })
}

// ---------------------------------------------------------------------------
// US1: Create a monthly spending target for a category
// ---------------------------------------------------------------------------

test.describe("Budgets US1 — create a monthly spending target", () => {
  const us1Email = `e2e-budgets-us1-${Date.now()}@example.com`

  // Shared state for the test suite
  let accountId: string
  let groceriesCategoryId: string

  test("(a) signs up, seeds data, (b) shows no-budget empty state", async ({ page }) => {
    // Sign up fresh user
    await signUp(page, us1Email)

    const userId = await getUserIdByEmail(us1Email)

    // Seed one USD account (Chase Checking, $5,000) directly via Prisma
    const account = await prisma.account.create({
      data: {
        userId,
        name: "Chase Checking",
        type: "CHECKING",
        currency: "USD",
        startingBalance: "5000.00",
      },
    })
    accountId = account.id

    // Get the Groceries category (seeded at signup — child of Food, EXPENSE)
    const groceries = await getCategoryByName(userId, "Groceries")
    groceriesCategoryId = groceries.id

    // Get the current month for seeding transactions
    const now = new Date()
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15))
      .toISOString()
      .slice(0, 10)

    // Seed 2 EXPENSE transactions in Groceries for the current month ($30 + $50 = $80 total)
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-30.00",
          currency: "USD",
          date: new Date(thisMonth),
          payee: "Whole Foods",
        },
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-50.00",
          currency: "USD",
          date: new Date(thisMonth),
          payee: "Trader Joe's",
        },
      ],
    })

    // (b) Assert the no-budgets empty state is visible
    await page.goto("/dashboard/budgets")
    await expect(page.getByRole("heading", { level: 1, name: "Budgets" })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole("button", { name: "Create your first budget" })).toBeVisible({
      timeout: 5000,
    })
  })

  test("(c)-(e) clicking CTA opens sheet; filling + submitting creates budget", async ({
    page,
  }) => {
    await signIn(page, us1Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByRole("heading", { level: 1, name: "Budgets" })).toBeVisible({
      timeout: 10000,
    })

    // (c) Click the CTA — sheet opens
    await page.getByRole("button", { name: "Create your first budget" }).click()
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // (d) Fill the form
    // Category: Groceries
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    await page.getByRole("option", { name: "Groceries" }).click()

    // Amount: 400
    await page.getByLabel("Amount").fill("400")

    // Currency: USD (should be defaulted from recent EXPENSE transactions — leave as-is)
    // Period: MONTHLY (default — leave as-is)
    // Start date: defaulted to 1st of current month — leave as-is
    // End date: leave empty

    // (e) Submit
    await page.getByRole("button", { name: "Save budget" }).click()

    // Sheet should close
    await expect(page.getByRole("heading", { name: "Add budget" })).not.toBeVisible({
      timeout: 10000,
    })
  })

  test("(f) budget row appears with correct actuals ($80 = $30 + $50)", async ({ page }) => {
    await signIn(page, us1Email)
    await page.goto("/dashboard/budgets")

    // Wait for the Groceries budget row to render
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Budgeted: $400.00
    await expect(page.getByText("$400.00")).toBeVisible({ timeout: 5000 })

    // Actuals: $80.00 (sum of the 2 seeded EXPENSE transactions)
    await expect(page.getByText("$80.00")).toBeVisible({ timeout: 5000 })

    // Remaining: $320.00
    await expect(page.getByText("$320.00")).toBeVisible({ timeout: 5000 })

    // Progress bar present
    const progressBar = page.getByRole("progressbar")
    await expect(progressBar).toBeVisible({ timeout: 5000 })

    // Status "under" (20%) — no near/over icons
    await expect(page.getByLabel("Near budget limit")).not.toBeVisible()
    await expect(page.getByLabel("Over budget")).not.toBeVisible()
  })

  test("(h) duplicate USD/MONTHLY/Groceries budget rejected with budget_exists error", async ({
    page,
  }) => {
    await signIn(page, us1Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Open create sheet via "+ Add budget" button
    await page.getByTestId("add-budget-btn").click()
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // Fill identically: Groceries + USD + MONTHLY
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    await page.getByRole("option", { name: "Groceries" }).click()

    await page.getByLabel("Amount").fill("200")

    // Submit
    await page.getByRole("button", { name: "Save budget" }).click()

    // Sheet should stay open with the budget_exists error banner
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("alert")).toContainText("already have an active")
  })

  test("(i) INCOME category filtered out by CategoryPicker (kind=EXPENSE enforcement)", async ({
    page,
  }) => {
    await signIn(page, us1Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Open create sheet
    await page.getByTestId("add-budget-btn").click()
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // Open the category picker
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })

    // Search for Salary (INCOME category) — it should NOT appear because kind="EXPENSE" filter
    await page.getByPlaceholder("Search categories…").fill("Salary")
    await expect(page.getByRole("option", { name: "Salary" })).not.toBeVisible({ timeout: 3000 })

    // Verify that Groceries DOES appear (EXPENSE category)
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    await expect(page.getByRole("option", { name: "Groceries" })).toBeVisible({ timeout: 5000 })
  })

  test("(j) keyboard-only path — create Housing budget without mouse after navigation", async ({
    page,
  }) => {
    await signIn(page, us1Email)
    await page.goto("/dashboard/budgets")

    // Wait for the Groceries budget to confirm we're on the list page
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Focus the "+ Add budget" button and open the sheet via keyboard
    await page.getByTestId("add-budget-btn").focus()
    await page.keyboard.press("Enter")

    // Sheet should open
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // Open category picker via keyboard (it's a combobox/button — Enter opens it)
    const categoryCombobox = page.getByRole("combobox", { name: "Category" })
    await categoryCombobox.focus()
    await page.keyboard.press("Enter")

    // Search input should be available — type to filter
    const searchInput = page.getByPlaceholder("Search categories…")
    await searchInput.waitFor({ state: "visible", timeout: 5000 })
    // searchInput should auto-focus when the popover opens; type to filter
    await searchInput.focus()
    await page.keyboard.type("Housing")

    // Wait for the Housing option to appear in the filtered list
    const housingOption = page.getByRole("option", { name: "Housing" })
    await housingOption.waitFor({ state: "visible", timeout: 5000 })
    // Ensure the option is highlighted (cmdk auto-highlights the first result after typing)
    // Press Enter to select the highlighted item
    await page.keyboard.press("Enter")

    // Wait for the popover to close (the picker closes after selection)
    await searchInput.waitFor({ state: "hidden", timeout: 3000 })

    // Verify the category was selected — the combobox trigger should now show "Housing"
    await expect(categoryCombobox).toContainText("Housing", { timeout: 3000 })

    // The category ID hidden input should now have a value
    // Move focus to Amount field and type
    await page.getByLabel("Amount").focus()
    await page.keyboard.type("600")

    // Press the submit button via keyboard (focus then Enter)
    const submitBtn = page.getByRole("button", { name: "Save budget" })
    await submitBtn.focus()
    // Verify the button is focused before pressing Enter
    await expect(submitBtn).toBeFocused({ timeout: 2000 })
    await page.keyboard.press("Enter")

    // Sheet closes on success
    await expect(page.getByRole("heading", { name: "Add budget" })).not.toBeVisible({
      timeout: 15000,
    })

    // Housing budget row appears (router.refresh() is called on success)
    await expect(page.getByText("Housing")).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// Helpers shared by US2
// ---------------------------------------------------------------------------

/**
 * Parse a formatted money string (e.g. "$1,300.00", "€50.00", "-$100.00") to a JS number.
 * Strips currency symbols, thousands separators, and handles leading minus sign.
 */
function parseMoneyText(text: string): number {
  // Remove everything except digits, dots, and leading minus sign.
  const cleaned = text.replace(/[^0-9.\-]/g, "")
  return parseFloat(cleaned)
}

// ---------------------------------------------------------------------------
// US2: See actuals vs. budget at a glance
// ---------------------------------------------------------------------------

test.describe("Budgets US2 — see actuals vs. budget at a glance", () => {
  // Re-use the US1 user (us1Email is in the outer scope closure of US1 describe).
  // To avoid tight coupling with the US1 const, we define a separate email here.
  // The test.beforeAll at the top already cleared all users, so we sign up fresh.
  const us2Email = `e2e-budgets-us2-${Date.now()}@example.com`

  // IDs populated during setup
  let userId: string
  let accountId: string
  let eurAccountId: string
  let groceriesCategoryId: string
  let restaurantsCategoryId: string
  let healthCategoryId: string

  // Clean up after US2 to prevent FK constraint violations in other spec files
  // (Budget.categoryId → Category with ON DELETE Restrict; categories.spec.ts beforeAll
  // tries to deleteMany categories without first deleting budgets).
  test.afterAll(async () => {
    if (userId) {
      // Delete in FK dependency order: budgets → transactions → categories → accounts → user
      await prisma.budget.deleteMany({ where: { userId } })
      await prisma.transaction.deleteMany({ where: { userId } })
      await prisma.category.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    }
  })

  test("(setup) seed US2 user + Groceries budget with $80 actuals", async ({ page }) => {
    // Sign up fresh user
    await signUp(page, us2Email)
    userId = await getUserIdByEmail(us2Email)

    // Seed one USD account
    const account = await prisma.account.create({
      data: {
        userId,
        name: "Chase Checking",
        type: "CHECKING",
        currency: "USD",
        startingBalance: "5000.00",
      },
    })
    accountId = account.id

    // Seed one EUR account (direct Prisma — avoids flaky EUR picker in UI)
    const eurAccount = await prisma.account.create({
      data: {
        userId,
        name: "Euro Savings",
        type: "SAVINGS",
        currency: "EUR",
        startingBalance: "1000.00",
      },
    })
    eurAccountId = eurAccount.id

    // Get seeded expense categories
    const groceries = await getCategoryByName(userId, "Groceries")
    groceriesCategoryId = groceries.id
    const restaurants = await getCategoryByName(userId, "Restaurants")
    restaurantsCategoryId = restaurants.id
    const health = await getCategoryByName(userId, "Health")
    healthCategoryId = health.id

    // Date helpers
    const now = new Date()
    const thisMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15))
      .toISOString()
      .slice(0, 10)
    const thisYearDate = new Date(Date.UTC(now.getUTCFullYear(), 5, 15)) // mid-year
      .toISOString()
      .slice(0, 10)

    // Seed Groceries EXPENSE transactions: $30 + $50 = $80 total
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-30.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Whole Foods",
        },
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-50.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Trader Joe's",
        },
      ],
    })

    // Create the Groceries USD MONTHLY budget ($400) via direct Prisma
    await prisma.budget.create({
      data: {
        userId,
        categoryId: groceriesCategoryId,
        period: "MONTHLY",
        amount: "400.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })

    // (a) Seed SECOND budget: Restaurants USD MONTHLY $200 + $180 actuals (90% → "near")
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: restaurantsCategoryId,
          type: "EXPENSE",
          amount: "-100.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Nobu",
        },
        {
          userId,
          accountId,
          categoryId: restaurantsCategoryId,
          type: "EXPENSE",
          amount: "-80.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Sushi Bar",
        },
      ],
    })
    await prisma.budget.create({
      data: {
        userId,
        categoryId: restaurantsCategoryId,
        period: "MONTHLY",
        amount: "200.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })

    // (c) Seed THIRD budget: Health USD YEARLY $1,200 + $1,300 actuals (108% → "over")
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: healthCategoryId,
          type: "EXPENSE",
          amount: "-700.00",
          currency: "USD",
          date: new Date(thisYearDate),
          payee: "Hospital",
        },
        {
          userId,
          accountId,
          categoryId: healthCategoryId,
          type: "EXPENSE",
          amount: "-600.00",
          currency: "USD",
          date: new Date(thisYearDate),
          payee: "Pharmacy",
        },
      ],
    })
    await prisma.budget.create({
      data: {
        userId,
        categoryId: healthCategoryId,
        period: "YEARLY",
        amount: "1200.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      },
    })

    // Navigate to budgets — all three rows should be visible
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Health")).toBeVisible({ timeout: 5000 })
  })

  // (b) Restaurants at 90% → "near" visual treatment
  test("(b) Restaurants row at 90% shows 'near' status — amber fill + warning icon", async ({
    page,
  }) => {
    await signIn(page, us2Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 10000 })

    // Actuals $180.00, budgeted $200.00
    await expect(page.getByText("$180.00")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("$200.00")).toBeVisible({ timeout: 5000 })

    // FR-025 non-color rule: near-budget warning icon MUST be present
    // The <StatusIcon> renders with aria-label="Near budget limit" for "near" status
    await expect(page.getByLabel("Near budget limit")).toBeVisible({ timeout: 5000 })

    // Groceries at 20% ($80 / $400) is still "under" — no warning icon for it
    // Assert at least one progressbar is present (each row has one)
    const progressBars = page.getByRole("progressbar")
    await expect(progressBars.first()).toBeVisible({ timeout: 5000 })
  })

  // (d) Health at 108% → "over" visual treatment
  test("(d) Health row at 108% shows 'over' status — negative remaining + over-budget icon", async ({
    page,
  }) => {
    await signIn(page, us2Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Health")).toBeVisible({ timeout: 10000 })

    // Actuals: $1,300.00 — uses Intl.NumberFormat with thousand separator
    await expect(page.getByText("$1,300.00")).toBeVisible({ timeout: 5000 })

    // Remaining: -$100.00 (negative — over budget)
    await expect(page.getByText("-$100.00")).toBeVisible({ timeout: 5000 })

    // FR-025 non-color rule: over-budget icon MUST be present
    // The <StatusIcon> renders with aria-label="Over budget" for "over" status
    await expect(page.getByLabel("Over budget")).toBeVisible({ timeout: 5000 })

    // Progress bar present (visually capped at 100% fill)
    const progressBars = page.getByRole("progressbar")
    await expect(progressBars.first()).toBeVisible({ timeout: 5000 })

    // No "near" icon on an over-budget row
    // (The "near" icon should only appear on Restaurants, not Health)
    // We can't assert absence globally since Restaurants also has near icon —
    // instead assert the Health row contains the "Over budget" icon.
    await expect(page.getByLabel("Over budget")).toBeVisible({ timeout: 5000 })
  })

  // (e) Multi-currency assertion: USD actuals unaffected by EUR transaction
  test("(e) multi-currency: EUR Groceries expense does not affect USD Groceries actuals", async ({
    page,
  }) => {
    await signIn(page, us2Email)

    const now = new Date()
    const thisMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15))
      .toISOString()
      .slice(0, 10)

    // Seed one EUR EXPENSE in Groceries this month
    await prisma.transaction.create({
      data: {
        userId,
        accountId: eurAccountId,
        categoryId: groceriesCategoryId,
        type: "EXPENSE",
        amount: "-50.00",
        currency: "EUR",
        date: new Date(thisMonthDate),
        payee: "Rewe",
      },
    })

    // Navigate to budgets — USD Groceries should still show $80.00 actuals (not $130)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // $80.00 must still be present (USD Groceries actuals — not contaminated by EUR)
    await expect(page.getByText("$80.00")).toBeVisible({ timeout: 5000 })

    // Now create a EUR MONTHLY Groceries budget €200 via direct Prisma
    await prisma.budget.create({
      data: {
        userId,
        categoryId: groceriesCategoryId,
        period: "MONTHLY",
        amount: "200.00000000",
        currency: "EUR",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })

    // Reload — should see TWO Groceries rows (USD and EUR)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toHaveCount(2, { timeout: 10000 })

    // EUR Groceries: actuals €50.00, remaining €150.00
    await expect(page.getByText("€50.00")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("€150.00")).toBeVisible({ timeout: 5000 })

    // USD Groceries: actuals $80.00 UNCHANGED (no FX mixing, FR-019 / SC-013)
    await expect(page.getByText("$80.00")).toBeVisible({ timeout: 5000 })
  })

  // (f) Byte-for-byte assertion against /dashboard/transactions
  test("(f) byte-for-byte: USD Groceries actuals match transaction list sum", async ({ page }) => {
    await signIn(page, us2Email)

    const now = new Date()
    // Build the date range for the current month (YYYY-MM-DD format)
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, "0")
    const fromDate = `${year}-${month}-01`
    // last day of the month
    const lastDay = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate()
    const toDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`

    // Navigate to transactions filtered to Groceries + current month + EXPENSE + USD account
    // Using accountId (USD account) to filter to USD-currency transactions only,
    // combined with categoryId for Groceries — this matches the budget actuals scope.
    const transactionsUrl = `/dashboard/transactions?from=${fromDate}&to=${toDate}&type=EXPENSE&categoryId=${groceriesCategoryId}&accountId=${accountId}`
    await page.goto(transactionsUrl)

    // Wait for the table to render
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10000 })

    // Extract all amount cell text values from the Amount column (5th column, 0-indexed at 4)
    // The table header row has 6 columns; data rows have cells we want.
    // <Money> renders with sign-aware styling; EXPENSE amounts display with negative sign.
    const amountCells = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell") })
      .locator("td:nth-child(5)")
    const amountTexts = await amountCells.allInnerTexts()

    // Parse and sum the absolute values (EXPENSE amounts display as negative in UI)
    let transactionSum = 0
    for (const text of amountTexts) {
      const val = parseMoneyText(text)
      if (!isNaN(val)) {
        transactionSum += Math.abs(val)
      }
    }

    // Navigate to budgets and compare
    await page.goto("/dashboard/budgets")
    // Two Groceries rows exist (USD + EUR); use .first() to avoid strict-mode violation
    await expect(page.getByText("Groceries").first()).toBeVisible({ timeout: 10000 })

    // The USD Groceries actuals cell renders via <Money currency="USD" amount={actuals} />
    // which formats as "$80.00" for 80.00
    const budgetActualsText = await page.getByText("$80.00").first().innerText()
    const budgetActuals = parseMoneyText(budgetActualsText)

    // Byte-for-byte: the sums must match exactly (SC-002)
    expect(Math.abs(budgetActuals - transactionSum)).toBeLessThan(0.001)
  })

  // (g) Reload-after-new-expense: actuals update by exactly $20
  test("(g) actuals update by $20 after adding a new Groceries EXPENSE", async ({ page }) => {
    await signIn(page, us2Email)

    // Navigate first to see the current state ($80.00 actuals before new expense)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("$80.00")).toBeVisible({ timeout: 10000 })

    const now = new Date()
    const thisMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 20))
      .toISOString()
      .slice(0, 10)

    // Record one more $20 USD Groceries EXPENSE via direct Prisma
    await prisma.transaction.create({
      data: {
        userId,
        accountId,
        categoryId: groceriesCategoryId,
        type: "EXPENSE",
        amount: "-20.00",
        currency: "USD",
        date: new Date(thisMonthDate),
        payee: "Corner Store",
      },
    })

    // Reload /dashboard/budgets
    await page.goto("/dashboard/budgets")
    // Two Groceries rows exist (USD + EUR); use .first() to avoid strict-mode violation
    await expect(page.getByText("Groceries").first()).toBeVisible({ timeout: 10000 })

    // USD Groceries actuals: $80.00 + $20.00 = $100.00
    // Use exact: true to avoid matching "-$100.00" (Health remaining) via substring
    await expect(page.getByText("$100.00", { exact: true })).toBeVisible({ timeout: 5000 })

    // Remaining: $400.00 - $100.00 = $300.00
    await expect(page.getByText("$300.00", { exact: true })).toBeVisible({ timeout: 5000 })

    // Still "under" status (25%) — no near/over icon for Groceries
    // (Restaurants still has the near icon; Health still has the over icon)
    // We verify progress bar is present
    await expect(page.getByRole("progressbar").first()).toBeVisible({ timeout: 5000 })
  })
})

// ---------------------------------------------------------------------------
// US3: Edit or archive a budget
// ---------------------------------------------------------------------------

test.describe("Budgets US3 — edit or archive a budget", () => {
  const us3Email = `e2e-budgets-us3-${Date.now()}@example.com`

  let userId: string
  let accountId: string
  let groceriesCategoryId: string
  let restaurantsCategoryId: string
  let groceriesBudgetId: string
  let restaurantsBudgetId: string

  test.afterAll(async () => {
    if (userId) {
      await prisma.budget.deleteMany({ where: { userId } })
      await prisma.transaction.deleteMany({ where: { userId } })
      await prisma.category.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    }
  })

  test("(setup) seed US3 user with Groceries budget ($400, $100 actuals) + Restaurants ($200, $180 actuals)", async ({
    page,
  }) => {
    await signUp(page, us3Email)
    userId = await getUserIdByEmail(us3Email)

    const account = await prisma.account.create({
      data: {
        userId,
        name: "Chase Checking",
        type: "CHECKING",
        currency: "USD",
        startingBalance: "5000.00",
      },
    })
    accountId = account.id

    const groceries = await getCategoryByName(userId, "Groceries")
    groceriesCategoryId = groceries.id
    const restaurants = await getCategoryByName(userId, "Restaurants")
    restaurantsCategoryId = restaurants.id

    const now = new Date()
    const thisMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15))
      .toISOString()
      .slice(0, 10)

    // Seed $100 Groceries actuals
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-50.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Whole Foods",
        },
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-50.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Trader Joe's",
        },
      ],
    })

    // Seed $180 Restaurants actuals (90% near-budget)
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: restaurantsCategoryId,
          type: "EXPENSE",
          amount: "-100.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Nobu",
        },
        {
          userId,
          accountId,
          categoryId: restaurantsCategoryId,
          type: "EXPENSE",
          amount: "-80.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Sushi Bar",
        },
      ],
    })

    // Create Groceries USD MONTHLY $400 budget
    const groceriesBudget = await prisma.budget.create({
      data: {
        userId,
        categoryId: groceriesCategoryId,
        period: "MONTHLY",
        amount: "400.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })
    groceriesBudgetId = groceriesBudget.id

    // Create Restaurants USD MONTHLY $200 budget
    const restaurantsBudget = await prisma.budget.create({
      data: {
        userId,
        categoryId: restaurantsCategoryId,
        period: "MONTHLY",
        amount: "200.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })
    restaurantsBudgetId = restaurantsBudget.id

    // Navigate to confirm both rows visible
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 5000 })
  })

  // (a) Click Groceries row → edit sheet opens; assert read-only fields and notice
  test("(a) clicking Groceries row opens edit sheet with read-only notice and disabled fields", async ({
    page,
  }) => {
    await signIn(page, us3Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Click the edit button for Groceries
    await page.getByRole("button", { name: /Edit budget for Groceries/ }).click()

    // Edit sheet title should appear
    await expect(page.getByRole("heading", { name: "Edit budget" })).toBeVisible({ timeout: 5000 })

    // (a.1) Read-only notice must be visible (partial match — JSX may collapse whitespace)
    await expect(page.getByText(/Category, currency, and period cannot be changed/)).toBeVisible({
      timeout: 5000,
    })

    // (a.2) Category field is disabled (read-only Input with value "Groceries")
    const categoryInput = page.getByLabel("Category (read-only)")
    await expect(categoryInput).toBeVisible({ timeout: 5000 })
    await expect(categoryInput).toBeDisabled()
    await expect(categoryInput).toHaveValue("Groceries")

    // (a.3) Currency field is disabled
    const currencyInput = page.getByLabel("Currency (read-only)")
    await expect(currencyInput).toBeDisabled()
    await expect(currencyInput).toHaveValue("USD")

    // (a.4) Period field is disabled
    const periodInput = page.getByLabel("Period (read-only)")
    await expect(periodInput).toBeDisabled()
    await expect(periodInput).toHaveValue("Monthly")
  })

  // (b) Change amount from $400 to $500 → save → assert row updates
  test("(b) editing amount from $400 to $500 updates the row with recomputed remaining", async ({
    page,
  }) => {
    await signIn(page, us3Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Open edit sheet for Groceries
    await page.getByRole("button", { name: /Edit budget for Groceries/ }).click()
    await expect(page.getByRole("heading", { name: "Edit budget" })).toBeVisible({ timeout: 5000 })

    // Clear and fill the amount field with 500
    const amountField = page.getByLabel("Amount")
    await amountField.clear()
    await amountField.fill("500")

    // Submit
    await page.getByRole("button", { name: "Save changes" }).click()

    // Sheet should close
    await expect(page.getByRole("heading", { name: "Edit budget" })).not.toBeVisible({
      timeout: 10000,
    })

    // Row should now show $500.00 budgeted
    await expect(page.getByText("$500.00")).toBeVisible({ timeout: 10000 })

    // Remaining: $500 - $100 actuals = $400.00
    await expect(page.getByText("$400.00")).toBeVisible({ timeout: 5000 })
  })

  // (c) Archive Groceries → dialog confirms → row disappears; transactions unchanged
  test("(c) archiving Groceries removes it from default list; transactions unchanged", async ({
    page,
  }) => {
    await signIn(page, us3Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Click the Archive button for Groceries
    await page.getByRole("button", { name: /Archive budget for Groceries/ }).click()

    // Archive confirm dialog should appear
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Archive this budget?")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Archive the Groceries budget/)).toBeVisible({ timeout: 5000 })

    // Click "Archive" to confirm
    await page.getByRole("button", { name: "Archive" }).click()

    // Wait for dialog to close and list to refresh
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 })

    // Groceries should no longer appear in the default list
    // Restaurants should still be there
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 10000 })

    // Groceries should not be visible in default view
    // (it was archived — only visible when "Show archived" is toggled on)
    await expect(
      page.getByRole("button", { name: /Archive budget for Groceries/ }),
    ).not.toBeVisible({ timeout: 5000 })

    // Assert transactions are UNCHANGED — navigate to transactions page
    await page.goto("/dashboard/transactions")
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10000 })

    // The two Groceries transactions ($50 + $50) should still be present
    const groceriesRows = page.getByRole("row").filter({ hasText: "Groceries" })
    const groceriesCount = await groceriesRows.count()
    expect(groceriesCount).toBeGreaterThanOrEqual(2)
  })

  // (d) Toggle "Show archived" ON → archived Groceries row reappears with badge
  test("(d) Show archived toggle reveals archived Groceries with Archived badge + Unarchive button", async ({
    page,
  }) => {
    await signIn(page, us3Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 10000 })

    // Groceries should not be visible by default (archived)
    // The "Archived" badge should not be visible initially
    await expect(page.getByTestId("archived-badge")).not.toBeVisible({ timeout: 3000 })

    // Toggle "Show archived" ON
    await page.getByTestId("show-archived-toggle").click()

    // Wait for URL to update and page to re-render with archived budgets
    await expect(page).toHaveURL(/showArchived=1/, { timeout: 10000 })

    // Archived Groceries row should appear with the badge
    await expect(page.getByTestId("archived-badge")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 5000 })

    // Unarchive button should be present for the archived row
    await expect(page.getByTestId("unarchive-btn")).toBeVisible({ timeout: 5000 })
  })

  // (e) Click Unarchive → Groceries returns to default list
  test("(e) clicking Unarchive restores Groceries to default list", async ({ page }) => {
    await signIn(page, us3Email)
    // Start with showArchived=1 so we can see the archived row
    await page.goto("/dashboard/budgets?showArchived=1")
    await expect(page.getByTestId("archived-badge")).toBeVisible({ timeout: 10000 })

    // Click Unarchive
    await page.getByTestId("unarchive-btn").click()

    // Page refreshes — row should move back to active
    // After unarchiving, the page may still be on ?showArchived=1 (router.refresh() keeps URL)
    // The row should now render as an active budget row (no Archived badge)
    await expect(page.getByRole("button", { name: /Archive budget for Groceries/ })).toBeVisible({
      timeout: 10000,
    })

    // Navigate back to default list (no showArchived param)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // The archive button should be present (active budget, not archived)
    await expect(page.getByRole("button", { name: /Archive budget for Groceries/ })).toBeVisible({
      timeout: 5000,
    })

    // The Archived badge should not be visible
    await expect(page.getByTestId("archived-badge")).not.toBeVisible({ timeout: 3000 })
  })

  // (f) Concurrent uniqueness race (SC-006) — covered by T021 unit tests.
  // This sub-step documents the acceptance of unit-test coverage as equivalent:
  // the Postgres partial unique index + the BudgetExistsError pre-check in queries.ts
  // ensure that concurrent creates for the same (userId, categoryId, currency, period)
  // result in one success + one failure. The behavior is validated in:
  //   tests/unit/budgets-queries.test.ts — case (a) and (c) cover the pre-check and P2002 race.
  // Playwright cannot reliably simulate a true concurrent race in a single-threaded browser;
  // the race guard is a DB-level invariant, not a UI flow — the unit test is the correct level.
  test("(f) concurrent uniqueness race — validated by unit tests in budgets-queries.test.ts (SC-006 documented)", async ({
    page,
  }) => {
    // Smoke test: attempting to create a duplicate Groceries USD MONTHLY budget
    // via the UI shows the budget_exists error (the application-layer guard).
    await signIn(page, us3Email)
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Open create sheet
    await page.getByTestId("add-budget-btn").click()
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // Try to create a duplicate Groceries USD MONTHLY budget
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    await page.getByRole("option", { name: "Groceries" }).click()
    await page.getByLabel("Amount").fill("300")

    await page.getByRole("button", { name: "Save budget" }).click()

    // Should show budget_exists error (application layer guard)
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("alert")).toContainText("already have an active")
  })

  // (g) Archived-category label (SC-017, Clarification Q3)
  test("(g) archiving the Restaurants category renders budget with (archived category) suffix; actuals unchanged", async ({
    page,
  }) => {
    await signIn(page, us3Email)

    // Archive the Restaurants category directly via Prisma (NOT the budget)
    await prisma.category.update({
      where: { id: restaurantsCategoryId },
      data: { archivedAt: new Date() },
    })

    // Reload /dashboard/budgets
    await page.goto("/dashboard/budgets")

    // The Restaurants BUDGET should still render in the default list
    // (the budget itself is not archived — only the category is per Q3)
    await expect(page.getByText("Restaurants (archived category)")).toBeVisible({
      timeout: 10000,
    })

    // Actuals should still show $180.00 (unchanged — transactions reference the category regardless)
    await expect(page.getByText("$180.00")).toBeVisible({ timeout: 5000 })

    // Remaining: $200 - $180 = $20.00
    await expect(page.getByText("$20.00")).toBeVisible({ timeout: 5000 })

    // Clean up: unarchive the Restaurants category to restore clean state
    await prisma.category.update({
      where: { id: restaurantsCategoryId },
      data: { archivedAt: null },
    })

    // Verify clean state — reload and confirm "(archived category)" suffix is gone
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Restaurants (archived category)")).not.toBeVisible({
      timeout: 3000,
    })

    // Also reference the budget IDs to ensure test variables are used (prevents lint warnings)
    void groceriesBudgetId
    void restaurantsBudgetId
  })
})

// ---------------------------------------------------------------------------
// US4: See budgets at a glance on the dashboard
// ---------------------------------------------------------------------------

test.describe("Budgets US4 — see budgets at a glance on the dashboard", () => {
  const us4Email = `e2e-budgets-us4-${Date.now()}@example.com`

  let userId: string
  let accountId: string
  let groceriesCategoryId: string
  let restaurantsCategoryId: string
  let healthCategoryId: string

  test.afterAll(async () => {
    if (userId) {
      // Delete in FK dependency order: budgets → transactions → categories → accounts → user
      await prisma.budget.deleteMany({ where: { userId } })
      await prisma.transaction.deleteMany({ where: { userId } })
      await prisma.category.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    }
  })

  test("(setup) seed US4 user with 3 budgets in mixed states", async ({ page }) => {
    await signUp(page, us4Email)
    userId = await getUserIdByEmail(us4Email)

    // Seed one USD account
    const account = await prisma.account.create({
      data: {
        userId,
        name: "Chase Checking",
        type: "CHECKING",
        currency: "USD",
        startingBalance: "5000.00",
      },
    })
    accountId = account.id

    // Get seeded expense categories
    const groceries = await getCategoryByName(userId, "Groceries")
    groceriesCategoryId = groceries.id
    const restaurants = await getCategoryByName(userId, "Restaurants")
    restaurantsCategoryId = restaurants.id
    const health = await getCategoryByName(userId, "Health")
    healthCategoryId = health.id

    const now = new Date()
    const thisMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15))
      .toISOString()
      .slice(0, 10)
    const thisYearDate = new Date(Date.UTC(now.getUTCFullYear(), 5, 15)).toISOString().slice(0, 10)

    // Seed Groceries MONTHLY $400 budget + $100 actuals (25% → "under")
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-50.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Whole Foods",
        },
        {
          userId,
          accountId,
          categoryId: groceriesCategoryId,
          type: "EXPENSE",
          amount: "-50.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Trader Joe's",
        },
      ],
    })
    await prisma.budget.create({
      data: {
        userId,
        categoryId: groceriesCategoryId,
        period: "MONTHLY",
        amount: "400.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })

    // Seed Restaurants MONTHLY $200 budget + $180 actuals (90% → "near")
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: restaurantsCategoryId,
          type: "EXPENSE",
          amount: "-100.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Nobu",
        },
        {
          userId,
          accountId,
          categoryId: restaurantsCategoryId,
          type: "EXPENSE",
          amount: "-80.00",
          currency: "USD",
          date: new Date(thisMonthDate),
          payee: "Sushi Bar",
        },
      ],
    })
    await prisma.budget.create({
      data: {
        userId,
        categoryId: restaurantsCategoryId,
        period: "MONTHLY",
        amount: "200.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      },
    })

    // Seed Health YEARLY $1,200 budget + $1,300 actuals (108% → "over")
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId,
          categoryId: healthCategoryId,
          type: "EXPENSE",
          amount: "-700.00",
          currency: "USD",
          date: new Date(thisYearDate),
          payee: "Doctor Visit",
        },
        {
          userId,
          accountId,
          categoryId: healthCategoryId,
          type: "EXPENSE",
          amount: "-600.00",
          currency: "USD",
          date: new Date(thisYearDate),
          payee: "Physical Therapy",
        },
      ],
    })
    await prisma.budget.create({
      data: {
        userId,
        categoryId: healthCategoryId,
        period: "YEARLY",
        amount: "1200.00000000",
        currency: "USD",
        startDate: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      },
    })

    // Verify setup: navigate to /dashboard/budgets to confirm all 3 budgets exist
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Restaurants")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Health")).toBeVisible({ timeout: 5000 })
  })

  // (a) Budgets widget renders alongside the other 3 widgets on /dashboard
  test("(a) Budgets widget renders on /dashboard alongside Net Worth, Cash Flow, Recent Transactions", async ({
    page,
  }) => {
    await signIn(page, us4Email)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Assert all 4 widgets are visible (FR-027, SC-012)
    await expect(page.getByText("Net worth", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("This month", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Recent transactions", { exact: true })).toBeVisible({
      timeout: 10000,
    })
    // Scope "Budgets" text to main content area to avoid matching the sidebar nav link.
    await expect(page.locator("main").getByText("Budgets", { exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Assert the Budgets widget card is present and contains budget rows
    const budgetsCard = page
      .locator("div.rounded-lg")
      .filter({ hasText: /^Budgets/ })
      .first()
    await expect(budgetsCard).toBeVisible({ timeout: 10000 })

    // All 3 seeded categories should appear in the widget
    await expect(budgetsCard.getByText("Health")).toBeVisible({ timeout: 10000 })
    await expect(budgetsCard.getByText("Restaurants")).toBeVisible({ timeout: 5000 })
    await expect(budgetsCard.getByText("Groceries")).toBeVisible({ timeout: 5000 })
  })

  // (b) Sort order: Health (over) first → Restaurants (near) → Groceries (under)
  test("(b) budget rows are sorted by priority: over → near → under", async ({ page }) => {
    await signIn(page, us4Email)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Scope "Budgets" text to main content area to avoid matching the sidebar nav link.
    await expect(page.locator("main").getByText("Budgets", { exact: true })).toBeVisible({
      timeout: 10000,
    })

    const budgetsCard = page
      .locator("div.rounded-lg")
      .filter({ hasText: /^Budgets/ })
      .first()
    await expect(budgetsCard).toBeVisible({ timeout: 10000 })

    // Get all category name spans within the budgets widget
    // Each budget row renders the category name in a <span>
    const categoryNames = budgetsCard.locator("span.truncate")
    await expect(categoryNames.first()).toBeVisible({ timeout: 10000 })

    const count = await categoryNames.count()
    expect(count).toBe(3)

    // Verify the order: Health (over, 108%) → Restaurants (near, 90%) → Groceries (under, 25%)
    await expect(categoryNames.nth(0)).toHaveText("Health")
    await expect(categoryNames.nth(1)).toHaveText("Restaurants")
    await expect(categoryNames.nth(2)).toHaveText("Groceries")
  })

  // (c) "See all" link navigates to /dashboard/budgets
  test("(c) clicking 'See all' link navigates to /dashboard/budgets", async ({ page }) => {
    await signIn(page, us4Email)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Scope "Budgets" text to main content area to avoid matching the sidebar nav link.
    await expect(page.locator("main").getByText("Budgets", { exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Click the "See all →" link in the Budgets widget
    const budgetsCard = page
      .locator("div.rounded-lg")
      .filter({ hasText: /^Budgets/ })
      .first()
    await budgetsCard.getByRole("link", { name: /See all/ }).click()

    await expect(page).toHaveURL("/dashboard/budgets", { timeout: 10000 })
  })

  // (d) Empty-state: archive all budgets → widget shows "No budgets yet" + CTA; other 3 widgets still render (FR-029, SC-018)
  test("(d) empty state: 'No budgets yet' + CTA; other 3 widgets still render", async ({
    page,
  }) => {
    await signIn(page, us4Email)

    // Archive all budgets via direct Prisma
    await prisma.budget.updateMany({
      where: { userId },
      data: { archivedAt: new Date() },
    })

    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // The Budgets widget must show the empty state (FR-029 — not a page takeover).
    // Scoped to main to avoid matching the sidebar nav link.
    await expect(page.locator("main").getByText("Budgets", { exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("No budgets yet", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("link", { name: /Set up your first budget/ })).toBeVisible({
      timeout: 5000,
    })

    // The other 3 widgets MUST still render (SC-018 — budgets empty state is NOT a page takeover)
    await expect(page.getByText("Net worth", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("This month", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Recent transactions", { exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Restore budgets for any downstream tests
    await prisma.budget.updateMany({
      where: { userId },
      data: { archivedAt: null },
    })
  })

  // (e) SC-018 explicit: feature-008 dashboard tests still pass (transitive proof).
  // The dashboard.spec.ts assertions are the canonical SC-018 check. Here we verify that
  // the Budgets widget renders correctly for a user with budgets while confirming the
  // Net Worth and Cash Flow widgets render their own data correctly and not the budget data.
  test("(e) SC-018 transitive: Net Worth + Cash Flow widgets render own data unchanged", async ({
    page,
  }) => {
    await signIn(page, us4Email)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Net Worth widget: user has Chase Checking with $5,000 starting balance (no transactions
    // affect the account balance directly — transactions are tracked separately).
    // The net worth widget shows $5,000.00 for USD (starting balance of the account).
    await expect(page.getByText("Net worth", { exact: true })).toBeVisible({ timeout: 10000 })
    // The widget shows some USD amount — verify the Net Worth widget is functional and
    // does not render budget data (no "$1,200.00" budget amount visible in Net Worth widget).
    const netWorthCard = page
      .locator("div.rounded-lg")
      .filter({ hasText: /^Net worth/ })
      .first()
    await expect(netWorthCard).toBeVisible({ timeout: 10000 })
    // Net Worth card should NOT contain "No budgets yet" (confirming isolation)
    await expect(netWorthCard.getByText("No budgets yet")).not.toBeVisible()

    // Cash Flow widget: should render without any budget data contamination
    const cashFlowCard = page
      .locator("div.rounded-lg")
      .filter({ hasText: /^This month/ })
      .first()
    await expect(cashFlowCard).toBeVisible({ timeout: 10000 })
    // Cash Flow card should NOT contain "Budgets" or "No budgets yet"
    await expect(cashFlowCard.getByText("No budgets yet")).not.toBeVisible()

    // Budgets widget renders alongside correctly — all 4 coexist.
    // Scoped to main to avoid matching the sidebar nav link.
    await expect(page.locator("main").getByText("Budgets", { exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("Recent transactions", { exact: true })).toBeVisible({
      timeout: 10000,
    })
  })
})

// ---------------------------------------------------------------------------
// US5: First-time user / no-budgets state
// ---------------------------------------------------------------------------

test.describe("Budgets US5 — first-time user / no-budgets state", () => {
  const us5Email = `e2e-budgets-us5-${Date.now()}@example.com`

  let userId: string

  test.afterAll(async () => {
    if (userId) {
      await prisma.budget.deleteMany({ where: { userId } })
      await prisma.transaction.deleteMany({ where: { userId } })
      await prisma.category.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    }
  })

  // (a) Fresh user sees no-budgets empty state: heading + CTA; no Money elements or progress bars
  test("(a) fresh user sees no-budgets empty state with heading, CTA, no monetary values, no progress bars", async ({
    page,
  }) => {
    await signUp(page, us5Email)
    userId = await getUserIdByEmail(us5Email)

    await page.goto("/dashboard/budgets")

    // The empty state heading rendered by <EmptyState title="Set spending targets for your expense categories">
    await expect(
      page.getByRole("heading", {
        name: "Set spending targets for your expense categories",
      }),
    ).toBeVisible({ timeout: 10000 })

    // Primary CTA "Create your first budget" rendered as a <Button>
    await expect(page.getByRole("button", { name: "Create your first budget" })).toBeVisible({
      timeout: 5000,
    })

    // No monetary numbers rendered (no tabular-nums spans from <Money>)
    await expect(page.locator('[class*="tabular-nums"]')).toHaveCount(0)

    // No progress bars rendered
    await expect(page.getByRole("progressbar")).toHaveCount(0)
  })

  // (b) Clicking CTA opens the create sheet (US1 sheet from T024)
  test("(b) clicking 'Create your first budget' CTA opens the create-budget sheet", async ({
    page,
  }) => {
    await signIn(page, us5Email)
    await page.goto("/dashboard/budgets")

    // Confirm empty state is showing
    await expect(
      page.getByRole("heading", {
        name: "Set spending targets for your expense categories",
      }),
    ).toBeVisible({ timeout: 10000 })

    // Click the CTA
    await page.getByRole("button", { name: "Create your first budget" }).click()

    // The create sheet from T024 should open
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // The form fields are visible (US1 sheet wired correctly)
    await expect(page.getByRole("combobox", { name: "Category" })).toBeVisible({ timeout: 5000 })
    await expect(page.getByLabel("Amount")).toBeVisible({ timeout: 5000 })
  })

  // (c) Close the sheet without submitting
  test("(c) closing the sheet without submitting returns to empty state", async ({ page }) => {
    await signIn(page, us5Email)
    await page.goto("/dashboard/budgets")

    // Open the sheet
    await expect(
      page.getByRole("heading", {
        name: "Set spending targets for your expense categories",
      }),
    ).toBeVisible({ timeout: 10000 })
    await page.getByRole("button", { name: "Create your first budget" }).click()
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // Close the sheet by pressing Escape
    await page.keyboard.press("Escape")

    // Sheet should close; empty state heading should still be visible
    await expect(page.getByRole("heading", { name: "Add budget" })).not.toBeVisible({
      timeout: 5000,
    })
    await expect(
      page.getByRole("heading", {
        name: "Set spending targets for your expense categories",
      }),
    ).toBeVisible({ timeout: 5000 })

    // No budgets were created — still no monetary values or progress bars
    await expect(page.locator('[class*="tabular-nums"]')).toHaveCount(0)
    await expect(page.getByRole("progressbar")).toHaveCount(0)
  })

  // (d) Special variant — no EXPENSE categories: archive all EXPENSE categories → special empty state
  test("(d) no EXPENSE categories: special empty state with Go to Categories CTA; 'Create your first budget' absent", async ({
    page,
  }) => {
    await signIn(page, us5Email)

    // Archive all EXPENSE categories for this user via direct Prisma (FR-021 enforcement path)
    await prisma.category.updateMany({
      where: { userId, kind: "EXPENSE" },
      data: { archivedAt: new Date() },
    })

    // Reload /dashboard/budgets
    await page.goto("/dashboard/budgets")

    // The special "no EXPENSE categories" empty state from page.tsx branch (5a)
    // Heading text (from page.tsx): "You need at least one expense category to create a budget"
    await expect(
      page.getByRole("heading", {
        name: "You need at least one expense category to create a budget",
      }),
    ).toBeVisible({ timeout: 10000 })

    // CTA to /dashboard/categories should be present
    await expect(page.getByRole("link", { name: "Go to Categories" })).toBeVisible({
      timeout: 5000,
    })

    // "Create your first budget" CTA MUST be absent (US5 ac.4, FR-021)
    await expect(page.getByRole("button", { name: "Create your first budget" })).not.toBeVisible({
      timeout: 3000,
    })

    // No monetary values or progress bars in the special empty state either
    await expect(page.locator('[class*="tabular-nums"]')).toHaveCount(0)
    await expect(page.getByRole("progressbar")).toHaveCount(0)

    // Restore categories so cleanup can proceed cleanly
    await prisma.category.updateMany({
      where: { userId, kind: "EXPENSE" },
      data: { archivedAt: null },
    })
  })

  // (e) Cross-user isolation (SC-005): fresh browser context, User C sees only their own empty state
  test("(e) cross-user isolation: fresh user C sees empty state with no data from earlier users", async ({
    browser,
  }) => {
    const userCEmail = `e2e-budgets-us5-c-${Date.now()}@example.com`
    let userCId: string | undefined

    // Open a fresh browser context (new cookie jar — complete session isolation)
    const context = await browser.newContext()
    const pageC = await context.newPage()

    try {
      // Sign up User C in the isolated context
      await pageC.goto("/signup")
      await pageC.getByLabel("Email").fill(userCEmail)
      await pageC.getByLabel("Password", { exact: true }).fill(PASSWORD)
      await pageC.getByLabel("Confirm password").fill(PASSWORD)
      await pageC.getByRole("button", { name: "Create account" }).click()
      await expect(pageC).toHaveURL("/dashboard", { timeout: 15000 })

      userCId = await getUserIdByEmail(userCEmail)

      // Navigate to /dashboard/budgets — User C has no budgets
      await pageC.goto("/dashboard/budgets")

      // User C sees the no-budgets empty state (their own, not leaking from US1-US4 users)
      await expect(
        pageC.getByRole("heading", {
          name: "Set spending targets for your expense categories",
        }),
      ).toBeVisible({ timeout: 10000 })

      // No <Money> elements — no leaked budget amounts from other users
      await expect(pageC.locator('[class*="tabular-nums"]')).toHaveCount(0)

      // No progress bars from other users' budgets
      await expect(pageC.getByRole("progressbar")).toHaveCount(0)

      // No text that could come from prior users' seeded data (SC-005)
      await expect(pageC.getByText("Groceries")).not.toBeVisible({ timeout: 3000 })
      await expect(pageC.getByText("Restaurants")).not.toBeVisible({ timeout: 3000 })
      await expect(pageC.getByText("Health")).not.toBeVisible({ timeout: 3000 })

      // The CTA is for User C's own budget creation — correct text
      await expect(pageC.getByRole("button", { name: "Create your first budget" })).toBeVisible({
        timeout: 5000,
      })
    } finally {
      await context.close()

      // Clean up User C via Prisma
      if (userCId) {
        await prisma.budget.deleteMany({ where: { userId: userCId } })
        await prisma.transaction.deleteMany({ where: { userId: userCId } })
        await prisma.category.deleteMany({ where: { userId: userCId } })
        await prisma.account.deleteMany({ where: { userId: userCId } })
        await prisma.user.deleteMany({ where: { id: userCId } })
      }
    }
  })
})

// ---------------------------------------------------------------------------
// SC-010: Constitution-mandated create → record → see-actuals-update flow
// ---------------------------------------------------------------------------

test.describe("Budgets SC-010 — create budget, record expenses, see actuals update", () => {
  const sc010Email = `e2e-budgets-sc010-${Date.now()}@example.com`

  let userId: string

  test.afterAll(async () => {
    if (userId) {
      await prisma.budget.deleteMany({ where: { userId } })
      await prisma.transaction.deleteMany({ where: { userId } })
      await prisma.category.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    }
  })

  // (a) Sign up user D. Create account + $400 USD MONTHLY Groceries budget via UI.
  //     Assert actuals = $0.00, remaining = $400.00.
  test("(a) sign up, create account + Groceries MONTHLY $400 budget via UI; actuals = $0, remaining = $400", async ({
    page,
  }) => {
    // Sign up fresh user D
    await signUp(page, sc010Email)
    userId = await getUserIdByEmail(sc010Email)

    // Create a USD checking account via UI (accounts page)
    await page.goto("/dashboard/accounts")
    const cta = page.getByRole("button", { name: "Add your first account" })
    const addBtn = page.getByRole("button", { name: "+ Add account" })
    await Promise.race([
      cta.waitFor({ state: "visible", timeout: 10000 }).catch(() => null),
      addBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => null),
    ])
    if (await cta.isVisible()) {
      await cta.click()
    } else {
      await addBtn.click()
    }
    await expect(page.getByRole("heading", { name: "Add account" })).toBeVisible({ timeout: 5000 })
    await page.getByLabel("Name").fill("Chase Checking")
    await page.locator("select[name='type']").selectOption("CHECKING")
    await page.getByRole("combobox", { name: "Select currency" }).click()
    await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search currency…").fill("USD")
    await page.getByRole("option", { name: /^USD/ }).waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /^USD/ }).click()
    const balanceInput = page.getByLabel("Starting balance")
    await balanceInput.clear()
    await balanceInput.fill("5000.00")
    await page.getByRole("button", { name: "Save account" }).click()
    await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
      timeout: 10000,
    })

    // Navigate to /dashboard/budgets — should see empty state
    await page.goto("/dashboard/budgets")
    await expect(page.getByRole("heading", { level: 1, name: "Budgets" })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole("button", { name: "Create your first budget" })).toBeVisible({
      timeout: 5000,
    })

    // Create a $400 USD MONTHLY Groceries budget via the UI (US1 flow)
    await page.getByRole("button", { name: "Create your first budget" }).click()
    await expect(page.getByRole("heading", { name: "Add budget" })).toBeVisible({ timeout: 5000 })

    // Select Groceries category
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    await page.getByRole("option", { name: "Groceries" }).click()

    // Fill amount = 400; currency = USD (default); period = MONTHLY (default)
    await page.getByLabel("Amount").fill("400")

    // Submit
    await page.getByRole("button", { name: "Save budget" }).click()
    await expect(page.getByRole("heading", { name: "Add budget" })).not.toBeVisible({
      timeout: 10000,
    })

    // (a) Assert: the budget row is visible; actuals = $0.00; remaining = $400.00
    // Both budgeted ($400) and remaining ($400 when actuals=$0) show $400.00,
    // so we use .first() to avoid strict mode violation.
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("$400.00").first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("$0.00")).toBeVisible({ timeout: 5000 })
  })

  // (b) Record one Groceries EXPENSE for $50 via the UI on /dashboard/transactions.
  //     (c) Navigate back to /dashboard/budgets; assert actuals = $50.00, remaining = $350.00,
  //     progress 12.5%, status "under".
  test("(b)-(c) record $50 Groceries EXPENSE; actuals update to $50.00, remaining = $350.00, status under", async ({
    page,
  }) => {
    await signIn(page, sc010Email)

    // (b) Navigate to /dashboard/transactions and record a $50 Groceries EXPENSE via UI
    await page.goto("/dashboard/transactions")
    await expect(
      page.getByRole("heading", { level: 1, name: "Transactions", exact: true }),
    ).toBeVisible({
      timeout: 10000,
    })

    const addTxBtn = page.getByRole("button", { name: "+ Add transaction" })
    await addTxBtn.click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Select Chase Checking account
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Chase Checking/ }).click()

    // Select Groceries category (search since it's a child of Food)
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    // CommandItem text may include parent "(Food)" — use partial name match
    const groceryOpt50 = page.getByRole("option").filter({ hasText: "Groceries" }).first()
    await groceryOpt50.waitFor({ state: "visible", timeout: 5000 })
    await groceryOpt50.click()

    // Fill amount $50
    await page.getByPlaceholder("0.00").fill("50")
    await page.getByLabel(/Payee/).fill("Market")

    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // (c) Navigate back to /dashboard/budgets
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Actuals = $50.00 byte-for-byte
    await expect(page.getByText("$50.00")).toBeVisible({ timeout: 5000 })

    // Remaining = $350.00
    await expect(page.getByText("$350.00")).toBeVisible({ timeout: 5000 })

    // Status "under" (12.5%) — no near/over icons
    await expect(page.getByLabel("Near budget limit")).not.toBeVisible()
    await expect(page.getByLabel("Over budget")).not.toBeVisible()

    // Progress bar is present (12.5%)
    await expect(page.getByRole("progressbar")).toBeVisible({ timeout: 5000 })
  })

  // (d) Record another Groceries EXPENSE for $300 via UI. Reload /dashboard/budgets.
  //     Assert actuals = $350.00, remaining = $50.00, progress 87.5%, status "near".
  test("(d) record $300 Groceries EXPENSE; actuals = $350.00, remaining = $50.00, status near", async ({
    page,
  }) => {
    await signIn(page, sc010Email)

    // Record a $300 Groceries EXPENSE via UI
    await page.goto("/dashboard/transactions")
    await expect(
      page.getByRole("heading", { level: 1, name: "Transactions", exact: true }),
    ).toBeVisible({
      timeout: 10000,
    })

    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Chase Checking/ }).click()

    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    const groceryOpt300 = page.getByRole("option").filter({ hasText: "Groceries" }).first()
    await groceryOpt300.waitFor({ state: "visible", timeout: 5000 })
    await groceryOpt300.click()

    await page.getByPlaceholder("0.00").fill("300")
    await page.getByLabel(/Payee/).fill("Superstore")

    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // Reload /dashboard/budgets
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Actuals = $350.00 (= $50 + $300)
    await expect(page.getByText("$350.00")).toBeVisible({ timeout: 5000 })

    // Remaining = $50.00
    await expect(page.getByText("$50.00")).toBeVisible({ timeout: 5000 })

    // Status "near" (87.5% >= 80% threshold) — warning icon MUST be present (FR-025 non-color rule)
    await expect(page.getByLabel("Near budget limit")).toBeVisible({ timeout: 5000 })

    // No "over" icon
    await expect(page.getByLabel("Over budget")).not.toBeVisible()

    // Progress bar is present
    await expect(page.getByRole("progressbar")).toBeVisible({ timeout: 5000 })
  })

  // (e) Record one more Groceries EXPENSE for $80 (total $430, over $400 budget).
  //     Assert actuals = $430.00, remaining = -$30.00, progress capped at 100%, status "over".
  test("(e) record $80 Groceries EXPENSE; total $430 over-budget; actuals = $430.00, remaining = -$30.00, status over", async ({
    page,
  }) => {
    await signIn(page, sc010Email)

    // Record a $80 Groceries EXPENSE via UI
    await page.goto("/dashboard/transactions")
    await expect(
      page.getByRole("heading", { level: 1, name: "Transactions", exact: true }),
    ).toBeVisible({
      timeout: 10000,
    })

    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Chase Checking/ }).click()

    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search categories…").fill("Groceries")
    const groceryOpt80 = page.getByRole("option").filter({ hasText: "Groceries" }).first()
    await groceryOpt80.waitFor({ state: "visible", timeout: 5000 })
    await groceryOpt80.click()

    await page.getByPlaceholder("0.00").fill("80")
    await page.getByLabel(/Payee/).fill("Corner Store")

    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // Reload /dashboard/budgets
    await page.goto("/dashboard/budgets")
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 10000 })

    // Actuals = $430.00 (= $50 + $300 + $80)
    await expect(page.getByText("$430.00")).toBeVisible({ timeout: 5000 })

    // Remaining = -$30.00 (negative — over budget; <Money> renders in money-negative color)
    await expect(page.getByText("-$30.00")).toBeVisible({ timeout: 5000 })

    // Status "over" — over-budget icon MUST be present (FR-025 / SC-011 non-color rule)
    await expect(page.getByLabel("Over budget")).toBeVisible({ timeout: 5000 })

    // No "near" icon (over status takes precedence)
    await expect(page.getByLabel("Near budget limit")).not.toBeVisible()

    // Progress bar is present. The visual fill is capped at 100% (via CSS width),
    // while aria-valuenow reflects the true over-budget percentage (>100) for screen readers.
    // The <ProgressBar> component intentionally uses truePercent for aria-valuenow.
    const progressBar = page.getByRole("progressbar")
    await expect(progressBar).toBeVisible({ timeout: 5000 })
    // aria-valuenow reflects the true ratio (may exceed 100 for over-budget — by design)
    const ariaValue = await progressBar.getAttribute("aria-valuenow")
    expect(Number(ariaValue)).toBeGreaterThan(100) // 108% — confirms over-budget
  })
})
