import { describe, expect, it } from "vitest"

import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password"

describe("password helpers", () => {
  it("hashPassword returns an Argon2id-encoded string", async () => {
    const encoded = await hashPassword("correcthorsebattery")
    expect(encoded.startsWith("$argon2id$")).toBe(true)
  })

  it("verifyPassword returns true for the correct password", async () => {
    const encoded = await hashPassword("correcthorsebattery")
    expect(await verifyPassword("correcthorsebattery", encoded)).toBe(true)
  })

  it("verifyPassword returns false for the wrong password", async () => {
    const encoded = await hashPassword("correcthorsebattery")
    expect(await verifyPassword("wrong-password", encoded)).toBe(false)
  })

  it("verifyPassword(anything, DUMMY_HASH) returns false and does not throw", async () => {
    await expect(verifyPassword("anything", DUMMY_HASH)).resolves.toBe(false)
  })
})
