import { Compass } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <Compass className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        </p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </Card>
    </div>
  )
}
