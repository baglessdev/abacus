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
  // Truncate in FK dependency order:
  // Transaction references Account and Category; Account and Category reference User.
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

/** Navigate to the transactions page via sidebar TRACK group. */
async function goToTransactions(page: Page) {
  const primaryNav = page.getByRole("navigation", { name: "Primary" })
  await primaryNav.getByRole("link", { name: "Transactions" }).click()
  await expect(page).toHaveURL("/dashboard/transactions")
}

/**
 * Creates a checking account via the accounts page UI.
 * Assumes the user is signed in. Navigates to /dashboard/accounts.
 */
async function createAccount(
  page: Page,
  opts: { name: string; type: string; currency: string; startingBalance: string },
) {
  await page.goto("/dashboard/accounts")

  // Wait for either the empty state CTA or the "+ Add account" button
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

  await page.getByLabel("Name").fill(opts.name)

  // Type is a native <select>
  const typeSelect = page.locator("select[name='type']")
  await typeSelect.selectOption(opts.type)

  // Currency combobox
  await page.getByRole("combobox", { name: "Select currency" }).click()
  const currencyListbox = page.getByRole("listbox")
  await currencyListbox.waitFor({ state: "visible", timeout: 5000 })
  await page.getByPlaceholder("Search currency…").fill(opts.currency)
  const currencyOption = page.getByRole("option", { name: new RegExp(`^${opts.currency}`) })
  await currencyOption.waitFor({ state: "visible", timeout: 5000 })
  await currencyOption.click()

  // Starting balance
  const balanceInput = page.getByLabel("Starting balance")
  await balanceInput.clear()
  await balanceInput.fill(opts.startingBalance)

  await page.getByRole("button", { name: "Save account" }).click()
  await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
    timeout: 10000,
  })
}

// ---------------------------------------------------------------------------
// US1: Record an expense transaction
// ---------------------------------------------------------------------------

test.describe("Transactions US1", () => {
  // Shared user for US1 tests
  const us1Email = `e2e-transactions-us1-${Date.now()}@example.com`

  test("creates an expense transaction; account balance updates", async ({ page }) => {
    // Step 1: Sign up a fresh user
    await signUp(page, us1Email)

    // Step 2: Create Chase Checking account with $1,000 starting balance
    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1000.00",
    })

    // Assert the account row appears with the correct starting balance
    await expect(page.getByText("Chase Checking", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("$1,000.00")).toBeVisible({ timeout: 10000 })

    // Step 3: Navigate to /dashboard/transactions via sidebar TRACK group
    await goToTransactions(page)

    // Assert the no-transactions empty state (accounts exist but no transactions yet)
    // Use exact: true to avoid substring-matching "No transactions yet" which also contains "Transactions"
    await expect(
      page.getByRole("heading", { level: 1, name: "Transactions", exact: true }),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("No transactions yet")).toBeVisible({ timeout: 5000 })

    // Assert the "+ Add transaction" CTA is ENABLED (accounts exist)
    const addTxBtn = page.getByRole("button", { name: "+ Add transaction" })
    await expect(addTxBtn).toBeEnabled()

    // Step 4: Click "+ Add transaction" — sheet opens
    await addTxBtn.click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Step 5: Fill the transaction form
    // Account: select Chase Checking via AccountPicker combobox
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Chase Checking/ }).click()

    // Type: EXPENSE (default — leave as-is)
    // The type select should already show EXPENSE by default

    // Category: Food (an EXPENSE seed category)
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: "Food", exact: true }).click()

    // Date: today (already defaults to today — leave as-is)

    // Amount: 50.00 (positive magnitude; form signs it as -50 for EXPENSE)
    const amountInput = page.getByPlaceholder("0.00")
    await amountInput.fill("50.00")

    // Payee: Whole Foods
    await page.getByLabel(/Payee/).fill("Whole Foods")

    // Step 6: Submit
    await page.getByRole("button", { name: "Save" }).click()

    // Sheet should close after successful submission
    await expect(page.getByRole("heading", { name: "Add transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // Step 7: Assert the row appears in the transactions list
    // Payee "Whole Foods" should be visible
    await expect(page.getByText("Whole Foods", { exact: true })).toBeVisible({ timeout: 10000 })

    // Category "Food" should be visible in the row
    await expect(page.getByText("Food", { exact: true })).toBeVisible({ timeout: 10000 })

    // Account "Chase Checking" should be visible in the row
    await expect(page.getByText("Chase Checking", { exact: true })).toBeVisible({ timeout: 10000 })

    // Amount: -$50.00 (negative, rendered in money-negative red via <Money>)
    // The <Money> component applies text-money-negative class for negative amounts.
    const amountCell = page.locator(".text-money-negative").filter({ hasText: "$50.00" })
    await expect(amountCell).toBeVisible({ timeout: 10000 })

    // Step 8: Navigate to /dashboard/accounts — verify Chase Checking balance = $950.00
    await page.goto("/dashboard/accounts")
    await expect(page.getByText("Chase Checking", { exact: true })).toBeVisible({ timeout: 10000 })
    // Balance = $1,000 (starting) + (-$50 expense) = $950.00
    await expect(page.getByText("$950.00")).toBeVisible({ timeout: 10000 })

    // Step 9: Reload and verify balance persists
    await page.reload()
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("Chase Checking", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("$950.00")).toBeVisible({ timeout: 10000 })
  })

  test("cross-user isolation — second user sees empty list", async ({ browser }) => {
    // Open a fresh browser context (isolated cookies/storage — completely new session)
    const context = await browser.newContext()
    const page = await context.newPage()

    // Sign up a second user
    const user2Email = `e2e-transactions-user2-${Date.now()}@example.com`
    await signUp(page, user2Email)

    // Navigate to /dashboard/transactions
    await goToTransactions(page)

    // Second user has no accounts — should see the "no accounts" empty state
    // (not the first user's transactions)
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible({
      timeout: 5000,
    })

    // Should NOT see "Whole Foods" from the first user's transactions (cross-user isolation)
    await expect(page.getByText("Whole Foods", { exact: true })).not.toBeVisible()

    // The "no accounts" empty state should appear because this user has no accounts yet
    // OR the "no transactions" empty state if categories were seeded but accounts not yet created.
    // Either way, no trace of the first user's data.
    await expect(
      page.getByText("Create an account first").or(page.getByText("No transactions yet")),
    ).toBeVisible({
      timeout: 5000,
    })

    await context.close()
  })
})

