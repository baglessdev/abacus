import type { Metadata } from "next"

import { Providers } from "@/app/providers"

import "./globals.css"

export const metadata: Metadata = {
  title: "Abacus",
  description: "Personal finance — income and expense tracking",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
