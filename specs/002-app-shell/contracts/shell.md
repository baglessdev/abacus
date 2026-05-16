# Contract — App Shell (UI surface)

This feature introduces no new HTTP endpoints. It introduces a **UI contract** — the layout/component "API" that every subsequent feature consumes when it renders inside the shell. This document is what feature 003 (auth) and later features will read when they need to know "how do I render inside the shell."

---

## 1. `<AppShell>` composition

**Path**: `components/shell/app-shell.tsx`

**Props**:

| Prop | Type | Required | Description |
|---|---|---|---|
| `children` | `React.ReactNode` | yes | The page content. Rendered inside `<main tabindex="-1">`. |

**Rendered structure**:

```text
<div class="min-h-screen flex">
  <Sidebar />                   {/* hidden md:flex; fixed width 256px */}
  <div class="flex-1 flex flex-col">
    <Header onOpenMobileNav={…} />     {/* sticky h-14 */}
    <main tabindex="-1" ref={mainRef} role="main" class="flex-1">
      {children}
    </main>
  </div>
  <MobileNav open={…} onClose={…} />    {/* shadcn Sheet — rendered at any viewport, only opened by Header below md */}
  <RouteFocus mainRef={mainRef} />
</div>
```

**Slots**:

- `children` is the only slot. Each route's `page.tsx` renders into it directly.
- The shell does NOT provide a "page header" slot in this feature. Each route page is responsible for its own `<h1>` and intro copy.

**State owned by `<AppShell>`**:

- `mobileNavOpen: boolean` — passed to `<Header>` (which toggles it) and `<MobileNav>` (which consumes `open` and `onClose`).
- `mainRef: RefObject<HTMLElement>` — passed to `<main>` and `<RouteFocus>`.

**What it does NOT own**:

- Auth state, user session, breadcrumbs, page titles, body classes. These are out of scope for this feature.

---

## 2. Nav-item shape

**Path**: `components/shell/nav-items.ts`

**Type**:

```ts
import type { LucideIcon } from "lucide-react"

export type NavItem = {
  href: string         // exact route path, e.g., "/" or "/accounts"
  label: string        // human-readable label rendered next to the icon
  icon: LucideIcon     // Lucide icon component (rendered at h-4 w-4)
}

export const navItems: NavItem[] = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { href: "/accounts",     label: "Accounts",     icon: Wallet },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets",      label: "Budgets",      icon: PieChart },
  { href: "/settings",     label: "Settings",     icon: Settings },
]
```

(Exact Lucide icon choices are a build-time decision; the shape and order are the contract.)

**Order**: This order is fixed by FR-002 of the spec. Future features that add a route (e.g., Reports, Recurring) extend this array; they MUST NOT reorder existing items.

**Single source of truth**: Both `<Sidebar>` and `<MobileNav>` import this array. Adding a route in the future means appending one entry, not editing two component files.

---

## 3. Active-route rule

The function used by `<NavLink>` to determine whether to render the active visual state and apply `aria-current="page"`:

```ts
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}
```

**Rules**:

- The dashboard (`/`) is active **only** on exact `pathname === "/"`. (Otherwise every route would highlight Dashboard, because every pathname starts with `/`.)
- Every other item is active on exact match **or** on prefix-with-trailing-slash. This makes nested routes like `/accounts/123/edit` correctly highlight "Accounts" once such routes exist.

**Visual treatment of the active item**:

- Background: `bg-primary text-primary-foreground` (the violet primary surface).
- Inactive: `text-foreground hover:bg-accent hover:text-accent-foreground`.
- Focus ring on either state: shadcn default `--ring` (which this feature maps to violet).
- `aria-current="page"` is set on the active link's `<a>` element.

---

## 4. Page-content slot

Where future features render their bodies:

- Each route's `app/(shell)/<route>/page.tsx` is a server component (by default) whose returned JSX is the page body. It renders directly into the `<main>` slot of `<AppShell>`.
- A page MAY add its own `loading.tsx` and `error.tsx` siblings to override the group-level defaults at `app/(shell)/loading.tsx` and `app/(shell)/error.tsx`. Future features will commonly do this once they have route-specific loading skeletons.
- A page MUST NOT render its own outer chrome (no second header, no second sidebar). The shell owns chrome.
- A page MUST NOT call `useTheme()` or manipulate the `<html class>` directly. The theme toggle is owned by `<Header>`.
- A page MAY use `<EmptyState>` from `components/shell/empty-state.tsx`; in this feature, every route does.

---

## 5. `<EmptyState>` component contract

**Path**: `components/shell/empty-state.tsx`

**Props**:

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | The empty-state headline (rendered as a heading). |
| `description` | `string` | yes | One-to-two sentence explanation. |
| `icon` | `LucideIcon` | yes | A Lucide icon component, rendered large (e.g., `h-12 w-12`) above the title. |
| `action` | `{ label: string; href?: string; onClick?: () => void; disabled?: boolean }` | no | Optional primary CTA. If `href` is provided, the action renders as a Next `<Link>` styled as a `<Button>`. If `onClick` or `disabled` is provided (without `href`), it renders as a `<Button>`. If both `href` and `onClick` are provided, `href` wins. |

