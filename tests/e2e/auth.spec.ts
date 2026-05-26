import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { expect, test } from "@playwright/test"
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
  await prisma.user.deleteMany({})
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

const PASSWORD = "correcthorsebattery"
let testEmail: string

test("first signup → dashboard → reload still authenticated", async ({ page }) => {
  testEmail = `e2e-${Date.now()}@example.com`

  // Signup is reachable directly (no first-user redirect; / is now public marketing).
  await page.goto("/signup")
  await expect(page).toHaveURL("/signup")

  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL("/dashboard")
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Abacus" })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL("/dashboard")
})

test("shell navigates across all 5 dashboard routes when authenticated", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/dashboard")

  const primaryNav = page.getByRole("navigation", { name: "Primary" })
  await expect(primaryNav).toBeVisible()

  const routes = [
    { path: "/dashboard/accounts", label: "Accounts", h1: "No accounts yet" },
    { path: "/dashboard/transactions", label: "Transactions", h1: "Create an account first" },
    { path: "/dashboard/budgets", label: "Budgets", h1: "Budgets" },
    { path: "/dashboard/settings", label: "Settings", h1: "Settings are coming soon" },
  ] as const

  for (const r of routes) {
    await primaryNav.getByRole("link", { name: r.label }).click()
    await expect(page).toHaveURL(r.path)
    await expect(primaryNav.getByRole("link", { name: r.label })).toHaveAttribute(
      "aria-current",
      "page",
    )
    await expect(page.getByRole("heading", { level: 1, name: r.h1 })).toBeVisible()
  }
})

test("mobile drawer opens via hamburger and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto("/login")
  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/dashboard")

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden()

  const hamburger = page.getByRole("button", { name: "Open navigation menu" })
  await expect(hamburger).toBeVisible()
  await hamburger.click()

  const drawerNav = page.getByRole("navigation", { name: "Primary mobile" })
  await expect(drawerNav).toBeVisible()

  await drawerNav.getByRole("link", { name: "Accounts" }).click()
  await expect(page).toHaveURL("/dashboard/accounts")
  await expect(drawerNav).toBeHidden()

  await hamburger.click()
  await expect(drawerNav).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(drawerNav).toBeHidden()
})

test("logout via user menu redirects to /login and blocks back-navigation", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/dashboard")

  await page.getByRole("button", { name: new RegExp(`Account menu for ${testEmail}`, "i") }).click()
  await page.getByRole("menuitem", { name: /log out/i }).click()
  await expect(page).toHaveURL(/\/login/)

  // /dashboard now redirects back to /login (with from preserved).
  await page.goto("/dashboard")
  await expect(page).toHaveURL("/login?from=%2Fdashboard")
})

test("unauthenticated /dashboard/transactions redirects with from preserved", async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/dashboard/transactions")
  await expect(page).toHaveURL("/login?from=%2Fdashboard%2Ftransactions")
  await context.close()
})

test("invalid credentials shows the locked error message", async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/login")
  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-12+")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Invalid email or password")).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  await context.close()
})

test("unknown email shows the same locked error message (no enumeration)", async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/login")
  await page.getByLabel("Email").fill("nobody-here@example.com")
  await page.getByLabel("Password", { exact: true }).fill("anything-12-chars-or-more")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Invalid email or password")).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  await context.close()
})

test("duplicate signup is rejected by the Postgres unique constraint", async ({ browser }) => {
  // A user with testEmail already exists from the first test. Submitting signup
  // again with the same email must surface USER_ALREADY_EXISTS, not create a second row.
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/signup")
  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(
    page.getByText("An account with this email already exists. Please log in."),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/signup/)

  const count = await prisma.user.count({ where: { email: testEmail } })
  expect(count).toBe(1)

  await context.close()
})

test("marketing home renders for anonymous visitor with two CTAs", async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/")
  await expect(
    page.getByRole("heading", { level: 1, name: /Personal finance, finally clear/i }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Sign up" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden()
  await context.close()
})

test("marketing home shows 'Go to dashboard' for authenticated visitor", async ({ page }) => {
  // Sign in within this serial-mode test's context.
  await page.goto("/login")
  await page.getByLabel("Email").fill(testEmail)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/dashboard")

  // Navigating to / from an authenticated session: marketing renders for everyone,
  // but the hero CTA is now "Go to dashboard".
  await page.goto("/")
  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("heading", { level: 1, name: /Personal finance, finally clear/i }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible()
})
