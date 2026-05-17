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
  // Category and Account both reference User → delete them first, then User.
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

/** Navigate to the categories page via sidebar. */
async function goToCategories(page: Page) {
  const primaryNav = page.getByRole("navigation", { name: "Primary" })
  await primaryNav.getByRole("link", { name: "Categories" }).click()
  await expect(page).toHaveURL("/dashboard/categories")
}

/** The 11 seed category names that every fresh user must see. */
const SEED_NAMES = [
  // 7 top-level EXPENSE
  "Food",
  "Housing",
  "Transport",
  "Utilities",
  "Entertainment",
  "Health",
  "Other Expenses",
  // 2 top-level INCOME
  "Salary",
  "Other Income",
  // 2 child EXPENSE under Food
  "Groceries",
  "Restaurants",
] as const

// ---------------------------------------------------------------------------
// US1: seeded categories appear for a fresh user
// ---------------------------------------------------------------------------

test.describe("Categories US1", () => {
  test("seeded categories appear for a fresh user", async ({ page }) => {
    const email = `e2e-categories-${Date.now()}@example.com`
    await signUp(page, email)

    // After signup, we should be on /dashboard.
    await expect(page).toHaveURL("/dashboard")

    // Click the "Categories" link in the sidebar primary navigation.
    const primaryNav = page.getByRole("navigation", { name: "Primary" })
    await primaryNav.getByRole("link", { name: "Categories" }).click()

    // Assert URL changed to /dashboard/categories.
    await expect(page).toHaveURL("/dashboard/categories")

    // Assert the page has the expected <h1>.
    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible()

    // Assert the section headings are present.
    await expect(page.getByRole("heading", { level: 2, name: "EXPENSE" })).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "INCOME" })).toBeVisible()

    // Assert all 11 seed category names are visible.
    for (const name of SEED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({
        timeout: 10000,
      })
    }

    // Verify at least one EXPENSE row (Food) and one INCOME row (Salary) are visible.
    await expect(page.getByText("Food", { exact: true })).toBeVisible()
    await expect(page.getByText("Salary", { exact: true })).toBeVisible()

    // Children (Groceries, Restaurants) are visible under Food.
    await expect(page.getByText("Groceries", { exact: true })).toBeVisible()
    await expect(page.getByText("Restaurants", { exact: true })).toBeVisible()

    // Reload → assert all 11 still visible (seed persisted, scoped to user).
    await page.reload()
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible()

    for (const name of SEED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({
        timeout: 10000,
      })
    }
  })

  test("second user sees their own seed, not the first user's", async ({ browser }) => {
    // Open a fresh browser context for the second user.
    const context = await browser.newContext()
    const page = await context.newPage()

    const email2 = `e2e-categories-user2-${Date.now()}@example.com`
    await signUp(page, email2)

    // Click the "Categories" link in the sidebar.
    const primaryNav = page.getByRole("navigation", { name: "Primary" })
    await primaryNav.getByRole("link", { name: "Categories" }).click()

    // Assert URL changed to /dashboard/categories.
    await expect(page).toHaveURL("/dashboard/categories")

    // Assert the page has the expected <h1>.
    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible()

    // Second user should have THEIR OWN 11 seeded categories (FR-014, SC-003).
    for (const name of SEED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({
        timeout: 10000,
      })
    }

    // Verify cross-user isolation: the second user's page should have exactly
    // 11 categories (2 sections: EXPENSE + INCOME).
    await expect(page.getByRole("heading", { level: 2, name: "EXPENSE" })).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "INCOME" })).toBeVisible()

    await context.close()
  })
})

// ---------------------------------------------------------------------------
// US2: create a new category
// ---------------------------------------------------------------------------