**Rendered structure** (illustrative):

```text
<div class="flex flex-col items-center justify-center text-center py-12 px-6 gap-4">
  <icon class="h-12 w-12 text-muted-foreground" aria-hidden="true" />
  <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
  <p class="text-muted-foreground max-w-md">{description}</p>
  {action && <Button …>{action.label}</Button>}
</div>
```

**Constraints**:

- The icon MUST receive `aria-hidden="true"` (it is decorative; the title carries the meaning).
- The title MUST render as the page's `<h1>` (not `<h2>`) so the page heading hierarchy is correct.
- No money values. No charts. No live data.
- In this feature, the dashboard CTA is informational only (no `href`, `disabled: true`, paired with a sibling `<p>` explaining the feature pending status). Future features replace this with `href="/accounts/new"` and a real link.

---

## 6. Error-boundary contract — what `error.tsx` exports

**Path**: `app/(shell)/error.tsx`

**Signature** (per Next.js App Router convention):

```tsx
"use client"

export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // render error UI
}
```

**Behavior**:

- MUST be marked `"use client"` (Next.js requirement for error boundaries).
- MUST render inside the shell's `<main>` (achieved automatically by being inside the `(shell)` group's layout).
- MUST display a friendly headline ("Something went wrong" or similar) and a one-sentence explanation.
- MUST offer at least one recovery action: a "Try again" button that calls `reset()`. SHOULD also offer "Go to dashboard" as a `<Link href="/">`.
- MUST NOT render `error.message` or `error.stack` in any environment. In dev, the value is visible in the browser console; the rendered UI stays generic.
- MAY log `error.digest` for support purposes; in this feature, the implementer can `console.error(error.digest)` and call it done. Future feature (observability) will wire real logging.

**Future-feature affordance**: Any future feature can drop a sibling `error.tsx` next to its own `page.tsx` (e.g., `app/(shell)/accounts/error.tsx`) to provide a route-specific error boundary. It MUST follow the same signature.

---

## 7. Loading-state contract — what `loading.tsx` exports

**Path**: `app/(shell)/loading.tsx`

**Signature**:

```tsx
export default function ShellLoading() {
  // render loading UI (server component is fine)
}
```

**Behavior**:

- MUST render inside the shell's `<main>` (achieved automatically).
- MUST NOT be a generic browser spinner (FR-020). Render a shell-aware skeleton — a few muted-color text-shaped blocks (`<div class="h-6 w-48 bg-muted rounded animate-pulse" />` style) sized to suggest a heading + paragraph + button.
- MUST respect reduced-motion: any `animate-pulse` is acceptable because Tailwind's `animate-pulse` is a low-amplitude opacity pulse; if a future feature uses a stronger animation, it must add `motion-reduce:animate-none`.

**Future-feature affordance**: A route can override with its own `loading.tsx` sibling to provide a route-shaped skeleton (e.g., a table-row skeleton for `/transactions`).

---

## 8. Not-found contract

**Path**: `app/not-found.tsx` (root level, OUTSIDE the route group)

**Signature**:

```tsx
export default function NotFound() {
  // renders <AppShell> directly, with a not-found body inside
}
```

**Behavior**:

- MUST render `<AppShell>` so the chrome remains visible (FR-023).
- MUST render an `<EmptyState>` with a "Page not found" title, a brief explanation, and an action linking back to `/`.
- MUST NOT redirect — the user typed (or was sent to) a URL that doesn't exist; respect that by showing them where they are.

---

## 9. `<main tabindex="-1">` focus landing target

The `<main>` element in `<AppShell>` is the focus landing target on every client-side route change (per deferred-clarification 4 resolved in `plan.md` and FR-017).

**Contract**:

- `<main>` MUST have `tabindex="-1"` so it is programmatically focusable without entering the natural tab order.
- `<main>` MUST receive `role="main"` (or be the only `<main>` element on the page — implicit role).
- A client-island component `<RouteFocus mainRef={mainRef} />` listens for `usePathname()` changes and calls `mainRef.current?.focus()` after the first mount.
- The first mount does NOT trigger a focus call (so initial page load does not steal focus).
- Future features MUST NOT add their own `tabindex="-1"` elements that compete for the route-change focus.

**Testability**: Playwright can assert `await expect(page.locator("main")).toBeFocused()` after a programmatic navigation.

---

## 10. What this contract does NOT define

This contract is intentionally narrow. The following are NOT specified here and remain feature-scoped or out-of-scope:

- Page titles / `<title>` management (each route can use Next's `generateMetadata` or static `metadata` exports).
- Breadcrumbs (no breadcrumb component in this feature).
- Per-route action bars (e.g., "+ New transaction" button on `/transactions`). Future features add their own.
- Auth gates, redirects, or session UI (feature 003).
- Toasts / notifications (no toaster in this feature).
- Modal / dialog stacking rules beyond what shadcn `Dialog`/`Sheet` already enforce.
- Internationalization. Copy is English-only this feature.

Future features that need any of these add them as their own components and document them in their own `contracts/`.
