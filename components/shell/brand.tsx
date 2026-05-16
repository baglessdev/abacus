import { Wallet } from "lucide-react"

export function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-4">
      <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
      <span className="text-base font-semibold tracking-tight">Abacus</span>
    </div>
  )
}
