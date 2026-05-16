import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must start with postgres:// or postgresql://",
    ),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url(),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(input: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = envSchema.safeParse(input)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)"
      return `  - ${path}: ${issue.message}`
    })
    throw new Error(["Invalid environment configuration:", ...lines].join("\n"))
  }
  return result.data
}

export const env: Env = parseEnv(process.env)
