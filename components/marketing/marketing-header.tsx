import { Wallet } from "lucide-react"
import Link from "next/link"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <Link href="/" className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
        <span className="text-base font-semibold tracking-tight">Abacus</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Log in</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/signup">Sign up</Link>
        </Button>
      </div>
    </header>
  )
}
