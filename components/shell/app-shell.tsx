"use client"

import { useRef, useState, type ReactNode } from "react"

import { Header } from "@/components/shell/header"
import { MobileNav } from "@/components/shell/mobile-nav"
import { RouteFocus } from "@/components/shell/route-focus"
import { ShellFooter } from "@/components/shell/shell-footer"
import { Sidebar } from "@/components/shell/sidebar"

type AppShellProps = {
  children: ReactNode
  user?: { email: string }
}

export function AppShell({ children, user }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} user={user} />
        <main ref={mainRef} tabIndex={-1} className="flex-1 p-6 outline-none md:p-8">
          {children}
        </main>
        <ShellFooter />
      </div>
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <RouteFocus mainRef={mainRef} />
    </div>
  )
}