// ---------------------------------------------------------------------------
// US2: Record an income transaction
// ---------------------------------------------------------------------------

test.describe("Transactions US2", () => {
  // Re-use the US1 user (who already has Chase Checking with $950 balance after the expense)
  const us2Email = `e2e-transactions-us2-${Date.now()}@example.com`

  test("creates an income transaction; balance increases", async ({ page }) => {
    // Step 1: Sign up a fresh user and create Chase Checking ($1,000 starting)
    await signUp(page, us2Email)
    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1000.00",
    })

    // Step 2: Navigate to /dashboard/transactions and click "+ Add transaction"
    await goToTransactions(page)
    await expect(page.getByText("No transactions yet")).toBeVisible({ timeout: 5000 })

    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Step 3: Fill the income transaction form
    // Account: Chase Checking
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Chase Checking/ }).click()

    // Type: switch to INCOME
    const typeSelect = page.getByTestId("type-select")
    await typeSelect.click()
    await page.getByRole("option", { name: "INCOME" }).click()

    // Category: Salary (an INCOME seed category — appears after switching to INCOME type)
    await page.getByRole("combobox", { name: "Category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: "Salary", exact: true }).click()

    // Date: today (already defaults to today)

    // Amount: 3200.00 (positive magnitude; form signs it as +3200 for INCOME)
    const amountInput = page.getByPlaceholder("0.00")
    await amountInput.fill("3200.00")

    // Payee: Acme Corp
    await page.getByLabel(/Payee/).fill("Acme Corp")

    // Step 4: Submit
    await page.getByRole("button", { name: "Save" }).click()

    // Sheet should close
    await expect(page.getByRole("heading", { name: "Add transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // Step 5: Assert the row appears with positive amount in foreground color
    // "Acme Corp" payee visible
    await expect(page.getByText("Acme Corp", { exact: true })).toBeVisible({ timeout: 10000 })

    // Category "Salary" visible
    await expect(page.getByText("Salary", { exact: true })).toBeVisible({ timeout: 10000 })

    // Amount: $3,200.00 in foreground color (NOT money-negative red — positive INCOME)
    // The <Money> component applies text-foreground for positive amounts.
    // Verify the amount text is present and does NOT have the money-negative class.
    const amountCells = page.locator("td").filter({ hasText: "$3,200.00" })
    await expect(amountCells.first()).toBeVisible({ timeout: 10000 })

    // Verify it's NOT rendered with money-negative color
    const negativeAmountCell = page.locator(".text-money-negative").filter({ hasText: "$3,200.00" })
    await expect(negativeAmountCell).not.toBeVisible()

    // Step 6: Navigate to /dashboard/accounts — verify Chase Checking balance = $4,200.00
    await page.goto("/dashboard/accounts")
    await expect(page.getByText("Chase Checking", { exact: true })).toBeVisible({ timeout: 10000 })
    // Balance = $1,000 (starting) + $3,200 (income) = $4,200.00
    await expect(page.getByText("$4,200.00")).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// US3: Transfer money between two accounts (atomic two-leg)
// ---------------------------------------------------------------------------

test.describe("Transactions US3", () => {
  const us3Email = `e2e-transactions-us3-${Date.now()}@example.com`
  let us3UserId: string | null = null

  test("creates a transfer; both accounts update; transferGroupId invariant holds", async ({
    page,
  }) => {
    // Step 1: Sign up fresh user
    await signUp(page, us3Email)

    // Capture the user id for Prisma assertions below
    const userRecord = await prisma.user.findFirst({ where: { email: us3Email } })
    us3UserId = userRecord?.id ?? null

    // Step 2: Create Chase Checking (USD, $1000) and Savings (USD, $0)
    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1000.00",
    })
    await createAccount(page, {
      name: "Savings",
      type: "SAVINGS",
      currency: "USD",
      startingBalance: "0.00",
    })

    // Step 3: Navigate to /dashboard/transactions and click "+ Add transfer"
    await goToTransactions(page)
    await expect(page.getByText("No transactions yet")).toBeVisible({ timeout: 5000 })

    const addTransferBtn = page.getByRole("button", { name: "+ Add transfer" })
    await expect(addTransferBtn).toBeEnabled()
    await addTransferBtn.click()

    // Assert the transfer sheet opens
    await expect(page.getByRole("heading", { name: "Add transfer" })).toBeVisible({
      timeout: 5000,
    })

    // Step 4: Fill the transfer form
    // From account: Chase Checking
    await page.getByRole("combobox", { name: "Account" }).first().click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Chase Checking/ }).click()

    // To account: Savings (same currency filter is active)
    // After from-account is selected, to-account picker becomes enabled
    await page.getByRole("combobox", { name: "Account" }).last().click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Savings/ }).click()

    // Date: today (already defaults)

    // Amount: 500.00
    await page.getByPlaceholder("0.00").fill("500.00")

    // Notes: "Move to savings"
    await page.getByLabel(/Notes/).fill("Move to savings")

    // Step 5: Submit
    await page.getByRole("button", { name: "Save transfer" }).click()

    // Step 5b: Assert sheet closes
    await expect(page.getByRole("heading", { name: "Add transfer" })).not.toBeVisible({
      timeout: 10000,
    })

    // Step 6: Assert TWO new rows appear in the transactions list
    // Chase Checking row: amount = -$500.00 (money-negative red), type=TRANSFER
    const negativeRow = page.locator(".text-money-negative").filter({ hasText: "$500.00" })
    await expect(negativeRow).toBeVisible({ timeout: 10000 })

    // Savings row: amount = +$500.00 (default foreground), type=TRANSFER
    const positiveAmountCells = page.locator("td").filter({ hasText: "$500.00" })
    await expect(positiveAmountCells.first()).toBeVisible({ timeout: 10000 })

    // Both rows should have TRANSFER badge visible in the list
    const transferBadges = page.getByText("TRANSFER")
    await expect(transferBadges.first()).toBeVisible({ timeout: 10000 })

    // Step 7: Direct Prisma query to verify invariants
    if (us3UserId) {
      const transferRows = await prisma.transaction.findMany({
        where: { userId: us3UserId, type: "TRANSFER" },
      })
      expect(transferRows).toHaveLength(2)
      const [legA, legB] = transferRows as [(typeof transferRows)[0], (typeof transferRows)[0]]
      expect(legA.transferGroupId).toBe(legB.transferGroupId)
      expect(legA.transferGroupId).not.toBeNull()
      const amounts = transferRows.map((r) => Number(r.amount.toString())).sort()
      expect(amounts).toEqual([-500, 500])
    }

    // Step 8: Navigate to /dashboard/accounts — verify balances updated
    await page.goto("/dashboard/accounts")
    // Chase Checking: was $1000, -$500 = $500.00
    const rows = page.getByRole("row")
    const checkingRow = rows.filter({ hasText: "Chase Checking" })
    await expect(checkingRow.getByText("$500.00")).toBeVisible({ timeout: 10000 })

    // Savings: was $0, +$500 = $500.00
    const savingsRow = rows.filter({ hasText: "Savings" })
    await expect(savingsRow.getByText("$500.00")).toBeVisible({ timeout: 10000 })

    // Step 9: Reload — both balances persist
    await page.reload()
    await page.waitForLoadState("networkidle")
    const rowsAfterReload = page.getByRole("row")
    await expect(
      rowsAfterReload.filter({ hasText: "Chase Checking" }).getByText("$500.00"),
    ).toBeVisible({ timeout: 10000 })
    await expect(rowsAfterReload.filter({ hasText: "Savings" }).getByText("$500.00")).toBeVisible({
      timeout: 10000,
    })
  })
})

