"use server"

import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

import { signIn, signOut } from "@/lib/auth"
import { hashPassword } from "@/lib/auth/password"
import { loginSchema, signupSchema } from "@/lib/auth/schemas"
import { createUser } from "@/lib/auth/user"

type FieldErrors<K extends string> = Partial<Record<K, string[]>>

type ValidationFailure<K extends string> = {
  error: {
    code: "VALIDATION_FAILED"
    message: string
    fieldErrors: FieldErrors<K>
  }
}

type SignUpResult =
  | { data: { userId: string } }
  | ValidationFailure<"email" | "password" | "confirmPassword">
  | { error: { code: "USER_ALREADY_EXISTS" | "AUTO_SIGN_IN_FAILED"; message: string } }

type SignInResult =
  | { data: { ok: true } }
  | ValidationFailure<"email" | "password">
  | { error: { code: "INVALID_CREDENTIALS"; message: string } }

const VALIDATION_SUMMARY = "Please fix the highlighted fields"
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"
const USER_EXISTS_MESSAGE = "An account with this email already exists. Please log in."

function safeFrom(rawFrom: FormDataEntryValue | null): string {
  if (typeof rawFrom !== "string") return "/dashboard"
  if (!rawFrom.startsWith("/")) return "/dashboard"
  if (rawFrom.startsWith("//")) return "/dashboard"
  if (rawFrom.includes(":")) return "/dashboard"
  return rawFrom
}

export async function signUp(formData: FormData): Promise<SignUpResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!parsed.success) {
    return {
      error: {
        code: "VALIDATION_FAILED",
        message: VALIDATION_SUMMARY,
        fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors<
          "email" | "password" | "confirmPassword"
        >,
      },
    }
  }

  const { email, password } = parsed.data

  try {
    const passwordHash = await hashPassword(password)
    await createUser({ email, passwordHash })
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return { error: { code: "USER_ALREADY_EXISTS", message: USER_EXISTS_MESSAGE } }
    }
    throw err
  }

  const from = safeFrom(formData.get("from"))

  try {
    await signIn("credentials", { email, password, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?message=account_created")
    }
    throw err
  }

  redirect(from)
}

export async function signInAction(formData: FormData): Promise<SignInResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return {
      error: {
        code: "VALIDATION_FAILED",
        message: VALIDATION_SUMMARY,
        fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors<"email" | "password">,
      },
    }
  }

  const { email, password } = parsed.data
  const from = safeFrom(formData.get("from"))

  try {
    await signIn("credentials", { email, password, redirect: false })
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        error: { code: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE },
      }
    }
    throw err
  }

  redirect(from)
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" })
}
