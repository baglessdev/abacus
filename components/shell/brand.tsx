import { AbacusIcon } from "@/components/brand/abacus-icon"

export function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-4">
      <AbacusIcon className="h-6 w-6" aria-hidden="true" />
      <span className="text-base font-semibold tracking-tight">Abacus</span>
    </div>
  )
}
