import { expect, test } from "@playwright/test"

const routes = [
  { path: "/", label: "Dashboard", h1: "Welcome to Abacus" },
  { path: "/accounts", label: "Accounts", h1: "No accounts yet" },
  { path: "/transactions", label: "Transactions", h1: "No transactions yet" },
  { path: "/budgets", label: "Budgets", h1: "No budgets yet" },
  { path: "/settings", label: "Settings", h1: "Settings" },
] as const

test("shell renders and navigates across all five routes", async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: Error[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  page.on("pageerror", (err) => pageErrors.push(err))

  await page.goto("/")

  const primaryNav = page.getByRole("navigation", { name: "Primary" })
  await expect(primaryNav).toBeVisible()
  for (const r of routes) {
    await expect(primaryNav.getByRole("link", { name: r.label })).toBeVisible()
  }

  await expect(primaryNav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await expect(page.getByRole("heading", { level: 1, name: routes[0].h1 })).toBeVisible()

  for (const r of routes.slice(1)) {
    await primaryNav.getByRole("link", { name: r.label }).click()
    await expect(page).toHaveURL(r.path)
    await expect(primaryNav.getByRole("link", { name: r.label })).toHaveAttribute(
      "aria-current",
      "page",
    )
    await expect(page.getByRole("heading", { level: 1, name: r.h1 })).toBeVisible()
  }

  await primaryNav.getByRole("link", { name: "Dashboard" }).click()
  await expect(page).toHaveURL("/")
  await expect(primaryNav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  )

  expect(pageErrors, "no page errors during navigation").toEqual([])
  expect(consoleErrors, "no console errors during navigation").toEqual([])
})

test("mobile drawer opens via hamburger, navigates, and closes via Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")

  const desktopNav = page.getByRole("navigation", { name: "Primary" })
  await expect(desktopNav).toBeHidden()

  const hamburger = page.getByRole("button", { name: "Open navigation menu" })
  await expect(hamburger).toBeVisible()
  await hamburger.click()

  const drawerNav = page.getByRole("navigation", { name: "Primary mobile" })
  await expect(drawerNav).toBeVisible()
  await expect(drawerNav.getByRole("link", { name: "Accounts" })).toBeVisible()

  await drawerNav.getByRole("link", { name: "Accounts" }).click()
  await expect(page).toHaveURL("/accounts")
  await expect(drawerNav).toBeHidden()
  await expect(page.getByRole("heading", { level: 1, name: "No accounts yet" })).toBeVisible()

  await hamburger.click()
  await expect(drawerNav).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(drawerNav).toBeHidden()
})
