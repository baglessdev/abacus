"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Wallet } from "lucide-react"

import { listAccounts } from "@/lib/accounts/actions"
import type { AccountDTO } from "@/lib/accounts/serialize"
import { formatAmount } from "@/lib/money/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountPickerProps = {
  /** The currently-selected account id, or null for "no selection". */
  value: string | null
  /** Called when the user picks an account (or clears the selection). */
  onChange: (id: string | null) => void
  /**
   * When set, only accounts where account.currency === currency are shown.
   * Used by the transfer form to ensure same-currency accounts only.
   */
  currency?: string
  /** When true, archived accounts are listed. Default: false. */
  includeArchived?: boolean
  /** When true, the picker trigger is non-interactive. */
  disabled?: boolean
  /**
   * When true, render a "(none)" option at the top of the list.
   * Calls onChange(null).
   */
  allowNone?: boolean
  /** Placeholder text when value is null. Default: "Select account…" */
  placeholder?: string
}

// ---------------------------------------------------------------------------
// AccountPicker
// ---------------------------------------------------------------------------

/**
 * Reusable account-picker primitive (FR-022, FR-023).
 * Contract surface for features 007 (Transactions), 008 (Budgets), 015 (Charts).
 * Lives at components/accounts/ (NOT under a route-bound _components/).
 *
 * Uses shadcn <Command> inside <Popover>.
 * Fetches accounts on mount via listAccounts({ includeArchived }).
 * Refetches when `currency` or `includeArchived` props change.
 * Filters by currency when set.
 */
export function AccountPicker({
  value,
  onChange,
  currency,
  includeArchived = false,
  disabled = false,
  allowNone = false,
  placeholder = "Select account…",
}: AccountPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [accounts, setAccounts] = React.useState<AccountDTO[]>([])
  const [loadError, setLoadError] = React.useState(false)

  // Fetch accounts on mount + when includeArchived or currency changes.
  React.useEffect(() => {
    let cancelled = false
    void listAccounts({ includeArchived }).then((result) => {
      if (cancelled) return
      if ("data" in result) {
        setAccounts(result.data.accounts)
        setLoadError(false)
      } else {
        setLoadError(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [includeArchived, currency])

  // Filter by currency when set.
  const filtered = currency ? accounts.filter((a) => a.currency === currency) : accounts

  // Derive the selected account from local state.
  const selectedAccount = value ? accounts.find((a) => a.id === value) : null

  // ---------------------------------------------------------------------------
  // Disabled: read-only display
  // ---------------------------------------------------------------------------

  if (disabled) {
    return (
      <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
        {selectedAccount ? (
          <>
            <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{selectedAccount.name}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              {selectedAccount.currency} ·{" "}
              {formatAmount(selectedAccount.balance, selectedAccount.currency)}
            </span>
          </>
        ) : (
          <span>{placeholder}</span>
        )}
      </div>
    )
  }

  // Trigger label
  const triggerContent = (() => {
    if (!selectedAccount) return <span className="text-muted-foreground">{placeholder}</span>
    return (
      <>
        <Wallet className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{selectedAccount.name}</span>
        <span className="ml-1 text-xs text-muted-foreground">
          {selectedAccount.currency} ·{" "}
          {formatAmount(selectedAccount.balance, selectedAccount.currency)}
        </span>
      </>
    )
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Account"
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center">{triggerContent}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts…" />
          <CommandList>
            {loadError ? (
              <CommandEmpty>Failed to load accounts.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>No accounts found.</CommandEmpty>

                {/* (none) option */}
                {allowNone && (
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        onChange(null)
                        setOpen(false)
                      }}
                    >
                      <span className="text-muted-foreground">(none)</span>
                      {value === null && <Check className="ml-auto h-4 w-4 shrink-0" />}
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* Accounts */}
                {filtered.length > 0 && (
                  <CommandGroup>
                    {filtered.map((account) => (
                      <CommandItem
                        key={account.id}
                        value={`${account.name} ${account.currency}`}
                        onSelect={() => {
                          onChange(account.id)
                          setOpen(false)
                        }}
                      >
                        <Wallet
                          className={cn("mr-2 h-4 w-4 shrink-0", "text-muted-foreground")}
                          aria-hidden="true"
                        />
                        <span className="flex-1">{account.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {account.currency} · {formatAmount(account.balance, account.currency)}
                        </span>
                        {value === account.id && <Check className="ml-2 h-4 w-4 shrink-0" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
