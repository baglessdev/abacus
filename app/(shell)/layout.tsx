import type { ReactNode } from "react"

import { AppShell } from "@/components/shell/app-shell"
import { auth } from "@/lib/auth"

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session?.user) {
    throw new Error("Shell rendered without session — middleware misconfigured")
  }
  return <AppShell user={{ email: session.user.email }}>{children}</AppShell>
}