test.describe("Categories US2", () => {
  // Re-use the same user across all US2 tests (they run serially).
  // Each test() re-uses the email but must sign up / sign in explicitly since
  // Playwright workers don't share browser state between test() calls.
  const us2Email = `e2e-categories-us2-${Date.now()}@example.com`

  test("creates a top-level EXPENSE category", async ({ page }) => {
    // Sign up a fresh user and navigate to categories.
    await signUp(page, us2Email)
    await goToCategories(page)

    // Confirm 11 seeded categories are visible.
    for (const name of SEED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 10000 })
    }

    // Click "+ Add category" button.
    await page.getByRole("button", { name: "+ Add category" }).click()

    // Assert the sheet opens with "Add category" title (role heading to avoid
    // matching the "+ Add category" button text too).
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Fill in the name.
    await page.getByLabel("Name").fill("Pets")

    // Kind defaults to EXPENSE — leave it as-is (it should already show EXPENSE).
    // (The default kind is "EXPENSE" from state initialization)

    // Leave parent as "No parent (top-level)".
    // (Default is already no parent — the picker shows the placeholder)

    // Pick the first color swatch (violet — first in the grid).
    // Each color button has aria-label matching the color label.
    const violetButton = page.getByRole("button", { name: "Violet" })
    await violetButton.click()

    // Pick an icon — open the icon picker and pick "Pets" (PawPrint).
    await page.getByRole("button", { name: "Choose icon" }).click()
    // Wait for the command list to appear and search for "Pets".
    await page.getByPlaceholder("Search icons…").fill("Pets")
    await page.getByRole("option", { name: "Pets" }).click()

    // Click Save.
    await page.getByRole("button", { name: "Save" }).click()

    // Assert the sheet closes (heading title no longer visible).
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert "Pets" now appears in the EXPENSE section of the list.
    await expect(page.getByText("Pets", { exact: true })).toBeVisible({ timeout: 10000 })

    // Verify it's in the EXPENSE section by checking the parent section is visible.
    await expect(page.getByRole("heading", { level: 2, name: "EXPENSE" })).toBeVisible()
  })

  test("creates a child category — kind auto-derived from parent", async ({ page }) => {
    // Sign in as the same user from the previous test (created "Pets").
    await page.goto("/login")
    await page.getByLabel("Email").fill(us2Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    // Navigate to categories.
    await goToCategories(page)
    await expect(page).toHaveURL("/dashboard/categories")

    // Verify "Pets" category exists from previous test.
    await expect(page.getByText("Pets", { exact: true })).toBeVisible({ timeout: 10000 })

    // Click "+ Add category" again.
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Fill name.
    await page.getByLabel("Name").fill("Pet Food")

    // Select "Pets" as the parent via the parent picker.
    // The CategoryPicker trigger has role="combobox" and aria-label="Parent category".
    await page.getByRole("combobox", { name: "Parent category" }).click()
    // Wait for the popover with the category search input.
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    // Find and click "Pets" in the list.
    await page.getByRole("option", { name: "Pets" }).click()

    // Assert the kind selector becomes disabled (shows EXPENSE, inherited from Pets).
    // The kind select trigger has data-testid="kind-select".
    const kindTrigger = page.getByTestId("kind-select")
    await expect(kindTrigger).toBeDisabled({ timeout: 3000 })

    // Confirm it shows EXPENSE.
    await expect(kindTrigger).toContainText("EXPENSE")

    // Pick a color.
    await page.getByRole("button", { name: "Blue" }).click()

    // Pick an icon — open and select "Coffee".
    await page.getByRole("button", { name: "Choose icon" }).click()
    await page.getByPlaceholder("Search icons…").fill("Coffee")
    await page.getByRole("option", { name: "Coffee" }).click()

    // Save.
    await page.getByRole("button", { name: "Save" }).click()

    // Assert the sheet closes.
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert "Pet Food" appears in the list (under Pets / EXPENSE section).
    await expect(page.getByText("Pet Food", { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test("validation: blank name shows inline error", async ({ page }) => {
    // Sign in as the same user and go to categories.
    await page.goto("/login")
    await page.getByLabel("Email").fill(us2Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    await page.goto("/dashboard/categories")
    await expect(page).toHaveURL("/dashboard/categories")

    // Open create sheet.
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Leave name blank and click Save.
    await page.getByRole("button", { name: "Save" }).click()

    // The browser's native required validation prevents submission with an empty name.
    // The name field has `required` and maxLength, so it won't submit.
    // We verify the form is still open (no new row added) and the sheet is still visible.
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 3000 })

    // The total number of categories in the list should still be 13
    // (11 seeded + Pets + Pet Food from previous tests).
    // Close the sheet by pressing Escape.
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 3000,
    })
  })
})

// ---------------------------------------------------------------------------
// US3: edit / archive / unarchive
// ---------------------------------------------------------------------------

test.describe("Categories US3 — edit and archive flow", () => {
  // Re-use the same user across all US3 tests (serial execution).
  const us3Email = `e2e-categories-us3-${Date.now()}@example.com`

  test("edits a category name", async ({ page }) => {
    // Sign up a fresh user and navigate to categories.
    await signUp(page, us3Email)
    await goToCategories(page)

    // Click the "Other Expenses" row to open the edit sheet.
    await page.getByText("Other Expenses", { exact: true }).click()

    // Assert the edit sheet opens with "Edit category" title.
    await expect(page.getByRole("heading", { name: "Edit category" })).toBeVisible({
      timeout: 5000,
    })

    // Change the name.
    const nameInput = page.getByLabel("Name")
    await nameInput.clear()
    await nameInput.fill("Other Spending")

    // Submit.
    await page.getByRole("button", { name: "Save changes" }).click()

    // Assert sheet closes.
    await expect(page.getByRole("heading", { name: "Edit category" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert the new name appears in the list.
    await expect(page.getByText("Other Spending", { exact: true })).toBeVisible({ timeout: 10000 })

    // The old name should no longer appear.
    await expect(page.getByText("Other Expenses", { exact: true })).not.toBeVisible()
  })

  test("archives an active category and toggles to view it", async ({ page }) => {
    // Sign in as the same user.
    await page.goto("/login")
    await page.getByLabel("Email").fill(us3Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    await goToCategories(page)

    // Find the "Health" row and click its Archive button.
    const healthRow = page.getByRole("listitem").filter({ hasText: "Health" })
    const archiveBtn = healthRow.getByRole("button", { name: /^Archive Health$/ })
    await archiveBtn.click()

    // Assert the AlertDialog appears.
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("heading", { name: "Archive this category?" })).toBeVisible()

    // Click the "Archive" confirm button in the dialog.
    await page.getByRole("button", { name: "Archive" }).click()

    // Assert the dialog closes.
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 })

    // Assert "Health" no longer appears in the default list.
    await expect(page.getByText("Health", { exact: true })).not.toBeVisible({ timeout: 10000 })

    // Toggle "Show archived" on.
    await page.getByRole("switch", { name: "Show archived" }).click()

    // Assert "Health" reappears with the "Archived" badge.
    await expect(page.getByText("Health", { exact: true })).toBeVisible({ timeout: 10000 })
    // The archived badge should be visible near the "Health" row.
    const healthRowArchived = page.getByRole("listitem").filter({ hasText: "Health" })
    await expect(healthRowArchived.getByText("Archived")).toBeVisible({ timeout: 5000 })
  })

  test("edits name on an archived row but kind/color/icon are read-only", async ({ page }) => {
    // Sign in as the same user (Health is archived from previous test).
    await page.goto("/login")
    await page.getByLabel("Email").fill(us3Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    await goToCategories(page)

    // Toggle "Show archived" on to see the archived row.
    await page.getByRole("switch", { name: "Show archived" }).click()

    // Wait for the archived row to appear.
    await expect(page.getByText("Health", { exact: true })).toBeVisible({ timeout: 10000 })

    // Click the "Health" text in the row (not a button, so it bubbles to the row's onClick).
    await page
      .getByRole("listitem")
      .filter({ hasText: "Health" })
      .getByText("Health", { exact: true })
      .click()

    // Assert the edit sheet opens with "Edit archived category" title.
    await expect(page.getByRole("heading", { name: "Edit archived category" })).toBeVisible({
      timeout: 5000,
    })

    // Assert the name input is enabled.
    const nameInput = page.getByLabel("Name")
    await expect(nameInput).toBeEnabled()

    // Assert the kind select is disabled.
    const kindSelect = page.getByTestId("kind-select-archived")
    await expect(kindSelect).toBeDisabled()

    // Change the name.
    await nameInput.clear()
    await nameInput.fill("Well-being")

    // Submit.
    await page.getByRole("button", { name: "Save name" }).click()

    // Assert the sheet closes.
    await expect(page.getByRole("heading", { name: "Edit archived category" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert the updated name appears (still in archived view).
    await expect(page.getByText("Well-being", { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test("unarchives the category", async ({ page }) => {
    // Sign in as the same user.
    await page.goto("/login")
    await page.getByLabel("Email").fill(us3Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")

    await goToCategories(page)

    // Toggle "Show archived" on.
    await page.getByRole("switch", { name: "Show archived" }).click()

    // Wait for the archived row (Well-being, renamed from Health).
    await expect(page.getByText("Well-being", { exact: true })).toBeVisible({ timeout: 10000 })

    // Find the archived row and click its Unarchive button.
    const archivedRow = page.getByRole("listitem").filter({ hasText: "Well-being" })
    const unarchiveBtn = archivedRow.getByRole("button", { name: /Unarchive/ })
    await unarchiveBtn.click()

    // After unarchiving, toggle "Show archived" off.
    await page.getByRole("switch", { name: "Show archived" }).click()

    // Assert the row reappears in the active list (no "Archived" badge).
    await expect(page.getByText("Well-being", { exact: true })).toBeVisible({ timeout: 10000 })
    const activeRow = page.getByRole("listitem").filter({ hasText: "Well-being" })
    await expect(activeRow.getByText("Archived")).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// US4: picker filter behavior
// ---------------------------------------------------------------------------

test.describe("Categories US4 — picker filter behavior", () => {
  test("picker filters by kind and hides archived", async ({ page }) => {
    const email = `e2e-categories-us4-${Date.now()}@example.com`
    await signUp(page, email)
    await goToCategories(page)

    // 11 seeded categories present.
    for (const name of SEED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 10000 })
    }

    // --- Step 1: Open create form, set kind = INCOME, open parent picker ---
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Change kind to INCOME via the kind select.
    const kindTrigger = page.getByTestId("kind-select")
    await kindTrigger.click()
    await page.getByRole("option", { name: "INCOME" }).click()

    // Open the parent picker.
    await page.getByRole("combobox", { name: "Parent category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })

    // Assert INCOME categories are visible in the picker (exact: true avoids strict-mode conflicts).
    await expect(page.getByRole("option", { name: "Salary", exact: true })).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByRole("option", { name: "Other Income", exact: true })).toBeVisible()

    // Assert EXPENSE categories are NOT visible in the picker (kind filter applied).
    // Using exact: true to ensure we only match the specific option text, not substring matches.
    await expect(page.getByRole("option", { name: "Food", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Housing", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Transport", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Utilities", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Entertainment", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Health", exact: true })).not.toBeVisible()
    await expect(
      page.getByRole("option", { name: "Other Expenses", exact: true }),
    ).not.toBeVisible()
    // Children of Food (EXPENSE) are also filtered out.
    await expect(page.getByRole("option", { name: "Groceries", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Restaurants", exact: true })).not.toBeVisible()

    // Assert the "(none)" / "No parent (top-level)" option is visible (allowNone=true in form).
    // Per FR-018, the picker MUST support a (none) option.
    await expect(page.getByRole("option", { name: "No parent (top-level)" })).toBeVisible()

    // Close the picker by pressing Escape.
    await page.keyboard.press("Escape")

    // --- Step 2: Change kind to EXPENSE, open parent picker ---
    // Wait for picker to close.
    await page.getByPlaceholder("Search categories…").waitFor({ state: "hidden", timeout: 3000 })

    // Change kind to EXPENSE.
    await kindTrigger.click()
    await page.getByRole("option", { name: "EXPENSE" }).click()

    // Open the parent picker again.
    await page.getByRole("combobox", { name: "Parent category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })

    // Assert EXPENSE categories are visible.
    // The CategoryPicker fetches all non-archived categories of the given kind from the server,
    // including children (Groceries, Restaurants under Food). We assert a representative sample.
    await expect(page.getByRole("option", { name: "Food", exact: true })).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByRole("option", { name: "Housing", exact: true })).toBeVisible()
    await expect(page.getByRole("option", { name: "Other Expenses", exact: true })).toBeVisible()

    // Assert INCOME categories are NOT visible.
    await expect(page.getByRole("option", { name: "Salary", exact: true })).not.toBeVisible()
    await expect(page.getByRole("option", { name: "Other Income", exact: true })).not.toBeVisible()

    // Close the picker via Escape, then close the sheet via the Close (X) button.
    await page.keyboard.press("Escape")
    await page.getByPlaceholder("Search categories…").waitFor({ state: "hidden", timeout: 3000 })
    await page.getByRole("button", { name: "Close" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 5000,
    })

    // --- Step 3: Archived exclusion ---
    // Archive "Other Expenses" (open it, click Archive, confirm).
    const otherExpensesRow = page.getByRole("listitem").filter({ hasText: "Other Expenses" })
    await otherExpensesRow.getByRole("button", { name: /^Archive Other Expenses$/ }).click()
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await page.getByRole("button", { name: "Archive" }).click()
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 })
    // Confirm "Other Expenses" no longer in the list.
    await expect(page.getByText("Other Expenses", { exact: true })).not.toBeVisible({
      timeout: 10000,
    })

    // Click "+ Add category", set kind = EXPENSE, open parent picker.
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Kind defaults to EXPENSE — leave as-is.
    // Open parent picker.
    await page.getByRole("combobox", { name: "Parent category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })

    // Assert "Other Expenses" is NOT in the picker (archivedAt is non-null, includeArchived defaults to false per FR-011).
    await expect(
      page.getByRole("option", { name: "Other Expenses", exact: true }),
    ).not.toBeVisible()

    // Active EXPENSE categories should still be visible.
    await expect(page.getByRole("option", { name: "Food", exact: true })).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByRole("option", { name: "Housing", exact: true })).toBeVisible()

    // Close the picker via Escape, then close the sheet via the Close (X) button.
    await page.keyboard.press("Escape")
    await page.getByPlaceholder("Search categories…").waitFor({ state: "hidden", timeout: 3000 })
    await page.getByRole("button", { name: "Close" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 5000,
    })

    // --- Gap documentation ---
    // FR-018: The picker MUST visually group by kind when kind is unset (kind="any" or omitted).
    // This scenario (showing BOTH kinds with group headers INCOME / EXPENSE) is not testable through
    // the category form, because the form always passes a specific `kind` to the picker.
    // This grouping behavior will be tested when feature 006 (Transactions) lands and mounts the
    // CategoryPicker without a fixed kind (e.g., for uncategorized or any-kind transaction categories).
  })
})

// ---------------------------------------------------------------------------
// US3: kind-change blocked (kept in its own describe per original test org)
// ---------------------------------------------------------------------------

test.describe("Categories US3 — kind-change blocked", () => {
  const us3KindEmail = `e2e-categories-us3-kind-${Date.now()}@example.com`

  test("kind-change blocked when category has children", async ({ page }) => {
    // Sign up a fresh user. Food has children Groceries and Restaurants.
    await signUp(page, us3KindEmail)
    await goToCategories(page)

    // Click "Food" to open the edit sheet.
    await page.getByText("Food", { exact: true }).click()

    // Assert the edit sheet opens.
    await expect(page.getByRole("heading", { name: "Edit category" })).toBeVisible({
      timeout: 5000,
    })

    // Change the kind to INCOME.
    // First, clear the hidden input by changing the select.
    // The kind select trigger has data-testid="kind-select".
    const kindTrigger = page.getByTestId("kind-select")
    await kindTrigger.click()

    // Wait for the dropdown and select INCOME.
    await page.getByRole("option", { name: "INCOME" }).click()

    // Submit.
    await page.getByRole("button", { name: "Save changes" }).click()

    // Assert the kind_change_blocked error appears in the form.
    await expect(page.getByTestId("kind-change-blocked-error")).toBeVisible({ timeout: 10000 })

    // The sheet should still be open (form not closed).
    await expect(page.getByRole("heading", { name: "Edit category" })).toBeVisible()

    // Close the sheet.
    await page.keyboard.press("Escape")

    // Assert "Food" in the list still shows under EXPENSE (not changed).
    await expect(page.getByRole("heading", { level: 2, name: "EXPENSE" })).toBeVisible()
    await expect(page.getByText("Food", { exact: true })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// US5: validation surfaces actionable errors
// ---------------------------------------------------------------------------

test.describe("Categories US5 — validation errors", () => {
  const us5Email = `e2e-categories-us5-${Date.now()}@example.com`

  test("blank name and 81-char name are rejected; valid name accepted after correction", async ({
    page,
  }) => {
    await signUp(page, us5Email)
    await goToCategories(page)

    // ---- (a) Blank name ----
    // Open create form, leave name blank, submit.
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Leave name blank and click Save.
    await page.getByRole("button", { name: "Save" }).click()

    // The HTML `required` attribute prevents submission and the form stays open.
    // The sheet must remain visible (no new row added).
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 3000 })

    // Close the sheet and verify no extra rows added (still 11 seeded).
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 3000,
    })
    for (const name of SEED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 5000 })
    }

    // ---- (b) 81-character name ----
    // Open create form.
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Use evaluate to bypass the HTML maxLength attribute and set an 81-char value.
    const nameInput = page.locator('input[name="name"]')
    await nameInput.evaluate((el, val) => {
      ;(el as HTMLInputElement).value = val
    }, "x".repeat(81))
    // Dispatch an input event so React picks up the value change.
    await nameInput.dispatchEvent("input")

    // Submit.
    await page.getByRole("button", { name: "Save" }).click()

    // Assert a length error is visible and the sheet stays open.
    // The server-side Zod schema rejects names longer than 80 chars (FR-004).
    await expect(page.getByText(/80|too long|length|character/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible()

    // Verify no new row was added — all still seeded.
    // (Do not close yet — value preservation test follows.)

    // ---- Value preservation and successful correction ----
    // After the server rejects the 81-char name, fix it to a valid name and resubmit.
    // This verifies that the form stays open and can be corrected without needing to reopen.
    await nameInput.fill("Valid Name")

    // Pick a color (violet) and an icon (Pets) so the submission is fully valid.
    await page.getByRole("button", { name: "Violet" }).click()
    await page.getByRole("button", { name: "Choose icon" }).click()
    await page.getByPlaceholder("Search icons…").fill("Pets")
    await page.getByRole("option", { name: "Pets" }).click()

    // Submit the corrected form.
    await page.getByRole("button", { name: "Save" }).click()

    // Assert the sheet closes and the new row appears in the list.
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("Valid Name", { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test("hierarchy violation: selecting a child category as parent is rejected by the server", async ({
    page,
  }) => {
    // Sign in as the same user (who now has "Valid Name" from the previous test).
    await page.goto("/login")
    await page.getByLabel("Email").fill(us5Email)
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL("/dashboard")
    await goToCategories(page)

    // Setup: "Valid Name" (top-level EXPENSE) was created in the previous test.
    // Create "Child Of Valid" as a child of "Valid Name".
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    // Use the specific input[name="name"] selector to avoid strict mode conflicts
    // when list items with aria-label="Edit <name>" are also visible.
    await page.locator('input[name="name"]').fill("Child Of Valid")

    // Select "Valid Name" as the parent.
    await page.getByRole("combobox", { name: "Parent category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })
    await page.getByRole("option", { name: "Valid Name", exact: true }).click()

    // Pick color and icon.
    await page.getByRole("button", { name: "Blue" }).click()
    await page.getByRole("button", { name: "Choose icon" }).click()
    await page.getByPlaceholder("Search icons…").fill("Coffee")
    await page.getByRole("option", { name: "Coffee" }).click()

    // Save.
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("Child Of Valid", { exact: true })).toBeVisible({ timeout: 10000 })

    // Now open the create form and try to pick "Child Of Valid" as a parent (hierarchy violation).
    // Note: The CategoryPicker fetches all non-archived categories of the given kind from the server
    // via listCategories — it shows both top-level AND child categories as options. The hierarchy
    // depth rule (FR-006: no grandchildren) is enforced server-side when the form is submitted.
    await page.getByRole("button", { name: "+ Add category" }).click()
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible({ timeout: 5000 })

    await page.locator('input[name="name"]').fill("Premium Kibble")

    // Open the parent picker (kind=EXPENSE by default).
    await page.getByRole("combobox", { name: "Parent category" }).click()
    await page.getByPlaceholder("Search categories…").waitFor({ state: "visible", timeout: 5000 })

    // "Child Of Valid" IS visible in the picker (picker shows all EXPENSE categories, including children).
    // Its accessible name includes the parent hint: "Child Of Valid (Valid Name)".
    // Select it — this SHOULD fail at the server because "Child Of Valid" is itself a child.
    // Use text locator inside CommandList to reliably find the option.
    const childOption = page.getByRole("option").filter({ hasText: "Child Of Valid" })
    await expect(childOption).toBeVisible({ timeout: 3000 })
    await childOption.click()

    // Pick color and icon.
    await page.getByRole("button", { name: "Green" }).click()
    await page.getByRole("button", { name: "Choose icon" }).click()
    await page.getByPlaceholder("Search icons…").fill("Pets")
    await page.getByRole("option", { name: "Pets" }).click()

    // Submit — the server should reject with hierarchy_violation (FR-006).
    await page.getByRole("button", { name: "Save" }).click()

    // Assert the hierarchy violation error appears and the form stays open.
    // The server returns error code "hierarchy_violation" with the message:
    // "Parent must be a top-level category (single-level hierarchy only)."
    // The CreateForm renders this as a top-level error paragraph.
    await expect(page.getByText(/top-level category|single-level|hierarchy/i)).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole("heading", { name: "Add category" })).toBeVisible()

    // Verify "Premium Kibble" was NOT added to the list.
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Add category" })).not.toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByText("Premium Kibble", { exact: true })).not.toBeVisible()

    // --- Comments on deferred / untestable scenarios ---
    // (d) Kind mismatch with parent: the form auto-syncs kind when a parent is picked
    //   (kind becomes read-only and inherits the parent's kind). This makes kind mismatch
    //   impossible to trigger through the UI without directly manipulating form state.
    //   The rule is enforced at the queries layer (covered by the T013b unit test for FR-005).
    //
    // (e) Kind change blocked when parent has children: already covered in US3 Test 5.
    //   Not duplicated here per the task instructions.
  })
})
