"use client"

import { useEffect, useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { createAccount, updateAccount } from "@/lib/accounts/actions"
import type { AccountDTO } from "@/lib/accounts/serialize"
import { ACCOUNT_TYPES } from "@/lib/accounts/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CurrencyPicker } from "./currency-picker"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountFormProps = {
  mode: "create" | "edit" | "edit-archived"
  account?: AccountDTO
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
// AccountForm — dispatcher to inner forms so hooks are always unconditional
// ---------------------------------------------------------------------------

/**
 * Multi-mode form for account create / edit / edit-archived.
 * FR-007, FR-009a, FR-019.
 */
export function AccountForm({ mode, account, onSuccess }: AccountFormProps) {
  if (mode === "edit" && account) {
    return <EditForm account={account} onSuccess={onSuccess} />
  }

  if (mode === "edit-archived" && account) {
    return <EditArchivedForm account={account} onSuccess={onSuccess} />
  }

  // Default: create mode
  return <CreateForm onSuccess={onSuccess} />
}

// ---------------------------------------------------------------------------
// CreateForm — inner component so hooks are unconditional
// ---------------------------------------------------------------------------

function CreateForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction] = useActionState(createAccount, null)
  const [currency, setCurrency] = useState("")

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.account) {
      onSuccess()
    }
  }, [state, onSuccess])

  // Extract field errors from a validation_failed response
  const fieldErrors =
    state && "error" in state && state.error.code === "validation_failed"
      ? ((state.error as { fieldErrors?: Partial<Record<string, string[]>> }).fieldErrors ?? {})
      : {}

  // Top-level non-field error (e.g., internal_error)
  const topLevelError =
    state && "error" in state && state.error.code !== "validation_failed"
      ? state.error.message
      : null

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="e.g., Chase Checking"
          autoComplete="off"
        />
        {fieldErrors.name?.[0] && <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>}
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-type">Type</Label>
        <select
          id="account-type"
          name="type"
          defaultValue="CHECKING"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {fieldErrors.type?.[0] && <p className="text-sm text-destructive">{fieldErrors.type[0]}</p>}
      </div>

      {/* Currency */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-currency">Currency</Label>
        <CurrencyPicker
          id="account-currency"
          name="currency"
          value={currency}
          onChange={setCurrency}
        />
        {fieldErrors.currency?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.currency[0]}</p>
        )}
      </div>

      {/* Starting balance */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-balance">Starting balance</Label>
        <Input
          id="account-balance"
          name="startingBalance"
          type="text"
          inputMode="decimal"
          defaultValue="0"
          placeholder="0.00"
        />
        {fieldErrors.startingBalance?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.startingBalance[0]}</p>
        )}
      </div>

      <SubmitButton label="Save account" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditForm — active account edit (name, type, startingBalance editable; currency locked)
// ---------------------------------------------------------------------------

function EditForm({ account, onSuccess }: { account: AccountDTO; onSuccess: () => void }) {
  const [state, formAction] = useActionState(updateAccount, null)

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.account) {
      onSuccess()
    }
  }, [state, onSuccess])

  // Extract field errors from a validation_failed response
  const fieldErrors =
    state && "error" in state && state.error.code === "validation_failed"
      ? ((state.error as { fieldErrors?: Partial<Record<string, string[]>> }).fieldErrors ?? {})
      : {}

  // Top-level non-field error
  const topLevelError =
    state && "error" in state && state.error.code !== "validation_failed"
      ? state.error.message
      : null

  // Keep entered name across server rejects
  const nameValue =
    state && "error" in state
      ? undefined // let defaultValue handle it (re-mount via key)
      : undefined

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden account id */}
      <input type="hidden" name="id" value={account.id} />

      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-account-name">Name</Label>
        <Input
          id="edit-account-name"
          name="name"
          type="text"
          required
          maxLength={80}
          defaultValue={nameValue ?? account.name}
          autoComplete="off"
        />
        {fieldErrors.name?.[0] && <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>}
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-account-type">Type</Label>
        <select
          id="edit-account-type"
          name="type"
          defaultValue={account.type}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {fieldErrors.type?.[0] && <p className="text-sm text-destructive">{fieldErrors.type[0]}</p>}
      </div>

      {/* Currency — locked, read-only (FR-007, US3 scenario 3, SC-009) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-account-currency">Currency</Label>
        <CurrencyPicker
          id="edit-account-currency"
          name="currency"
          value={account.currency}
          onChange={() => {
            /* intentionally locked */
          }}
          disabled
        />
        <p className="text-xs text-muted-foreground">
          Currency is locked at creation to keep balances consistent.
        </p>
        {fieldErrors.currency?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.currency[0]}</p>
        )}
      </div>

      {/* Starting balance */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-account-balance">Starting balance</Label>
        <Input
          id="edit-account-balance"
          name="startingBalance"
          type="text"
          inputMode="decimal"
          defaultValue={account.startingBalance}
          placeholder="0.00"
        />
        {fieldErrors.startingBalance?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.startingBalance[0]}</p>
        )}
      </div>

      <SubmitButton label="Save changes" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditArchivedForm — archived account edit (name editable; type, currency, startingBalance locked)
// ---------------------------------------------------------------------------

function EditArchivedForm({ account, onSuccess }: { account: AccountDTO; onSuccess: () => void }) {
  const [state, formAction] = useActionState(updateAccount, null)

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.account) {
      onSuccess()
    }
  }, [state, onSuccess])

  // Extract field errors from a validation_failed response
  const fieldErrors =
    state && "error" in state && state.error.code === "validation_failed"
      ? ((state.error as { fieldErrors?: Partial<Record<string, string[]>> }).fieldErrors ?? {})
      : {}

  // Top-level non-field error
  const topLevelError =
    state && "error" in state && state.error.code !== "validation_failed"
      ? state.error.message
      : null

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden account id */}
      <input type="hidden" name="id" value={account.id} />

      {/* Archived notice (FR-009a, SC-014) */}
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        This account is archived. Only the name can be edited while archived.
      </p>

      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Name — editable */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-archived-account-name">Name</Label>
        <Input
          id="edit-archived-account-name"
          name="name"
          type="text"
          required
          maxLength={80}
          defaultValue={account.name}
          autoComplete="off"
        />
        {fieldErrors.name?.[0] && <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>}
      </div>

      {/* Type — disabled (FR-009a) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-archived-account-type">Type</Label>
        <select
          id="edit-archived-account-type"
          name="type"
          defaultValue={account.type}
          disabled
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Currency — locked (FR-007) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-archived-account-currency">Currency</Label>
        <CurrencyPicker
          id="edit-archived-account-currency"
          name="currency"
          value={account.currency}
          onChange={() => {
            /* intentionally locked */
          }}
          disabled
        />
        <p className="text-xs text-muted-foreground">
          Currency is locked at creation to keep balances consistent.
        </p>
      </div>

      {/* Starting balance — disabled (FR-009a) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-archived-account-balance">Starting balance</Label>
        <Input
          id="edit-archived-account-balance"
          name="startingBalance"
          type="text"
          inputMode="decimal"
          defaultValue={account.startingBalance}
          placeholder="0.00"
          disabled
        />
      </div>

      <SubmitButton label="Save name" />
    </form>
  )
}
