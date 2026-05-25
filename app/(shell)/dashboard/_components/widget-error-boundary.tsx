"use client"

/**
 * app/(shell)/dashboard/_components/widget-error-boundary.tsx
 *
 * Per-widget React error boundary (FR-034, FR-035).
 * "use client" — React error boundaries must be client-side class components.
 *
 * On caught error: renders an inline "Couldn't load — try again" fallback inside
 * <WidgetCard> with a keyboard-focusable Retry button. Retry resets local error state
 * AND calls router.refresh() to re-fetch the server-component subtree.
 *
 * Hand-rolled ~30-line class component. No react-error-boundary dep.
 * (plan.md §Technical Context — no new runtime deps)
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { WidgetCard } from "./widget-card"
import { EmptyCell } from "./empty-cell"

interface Props {
  title: string
  children: React.ReactNode
}

interface State {
  hasError: boolean
  message: string
}

// Small functional component so we can use the useRouter hook inside a class boundary.
function RetryButton({ onRetry }: { onRetry: () => void }) {
  const router = useRouter()
  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-2"
      onClick={() => {
        onRetry()
        router.refresh()
      }}
    >
      Try again
    </Button>
  )
}

export class WidgetErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: "" }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Optional client-side log for debugging
    console.error("[WidgetErrorBoundary]", error, info.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, message: "" })
  }

  render() {
    if (this.state.hasError) {
      return (
        <WidgetCard title={this.props.title}>
          <EmptyCell message="Couldn't load — try again" />
          <RetryButton onRetry={this.reset} />
        </WidgetCard>
      )
    }
    return this.props.children
  }
}
