import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"
import prettierConfig from "eslint-config-prettier"

const processEnvRestriction = [
  "error",
  {
    selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
    message: "Do not read process.env directly. Import the typed `env` object from '@/lib/env'.",
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: "Do not read process.env directly. Import the typed `env` object from '@/lib/env'.",
  },
]

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "db/migrations/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettierConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "lib/env.ts",
      "tests/setup.ts",
      "tests/e2e/**",
      "prisma.config.ts",
      "playwright.config.ts",
    ],
    rules: {
      "no-restricted-syntax": processEnvRestriction,
    },
  },
]

export default config
