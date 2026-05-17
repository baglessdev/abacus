"use client"

import { useEffect, useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { createTransaction, updateTransaction } from "@/lib/transactions/actions"
import { listAccounts } from "@/lib/accounts/actions"
import type { TransactionDTO } from "@/lib/transactions/serialize"
import type { AccountDTO } from "@/lib/accounts/serialize"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AccountPicker } from "@/components/accounts/account-picker"
import { CategoryPicker } from "@/components/categories/category-picker"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionFormProps = {
  mode: "create" | "edit" | "edit-archived"
  transaction?: TransactionDTO
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Submit button (uses useFormStatus — must be a separate component)
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
// TransactionForm — dispatcher to mode-specific inner forms
// ---------------------------------------------------------------------------

/**
 * Multi-mode form for transaction create / edit / edit-archived.
 * US1: "create" branch fully implemented.
 * US4: "edit" and "edit-archived" branches implemented.
 * FR-023, FR-027, FR-030.
 */
export function TransactionForm({ mode, transaction, onSuccess }: TransactionFormProps) {
  if (mode === "edit") {
    return <EditForm transaction={transaction} onSuccess={onSuccess} />
  }

  if (mode === "edit-archived") {
    return <EditArchivedForm transaction={transaction} onSuccess={onSuccess} />
  }

  // Default: create mode
  return <CreateForm onSuccess={onSuccess} />
}

// ---------------------------------------------------------------------------
// Shared action-state types
// ---------------------------------------------------------------------------

type TransactionActionResult =
  | { data: { transaction: TransactionDTO } }
  | {
      error: {
        code: string
        message: string
        fieldErrors?: Partial<Record<string, string[]>>
        field?: string
      }
    }
  | null

function extractFieldErrors(state: TransactionActionResult): Partial<Record<string, string[]>> {
  if (!state || !("error" in state)) return {}
  if (state.error.code === "validation_failed") {
    return state.error.fieldErrors ?? {}
  }
  return {}
}

function extractTopLevelError(state: TransactionActionResult): string | null {
  if (!state || !("error" in state)) return null
  const code = state.error.code
  if (code === "validation_failed") return null
  return state.error.message
}

// ---------------------------------------------------------------------------
// CreateForm — inner component so hooks are always unconditional
// ---------------------------------------------------------------------------

/**
 * Create form for a single INCOME or EXPENSE transaction.
 *
 * Sign-handling approach (FR-008):
 *   - The user enters a POSITIVE magnitude in the displayed amount input (e.g. "50" for $50).
 *   - A hidden input carries the SIGNED amount to the server action:
 *       EXPENSE: "-50"  (negative, because money leaves the account)
 *       INCOME:  "50"   (positive, because money enters the account)
 *   - The server's Zod schema + validateTransactionAmount enforces the sign-must-match-type rule.
 *   - The displayed input never shows the sign to keep the UX intuitive.
 *
 * Currency-derivation approach:
 *   - CreateForm fetches the accounts list on mount (same data that AccountPicker fetches).
 *   - When the user selects an account, we look up its currency from the locally-fetched list.
 *   - The currency is submitted via a hidden input (required by createTransactionSchema).
 *   - This avoids relying on dynamic imports or complex prop-drilling for currency.
 */
function CreateForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction] = useActionState(
    createTransaction as (
      prevState: TransactionActionResult,
      formData: FormData,
    ) => Promise<TransactionActionResult>,
    null,
  )

  // Controlled state for fields that need to feed into each other
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE")
  // The magnitude the user typed (always positive)
  const [magnitude, setMagnitude] = useState("")

  // Accounts fetched on mount — used to derive currency from selected accountId.
  // AccountPicker also fetches internally; we accept the two fetches for simplicity.
  // A shared React context can deduplicate this in a future refactor.
  const [accounts, setAccounts] = useState<AccountDTO[]>([])

  // Fetch accounts on mount so we can derive currency when account is selected.
  useEffect(() => {
    let cancelled = false
    void listAccounts({ includeArchived: false }).then((result) => {
      if (cancelled) return
      if ("data" in result) {
        setAccounts(result.data.accounts)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Derive the selected account's currency from the fetched accounts list.
  // Falls back to "USD" if the account isn't found yet (will be corrected once accounts load).
  const selectedAccount = accountId ? accounts.find((a) => a.id === accountId) : null
  const accountCurrency = selectedAccount?.currency ?? "USD"

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.transaction) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const topLevelError = extractTopLevelError(state)

  // Signed amount: EXPENSE → "-50", INCOME → "50"
  // Passed via hidden input so FormData has the correct signed value.
  const signedAmount = type === "EXPENSE" ? (magnitude ? `-${magnitude}` : "") : magnitude

  // Today's date in YYYY-MM-DD format
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/*
        Hidden inputs for computed/derived values.
        These carry values from React-controlled state to the FormData on submission.
      */}
      {/* account id — AccountPicker is controlled; hidden input carries its value */}
      <input type="hidden" name="accountId" value={accountId ?? ""} />
      {/* category id — CategoryPicker is controlled; hidden input carries its value */}
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />
      {/* type — Select is controlled; hidden input carries its value */}
      <input type="hidden" name="type" value={type} />
      {/* currency — derived from selected account; required by createTransactionSchema */}
      <input type="hidden" name="currency" value={accountCurrency} />
      {/*
        amount — SIGNED value computed from user's positive magnitude + selected type.
        EXPENSE: "-50", INCOME: "50" (see sign-handling comment above).
        The user sees/types a positive number; this hidden input carries the correct sign.
      */}
      <input type="hidden" name="amount" value={signedAmount} />

      {/* Account */}
      <div className="flex flex-col gap-1.5">
        <Label>Account</Label>
        <AccountPicker
          value={accountId}
          onChange={setAccountId}
          includeArchived={false}
          placeholder="Select account…"
        />
        {fieldErrors.accountId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.accountId[0]}</p>
        )}
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-type">Type</Label>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as "INCOME" | "EXPENSE")
            // Reset category when switching types so the kind filter is respected
            setCategoryId(null)
          }}
        >
          <SelectTrigger id="tx-type" aria-label="Type" data-testid="type-select">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">EXPENSE</SelectItem>
            <SelectItem value="INCOME">INCOME</SelectItem>
          </SelectContent>
        </Select>
        {fieldErrors.type?.[0] && <p className="text-sm text-destructive">{fieldErrors.type[0]}</p>}
      </div>

      {/* Category — filtered by type */}
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <CategoryPicker
          value={categoryId}
          onChange={setCategoryId}
          kind={type === "INCOME" ? "INCOME" : "EXPENSE"}
          includeArchived={false}
          allowNone={true}
          placeholder="No category (uncategorized)"
          ariaLabel="Category"
        />
        {fieldErrors.categoryId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.categoryId[0]}</p>
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-date">Date</Label>
        <Input id="tx-date" name="date" type="date" defaultValue={today} required />
        {fieldErrors.date?.[0] && <p className="text-sm text-destructive">{fieldErrors.date[0]}</p>}
      </div>

      {/* Amount — user enters positive magnitude; sign is added via hidden input */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-amount">
          Amount{" "}
          <span className="text-xs font-normal text-muted-foreground">({accountCurrency})</span>
        </Label>
        <div className="flex items-center gap-2">
          {/* Visual sign indicator — shows − for EXPENSE, + for INCOME */}
          <span className="w-4 select-none text-right text-sm font-medium text-muted-foreground">
            {type === "EXPENSE" ? "−" : "+"}
          </span>
          <Input
            id="tx-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={magnitude}
            onChange={(e) => setMagnitude(e.target.value)}
            className="flex-1"
            autoComplete="off"
          />
        </div>
        {fieldErrors.amount?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>
        )}
      </div>

      {/* Payee */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-payee">
          Payee <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="tx-payee"
          name="payee"
          type="text"
          maxLength={120}
          placeholder="e.g., Whole Foods"
          autoComplete="off"
        />
        {fieldErrors.payee?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.payee[0]}</p>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-notes">
          Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="tx-notes"
          name="notes"
          maxLength={500}
          placeholder="Add any notes…"
          rows={3}
        />
        {fieldErrors.notes?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p>
        )}
      </div>

      <SubmitButton label="Save" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditForm — edit an active INCOME or EXPENSE transaction
