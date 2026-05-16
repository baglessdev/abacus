"use client"

import { useState, useTransition } from "react"

import { signUp } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword", string[]>>

type FormError =
  | { kind: "validation"; message: string; fieldErrors: FieldErrors }
  | { kind: "other"; message: string }
  | null

export function SignupForm({ from }: { from?: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<FormError>(null)
  const [email, setEmail] = useState("")

  async function action(formData: FormData) {
    setError(null)
    if (from) formData.set("from", from)
    startTransition(async () => {
      const result = await signUp(formData)
      if (result && "error" in result) {
        if (result.error.code === "VALIDATION_FAILED") {
          setError({
            kind: "validation",
            message: result.error.message,
            fieldErrors: result.error.fieldErrors,
          })
        } else {
          setError({ kind: "other", message: result.error.message })
        }
      }
    })
  }

  const fieldErrors = error?.kind === "validation" ? error.fieldErrors : {}

  return (
    <form action={action} className="flex flex-col gap-4">
      {error?.kind === "other" && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
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
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="signup-password-hint"
        />
        <p id="signup-password-hint" className="text-xs text-muted-foreground">
          At least 12 characters.
        </p>
        {fieldErrors.password?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.password[0]}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <Input
          id="signup-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        {fieldErrors.confirmPassword?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.confirmPassword[0]}</p>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create account"}
      </Button>
    </form>
  )
}
