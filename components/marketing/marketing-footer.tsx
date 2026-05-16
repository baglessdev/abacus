import { AbacusIcon } from "@/components/brand/abacus-icon"

export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      <span className="inline-flex items-center justify-center gap-1.5">
        <AbacusIcon className="h-5 w-5 text-muted-foreground" accent="currentColor" />
        <span className="font-semibold text-foreground">Abacus</span>
        <span>· © {year} · Personal finance tracking</span>
      </span>
    </footer>
  )
}
