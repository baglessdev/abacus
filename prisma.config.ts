import { existsSync } from "node:fs"

import { defineConfig, env } from "prisma/config"

// Load .env.local (preferred) or .env so `env("DATABASE_URL")` resolves.
// Node 21+ ships `process.loadEnvFile`; we target Node 24 LTS.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local")
} else if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
