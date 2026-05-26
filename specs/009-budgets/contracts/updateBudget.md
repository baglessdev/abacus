# Server Action — `updateBudget`

Updates an existing `Budget` row owned by the session's user.

**Editable fields**: `amount`, `startDate`, `endDate`. **Read-only on edit** per US3 ac.5: `categoryId`, `currency`, `period`. Changing any of these would effectively be a different budget (they form the uniqueness key); the form tells the user to archive this one and create a new one.

## Location

`lib/budgets/actions.ts`. Marked `"use server"`. Invoked from `<BudgetForm>` (in edit mode).

## Signature

```ts
async function updateBudget(
  prevState: UpdateBudgetResult | null,
  formData: FormData,
): Promise<UpdateBudgetResult>

type UpdateBudgetResult =
  | { data: { budget: BudgetDTO } }
  | { error: BudgetErrorEnvelope }
```

## Input — `FormData` keys

| Key | Type | Required | Validation |
|---|---|---|---|
| `id` | string | yes | Trim → non-empty. The budget MUST exist and belong to the session's user (FR-022). |
| `amount` | string | yes | Parseable positive decimal `> 0` (FR-005). |
| `startDate` | string | yes | `YYYY-MM-DD`. Normalized to UTC midnight. |
| `endDate` | string | no | `YYYY-MM-DD` or empty. When set, MUST be `>= startDate`. |

**NOT accepted**: `categoryId`, `currency`, `period`. These fields are not present in the schema — any FormData entries with these keys are silently ignored (the Zod schema's strict-object pattern + the queries-layer ignore behaviour). The form renders these fields as disabled (US3 ac.5).

## Zod schema sketch

```ts
export const updateBudgetSchema = z
  .object({
    id: z.string().trim().min(1, "Missing budget id"),
    amount: z
      .string()
      .trim()
      .refine((v) => /^\d+(\.\d+)?$/.test(v) && parseFloat(v) > 0, {
        message: "Enter a positive amount greater than zero",
      }),
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
  })
  .refine(
    (v) => v.endDate === null || v.endDate.getTime() >= v.startDate.getTime(),
    { path: ["endDate"], message: "End date must be on or after start date" },
  )
```

No async `superRefine` (no category-kind check — the categoryId is not editable, so the existing row's category is still valid).

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. `safeParse` the FormData via `updateBudgetSchema`. On failure → `validation_failed` envelope.
3. Pre-fetch via `getBudgetForUser(session.user.id, parsed.data.id)` for ownership.
4. If null → `{ error: { code: "not_found", … } }`.
5. Call `updateBudgetForUser(session.user.id, id, { amount, startDate, endDate })` — applies the patch via `prisma.budget.updateMany({ where: { id, userId }, data: {...} })`.
6. On success: `revalidatePath("/dashboard/budgets")` + `revalidatePath("/dashboard")`. Return `{ data: { budget: serializeBudget(updated) } }`.

## Success — `data` shape

```ts
{
  data: {
    budget: BudgetDTO  // updated row, with new amount + dates; categoryId / currency / period unchanged
  }
}
```

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `validation_failed` | Zod parse failed (shape reasons) | `fieldErrors` |
| `not_found` | Budget id does not exist or belongs to another user | — |
| `internal_error` | Prisma threw on update | — |

`budget_exists` and `category_wrong_kind` are NOT reachable on update — the uniqueness key and the category aren't editable.

## Side effects

- Updates one row in `Budget`.
- Calls `revalidatePath("/dashboard/budgets")` and `revalidatePath("/dashboard")` on success.

## Applicable FRs

FR-005, FR-006, FR-007, FR-018, FR-022.

## Applicable SCs

SC-005.
