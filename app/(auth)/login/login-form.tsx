"use client"

import { useState, useTransition } from "react"

import { signInAction } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FieldErrors = Partial<Record<"email" | "password", string[]>>

type FormError =
  | { kind: "validation"; message: string; fieldErrors: FieldErrors }
  | { kind: "credentials"; message: string }
  | null

export function LoginForm({ from, message }: { from?: string; message?: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<FormError>(null)
  const [email, setEmail] = useState("")
  const showAccountCreated = message === "account_created" && !error

  async function action(formData: FormData) {
    setError(null)
    if (from) formData.set("from", from)
    startTransition(async () => {
      const result = await signInAction(formData)
      if (result && "error" in result) {
        if (result.error.code === "VALIDATION_FAILED") {
          setError({
            kind: "validation",
            message: result.error.message,
            fieldErrors: result.error.fieldErrors,
          })
        } else {
          // The locked client message ignores the server's code text — FR-014.
          setError({ kind: "credentials", message: "Invalid email or password" })
        }
      }
    })
  }

  const fieldErrors = error?.kind === "validation" ? error.fieldErrors : {}

  return (
    <form action={action} className="flex flex-col gap-4">
      {showAccountCreated && (
        <Alert>
          <AlertDescription>Your account was created. Please sign in.</AlertDescription>
        </Alert>
      )}
      {error?.kind === "credentials" && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {fieldErrors.email?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.email[0]}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {fieldErrors.password?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.password[0]}</p>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