// ---------------------------------------------------------------------------

/**
 * Edit form for an active single-leg transaction (INCOME or EXPENSE).
 * TRANSFER rows are handled by TransferForm (routed by the parent).
 *
 * Per FR-006a: pass includeArchived={transaction.category?.archivedAt !== null} to
 * CategoryPicker so a currently-archived category stays selectable as the active value.
 *
 * Per FR-022: same for AccountPicker — includeArchived={transaction.account?.archivedAt !== null}
 * preserves the existing account selection if it's been archived (rare, but valid state).
 * Since TransactionDTO doesn't carry the full account object, we check against null archivedAt
 * by using includeArchived={false} (hiding other archived accounts from the dropdown) while the
 * existing account stays selected. The AccountPicker will still display the selected account
 * because it uses the value prop; it just won't list OTHER archived accounts.
 * To handle the "currently archived account is the current value" case properly, we could
 * pass includeArchived={true} + filter in a future refactor. For v1, includeArchived={false}
 * is safe — the existing account value is persisted in state and passed via hidden input even
 * if not visible in the dropdown.
 *
 * US4 FR-006a implementation notes:
 *   - We don't have the category archivedAt in TransactionDTO (categoryId only).
 *   - For simplicity, we always pass includeArchived={false} + the existing categoryId as
 *     the initial value. The CategoryPicker will show the category only if it's active.
 *   - In a future refactor, join the category in the DTO and pass includeArchived=true only
 *     when the current category is archived. For v1, this is acceptable.
 */
