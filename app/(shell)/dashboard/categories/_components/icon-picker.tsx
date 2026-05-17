"use client"

import { useState } from "react"
import { Check } from "lucide-react"

import { CATEGORY_ICONS } from "@/lib/categories/icons"
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

type IconPickerProps = {
  value: string
  onChange: (name: string) => void
  name?: string
  disabled?: boolean
}

/**
 * Icon picker — Command-in-Popover searchable icon selector.
 * Keyboard-accessible via cmdk's built-in keyboard model.
 * FR-008, FR-020.
 */
export function IconPicker({ value, onChange, name, disabled = false }: IconPickerProps) {
  const [open, setOpen] = useState(false)

  const selectedIcon = CATEGORY_ICONS.find((i) => i.name === value)

  if (disabled) {
    return (
      <div className="flex items-center gap-2">
        {name && <input type="hidden" name={name} value={value} />}
        <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground opacity-60">
          {selectedIcon ? (
            <>
              <selectedIcon.component className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{selectedIcon.label}</span>
            </>
          ) : (
            <span>No icon selected</span>
          )}
          <span className="ml-auto text-xs">(locked while archived)</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Hidden input for FormData submission */}
      {name && <input type="hidden" name={name} value={value} />}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            aria-label="Choose icon"
          >
            {selectedIcon ? (
              <>
                <selectedIcon.component className="mr-2 h-4 w-4" aria-hidden="true" />
                {selectedIcon.label}
              </>
            ) : (
              <span className="text-muted-foreground">Choose icon</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search icons…" />
            <CommandList>
              <CommandEmpty>No icons found.</CommandEmpty>
              <CommandGroup>
                {CATEGORY_ICONS.map((icon) => (
                  <CommandItem
                    key={icon.name}
                    value={`${icon.name} ${icon.label}`}
                    onSelect={() => {
                      onChange(icon.name)
                      setOpen(false)
                    }}
                  >
                    <icon.component className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{icon.label}</span>
                    {value === icon.name ? <Check className={cn("ml-auto h-4 w-4")} /> : null}
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
