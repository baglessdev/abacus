"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { CURRENCIES } from "@/lib/money"
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
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type CurrencyPickerProps = {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  name?: string
  id?: string
}

/**
 * Searchable currency combobox — cmdk Command inside Radix Popover.
 * When disabled=true, renders a read-only Input showing the code (no popover).
 * The hidden input carries the value for FormData submission.
 * FR-005, FR-020.
 */
export function CurrencyPicker({ value, onChange, disabled, name, id }: CurrencyPickerProps) {
  const [open, setOpen] = React.useState(false)

  // When disabled, show a plain read-only input
  if (disabled) {
    return (
      <Input id={id} value={value} readOnly disabled aria-label="Currency (locked at creation)" />
    )
  }

  const selectedCurrency = CURRENCIES.find((c) => c.code === value)

  return (
    <div className="relative">
      {/* Hidden input so FormData picks up the value */}
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Select currency"
            className="w-full justify-between font-normal"
          >
            {selectedCurrency
              ? `${selectedCurrency.code} — ${selectedCurrency.name}`
              : "Select currency"}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search currency…" />
            <CommandList>
              <CommandEmpty>No currency found.</CommandEmpty>
              <CommandGroup>
                {CURRENCIES.map((currency) => (
                  <CommandItem
                    key={currency.code}
                    value={`${currency.code} ${currency.name}`}
                    onSelect={() => {
                      onChange(currency.code)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === currency.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {currency.code} — {currency.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
