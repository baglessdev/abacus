"use client"

import { LogOut, Settings } from "lucide-react"
import Link from "next/link"

import { signOutAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type UserMenuProps = {
  user: { email: string }
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-[14rem] truncate"
          aria-label={`Account menu for ${user.email}`}
        >
          <span className="truncate">{user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="flex w-full items-center gap-2 text-left">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Log out</span>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
