# Server Action — `createBudget`

Creates a new `Budget` row owned by the session's user.

## Location

`lib/budgets/actions.ts`. Marked `"use server"`. Invoked from `<BudgetForm>` (in create mode) inside `<BudgetFormSheet>`, bound via React 19 `useActionState`.

## Signature

```ts
async function createBudget(
  prevState: CreateBudgetResult | null,
  formData: FormData,
): Promise<CreateBudgetResult>

type CreateBudgetResult =
  | { data: { budget: BudgetDTO } }
  | { error: BudgetErrorEnvelope }
```

The first argument is the previous-state slot mandated by `useActionState`; the action does not branch on it.

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `categoryId` | string | yes | Trim → non-empty. The category MUST exist, belong to the session's user (FR-022), and have `kind === "EXPENSE"` (FR-003, R6). |
| `period` | string | yes | Member of `BudgetPeriod` (`MONTHLY` / `YEARLY`). |
| `amount` | string | yes | Parseable positive decimal, `> 0` (FR-005). Currency-aware decimal places per `lib/money/validate.ts`. |
| `currency` | string | yes | Uppercase ISO 4217 alpha-3 (validated via `isCurrencyCode`). |
| `startDate` | string | yes | `YYYY-MM-DD`. Normalized to UTC midnight via `normalizeToUtcDay` from `lib/transactions/dates.ts`. Per FR-006, MONTHLY normalizes to the 1st of its containing month; YEARLY normalizes to January 1st of its containing year. |
| `endDate` | string | no | `YYYY-MM-DD` or empty. When set, MUST be `>= startDate` (FR-007). Empty → null (open-ended). |

## Zod schema sketch

```ts
// lib/budgets/schemas.ts (shape only)

const baseFields = {
  categoryId: z.string().trim().min(1, "Category is required"),
  period: z.enum(["MONTHLY", "YEARLY"], { message: "Period must be MONTHLY or YEARLY" }),
  amount: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && parseFloat(v) > 0, {
      message: "Enter a positive amount greater than zero",
    }),
  currency: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().refine(isCurrencyCode, { message: "Pick a valid ISO 4217 currency code" })),
  startDate: z
    .string()
    .refine(isISODateString, { message: "Start date must be YYYY-MM-DD" })
    .transform(normalizeToUtcDay),
  endDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(
      z
        .string()
        .refine(isISODateString, { message: "End date must be YYYY-MM-DD" })
        .transform(normalizeToUtcDay)
        .nullable(),
    )
    .optional()
    .default(""),
}

export function makeCreateBudgetSchema(userId: string) {
  return z
    .object(baseFields)
    .refine(
      (v) => v.endDate === null || v.endDate.getTime() >= v.startDate.getTime(),
      { path: ["endDate"], message: "End date must be on or after start date" },
    )
    .superRefine(async (value, ctx) => {
      // R6 layer 2: EXPENSE-only category check via Prisma.
      const cat = await getCategoryForUser(userId, value.categoryId)
      if (!cat) {
        ctx.addIssue({
          path: ["categoryId"],
          code: "custom",
          message: "Category not found",
          params: { errorCode: "not_found" },
        })
        return
      }
      if (cat.kind !== "EXPENSE") {
        ctx.addIssue({
          path: ["categoryId"],
          code: "custom",
          message: "Budgets are for expense categories. Income tracking is coming in a future feature.",
          params: { errorCode: "category_wrong_kind" },
        })
      }
    })
}
```

`params.errorCode` is read by the action body to map a custom Zod issue to the right envelope code.

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Coerce the six `FormData` keys to strings; build `makeCreateBudgetSchema(session.user.id)`; `await schema.safeParseAsync(...)`.
3. On schema failure:
   - If any issue has `params.errorCode === "not_found"` → `{ error: { code: "not_found", … } }`.
   - If any issue has `params.errorCode === "category_wrong_kind"` → `{ error: { code: "category_wrong_kind", …, field: "categoryId" } }`.
   - Otherwise → `{ error: { code: "validation_failed", …, fieldErrors } }`.
4. Call `createBudgetForUser(session.user.id, parsed.data)` (helper in `lib/budgets/queries.ts`). The helper:
   - Runs the app-level uniqueness pre-check via `findExistingActiveBudgetForUser(userId, categoryId, currency, period)`. If a row exists → throws `BudgetExistsError`.
   - Re-fetches the category and re-asserts `kind === "EXPENSE"` (R6 layer 3). On mismatch → throws `CategoryWrongKindError`.
   - Persists the row.
5. On caught `BudgetExistsError` → `{ error: { code: "budget_exists", … , field: "categoryId" } }`.
6. On caught `CategoryWrongKindError` → `{ error: { code: "category_wrong_kind", … , field: "categoryId" } }`.
7. On caught Prisma `P2002` (partial-unique-index race) → `{ error: { code: "budget_exists", … , field: "categoryId" } }` (same envelope as the app-level pre-check; UI handles one error case).
8. On other Prisma error → `{ error: { code: "internal_error", … } }`.
9. On success: call `revalidatePath("/dashboard/budgets")` AND `revalidatePath("/dashboard")` (the dashboard widget reads from the same query). Return `{ data: { budget: serializeBudget(row) } }`.

## Success — `data` shape

```ts
{
  data: {
    budget: BudgetDTO  // see data-model.md §BudgetDTO
  }
}
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Zod parse failed (shape reasons: bad amount, bad date, bad currency, etc.) | `fieldErrors` |
| `not_found` | `categoryId` references a non-existent or cross-user category | — |
| `category_wrong_kind` | `categoryId` references an INCOME category | `field: "categoryId"` |
| `budget_exists` | An active budget for `(userId, categoryId, currency, period)` already exists (app-level or race-caught) | `field: "categoryId"` |
| `internal_error` | Prisma threw on insert (other than P2002) | — |

## Side effects

- Inserts one row into `Budget`.
- Calls `revalidatePath("/dashboard/budgets")` and `revalidatePath("/dashboard")` on success.

## Applicable FRs

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-022, FR-023.

## Applicable SCs

SC-001, SC-005, SC-006.
