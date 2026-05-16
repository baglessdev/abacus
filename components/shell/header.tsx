"use client"

import { Menu } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

type HeaderProps = {
  onOpenMobileNav: () => void
}

export function Header({ onOpenMobileNav }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        onClick={onOpenMobileNav}
        className="md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <div className="md:hidden" aria-hidden="true">
        {/* spacer to balance the hamburger on mobile; brand lives in sidebar/drawer */}
      </div>
      <div className="hidden md:block" aria-hidden="true" />
      <ThemeToggle />
    </header>
  )
}
