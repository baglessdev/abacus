"use client"

/**
 * app/(shell)/dashboard/budgets/_components/budget-form.tsx
 *
 * Multi-mode form for budget create / edit.
 * US1: "create" branch fully implemented.
 * US3: "edit" branch — implemented in T030.
 *
 * Wired to createBudget / updateBudget server actions via useActionState (React 19).
 * Field errors rendered inline from action's fieldErrors.
 * Action-level errors (budget_exists, category_wrong_kind) rendered as a banner.
 *
 * FR-023, FR-027.
 */

import { useEffect, useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { createBudget, updateBudget } from "@/lib/budgets/actions"
import { computeCurrentPeriodRange } from "@/lib/budgets/periods"
import { type BudgetWithActualsDTO } from "@/lib/budgets/serialize"
import { type CategoryDTO } from "@/lib/categories/serialize"
import { CategoryPicker } from "@/components/categories/category-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetFormProps = {
  mode: "create" | "edit"
  budget?: BudgetWithActualsDTO
  expenseCategories: CategoryDTO[]
  defaultCurrency: string | null
  currencies: string[]
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Result shape (mirrors BudgetErrorEnvelope)
// ---------------------------------------------------------------------------

type BudgetActionResult =
  | { data: { budget: { id: string } } }
  | {
      error: {
        code: string
        message: string
        fieldErrors?: Partial<Record<string, string[]>>
        field?: string
      }
    }
  | null

// ---------------------------------------------------------------------------
// Submit button — must be a separate component to use useFormStatus
// ---------------------------------------------------------------------------

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : label}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFieldErrors(state: BudgetActionResult): Partial<Record<string, string[]>> {
  if (!state || !("error" in state)) return {}
  if (state.error.code === "validation_failed") {
    return state.error.fieldErrors ?? {}
  }
  return {}
}

/**
 * Returns an action-level error message for non-validation errors
 * (budget_exists, category_wrong_kind, internal_error, etc.).
 */
function extractBannerError(state: BudgetActionResult): string | null {
  if (!state || !("error" in state)) return null
  const code = state.error.code
  if (code === "validation_failed") return null
  return state.error.message
}

// ---------------------------------------------------------------------------
// BudgetForm
// ---------------------------------------------------------------------------

export function BudgetForm(props: BudgetFormProps) {
  const { mode, budget, defaultCurrency, currencies, onSuccess } = props

  if (mode === "edit") {
    // US3 edit branch — pre-populate from budget prop.
    // categoryId / currency / period are read-only (FR-005 from US3 ac.5).
    return <EditForm budget={budget!} onSuccess={onSuccess} />
  }

  return (
    <CreateForm defaultCurrency={defaultCurrency} currencies={currencies} onSuccess={onSuccess} />
  )
}

// ---------------------------------------------------------------------------
// EditForm (US3 — T030)
// ---------------------------------------------------------------------------

/**
 * EditForm — pre-populated with the existing budget's values.
 *
 * Read-only fields (FR-005 / US3 ac.5): category, currency, period.
 * These form the uniqueness key (userId, categoryId, currency, period); changing any of
 * them is effectively a different budget. Users are told to archive and create a new one.
 *
 * Editable fields: amount, startDate, endDate.
 * Wired to updateBudget via useActionState.
 */

