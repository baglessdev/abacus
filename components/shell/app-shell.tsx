"use client"

import { useRef, useState, type ReactNode } from "react"

import { Header } from "@/components/shell/header"
import { MobileNav } from "@/components/shell/mobile-nav"
import { RouteFocus } from "@/components/shell/route-focus"
import { Sidebar } from "@/components/shell/sidebar"

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main ref={mainRef} tabIndex={-1} className="flex-1 p-6 outline-none md:p-8">
          {children}
        </main>
      </div>
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <RouteFocus mainRef={mainRef} />
    </div>
  )
}
