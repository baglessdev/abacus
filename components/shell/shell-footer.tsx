import { AbacusIcon } from "@/components/brand/abacus-icon"

/**
 * ShellFooter — brand reaffirmation footer rendered at the bottom of every
 * authenticated route (FR-016, FR-017, FR-018).
 *
 * Sticky-bottom behavior is achieved via the flex layout in app-shell.tsx
 * (main has flex-1, footer sits at the natural flex end). NOT position: fixed.
 *
 * No props. No navigation links. No theme toggle. Content-minimal per FR-017.
 */
export function ShellFooter() {
  return (
    <footer className="border-t px-6 py-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AbacusIcon
          className="h-4 w-4 text-muted-foreground"
          accent="currentColor"
          aria-hidden="true"
        />
        <span className="font-semibold tracking-tight text-muted-foreground">Abacus</span>
        <span aria-hidden="true" className="mx-1">
          &middot;
        </span>
        <span>© 2026 Abacus</span>
      </div>
    </footer>
  )
}
