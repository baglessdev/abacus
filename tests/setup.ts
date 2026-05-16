// Vitest setup: provide a syntactically valid DATABASE_URL so that
// importing `@/lib/env` (which parses process.env at module load) does
// not throw during test collection. Individual tests still exercise
// `parseEnv` with their own inputs.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test"
process.env.AUTH_SECRET ??= "test-test-test-test-test-test-test-32chars"
process.env.AUTH_URL ??= "http://localhost:3000"
// `NODE_ENV` is typed readonly by @types/node 24; `Object.assign` writes it at runtime.
Object.assign(process.env, { NODE_ENV: "test" })
