import { describe, expect, it } from "vitest"

import { parseEnv } from "@/lib/env"

describe("env Zod schema", () => {
  it("rejects an object missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrowError(/DATABASE_URL/)
  })

  it("rejects DATABASE_URL with a non-postgres scheme", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://u:p@localhost:3306/db" })).toThrowError(
      /DATABASE_URL/,
    )
  })

  it("accepts a valid postgres connection string", () => {
    const result = parseEnv({
      DATABASE_URL: "postgresql://u:p@localhost:5432/abacus",
      NODE_ENV: "test",
    })
    expect(result.DATABASE_URL).toBe("postgresql://u:p@localhost:5432/abacus")
    expect(result.NODE_ENV).toBe("test")
  })

  it("defaults NODE_ENV to development when omitted", () => {
    const result = parseEnv({
      DATABASE_URL: "postgresql://u:p@localhost:5432/abacus",
    })
    expect(result.NODE_ENV).toBe("development")
  })
})