function EditForm({ budget, onSuccess }: { budget: BudgetWithActualsDTO; onSuccess: () => void }) {
  const [state, formAction] = useActionState(
    updateBudget as (
      prevState: BudgetActionResult,
      formData: FormData,
    ) => Promise<BudgetActionResult>,
    null,
  )

  // Close the sheet on success
  useEffect(() => {
    if (state && "data" in state && state.data?.budget?.id) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const bannerError = extractBannerError(state)

  const { budget: b, category } = budget

  const periodLabel = b.period === "MONTHLY" ? "Monthly" : "Yearly"

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden input: budget id — required by updateBudget */}
      <input type="hidden" name="id" value={b.id} />

      {/* Banner error for action-level errors (not_found, internal_error, etc.) */}
      {bannerError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {bannerError}
        </p>
      )}

      {/* Read-only notice (US3 ac.5 / FR-005) */}
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Category, currency, and period cannot be changed. To switch to a different category /
        currency / period, archive this budget and create a new one.
      </p>

      {/* Category — read-only */}
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <Input
          value={category.name}
          disabled
          readOnly
          aria-label="Category (read-only)"
          className="cursor-not-allowed opacity-60"
        />
      </div>

      {/* Currency — read-only */}
      <div className="flex flex-col gap-1.5">
        <Label>Currency</Label>
        <Input
          value={b.currency}
          disabled
          readOnly
          aria-label="Currency (read-only)"
          className="cursor-not-allowed opacity-60"
        />
      </div>

      {/* Period — read-only */}
      <div className="flex flex-col gap-1.5">
        <Label>Period</Label>
        <Input
          value={periodLabel}
          disabled
          readOnly
          aria-label="Period (read-only)"
          className="cursor-not-allowed opacity-60"
        />
      </div>

      {/* Amount — editable */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-budget-amount">Amount</Label>
        <Input
          id="edit-budget-amount"
          name="amount"
          type="text"
          inputMode="decimal"
          defaultValue={b.amount}
          autoComplete="off"
        />
        {fieldErrors.amount?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>
        )}
      </div>

      {/* Start Date — editable */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-budget-start-date">Start date</Label>
        <Input
          id="edit-budget-start-date"
          name="startDate"
          type="date"
          defaultValue={b.startDate}
        />
        {fieldErrors.startDate?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.startDate[0]}</p>
        )}
      </div>

      {/* End Date — editable (optional) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-budget-end-date">
          End date <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="edit-budget-end-date"
          name="endDate"
          type="date"
          defaultValue={b.endDate ?? ""}
        />
        {fieldErrors.endDate?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.endDate[0]}</p>
        )}
      </div>

      <SubmitButton label="Save changes" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// CreateForm
// ---------------------------------------------------------------------------

function CreateForm({
  defaultCurrency,
  currencies,
  onSuccess,
}: {
  defaultCurrency: string | null
  currencies: string[]
  onSuccess: () => void
}) {
  const [state, formAction] = useActionState(
    createBudget as (
      prevState: BudgetActionResult,
      formData: FormData,
    ) => Promise<BudgetActionResult>,
    null,
  )

  // Controlled state for CategoryPicker (a Popover/Command — its value must be in state)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  // Controlled state for period & currency Selects
  const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY")
  const [currency, setCurrency] = useState<string>(defaultCurrency ?? currencies[0] ?? "USD")

  // Default startDate: 1st of the current UTC month in YYYY-MM-DD
  const defaultStartDate = computeCurrentPeriodRange("MONTHLY").dateFrom.toISOString().slice(0, 10)

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.budget?.id) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const bannerError = extractBannerError(state)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Banner error for action-level errors (budget_exists, category_wrong_kind, etc.) */}
      {bannerError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {bannerError}
        </p>
      )}

      {/* Hidden inputs for controlled-state values */}
      {/* categoryId — CategoryPicker is controlled; hidden input carries its value */}
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />
      {/* period — Select is controlled; hidden input carries its value */}
      <input type="hidden" name="period" value={period} />
      {/* currency — Select is controlled; hidden input carries its value */}
      <input type="hidden" name="currency" value={currency} />

      {/* Category — EXPENSE only (FR-003, R6) */}
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <CategoryPicker
          value={categoryId}
          onChange={setCategoryId}
          kind="EXPENSE"
          includeArchived={false}
          allowNone={false}
          placeholder="Select expense category…"
          ariaLabel="Category"
        />
        {/* Category errors can come from both field errors and action-level errors with field="categoryId" */}
        {fieldErrors.categoryId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.categoryId[0]}</p>
        )}
      </div>

      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget-amount">Amount</Label>
        <Input
          id="budget-amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
        />
        {fieldErrors.amount?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>
        )}
      </div>

      {/* Currency */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget-currency">Currency</Label>
        <Select value={currency} onValueChange={(v) => setCurrency(v)}>
          <SelectTrigger id="budget-currency" aria-label="Currency" data-testid="currency-select">
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {currencies.length > 0 ? (
              currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))
            ) : (
              <SelectItem value={defaultCurrency ?? "USD"}>{defaultCurrency ?? "USD"}</SelectItem>
            )}
          </SelectContent>
        </Select>
        {fieldErrors.currency?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.currency[0]}</p>
        )}
      </div>

      {/* Period */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget-period">Period</Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as "MONTHLY" | "YEARLY")}>
          <SelectTrigger id="budget-period" aria-label="Period" data-testid="period-select">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
            <SelectItem value="YEARLY">Yearly</SelectItem>
          </SelectContent>
        </Select>
        {fieldErrors.period?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.period[0]}</p>
        )}
      </div>

      {/* Start Date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget-start-date">Start date</Label>
        <Input
          id="budget-start-date"
          name="startDate"
          type="date"
          defaultValue={defaultStartDate}
        />
        {fieldErrors.startDate?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.startDate[0]}</p>
        )}
      </div>

      {/* End Date (optional) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget-end-date">
          End date <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="budget-end-date" name="endDate" type="date" />
        {fieldErrors.endDate?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.endDate[0]}</p>
        )}
      </div>

      <SubmitButton label="Save budget" />
    </form>
  )
}
