import Link from "next/link"

import { Button } from "@/components/ui/button"

type HeroProps = {
  isAuthenticated: boolean
}

export function Hero({ isAuthenticated }: HeroProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        Personal finance, finally clear
      </h1>
      <p className="mt-6 text-lg text-muted-foreground">
        Track accounts, set budgets, and see where your money goes — without the spreadsheets.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {isAuthenticated ? (
          <Button asChild size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link href="/signup">Sign up</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
