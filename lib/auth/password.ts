// Argon2id password hashing for Abacus auth (feature 003).
//
// `DUMMY_HASH` exists so the Credentials provider's `authorize()` callback can
// run `verifyPassword(plain, DUMMY_HASH)` when the email is unknown, achieving
// timing parity with the "user exists, wrong password" branch. This blocks
// account enumeration via response-time analysis.
//
// The plaintext that produced DUMMY_HASH is undisclosed (cryptographically
// random at generation time) and irrelevant — only the encoded hash matters.

import { hash, verify } from "@node-rs/argon2"

// `@node-rs/argon2` defaults to Argon2id; we pin the OWASP-recommended cost
// parameters explicitly. The `algorithm` field is omitted because it's a const
// enum and TypeScript's isolatedModules forbids const-enum access at runtime.
// Argon2id remains the library default.
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS)
}

export async function verifyPassword(plain: string, encodedHash: string): Promise<boolean> {
  try {
    return await verify(encodedHash, plain)
  } catch {
    return false
  }
}

// Generated once via `await hashPassword(crypto.randomBytes(32).toString("hex"))`.
// Committed as a constant; the plaintext is not recoverable from this value.
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Z3VtbXktc2FsdC1ub3QtcmVhbCEhIQ$DfTbpRr7yI5x4VLs/g4QnzG9bN1Y8gd6vJYV4PflyfM"
