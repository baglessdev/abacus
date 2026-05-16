import { describe, expect, it } from "vitest"

import { parseEnv } from "@/lib/env"

const validEnv = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/abacus",
  AUTH_SECRET: "test-test-test-test-test-test-test-32chars",
  AUTH_URL: "http://localhost:3000",
}

describe("env Zod schema", () => {
  it("rejects an object missing DATABASE_URL", () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: undefined })).toThrowError(/DATABASE_URL/)
  })

  it("rejects DATABASE_URL with a non-postgres scheme", () => {
    expect(() =>
      parseEnv({ ...validEnv, DATABASE_URL: "mysql://u:p@localhost:3306/db" }),
    ).toThrowError(/DATABASE_URL/)
  })

  it("rejects when AUTH_SECRET is missing or too short (feature 003 tightening)", () => {
    expect(() => parseEnv({ ...validEnv, AUTH_SECRET: undefined })).toThrowError(/AUTH_SECRET/)
    expect(() => parseEnv({ ...validEnv, AUTH_SECRET: "short" })).toThrowError(/AUTH_SECRET/)
  })

  it("rejects when AUTH_URL is missing", () => {
    expect(() => parseEnv({ ...validEnv, AUTH_URL: undefined })).toThrowError(/AUTH_URL/)
  })

  it("accepts a valid env object", () => {
    const result = parseEnv({ ...validEnv, NODE_ENV: "test" })
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL)
    expect(result.NODE_ENV).toBe("test")
    expect(result.AUTH_SECRET).toBe(validEnv.AUTH_SECRET)
  })

  it("defaults NODE_ENV to development when omitted", () => {
    const result = parseEnv(validEnv)
    expect(result.NODE_ENV).toBe("development")
  })
})
