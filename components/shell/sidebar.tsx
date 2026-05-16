import { Brand } from "@/components/shell/brand"
import { NavLink } from "@/components/shell/nav-link"
import { navItems } from "@/components/shell/nav-items"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export function Sidebar() {
  return (
    <aside className="hidden bg-background md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-r">
      <Brand />
      <Separator />
      <ScrollArea className="flex-1">
        <nav aria-label="Primary" className="flex flex-col gap-1 p-2">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
