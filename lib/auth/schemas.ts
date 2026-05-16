import { z } from "zod"

const emailField = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase())

export const signupSchema = z
  .object({
    email: emailField,
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
