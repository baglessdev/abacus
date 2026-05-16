"use client"

import { Brand } from "@/components/shell/brand"
import { NavLink } from "@/components/shell/nav-link"
import { navGroups } from "@/components/shell/nav-items"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type MobileNavProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 p-0 transition-transform duration-200 motion-reduce:transition-none"
      >
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          <Brand />
        </SheetHeader>
        <Separator />
        <nav aria-label="Primary mobile" className="flex flex-col gap-2 p-2">
          {navGroups.map((group, idx) => (
            <div key={group.label} className="flex flex-col gap-1">
              {idx > 0 ? <Separator className="my-2" /> : null}
              <span
                aria-hidden="true"
                className="px-3 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {group.label}
              </span>
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  onNavigate={() => onOpenChange(false)}
                />
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