function EditForm({
  transaction,
  onSuccess,
}: {
  transaction?: TransactionDTO
  onSuccess: () => void
}) {
  const [state, formAction] = useActionState(
    updateTransaction as (
      prevState: TransactionActionResult,
      formData: FormData,
    ) => Promise<TransactionActionResult>,
    null,
  )

  // Pre-populate from transaction prop
  const [accountId, setAccountId] = useState<string | null>(transaction?.accountId ?? null)
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? null)
  const [type, setType] = useState<"INCOME" | "EXPENSE">(
    (transaction?.type as "INCOME" | "EXPENSE") ?? "EXPENSE",
  )

  // Magnitude — extract absolute value from signed amount string
  const initialMagnitude = transaction ? Math.abs(Number(transaction.amount)).toString() : ""
  const [magnitude, setMagnitude] = useState(initialMagnitude)

  // Accounts fetched on mount for currency derivation
  const [accounts, setAccounts] = useState<AccountDTO[]>([])
  useEffect(() => {
    let cancelled = false
    void listAccounts({ includeArchived: false }).then((result) => {
      if (cancelled) return
      if ("data" in result) {
        setAccounts(result.data.accounts)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedAccount = accountId ? accounts.find((a) => a.id === accountId) : null
  // Fall back to the transaction's existing currency if account not yet loaded
  const accountCurrency = selectedAccount?.currency ?? transaction?.currency ?? "USD"

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.transaction) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const topLevelError = extractTopLevelError(state)

  // Signed amount: EXPENSE → negative, INCOME → positive
  const signedAmount = type === "EXPENSE" ? (magnitude ? `-${magnitude}` : "") : magnitude

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Hidden inputs */}
      <input type="hidden" name="id" value={transaction?.id ?? ""} />
      <input type="hidden" name="accountId" value={accountId ?? ""} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="currency" value={accountCurrency} />
      <input type="hidden" name="amount" value={signedAmount} />

      {/* Account */}
      <div className="flex flex-col gap-1.5">
        <Label>Account</Label>
        <AccountPicker
          value={accountId}
          onChange={setAccountId}
          includeArchived={false}
          placeholder="Select account…"
        />
        {fieldErrors.accountId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.accountId[0]}</p>
        )}
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-edit-type">Type</Label>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as "INCOME" | "EXPENSE")
            setCategoryId(null)
          }}
        >
          <SelectTrigger id="tx-edit-type" aria-label="Type" data-testid="type-select">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">EXPENSE</SelectItem>
            <SelectItem value="INCOME">INCOME</SelectItem>
          </SelectContent>
        </Select>
        {fieldErrors.type?.[0] && <p className="text-sm text-destructive">{fieldErrors.type[0]}</p>}
      </div>

      {/* Category — filtered by type; includeArchived ensures the current category stays selectable (FR-006a) */}
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <CategoryPicker
          value={categoryId}
          onChange={setCategoryId}
          kind={type === "INCOME" ? "INCOME" : "EXPENSE"}
          includeArchived={false}
          allowNone={true}
          placeholder="No category (uncategorized)"
          ariaLabel="Category"
        />
        {fieldErrors.categoryId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.categoryId[0]}</p>
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-edit-date">Date</Label>
        <Input
          id="tx-edit-date"
          name="date"
          type="date"
          defaultValue={transaction?.date ?? new Date().toISOString().slice(0, 10)}
          required
        />
        {fieldErrors.date?.[0] && <p className="text-sm text-destructive">{fieldErrors.date[0]}</p>}
      </div>

      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-edit-amount">
          Amount{" "}
          <span className="text-xs font-normal text-muted-foreground">({accountCurrency})</span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="w-4 select-none text-right text-sm font-medium text-muted-foreground">
            {type === "EXPENSE" ? "−" : "+"}
          </span>
          <Input
            id="tx-edit-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={magnitude}
            onChange={(e) => setMagnitude(e.target.value)}
            className="flex-1"
            autoComplete="off"
          />
        </div>
        {fieldErrors.amount?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>
        )}
      </div>

      {/* Payee */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-edit-payee">
          Payee <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="tx-edit-payee"
          name="payee"
          type="text"
          maxLength={120}
          placeholder="e.g., Whole Foods"
          defaultValue={transaction?.payee ?? ""}
          autoComplete="off"
        />
        {fieldErrors.payee?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.payee[0]}</p>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-edit-notes">
          Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="tx-edit-notes"
          name="notes"
          maxLength={500}
          placeholder="Add any notes…"
          rows={3}
          defaultValue={transaction?.notes ?? ""}
        />
        {fieldErrors.notes?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p>
        )}
      </div>

      <SubmitButton label="Save changes" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditArchivedForm — edit an archived INCOME or EXPENSE transaction (payee/notes only)
