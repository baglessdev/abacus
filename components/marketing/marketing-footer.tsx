export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      © {year} Abacus · Personal finance tracking
    </footer>
  )
}