// ---------------------------------------------------------------------------
// US4: Edit / archive / unarchive — atomic for transfers
// ---------------------------------------------------------------------------

test.describe("Transactions US4", () => {
  const us4Email = `e2e-transactions-us4-${Date.now()}@example.com`
  let us4UserId: string | null = null

  /**
   * Helper: creates the US4 test setup — a user with Checking ($1000) and Savings ($0),
   * plus a $500 transfer from Checking → Savings, plus a $50 expense.
   */
  async function setupUS4(page: Page) {
    await signUp(page, us4Email)
    const userRecord = await prisma.user.findFirst({ where: { email: us4Email } })
    us4UserId = userRecord?.id ?? null

    await createAccount(page, {
      name: "Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1000.00",
    })
    await createAccount(page, {
      name: "Savings",
      type: "SAVINGS",
      currency: "USD",
      startingBalance: "0.00",
    })

    // Create a $50 expense from Checking
    await goToTransactions(page)
    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Checking/ }).click()
    // Type EXPENSE (default)
    await page.getByLabel(/Payee/).fill("Whole Foods")
    await page.getByPlaceholder("0.00").fill("50.00")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // Create the $500 transfer Checking → Savings
    await page.getByRole("button", { name: "+ Add transfer" }).click()
    await expect(page.getByRole("heading", { name: "Add transfer" })).toBeVisible({
      timeout: 5000,
    })
    await page.getByRole("combobox", { name: "Account" }).first().click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Checking/ }).click()
    await page.getByRole("combobox", { name: "Account" }).last().click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /Savings/ }).click()
    await page.getByPlaceholder("0.00").fill("500.00")
    await page.getByRole("button", { name: "Save transfer" }).click()
    await expect(page.getByRole("heading", { name: "Add transfer" })).not.toBeVisible({
      timeout: 10000,
    })
  }

  test("edits a single-leg transaction; balance recomputes", async ({ page }) => {
    await setupUS4(page)

    // Navigate to transactions; find the Whole Foods $50 expense row and click it
    await goToTransactions(page)
    await expect(page.getByText("Whole Foods", { exact: true })).toBeVisible({ timeout: 10000 })

    // Click the Whole Foods row to open the edit sheet
    const wholeFoodsRow = page.getByRole("row").filter({ hasText: "Whole Foods" })
    await wholeFoodsRow.click()

    // Assert edit sheet opens (title "Edit transaction")
    await expect(page.getByRole("heading", { name: "Edit transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Change amount to 75.00
    const amountInput = page.getByPlaceholder("0.00")
    await amountInput.clear()
    await amountInput.fill("75.00")

    // Submit
    await page.getByRole("button", { name: "Save changes" }).click()

    // Sheet should close
    await expect(page.getByRole("heading", { name: "Edit transaction" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert updated amount in list: -$75.00
    const updatedAmountCell = page.locator(".text-money-negative").filter({ hasText: "$75.00" })
    await expect(updatedAmountCell).toBeVisible({ timeout: 10000 })

    // Navigate to accounts — Checking balance: $1000 - $75 (expense) - $500 (transfer) = $425.00
    await page.goto("/dashboard/accounts")
    const checkingRow = page.getByRole("row").filter({ hasText: "Checking" })
    await expect(checkingRow.getByText("$425.00")).toBeVisible({ timeout: 10000 })
  })

  test("edits a transfer; BOTH legs update atomically", async ({ page }) => {
    // Sign in as the same user from previous test (setupUS4 registered us4Email).
    await page.goto("/login")
    await page.getByLabel("Email").fill(us4Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    // Navigate directly to transactions.
    await page.goto("/dashboard/transactions")
    await expect(page).toHaveURL("/dashboard/transactions")

    // Find a transfer row and click it
    // Both TRANSFER rows have TRANSFER badge; find the one for Checking (negative amount)
    const transferRows = page.getByRole("row").filter({ hasText: "TRANSFER" })
    // Click the first transfer row
    await transferRows.first().click()

    // Assert the TRANSFER edit sheet opens — title "Edit transfer"
    await expect(page.getByRole("heading", { name: "Edit transfer" })).toBeVisible({
      timeout: 5000,
    })

    // Change amount to 600.00
    const amountInput = page.getByPlaceholder("0.00")
    await amountInput.clear()
    await amountInput.fill("600.00")

    // Submit
    await page.getByRole("button", { name: "Save changes" }).click()

    // Sheet should close
    await expect(page.getByRole("heading", { name: "Edit transfer" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert TWO updated rows: -$600.00 and +$600.00
    const negativeTransfer = page.locator(".text-money-negative").filter({ hasText: "$600.00" })
    await expect(negativeTransfer).toBeVisible({ timeout: 10000 })

    const allAmountCells = page.locator("td").filter({ hasText: "$600.00" })
    await expect(allAmountCells.first()).toBeVisible({ timeout: 10000 })

    // Verify via Prisma: both legs share transferGroupId, amounts are ±600
    if (us4UserId) {
      const transferRows2 = await prisma.transaction.findMany({
        where: { userId: us4UserId, type: "TRANSFER", archivedAt: null },
      })
      expect(transferRows2).toHaveLength(2)
      const [leg2A, leg2B] = transferRows2 as [(typeof transferRows2)[0], (typeof transferRows2)[0]]
      expect(leg2A.transferGroupId).toBe(leg2B.transferGroupId)
      const amounts = transferRows2.map((r) => Number(r.amount.toString())).sort()
      expect(amounts).toEqual([-600, 600])
    }

    // Navigate to accounts — Checking: $1000 - $75 (expense) - $600 (transfer) = $325
    // Savings: $0 + $600 = $600
    await page.goto("/dashboard/accounts")
    const checkingRow = page.getByRole("row").filter({ hasText: "Checking" })
    await expect(checkingRow.getByText("$325.00")).toBeVisible({ timeout: 10000 })
    const savingsRow = page.getByRole("row").filter({ hasText: "Savings" })
    await expect(savingsRow.getByText("$600.00")).toBeVisible({ timeout: 10000 })
  })

  test("archives a transfer; BOTH legs disappear; toggle reveals; unarchive restores BOTH", async ({
    page,
  }) => {
    // Sign in as the same user — they have a $600 transfer and $75 expense.
    await page.goto("/login")
    await page.getByLabel("Email").fill(us4Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    await page.goto("/dashboard/transactions")
    await expect(page).toHaveURL("/dashboard/transactions")

    // Both transfer rows should be visible (look in table for TRANSFER badge)
    const transferBadgesInTable2 = page
      .getByRole("table")
      .locator(".text-xs", { hasText: "TRANSFER" })
    await expect(transferBadgesInTable2.first()).toBeVisible({ timeout: 10000 })

    // Step 1: Click the trailing Archive button on a transfer row
    // Find a TRANSFER row (containing the TRANSFER badge in the table) and click its Archive button
    const firstTransferRow = page
      .getByRole("row")
      .filter({ has: page.locator(".text-xs", { hasText: "TRANSFER" }) })
      .first()
    await firstTransferRow.getByRole("button", { name: "Archive" }).click()

    // Step 2: Confirm in dialog
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Archive this transfer?")).toBeVisible({ timeout: 5000 })
    await page.getByRole("button", { name: "Archive" }).click()

    // Step 3: Assert BOTH transfer rows disappear from default list
    // Wait for the dialog to close and page to update
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 })
    // TRANSFER badges inside table rows should no longer be visible (both archived)
    // Use a more specific locator to avoid matching the "+ Add transfer" button
    const transferBadgesInTable = page
      .getByRole("table")
      .locator(".text-xs", { hasText: "TRANSFER" })
    await expect(transferBadgesInTable).not.toBeVisible({ timeout: 10000 })

    // Step 4: Navigate to accounts — both balances reverted
    // Checking: $1000 - $75 (expense, still active) = $925
    // Savings: $0 (transfer archived, so $0 net)
    await page.goto("/dashboard/accounts")
    const checkingRow = page.getByRole("row").filter({ hasText: "Checking" })
    await expect(checkingRow.getByText("$925.00")).toBeVisible({ timeout: 10000 })
    const savingsRow = page.getByRole("row").filter({ hasText: "Savings" })
    await expect(savingsRow.getByText("$0.00")).toBeVisible({ timeout: 10000 })

    // Step 5: Back to transactions — toggle "Show archived" on
    await page.goto("/dashboard/transactions")
    await expect(page).toHaveURL("/dashboard/transactions")
    const showArchivedSwitch = page.getByRole("switch", { name: /Show archived/ })
    await showArchivedSwitch.click()

    // Both archived transfer rows should reappear with "Archived" badges in the table
    const archivedBadgesInTable = page
      .getByRole("table")
      .locator(".text-xs", { hasText: "Archived" })
    await expect(archivedBadgesInTable.first()).toBeVisible({ timeout: 10000 })
    // Both TRANSFER badges should also be visible in the table
    const transferBadgesInTableToggled = page
      .getByRole("table")
      .locator(".text-xs", { hasText: "TRANSFER" })
    await expect(transferBadgesInTableToggled.first()).toBeVisible({ timeout: 10000 })

    // Step 6: Click the Unarchive button on either archived transfer row
    // Filter rows that contain a TRANSFER badge (inside the table)
    const archivedTransferRow = page
      .getByRole("row")
      .filter({ has: page.locator(".text-xs", { hasText: "TRANSFER" }) })
      .first()
    await archivedTransferRow.getByRole("button", { name: "Unarchive" }).click()

    // Wait for the unarchive to complete
    await page.waitForLoadState("networkidle")

    // Step 7: Toggle "Show archived" off — BOTH transfer rows back in active list
    await showArchivedSwitch.click()
    // After toggle off, only active transactions visible; TRANSFER badges should still be there (active)
    await expect(
      page.getByRole("table").locator(".text-xs", { hasText: "TRANSFER" }).first(),
    ).toBeVisible({ timeout: 10000 })

    // Verify via Prisma: archivedAt on both rows is null
    if (us4UserId) {
      const transferRows3 = await prisma.transaction.findMany({
        where: { userId: us4UserId, type: "TRANSFER" },
      })
      expect(transferRows3).toHaveLength(2)
      for (const row of transferRows3) {
        expect(row.archivedAt).toBeNull()
      }
    }
  })
})

// ---------------------------------------------------------------------------
// US5: Filter the transactions list — URL-driven (date range, account, type)
// ---------------------------------------------------------------------------

test.describe("Transactions US5", () => {
  const us5Email = `e2e-transactions-us5-${Date.now()}@example.com`
  let us5UserId: string | null = null

  /**
   * Setup helper: one user with two accounts + transactions across types.
   * - Chase Checking (USD, $1000): EXPENSE today $50, INCOME today $200
   * - Savings (USD, $500): INCOME today $3000
   * - TRANSFER today Checking→Savings $100
   * We also create a 35-days-ago EXPENSE to test the date range filter.
   */
  async function setupUS5(page: Page) {
    await signUp(page, us5Email)
    const userRecord = await prisma.user.findFirst({ where: { email: us5Email } })
    us5UserId = userRecord?.id ?? null

    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1000.00",
    })
    await createAccount(page, {
      name: "Savings",
      type: "SAVINGS",
      currency: "USD",
      startingBalance: "500.00",
    })

    // If userId is available, create transactions via Prisma directly
    // (faster and avoids UI complexity for setup)
    if (us5UserId) {
      const checking = await prisma.account.findFirst({
        where: { userId: us5UserId, name: "Chase Checking" },
      })
      const savings = await prisma.account.findFirst({
        where: { userId: us5UserId, name: "Savings" },
      })

      if (checking && savings) {
        const today = new Date()
        today.setUTCHours(0, 0, 0, 0)

        const thirtyFiveDaysAgo = new Date(today)
        thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35)

        const transferGroupId = `tg-${Date.now()}`

        // EXPENSE today on Checking
        await prisma.transaction.create({
          data: {
            userId: us5UserId,
            accountId: checking.id,
            date: today,
            amount: new (await import("@prisma/client")).Prisma.Decimal("-50"),
            currency: "USD",
            type: "EXPENSE",
            payee: "Today Expense",
          },
        })

        // EXPENSE 35 days ago on Checking
        await prisma.transaction.create({
          data: {
            userId: us5UserId,
            accountId: checking.id,
            date: thirtyFiveDaysAgo,
            amount: new (await import("@prisma/client")).Prisma.Decimal("-30"),
            currency: "USD",
            type: "EXPENSE",
            payee: "Old Expense",
          },
        })

        // INCOME today on Savings
        await prisma.transaction.create({
          data: {
            userId: us5UserId,
            accountId: savings.id,
            date: today,
            amount: new (await import("@prisma/client")).Prisma.Decimal("3000"),
            currency: "USD",
            type: "INCOME",
            payee: "Salary",
          },
        })

        // TRANSFER today Checking→Savings ($100)
        await prisma.transaction.create({
          data: {
            userId: us5UserId,
            accountId: checking.id,
            date: today,
            amount: new (await import("@prisma/client")).Prisma.Decimal("-100"),
            currency: "USD",
            type: "TRANSFER",
            transferGroupId,
          },
        })
        await prisma.transaction.create({
          data: {
            userId: us5UserId,
            accountId: savings.id,
            date: today,
            amount: new (await import("@prisma/client")).Prisma.Decimal("100"),
            currency: "USD",
            type: "TRANSFER",
            transferGroupId,
          },
        })
      }
    }
  }

  test("default 30-day range: shows recent transactions; old EXPENSE excluded", async ({
    page,
  }) => {
    await setupUS5(page)

    // Visit /dashboard/transactions (default range = last 30 days)
    await page.goto("/dashboard/transactions")
    await expect(page).toHaveURL("/dashboard/transactions")

    // Wait for the page to load
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({
      timeout: 10000,
    })

    // Recent transactions should be visible
    await expect(page.getByText("Today Expense", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Salary", { exact: true })).toBeVisible({ timeout: 10000 })

    // TRANSFER badge should appear (2 legs)
    await expect(page.getByText("TRANSFER").first()).toBeVisible({ timeout: 10000 })

    // "Old Expense" (35 days ago) should NOT be visible (outside 30-day window)
    await expect(page.getByText("Old Expense", { exact: true })).not.toBeVisible()
  })

  test("filter by type=TRANSFER: URL updates; only TRANSFER rows visible", async ({ page }) => {
    // Sign in as US5 user (already has data)
    await page.goto("/login")
    await page.getByLabel("Email").fill(us5Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    // Navigate to transactions with type=TRANSFER filter
    await page.goto("/dashboard/transactions?type=TRANSFER")
    await expect(page).toHaveURL("/dashboard/transactions?type=TRANSFER")

    // Wait for page to settle
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({
      timeout: 10000,
    })

    // The type filter select should show TRANSFER
    // TRANSFER rows should be visible
    const transferBadges = page.getByText("TRANSFER")
    await expect(transferBadges.first()).toBeVisible({ timeout: 10000 })

    // Non-TRANSFER transactions should NOT be visible
    await expect(page.getByText("Today Expense", { exact: true })).not.toBeVisible()
    await expect(page.getByText("Salary", { exact: true })).not.toBeVisible()
  })

  test("filter by account: URL updates; only that account's rows visible", async ({ page }) => {
    if (!us5UserId) {
      test.skip()
      return
    }

    // Get Checking account id
    const checking = await prisma.account.findFirst({
      where: { userId: us5UserId, name: "Chase Checking" },
    })
    if (!checking) {
      test.skip()
      return
    }

    await page.goto("/login")
    await page.getByLabel("Email").fill(us5Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    // Navigate to transactions filtered by Checking account
    await page.goto(`/dashboard/transactions?accountId=${checking.id}`)
    await expect(page).toHaveURL(new RegExp(`accountId=${checking.id}`))

    // Wait for page to settle
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({
      timeout: 10000,
    })

    // Checking account transactions should be visible (Today Expense + TRANSFER outflow)
    await expect(page.getByText("Today Expense", { exact: true })).toBeVisible({ timeout: 10000 })

    // Savings account INCOME (Salary) should NOT be visible
    await expect(page.getByText("Salary", { exact: true })).not.toBeVisible()
  })

  test("show archived toggle updates URL with ?archived=1", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(us5Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    await page.goto("/dashboard/transactions")
    await expect(page).toHaveURL("/dashboard/transactions")

    // Toggle "Show archived" on
    const archivedSwitch = page.getByRole("switch", { name: /Show archived/ })
    await archivedSwitch.click()

    // URL should now contain archived=1
    await expect(page).toHaveURL(/archived=1/)
  })

  test("reload preserves URL filter params", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(us5Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    // Navigate with type=EXPENSE filter
    await page.goto("/dashboard/transactions?type=EXPENSE")
    await expect(page).toHaveURL(/type=EXPENSE/)

    // Reload
    await page.reload()
    await page.waitForLoadState("networkidle")

    // URL params should be preserved
    await expect(page).toHaveURL(/type=EXPENSE/)

    // Page should render with the filter applied
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({
      timeout: 10000,
    })
  })
})

// ---------------------------------------------------------------------------
// US6: Validation surfaces actionable errors at the Zod boundary
// ---------------------------------------------------------------------------

test.describe("Transactions US6", () => {
  const us6Email = `e2e-transactions-us6-${Date.now()}@example.com`
  let us6UserId: string | null = null

  async function setupUS6(page: Page) {
    await signUp(page, us6Email)
    const userRecord = await prisma.user.findFirst({ where: { email: us6Email } })
    us6UserId = userRecord?.id ?? null

    await createAccount(page, {
      name: "US6 Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "500.00",
    })
  }

  test("blank amount: validation error displayed; sheet stays open; no row added", async ({
    page,
  }) => {
    await setupUS6(page)

    // Count transactions before
    const countBefore = us6UserId
      ? await prisma.transaction.count({ where: { userId: us6UserId } })
      : 0

    // Navigate to transactions and open create form
    await goToTransactions(page)
    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Select account
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /US6 Checking/ }).click()

    // Leave amount blank (don't fill the magnitude input)

    // Submit
    await page.getByRole("button", { name: "Save" }).click()

    // Sheet should remain open (validation failure)
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Validation error should appear near the amount field
    // The schema rejects blank amount ("Amount is required")
    await expect(page.getByText(/Amount is required/i)).toBeVisible({ timeout: 5000 })

    // Verify no rows added
    if (us6UserId) {
      const countAfter = await prisma.transaction.count({ where: { userId: us6UserId } })
      expect(countAfter).toBe(countBefore)
    }
  })

  test("sign mismatch: INCOME with negative amount → error; sheet stays open", async ({ page }) => {
    // Sign in as US6 user
    await page.goto("/login")
    await page.getByLabel("Email").fill(us6Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    const countBefore = us6UserId
      ? await prisma.transaction.count({ where: { userId: us6UserId } })
      : 0

    await goToTransactions(page)
    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Select account
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /US6 Checking/ }).click()

    // Switch to INCOME type
    const typeSelect = page.getByTestId("type-select")
    await typeSelect.click()
    await page.getByRole("option", { name: "INCOME" }).click()

    // Fill a magnitude, but then tamper the hidden signed-amount input to be negative
    // (simulating a sign mismatch — INCOME with negative amount)
    const magnitudeInput = page.getByPlaceholder("0.00")
    await magnitudeInput.fill("100")

    // Tamper: set the hidden amount input to a negative value
    await page.evaluate(() => {
      const hiddenAmount = document.querySelector<HTMLInputElement>('input[name="amount"]')
      if (hiddenAmount) hiddenAmount.value = "-100"
    })

    // Submit
    await page.getByRole("button", { name: "Save" }).click()

    // Sheet should remain open
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Sign mismatch error should appear (exact message: "Income amount must be positive.")
    await expect(
      page.locator("p.text-destructive").filter({ hasText: /amount must be positive/i }),
    ).toBeVisible({ timeout: 5000 })

    // Verify no rows added
    if (us6UserId) {
      const countAfter = await prisma.transaction.count({ where: { userId: us6UserId } })
      expect(countAfter).toBe(countBefore)
    }
  })

  test("too many decimals: USD amount with 3 decimal places → error", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(us6Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    const countBefore = us6UserId
      ? await prisma.transaction.count({ where: { userId: us6UserId } })
      : 0

    await goToTransactions(page)
    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Select account
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /US6 Checking/ }).click()

    // Fill amount with too many decimals
    const magnitudeInput = page.getByPlaceholder("0.00")
    await magnitudeInput.fill("50.123")

    // Tamper: set the hidden amount input to the negative signed value (EXPENSE)
    await page.evaluate(() => {
      const hiddenAmount = document.querySelector<HTMLInputElement>('input[name="amount"]')
      if (hiddenAmount) hiddenAmount.value = "-50.123"
    })

    // Submit
    await page.getByRole("button", { name: "Save" }).click()

    // Sheet should remain open
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Error about decimal places should appear (exact message: "USD supports at most 2 decimal places.")
    await expect(
      page.locator("p.text-destructive").filter({ hasText: /decimal place|supports at most/i }),
    ).toBeVisible({ timeout: 5000 })

    // Verify no rows added
    if (us6UserId) {
      const countAfter = await prisma.transaction.count({ where: { userId: us6UserId } })
      expect(countAfter).toBe(countBefore)
    }
  })

  test("over-length payee (121 chars): validation error displayed", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(us6Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    const countBefore = us6UserId
      ? await prisma.transaction.count({ where: { userId: us6UserId } })
      : 0

    await goToTransactions(page)
    await page.getByRole("button", { name: "+ Add transaction" }).click()
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Select account
    await page.getByRole("combobox", { name: "Account" }).click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /US6 Checking/ }).click()

    // Fill amount
    const magnitudeInput = page.getByPlaceholder("0.00")
    await magnitudeInput.fill("50.00")

    // Fill payee with 121 chars (bypassing the maxLength by using evaluate)
    const longPayee = "A".repeat(121)
    await page.evaluate((payee) => {
      const payeeInput = document.querySelector<HTMLInputElement>('input[name="payee"]')
      if (payeeInput) {
        // Remove maxLength to bypass client-side limit
        payeeInput.removeAttribute("maxlength")
        payeeInput.value = payee
      }
    }, longPayee)

    // Submit
    await page.getByRole("button", { name: "Save" }).click()

    // Sheet should remain open
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible({
      timeout: 5000,
    })

    // Payee length error should appear (exact message: "Payee must be at most 120 characters")
    await expect(
      page.locator("p.text-destructive").filter({ hasText: /Payee must be at most 120/i }),
    ).toBeVisible({ timeout: 5000 })

    // Verify no rows added
    if (us6UserId) {
      const countAfter = await prisma.transaction.count({ where: { userId: us6UserId } })
      expect(countAfter).toBe(countBefore)
    }
  })

  test("transfer: to-account picker excludes EUR accounts when from is USD", async ({ page }) => {
    // Create a EUR account for this test
    await page.goto("/login")
    await page.getByLabel("Email").fill(us6Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    // Create EUR account
    await createAccount(page, {
      name: "EUR Savings",
      type: "SAVINGS",
      currency: "EUR",
      startingBalance: "0.00",
    })

    await goToTransactions(page)

    // Open the transfer form
    await page.getByRole("button", { name: "+ Add transfer" }).click()
    await expect(page.getByRole("heading", { name: "Add transfer" })).toBeVisible({ timeout: 5000 })

    // Select USD account as "from"
    const accountPickers = page.getByRole("combobox", { name: "Account" })
    await accountPickers.first().click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: /US6 Checking/ }).click()

    // Open "to" account picker — it should filter to USD only
    await accountPickers.last().click()
    await page.getByPlaceholder("Search accounts…").waitFor({ state: "visible", timeout: 5000 })

    // EUR Savings should NOT appear in the to-account picker (currency filter)
    // The AccountPicker filters by currency when the fromAccount's currency is set
    await expect(page.getByRole("option", { name: /EUR Savings/ })).not.toBeVisible()

    // US6 Checking SHOULD be listed (same currency = USD)
    // (but in transfer form it might exclude itself too — the form logic handles this)
    // At minimum verify the EUR account is not showing
  })

  // Note: currency_mismatch (signed-amount with wrong currency) is covered by unit tests
  // in tests/unit/transactions-schemas.test.ts (T018) and tests/unit/transactions-queries.test.ts (T019).
  // Transfer same-account rejection is also covered by T018 (createTransferSchema self-transfer check)
  // and T019 (createTransferForUser with fromAccountId === toAccountId).
})
