"use client"

import { useEffect, useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { createTransfer, updateTransfer } from "@/lib/transactions/actions"
import { listAccounts } from "@/lib/accounts/actions"
import type { TransactionDTO, TransferPairDTO } from "@/lib/transactions/serialize"
import type { AccountDTO } from "@/lib/accounts/serialize"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AccountPicker } from "@/components/accounts/account-picker"

// ---------------------------------------------------------------------------
// TransferGroupDTO — a two-leg transfer represented as a UI convenience type.
// Both legs share the same transferGroupId.
// source: negative-amount leg (the from-account)
// destination: positive-amount leg (the to-account)
// ---------------------------------------------------------------------------

export type TransferGroupDTO = {
  transferGroupId: string
  source: TransactionDTO // amount < 0; accountId = fromAccountId
  destination: TransactionDTO // amount > 0; accountId = toAccountId
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransferFormProps = {
  mode: "create" | "edit"
  transferGroup?: TransferGroupDTO
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
// Shared result types
// ---------------------------------------------------------------------------

type CreateTransferResult =
  | { data: { transfer: TransferPairDTO } }
  | {
      error: {
        code: string
        message: string
        fieldErrors?: Partial<Record<string, string[]>>
        field?: string
      }
    }
  | null

function extractFieldErrors(state: CreateTransferResult): Partial<Record<string, string[]>> {
  if (!state || !("error" in state)) return {}
  if (state.error.code === "validation_failed") {
    return state.error.fieldErrors ?? {}
  }
  return {}
}

function extractTopLevelError(state: CreateTransferResult): string | null {
  if (!state || !("error" in state)) return null
  const code = state.error.code
  if (code === "validation_failed") return null
  return state.error.message
}

// ---------------------------------------------------------------------------
// TransferForm — dispatcher to mode-specific inner forms
// ---------------------------------------------------------------------------

/**
 * Multi-mode form for transfer create / edit.
 * US3: "create" branch fully implemented.
 * US4: "edit" branch fully implemented.
 *
 * NO Category field (transfers don't carry categories — FR-006, FR-024).
 * NO Type field (always TRANSFER).
 * NO Payee field (transfers don't have a payee — FR-024).
 *
 * Same-currency constraint: toAccount picker is filtered by fromAccount's currency (FR-015).
 * The server also enforces this — so even if the UI filter is bypassed, the server rejects it.
 *
 * NO edit-archived mode for transfers in v1 — archived transfers are displayed read-only
 * with just the "Unarchive both legs" button (handled in the list, not the form).
 */
export function TransferForm({ mode, transferGroup, onSuccess }: TransferFormProps) {
  if (mode === "edit") {
    return <EditForm transferGroup={transferGroup} onSuccess={onSuccess} />
  }

  // Default: create mode
  return <CreateForm onSuccess={onSuccess} />
}

// ---------------------------------------------------------------------------
// CreateForm
// ---------------------------------------------------------------------------

/**
 * Create form for a new TRANSFER.
 *
 * Amount handling (FR-008):
 *   - The user enters a positive magnitude (e.g. "500" for $500).
 *   - The server action signs both legs internally: source = -magnitude, destination = +magnitude.
 *   - No sign indicator needed in the UI (unlike single transactions).
 *
 * Currency constraint (FR-015):
 *   - toAccount picker is filtered by fromAccount's currency.
 *   - When fromAccount changes, toAccountId is cleared if it no longer matches the new currency.
 */
function CreateForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction] = useActionState(
    createTransfer as (
      prevState: CreateTransferResult,
      formData: FormData,
    ) => Promise<CreateTransferResult>,
    null,
  )

  const [fromAccountId, setFromAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [magnitude, setMagnitude] = useState("")

  // Fetch accounts to derive currency of the selected from-account.
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

  // Derive the selected from-account's currency.
  const fromAccount = fromAccountId ? accounts.find((a) => a.id === fromAccountId) : null

  // When fromAccount changes, clear toAccountId if currency no longer matches (FR-015).
  function handleFromAccountChange(id: string | null) {
    const newFromAccount = id ? accounts.find((a) => a.id === id) : null
    if (newFromAccount && toAccountId) {
      const currentToAccount = accounts.find((a) => a.id === toAccountId)
      if (currentToAccount && currentToAccount.currency !== newFromAccount.currency) {
        // Clear stale to-account (different currency from new from-account)
        setToAccountId(null)
      }
    }
    setFromAccountId(id)
  }

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.transfer) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const topLevelError = extractTopLevelError(state)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Hidden inputs carry controlled state to FormData */}
      <input type="hidden" name="fromAccountId" value={fromAccountId ?? ""} />
      <input type="hidden" name="toAccountId" value={toAccountId ?? ""} />
      {/* Transfer amount — user enters positive magnitude; server signs both legs */}
      <input type="hidden" name="amount" value={magnitude} />

      {/* From Account */}
      <div className="flex flex-col gap-1.5">
        <Label>From account</Label>
        <AccountPicker
          value={fromAccountId}
          onChange={handleFromAccountChange}
          includeArchived={false}
          placeholder="Select source account…"
        />
        {fieldErrors.fromAccountId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.fromAccountId[0]}</p>
        )}
      </div>

      {/* To Account — filtered to same currency as from-account (FR-015) */}
      <div className="flex flex-col gap-1.5">
        <Label>To account</Label>
        <AccountPicker
          value={toAccountId}
          onChange={setToAccountId}
          currency={fromAccount?.currency}
          includeArchived={false}
          disabled={fromAccountId === null}
          placeholder="Select a same-currency account"
        />
        {fieldErrors.toAccountId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.toAccountId[0]}</p>
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tf-date">Date</Label>
        <Input id="tf-date" name="date" type="date" defaultValue={today} required />
        {fieldErrors.date?.[0] && <p className="text-sm text-destructive">{fieldErrors.date[0]}</p>}
      </div>

      {/* Amount — positive magnitude; server signs both legs */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tf-amount">
          Amount{" "}
          {fromAccount?.currency && (
            <span className="text-xs font-normal text-muted-foreground">
              ({fromAccount.currency})
            </span>
          )}
        </Label>
        <Input
          id="tf-amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          autoComplete="off"
        />
        {fieldErrors.amount?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tf-notes">
          Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="tf-notes"
          name="notes"
          maxLength={500}
          placeholder="Add any notes…"
          rows={3}
        />
        {fieldErrors.notes?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p>
        )}
      </div>

      <SubmitButton label="Save transfer" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditForm
// ---------------------------------------------------------------------------

/**
 * Edit form for an existing TRANSFER pair.
 * Pre-populates from the transferGroup prop.
 * Submits via updateTransfer which atomically updates BOTH legs.
 *
 * Hidden transferGroupId is NOT used — updateTransfer uses the `id` of either leg
 * to identify the pair (via the anchor leg's transferGroupId lookup).
 *
 * NO edit-archived mode for transfers in v1 — archived transfers display read-only
 * with an "Unarchive both legs" button in the list. Document via this comment.
 */
function EditForm({
  transferGroup,
  onSuccess,
}: {
  transferGroup?: TransferGroupDTO
  onSuccess: () => void
}) {
  const [state, formAction] = useActionState(
    updateTransfer as (
      prevState: CreateTransferResult,
      formData: FormData,
    ) => Promise<CreateTransferResult>,
    null,
  )

  // Pre-populate from transferGroup (the source leg's accountId is fromAccountId,
  // the destination leg's accountId is toAccountId)
  const [fromAccountId, setFromAccountId] = useState<string | null>(
    transferGroup?.source.accountId ?? null,
  )
  const [toAccountId, setToAccountId] = useState<string | null>(
    transferGroup?.destination.accountId ?? null,
  )

  // Pre-populate magnitude from the positive leg
  const initialMagnitude = transferGroup
    ? (() => {
        const raw = transferGroup.destination.amount
        // destination.amount is a positive decimal string like "500.00"
        return raw.startsWith("-") ? raw.slice(1) : raw
      })()
    : ""
  const [magnitude, setMagnitude] = useState(initialMagnitude)

  // Fetch accounts to derive from-account currency for filtered toAccount picker.
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

  const fromAccount = fromAccountId ? accounts.find((a) => a.id === fromAccountId) : null

  function handleFromAccountChange(id: string | null) {
    const newFromAccount = id ? accounts.find((a) => a.id === id) : null
    if (newFromAccount && toAccountId) {
      const currentToAccount = accounts.find((a) => a.id === toAccountId)
      if (currentToAccount && currentToAccount.currency !== newFromAccount.currency) {
        setToAccountId(null)
      }
    }
    setFromAccountId(id)
  }

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.transfer) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state)
  const topLevelError = extractTopLevelError(state)

  // Use the source leg's id as the anchor id for updateTransfer
  const anchorId = transferGroup?.source.id ?? ""

  // Pre-populate date from source leg (both legs share the same date)
  const existingDate = transferGroup?.source.date ?? new Date().toISOString().slice(0, 10)
  // Pre-populate notes from source leg (both legs share the same notes)
  const existingNotes = transferGroup?.source.notes ?? ""

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Hidden inputs */}
      <input type="hidden" name="id" value={anchorId} />
      <input type="hidden" name="fromAccountId" value={fromAccountId ?? ""} />
      <input type="hidden" name="toAccountId" value={toAccountId ?? ""} />
      <input type="hidden" name="amount" value={magnitude} />

      {/* From Account */}
      <div className="flex flex-col gap-1.5">
        <Label>From account</Label>
        <AccountPicker
          value={fromAccountId}
          onChange={handleFromAccountChange}
          includeArchived={false}
          placeholder="Select source account…"
        />
        {fieldErrors.fromAccountId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.fromAccountId[0]}</p>
        )}
      </div>

      {/* To Account — filtered to same currency */}
      <div className="flex flex-col gap-1.5">
        <Label>To account</Label>
        <AccountPicker
          value={toAccountId}
          onChange={setToAccountId}
          currency={fromAccount?.currency}
          includeArchived={false}
          disabled={fromAccountId === null}
          placeholder="Select a same-currency account"
        />
        {fieldErrors.toAccountId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.toAccountId[0]}</p>
        )}
      </div>

      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tf-edit-date">Date</Label>
        <Input id="tf-edit-date" name="date" type="date" defaultValue={existingDate} required />
        {fieldErrors.date?.[0] && <p className="text-sm text-destructive">{fieldErrors.date[0]}</p>}
      </div>

      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tf-edit-amount">
          Amount{" "}
          {fromAccount?.currency && (
            <span className="text-xs font-normal text-muted-foreground">
              ({fromAccount.currency})
            </span>
          )}
        </Label>
        <Input
          id="tf-edit-amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          autoComplete="off"
        />
        {fieldErrors.amount?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tf-edit-notes">
          Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="tf-edit-notes"
          name="notes"
          maxLength={500}
          placeholder="Add any notes…"
          rows={3}
          defaultValue={existingNotes ?? ""}
        />
        {fieldErrors.notes?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.notes[0]}</p>
        )}
      </div>

      <SubmitButton label="Save changes" />
    </form>
  )
}