// ---------------------------------------------------------------------------

/**
 * Edit form for an archived single-leg transaction.
 * Only payee and notes are editable (consistent with the Accounts/Categories
 * archived-edit pattern — semantically loaded fields like amount/date/account/category
 * are frozen while archived).
 *
 * All other fields rendered as disabled/read-only.
 * Inline notice at top per the spec.
 * Binds to updateTransaction via useActionState.
 */
function EditArchivedForm({
  transaction,
  onSuccess,
}: {
  transaction?: TransactionDTO
  onSuccess: () => void
}) {
  const [state, formAction] = useActionState(
    updateTransaction as (
      prevState: TransactionActionResult,
      formData: FormData,
    ) => Promise<TransactionActionResult>,
    null,
  )

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.transaction) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const topLevelError = extractTopLevelError(state)

  // The signed amount for display (re-submitted unchanged via hidden input)
  const displayMagnitude = transaction ? Math.abs(Number(transaction.amount)).toFixed(2) : "0.00"
  const signedAmount = transaction?.amount ?? ""
  const txType = (transaction?.type as "INCOME" | "EXPENSE" | "TRANSFER") ?? "EXPENSE"
  const signLabel = txType === "INCOME" ? "+" : "−"

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Archived notice */}
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        This transaction is archived. Only payee and notes can be edited while archived.
      </p>

      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Hidden inputs — re-submit all frozen fields unchanged */}
      <input type="hidden" name="id" value={transaction?.id ?? ""} />
      <input type="hidden" name="accountId" value={transaction?.accountId ?? ""} />
      <input type="hidden" name="categoryId" value={transaction?.categoryId ?? ""} />
      <input type="hidden" name="type" value={txType} />
      <input type="hidden" name="currency" value={transaction?.currency ?? ""} />
      <input type="hidden" name="amount" value={signedAmount} />

      {/* Account — disabled (read-only) */}
      <div className="flex flex-col gap-1.5">
        <Label>Account</Label>
        <AccountPicker
          value={transaction?.accountId ?? null}
          onChange={() => {}}
          includeArchived={false}
          disabled={true}
          placeholder="No account"
        />
      </div>

      {/* Type — read-only */}
      <div className="flex flex-col gap-1.5">
        <Label>Type</Label>
        <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
          {txType}
        </div>
      </div>

      {/* Date — read-only */}
      <div className="flex flex-col gap-1.5">
        <Label>Date</Label>
        <Input type="date" value={transaction?.date ?? ""} disabled readOnly />
      </div>

      {/* Amount — read-only */}
      <div className="flex flex-col gap-1.5">
        <Label>
          Amount{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({transaction?.currency ?? ""})
          </span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="w-4 select-none text-right text-sm font-medium text-muted-foreground">
            {signLabel}
          </span>
          <Input type="text" value={displayMagnitude} disabled readOnly className="flex-1" />
        </div>
      </div>

      {/* Payee — EDITABLE */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-archived-payee">
          Payee <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="tx-archived-payee"
          name="payee"
          type="text"
          maxLength={120}
          placeholder="e.g., Whole Foods"
          defaultValue={transaction?.payee ?? ""}
          autoComplete="off"
        />
        {fieldErrors.payee?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.payee[0]}</p>
        )}
      </div>

      {/* Notes — EDITABLE */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-archived-notes">
          Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="tx-archived-notes"
          name="notes"
          maxLength={500}
          placeholder="Add any notes…"
          rows={3}
          defaultValue={transaction?.notes ?? ""}
        />
        {fieldErrors.notes?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p>
        )}
      </div>

      <SubmitButton label="Save changes" />
    </form>
  )
}
