import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md p-6">{children}</Card>
    </div>
  )
}
