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
  // Truncate Account first (FK references User), then User.
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

/**
 * Creates an account via the UI.
 * Assumes the user is on /dashboard/accounts with the page loaded.
 * Works from both the empty state (CTA button) and the table view (+ Add account).
 */
async function createAccount(
  page: Page,
  opts: { name: string; type: string; currency: string; startingBalance: string },
) {
  // Open the create sheet — try CTA first (empty state), then the "+ Add account" button (table view)
  const cta = page.getByRole("button", { name: "Add your first account" })
  const addBtn = page.getByRole("button", { name: "+ Add account" })
  // Wait for one of the two entry-points to become visible, then click the right one
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

  // Fill name
  await page.getByLabel("Name").fill(opts.name)

  // Type select
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

  // Submit
  await page.getByRole("button", { name: "Save account" }).click()

  // Wait for sheet to close
  await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
    timeout: 10000,
  })
}

// ---------------------------------------------------------------------------
// T030 — US1: empty state → create → reload
// ---------------------------------------------------------------------------

test.describe("Accounts US1", () => {
  test("creates first account from empty state, persists across reload", async ({ page }) => {
    const email = `e2e-accounts-${Date.now()}@example.com`
    await signUp(page, email)

    // Navigate to the accounts page
    await page.goto("/dashboard/accounts")

    // Assert empty state is shown
    await expect(page.getByRole("heading", { level: 1, name: "No accounts yet" })).toBeVisible()
    const ctaButton = page.getByRole("button", { name: "Add your first account" })
    await expect(ctaButton).toBeVisible()

    // Click the CTA — assert sheet opens
    await ctaButton.click()
    await expect(page.getByRole("heading", { name: "Add account" })).toBeVisible({ timeout: 5000 })

    // Fill in the form
    await page.getByLabel("Name").fill("Chase Checking")

    // Type is a native <select> — already defaults to CHECKING; verify and keep it
    const typeSelect = page.locator("select[name='type']")
    await typeSelect.selectOption("CHECKING")

    // Currency picker — click the combobox trigger, type "USD", pick USD
    await page.getByRole("combobox", { name: "Select currency" }).click()
    // Wait for the popover content to open (listbox is the cmdk CommandList)
    const currencyListbox = page.getByRole("listbox")
    await currencyListbox.waitFor({ state: "visible", timeout: 5000 })
    // Type to filter
    const searchInput = page.getByPlaceholder("Search currency…")
    await searchInput.fill("USD")
    // Wait for the filtered item and click it (currency name is "United States Dollar")
    const usdOption = page.getByRole("option", { name: "USD — United States Dollar" })
    await usdOption.waitFor({ state: "visible", timeout: 5000 })
    await usdOption.click()

    // Starting balance — clear the default "0" and type the new value
    const balanceInput = page.getByLabel("Starting balance")
    await balanceInput.clear()
    await balanceInput.fill("1250.00")

    // Submit
    await page.getByRole("button", { name: "Save account" }).click()

    // Assert the sheet closes
    await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert the table row exists with the expected data
    await expect(page.getByRole("cell", { name: "Chase Checking", exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole("cell", { name: "CHECKING", exact: true })).toBeVisible()
    await expect(page.getByRole("cell", { name: "USD", exact: true })).toBeVisible()
    await expect(page.getByRole("cell", { name: "$1,250.00", exact: true })).toBeVisible()

    // Reload the page and assert the row persists (SC-002)
    await page.reload()
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("cell", { name: "Chase Checking", exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole("cell", { name: "$1,250.00", exact: true })).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // T031 — US1: cross-user isolation (SC-003 / FR-013 / SC-008)
  // ---------------------------------------------------------------------------

  test("second user sees empty state, not first user's accounts", async ({ browser }) => {
    // Open a fresh browser context for the second user
    const context = await browser.newContext()
    const page = await context.newPage()

    const email2 = `e2e-accounts-user2-${Date.now()}@example.com`
    await signUp(page, email2)

    // Navigate to accounts page
    await page.goto("/dashboard/accounts")

    // Second user should see empty state — no accounts from user 1
    await expect(page.getByRole("heading", { level: 1, name: "No accounts yet" })).toBeVisible({
      timeout: 10000,
    })

    // No table rows visible
    await expect(page.getByRole("table")).not.toBeVisible()

    // The first user's account name must not appear anywhere on the page
    await expect(page.getByText("Chase Checking")).not.toBeVisible()

    await context.close()
  })
})

// ---------------------------------------------------------------------------
// T035 + T036 — US2: edit / archive / unarchive
// ---------------------------------------------------------------------------

test.describe("Accounts US2", () => {
  // ---------------------------------------------------------------------------
  // T035 — edit name; currency is locked (FR-007, US3 scenario 3, SC-009)
  // ---------------------------------------------------------------------------

  test("edits account name; currency is locked", async ({ page }) => {
    const email = `e2e-us2-edit-${Date.now()}@example.com`
    await signUp(page, email)
    await page.goto("/dashboard/accounts")

    // Create the account via helper
    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1250.00",
    })

    // Verify the row is present
    await expect(page.getByRole("cell", { name: "Chase Checking", exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Click the row cell (not the trailing button) to open the edit sheet
    await page.getByRole("cell", { name: "Chase Checking", exact: true }).click()

    // Assert the edit sheet opens with the correct title
    await expect(page.getByRole("heading", { name: "Edit account" })).toBeVisible({
      timeout: 5000,
    })

    // Assert currency is locked — the disabled input should show "USD" and be read-only
    const currencyInput = page.locator("input[aria-label='Currency (locked at creation)']")
    await expect(currencyInput).toBeVisible()
    await expect(currencyInput).toBeDisabled()
    await expect(currencyInput).toHaveValue("USD")

    // Assert the locked caption is visible (FR-007, US3 SC-009)
    await expect(
      page.getByText("Currency is locked at creation to keep balances consistent."),
    ).toBeVisible()

    // Change the name
    const nameInput = page.getByLabel("Name")
    await nameInput.clear()
    await nameInput.fill("Chase Primary Checking")

    // Submit
    await page.getByRole("button", { name: "Save changes" }).click()

    // Assert the sheet closes
    await expect(page.getByRole("heading", { name: "Edit account" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert the row now shows the updated name
    await expect(
      page.getByRole("cell", { name: "Chase Primary Checking", exact: true }),
    ).toBeVisible({ timeout: 10000 })
  })

  // ---------------------------------------------------------------------------
  // T036 — archive → toggle → archived-row field lock → edit name → unarchive
  // ---------------------------------------------------------------------------

  test("archives, toggles to show archived, edits name on archived, unarchives", async ({
    page,
  }) => {
    const email = `e2e-us2-archive-${Date.now()}@example.com`
    await signUp(page, email)
    await page.goto("/dashboard/accounts")

    // 1. Create account
    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1250.00",
    })

    await expect(page.getByRole("cell", { name: "Chase Checking", exact: true })).toBeVisible({
      timeout: 10000,
    })

    // 2. Click the trailing "Archive" button on the row (stop propagation prevents row-click)
    await page.getByRole("button", { name: "Archive", exact: true }).click()

    // 3. Assert the AlertDialog appears with the correct title
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Archive this account?")).toBeVisible()

    // 4. Click the "Archive" action button in the dialog
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click()

    // 5. Assert the dialog closes and the row is no longer in the default list.
    // The table or empty-state message should no longer contain "Chase Checking" as a table cell.
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("cell", { name: "Chase Checking", exact: true })).not.toBeVisible({
      timeout: 10000,
    })

    // 6. Click the "Show archived" toggle.
    // After archiving, the component stays in the "had accounts" state (no page reload),
    // so the top bar with the toggle remains visible.
    const showArchivedSwitch = page.getByRole("switch", { name: "Show archived" })
    await expect(showArchivedSwitch).toBeVisible({ timeout: 5000 })
    await showArchivedSwitch.click()

    // 7. Assert the row reappears with the "Archived" badge visible
    await expect(page.getByRole("cell", { name: /Chase Checking/ })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("Archived", { exact: true })).toBeVisible()

    // 8. Click the row (name cell) to open the edit sheet in edit-archived mode
    await page
      .getByRole("cell", { name: /Chase Checking/ })
      .first()
      .click()

    // 9. Assert the edit-archived sheet opens
    await expect(page.getByRole("heading", { name: "Edit archived account" })).toBeVisible({
      timeout: 5000,
    })

    // Assert the archived notice caption is visible (FR-009a, SC-014)
    await expect(
      page.getByText("This account is archived. Only the name can be edited while archived."),
    ).toBeVisible()

    // Assert name input is enabled
    const nameInput = page.getByLabel("Name")
    await expect(nameInput).toBeEnabled()

    // Assert type select is disabled (FR-009a)
    const typeSelect = page.locator("select[name='type']")
    await expect(typeSelect).toBeDisabled()

    // Assert starting balance input is disabled (FR-009a)
    const balanceInput = page.getByLabel("Starting balance")
    await expect(balanceInput).toBeDisabled()

    // 10. Change the name to "Closed Chase"; click "Save name"
    await nameInput.clear()
    await nameInput.fill("Closed Chase")
    await page.getByRole("button", { name: "Save name" }).click()

    // Assert the sheet closes
    await expect(page.getByRole("heading", { name: "Edit archived account" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert the row name updates in the archived list (SC-005)
    await expect(page.getByRole("cell", { name: /Closed Chase/ })).toBeVisible({
      timeout: 10000,
    })

    // 11. Click the row's trailing "Unarchive" button
    await page.getByRole("button", { name: "Unarchive" }).click()

    // 12. Toggle "Show archived" off
    const showArchivedSwitch2 = page.getByRole("switch", { name: "Show archived" })
    await expect(showArchivedSwitch2).toBeVisible({ timeout: 5000 })
    await showArchivedSwitch2.click()

    // 13. Assert the row appears in the active list with the new name and NO "Archived" badge
    await expect(page.getByRole("cell", { name: "Closed Chase", exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText("Archived", { exact: true })).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// T037 — US3: multi-currency display (FR-012a, SC-011, SC-015)
// ---------------------------------------------------------------------------

test.describe("Accounts US3 - multi-currency", () => {
  test("two accounts in two currencies render with their own currency; no aggregate widget; no per-currency subtotals", async ({
    page,
  }) => {
    const email = `e2e-us3-multicurrency-${Date.now()}@example.com`
    await signUp(page, email)
    await page.goto("/dashboard/accounts")

    // Create account 1: Chase Checking / CHECKING / USD / 1250.00
    await createAccount(page, {
      name: "Chase Checking",
      type: "CHECKING",
      currency: "USD",
      startingBalance: "1250.00",
    })

    // After first creation the list should show the table; now create account 2
    await expect(page.getByRole("cell", { name: "Chase Checking", exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Create account 2: Euro Savings / SAVINGS / EUR / 800.00
    await createAccount(page, {
      name: "Euro Savings",
      type: "SAVINGS",
      currency: "EUR",
      startingBalance: "800.00",
    })

    // Wait for the second row to appear
    await expect(page.getByRole("cell", { name: "Euro Savings", exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Assert the table has exactly two rows (not counting the header row)
    const dataRows = page.getByRole("row").filter({ has: page.getByRole("cell") })
    await expect(dataRows).toHaveCount(2)

    // Assert the first account renders with USD format: $1,250.00
    // (formatAmount("1250.00", "USD") → "$1,250.00" per money-format.test.ts)
    await expect(page.getByRole("cell", { name: "$1,250.00", exact: true })).toBeVisible()

    // Assert the second account renders with EUR format: €800.00
    // (formatAmount("800.00", "EUR") uses Intl.NumberFormat "en-US" + EUR → "€800.00")
    await expect(page.getByRole("cell", { name: "€800.00", exact: true })).toBeVisible()

    // FR-012a / SC-015: assert there is NO aggregated total widget on the page
    await expect(page.getByTestId("accounts-total")).toHaveCount(0)

    // No element matching "Total", "Net worth", or "All accounts" in the accounts list
    // (these are the forbidden aggregate-widget labels per FR-012a)
    await expect(page.getByText("Net worth", { exact: true })).toHaveCount(0)
    await expect(page.getByText("All accounts", { exact: true })).toHaveCount(0)

    // FR-012a / SC-015: assert there are NO per-currency subtotal lines
    // These are the labels the aggregation feature 020 would introduce — they MUST NOT exist here.
    await expect(page.getByText(/USD total:/i)).toHaveCount(0)
    await expect(page.getByText(/EUR total:/i)).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// T038 — US4: validation errors (FR-004, FR-005, FR-006, SC-007)
// ---------------------------------------------------------------------------

test.describe("Accounts US4 - validation", () => {
  test("blank name, 81-char name, negative balance on CHECKING, and too-many-decimals on USD are all rejected; form stays open; no row added; fixing the error allows success", async ({
    page,
  }) => {
    const email = `e2e-us4-validation-${Date.now()}@example.com`
    await signUp(page, email)
    await page.goto("/dashboard/accounts")

    // Helper: open the create sheet from whatever state the list is in.
    // We may be at empty state (first open) or showing the table (later opens).
    async function openCreateSheet() {
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
      await expect(page.getByRole("heading", { name: "Add account" })).toBeVisible({
        timeout: 5000,
      })
    }

    // Helper: assert that the sheet is still open (form rejected the submission)
    async function assertSheetOpen() {
      await expect(page.getByRole("heading", { name: "Add account" })).toBeVisible()
    }

    // Helper: assert that no account rows exist in the table yet
    async function assertNoRows() {
      // The table must not be visible at all while we have 0 accounts,
      // or if the table is somehow visible, it should have no data rows.
      const tableVisible = await page.getByRole("table").isVisible()
      if (tableVisible) {
        const dataRows = page.getByRole("row").filter({ has: page.getByRole("cell") })
        await expect(dataRows).toHaveCount(0)
      }
      // Otherwise: empty state is shown = 0 rows, which is correct.
    }

    // ---------------------------------------------------------------------------
    // (a) Whitespace-only name (treated as blank after Zod .trim(); passes browser
    //     native `required` validation since "   " is not empty from the browser's
    //     perspective, but Zod rejects it as blank — FR-004 / SC-007).
    // ---------------------------------------------------------------------------
    await openCreateSheet()

    // Fill name with spaces only — the browser won't block this (spaces are not
    // empty per HTML required), but Zod trims it to "" and returns "Name is required".
    await page.getByLabel("Name").fill("   ")
    const typeSelect = page.locator("select[name='type']")
    await typeSelect.selectOption("CHECKING")
    // Set a valid currency: USD
    await page.getByRole("combobox", { name: "Select currency" }).click()
    await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search currency…").fill("USD")
    const usdOpt = page.getByRole("option", { name: /^USD/ })
    await usdOpt.waitFor({ state: "visible", timeout: 5000 })
    await usdOpt.click()
    // Set a valid starting balance
    const balanceInput = page.getByLabel("Starting balance")
    await balanceInput.clear()
    await balanceInput.fill("100.00")

    await page.getByRole("button", { name: "Save account" }).click()

    // Assert the Zod-generated name field error "Name is required" is shown
    await expect(page.getByText("Name is required")).toBeVisible({ timeout: 5000 })
    await assertSheetOpen()
    await assertNoRows()

    // Close the sheet by pressing Escape before next scenario
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
      timeout: 5000,
    })

    // ---------------------------------------------------------------------------
    // (b) Name too long (81 characters; max is 80, FR-004)
    //
    // The HTML input has maxLength={80} which clips browser input to 80 chars.
    // We bypass this via evaluate() to set the value programmatically so Zod
    // actually receives 81 characters and returns the length error.
    // ---------------------------------------------------------------------------
    await openCreateSheet()

    const longName = "x".repeat(81)
    // Use evaluate to bypass the browser's maxLength enforcement
    const nameInput = page.getByLabel("Name")
    await nameInput.evaluate((el, value) => {
      ;(el as HTMLInputElement).value = value
    }, longName)
    // Trigger a change event so React sees the new value
    await nameInput.dispatchEvent("input")

    await page.locator("select[name='type']").selectOption("CHECKING")
    // Set currency again (new sheet, fresh state)
    await page.getByRole("combobox", { name: "Select currency" }).click()
    await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search currency…").fill("USD")
    const usdOpt2 = page.getByRole("option", { name: /^USD/ })
    await usdOpt2.waitFor({ state: "visible", timeout: 5000 })
    await usdOpt2.click()
    await page.getByLabel("Starting balance").clear()
    await page.getByLabel("Starting balance").fill("100.00")

    await page.getByRole("button", { name: "Save account" }).click()

    // Assert the Zod length error is shown and sheet stays open
    // Zod returns "Name must be at most 80 characters" for names > 80 chars
    await expect(page.getByText("Name must be at most 80 characters")).toBeVisible({
      timeout: 5000,
    })
    await assertSheetOpen()
    await assertNoRows()

    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
      timeout: 5000,
    })

    // ---------------------------------------------------------------------------
    // (c) Unrecognized currency — SKIPPED in e2e (covered by unit test T013)
    //
    // The CurrencyPicker combobox only surfaces valid ISO 4217 codes from the
    // bundled allow-list; it is not possible to type an obsolete code (e.g., "DEM")
    // and select it through the UI without brittle DOM manipulation.
    // T013 (tests/unit/money-currencies.test.ts) proves the schema rejects
    // obsolete codes at the Zod boundary — that is the authoritative coverage.
    // ---------------------------------------------------------------------------

    // ---------------------------------------------------------------------------
    // (d) Negative balance on CHECKING (FR-006, SC-007)
    // ---------------------------------------------------------------------------
    await openCreateSheet()

    await page.getByLabel("Name").fill("Valid Name")
    await page.locator("select[name='type']").selectOption("CHECKING")
    await page.getByRole("combobox", { name: "Select currency" }).click()
    await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search currency…").fill("USD")
    const usdOpt3 = page.getByRole("option", { name: /^USD/ })
    await usdOpt3.waitFor({ state: "visible", timeout: 5000 })
    await usdOpt3.click()
    await page.getByLabel("Starting balance").clear()
    await page.getByLabel("Starting balance").fill("-100.00")

    await page.getByRole("button", { name: "Save account" }).click()

    // Assert starting-balance error is shown and sheet stays open
    await expect(page.locator("p.text-destructive")).toBeVisible({ timeout: 5000 })
    await assertSheetOpen()
    await assertNoRows()

    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
      timeout: 5000,
    })

    // ---------------------------------------------------------------------------
    // (e) Too many decimals on USD — 1.234 has 3 decimal places; USD allows 2 (FR-006)
    // After asserting the error, fix the value and assert the form CAN submit (SC-007).
    // ---------------------------------------------------------------------------
    await openCreateSheet()

    await page.getByLabel("Name").fill("Valid Name")
    await page.locator("select[name='type']").selectOption("CHECKING")
    await page.getByRole("combobox", { name: "Select currency" }).click()
    await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5000 })
    await page.getByPlaceholder("Search currency…").fill("USD")
    const usdOpt4 = page.getByRole("option", { name: /^USD/ })
    await usdOpt4.waitFor({ state: "visible", timeout: 5000 })
    await usdOpt4.click()
    await page.getByLabel("Starting balance").clear()
    await page.getByLabel("Starting balance").fill("1.234")

    await page.getByRole("button", { name: "Save account" }).click()

    // Assert starting-balance error is shown and sheet stays open
    await expect(page.locator("p.text-destructive")).toBeVisible({ timeout: 5000 })
    await assertSheetOpen()
    await assertNoRows()

    // Fix only the offending field (starting balance) — name, type, currency are preserved
    // by React state (currency picker) and uncontrolled DOM values (name, type).
    // We also explicitly re-fill the name to guard against any platform-specific
    // uncontrolled-input reset behaviour.
    await page.getByLabel("Name").fill("Valid Name")
    await page.getByLabel("Starting balance").clear()
    await page.getByLabel("Starting balance").fill("100.00")

    await page.getByRole("button", { name: "Save account" }).click()

    // Assert the sheet closes (successful submission proves the form recovers from rejects)
    await expect(page.getByRole("heading", { name: "Add account" })).not.toBeVisible({
      timeout: 10000,
    })

    // Assert the new row appears in the table (SC-007: the create finally succeeds)
    await expect(page.getByRole("cell", { name: "Valid Name", exact: true })).toBeVisible({
      timeout: 10000,
    })
  })
})
