"use client"

import { Menu } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/shell/user-menu"
import { Button } from "@/components/ui/button"

type HeaderProps = {
  onOpenMobileNav: () => void
  user?: { email: string }
}

export function Header({ onOpenMobileNav, user }: HeaderProps) {
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
      <div className="hidden md:block" aria-hidden="true" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {user && <UserMenu user={user} />}
      </div>
    </header>
  )
}
