import { describe, expect, it } from "vitest"

import { loginSchema, signupSchema } from "@/lib/auth/schemas"

describe("signupSchema", () => {
  const valid = {
    email: "alice@example.com",
    password: "correcthorsebattery",
    confirmPassword: "correcthorsebattery",
  }

  it("rejects when email is missing", () => {
    const result = signupSchema.safeParse({ ...valid, email: "" })
    expect(result.success).toBe(false)
  })

  it("rejects when email is malformed", () => {
    const result = signupSchema.safeParse({ ...valid, email: "not-an-email" })
    expect(result.success).toBe(false)
  })

  it("rejects passwords shorter than 12 characters", () => {
    const result = signupSchema.safeParse({
      ...valid,
      password: "short1234",
      confirmPassword: "short1234",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors
      expect(errs.password?.[0]).toMatch(/12/)
    }
  })

  it("rejects when confirmPassword does not match", () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: "different12!" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors
      expect(errs.confirmPassword?.[0]).toMatch(/match/i)
    }
  })

  it("lowercases the email on output", () => {
    const result = signupSchema.safeParse({ ...valid, email: "Alice@Example.COM" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com")
    }
  })
})

describe("loginSchema", () => {
  it("lowercases the email on output", () => {
    const result = loginSchema.safeParse({
      email: "Bob@Example.com",
      password: "anything",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("bob@example.com")
    }
  })

  it("accepts any non-empty password (no min length on login)", () => {
    const result = loginSchema.safeParse({ email: "bob@example.com", password: "a" })
    expect(result.success).toBe(true)
  })

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "bob@example.com", password: "" })
    expect(result.success).toBe(false)
  })
})
