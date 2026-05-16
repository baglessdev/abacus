import type { Metadata } from "next"

import { FeatureGrid } from "@/components/marketing/feature-grid"
import { Hero } from "@/components/marketing/hero"
import { auth } from "@/lib/auth"

export const metadata: Metadata = {
  title: "Abacus — Personal finance, finally clear",
  description:
    "Track accounts, set budgets, and see where your money goes — without the spreadsheets.",
}

export default async function MarketingHomePage() {
  const session = await auth()
  const isAuthenticated = !!session?.user

  return (
    <>
      <Hero isAuthenticated={isAuthenticated} />
      <FeatureGrid />
    </>
  )
}
