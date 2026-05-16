"use client"

import { CircleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { EmptyState } from "@/components/shell/empty-state"
import { Button } from "@/components/ui/button"

type ShellErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ShellError({ error, reset }: ShellErrorProps) {
  useEffect(() => {
    if (error.digest) {
      console.error(`Shell error digest: ${error.digest}`)
    }
  }, [error.digest])

  return (
    <div className="flex flex-col">
      <EmptyState
        title="Something went wrong"
        description="An unexpected error occurred. You can try again or return to the dashboard."
        icon={CircleAlert}
      />
      <div className="mt-2 flex items-center justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
