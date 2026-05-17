"use client"

import { useEffect, useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { createCategory, updateCategory } from "@/lib/categories/actions"
import type { CategoryDTO } from "@/lib/categories/serialize"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CategoryPicker } from "@/components/categories/category-picker"
import { ColorPicker } from "./color-picker"
import { IconPicker } from "./icon-picker"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CategoryFormProps = {
  mode: "create" | "edit" | "edit-archived"
  category?: CategoryDTO
  onSuccess: () => void
  parentOptions: CategoryDTO[]
}

// ---------------------------------------------------------------------------
// Submit button (uses useFormStatus — must be a separate component)
// ---------------------------------------------------------------------------

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : label}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// CategoryForm — dispatcher to inner forms so hooks are always unconditional
// ---------------------------------------------------------------------------

/**
 * Multi-mode form for category create / edit / edit-archived.
 * FR-005, FR-006, FR-009, FR-017, FR-021.
 */
export function CategoryForm({ mode, category, onSuccess, parentOptions }: CategoryFormProps) {
  if (mode === "edit" && category) {
    return <EditForm category={category} onSuccess={onSuccess} parentOptions={parentOptions} />
  }

  if (mode === "edit-archived" && category) {
    return <EditArchivedForm category={category} onSuccess={onSuccess} />
  }

  // Default: create mode
  return <CreateForm onSuccess={onSuccess} parentOptions={parentOptions} />
}

// ---------------------------------------------------------------------------
// Shared field-error extractor
// ---------------------------------------------------------------------------

type ActionState =
  | { data: { category: CategoryDTO } }
  | {
      error: {
        code: string
        message: string
        fieldErrors?: Partial<Record<string, string[]>>
        field?: string
      }
    }
  | null

function extractFieldErrors(state: ActionState): Partial<Record<string, string[]>> {
  if (!state || !("error" in state)) return {}
  if (state.error.code === "validation_failed") {
    return state.error.fieldErrors ?? {}
  }
  return {}
}

function extractTopLevelError(state: ActionState): string | null {
  if (!state || !("error" in state)) return null
  const code = state.error.code
  // kind_change_blocked and hierarchy_violation are shown as field errors via their `field` property
  if (code === "validation_failed") return null
  return state.error.message
}

// ---------------------------------------------------------------------------
// CreateForm — inner component so hooks are unconditional
// ---------------------------------------------------------------------------

function CreateForm({
  onSuccess,
  parentOptions,
}: {
  onSuccess: () => void
  parentOptions: CategoryDTO[]
}) {
  const [state, formAction] = useActionState(createCategory, null)

  // Controlled state for pickers (hidden inputs carry values to FormData)
  const [parentId, setParentId] = useState<string | null>(null)
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE")
  const [color, setColor] = useState("violet")
  const [icon, setIcon] = useState("Tag")

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.category) {
      onSuccess()
    }
  }, [state, onSuccess])

  // When parent is selected, derive + lock the kind from the parent
  const selectedParent = parentId ? (parentOptions.find((c) => c.id === parentId) ?? null) : null
  const kindIsLocked = selectedParent !== null
  const effectiveKind: "INCOME" | "EXPENSE" = selectedParent ? selectedParent.kind : kind

  // Handler: when parent picker changes, also sync kind atomically
  function handleParentChange(id: string | null) {
    setParentId(id)
    if (id) {
      const parent = parentOptions.find((c) => c.id === id)
      if (parent) {
        setKind(parent.kind)
      }
    }
  }

  const fieldErrors = extractFieldErrors(state as ActionState)
  const topLevelError = extractTopLevelError(state as ActionState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="e.g., Pets"
          autoComplete="off"
        />
        {fieldErrors.name?.[0] && <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>}
      </div>

      {/* Kind */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-kind">Kind</Label>
        {/* Hidden input so FormData always has "kind" */}
        <input type="hidden" name="kind" value={effectiveKind} />
        <Select
          value={effectiveKind}
          onValueChange={(v) => {
            if (!kindIsLocked) setKind(v as "INCOME" | "EXPENSE")
          }}
          disabled={kindIsLocked}
        >
          <SelectTrigger id="category-kind" aria-label="Kind" data-testid="kind-select">
            <SelectValue placeholder="Select kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">EXPENSE</SelectItem>
            <SelectItem value="INCOME">INCOME</SelectItem>
          </SelectContent>
        </Select>
        {kindIsLocked && (
          <p className="text-xs text-muted-foreground">
            Kind is inherited from the parent category.
          </p>
        )}
        {fieldErrors.kind?.[0] && <p className="text-sm text-destructive">{fieldErrors.kind[0]}</p>}
      </div>

      {/* Parent */}
      <div className="flex flex-col gap-1.5">
        <Label>Parent category</Label>
        {/* Hidden input so FormData has parentId */}
        <input type="hidden" name="parentId" value={parentId ?? ""} />
        <CategoryPicker
          value={parentId}
          onChange={handleParentChange}
          kind={effectiveKind}
          includeArchived={false}
          allowNone={true}
          placeholder="No parent (top-level)"
          ariaLabel="Parent category"
        />
        {fieldErrors.parentId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.parentId[0]}</p>
        )}
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <ColorPicker value={color} onChange={setColor} name="color" />
        {fieldErrors.color?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.color[0]}</p>
        )}
      </div>

      {/* Icon */}
      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <IconPicker value={icon} onChange={setIcon} name="icon" />
        {fieldErrors.icon?.[0] && <p className="text-sm text-destructive">{fieldErrors.icon[0]}</p>}
      </div>

      <SubmitButton label="Save" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditForm — active category edit
// ---------------------------------------------------------------------------

function EditForm({
  category,
  onSuccess,
  parentOptions,
}: {
  category: CategoryDTO
  onSuccess: () => void
  parentOptions: CategoryDTO[]
}) {
  const [state, formAction] = useActionState(updateCategory, null)

  // Controlled state — initialized from category prop
  const [parentId, setParentId] = useState<string | null>(category.parentId ?? null)
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">(category.kind)
  const [color, setColor] = useState(category.color)
  const [icon, setIcon] = useState(category.icon)

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.category) {
      onSuccess()
    }
  }, [state, onSuccess])

  // When parent is selected, derive + lock the kind from the parent
  const selectedParent = parentId ? (parentOptions.find((c) => c.id === parentId) ?? null) : null
  const kindIsLocked = selectedParent !== null
  const effectiveKind: "INCOME" | "EXPENSE" = selectedParent ? selectedParent.kind : kind

  function handleParentChange(id: string | null) {
    setParentId(id)
    if (id) {
      const parent = parentOptions.find((c) => c.id === id)
      if (parent) {
        setKind(parent.kind)
      }
    }
  }

  const fieldErrors = extractFieldErrors(state as ActionState)
  const topLevelError = extractTopLevelError(state as ActionState)

  // kind_change_blocked surfaces as a top-level error with field: "kind"
  const kindChangeBlocked =
    state &&
    "error" in state &&
    (state as { error: { code: string } }).error.code === "kind_change_blocked"
      ? (state as { error: { message: string } }).error.message
      : null

  // hierarchy_violation surfaces as a parentId field error
  const hierarchyError =
    state &&
    "error" in state &&
    (state as { error: { code: string } }).error.code === "hierarchy_violation"
      ? (state as { error: { message: string } }).error.message
      : null

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden category id */}
      <input type="hidden" name="id" value={category.id} />

      {/* Top-level error (non-field errors excluding kind_change_blocked and hierarchy_violation) */}
      {topLevelError && !kindChangeBlocked && !hierarchyError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-category-name">Name</Label>
        <Input
          id="edit-category-name"
          name="name"
          type="text"
          required
          maxLength={80}
          defaultValue={category.name}
          autoComplete="off"
        />
        {fieldErrors.name?.[0] && <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>}
      </div>

      {/* Kind */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-category-kind">Kind</Label>
        <input type="hidden" name="kind" value={effectiveKind} />
        <Select
          value={effectiveKind}
          onValueChange={(v) => {
            if (!kindIsLocked) setKind(v as "INCOME" | "EXPENSE")
          }}
          disabled={kindIsLocked}
        >
          <SelectTrigger id="edit-category-kind" aria-label="Kind" data-testid="kind-select">
            <SelectValue placeholder="Select kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">EXPENSE</SelectItem>
            <SelectItem value="INCOME">INCOME</SelectItem>
          </SelectContent>
        </Select>
        {kindIsLocked && (
          <p className="text-xs text-muted-foreground">
            Kind is inherited from the parent category.
          </p>
        )}
        {fieldErrors.kind?.[0] && <p className="text-sm text-destructive">{fieldErrors.kind[0]}</p>}
        {kindChangeBlocked && (
          <p className="text-sm text-destructive" data-testid="kind-change-blocked-error">
            {kindChangeBlocked}
          </p>
        )}
      </div>

      {/* Parent */}
      <div className="flex flex-col gap-1.5">
        <Label>Parent category</Label>
        <input type="hidden" name="parentId" value={parentId ?? ""} />
        <CategoryPicker
          value={parentId}
          onChange={handleParentChange}
          kind={effectiveKind}
          includeArchived={false}
          allowNone={true}
          excludeIds={[category.id]}
          placeholder="No parent (top-level)"
          ariaLabel="Parent category"
        />
        {fieldErrors.parentId?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.parentId[0]}</p>
        )}
        {hierarchyError && <p className="text-sm text-destructive">{hierarchyError}</p>}
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <ColorPicker value={color} onChange={setColor} name="color" />
        {fieldErrors.color?.[0] && (
          <p className="text-sm text-destructive">{fieldErrors.color[0]}</p>
        )}
      </div>

      {/* Icon */}
      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <IconPicker value={icon} onChange={setIcon} name="icon" />
        {fieldErrors.icon?.[0] && <p className="text-sm text-destructive">{fieldErrors.icon[0]}</p>}
      </div>

      <SubmitButton label="Save changes" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// EditArchivedForm — archived category edit (name-only editable)
// ---------------------------------------------------------------------------

function EditArchivedForm({
  category,
  onSuccess,
}: {
  category: CategoryDTO
  onSuccess: () => void
}) {
  const [state, formAction] = useActionState(updateCategory, null)

  // Close the sheet when the action succeeds
  useEffect(() => {
    if (state && "data" in state && state.data?.category) {
      onSuccess()
    }
  }, [state, onSuccess])

  const fieldErrors = extractFieldErrors(state as ActionState)
  const topLevelError = extractTopLevelError(state as ActionState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden category id */}
      <input type="hidden" name="id" value={category.id} />
      {/* Pass current values so the server action has them (kind, color, icon, parentId) */}
      <input type="hidden" name="kind" value={category.kind} />
      <input type="hidden" name="color" value={category.color} />
      <input type="hidden" name="icon" value={category.icon} />
      <input type="hidden" name="parentId" value={category.parentId ?? ""} />

      {/* Archived notice */}
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        This category is archived. Only the name can be edited while archived.
      </p>

      {/* Top-level error */}
      {topLevelError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {topLevelError}
        </p>
      )}

      {/* Name — editable */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-archived-category-name">Name</Label>
        <Input
          id="edit-archived-category-name"
          name="name"
          type="text"
          required
          maxLength={80}
          defaultValue={category.name}
          autoComplete="off"
        />
        {fieldErrors.name?.[0] && <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>}
      </div>

      {/* Kind — disabled */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-archived-category-kind">Kind</Label>
        <Select value={category.kind} disabled>
          <SelectTrigger
            id="edit-archived-category-kind"
            aria-label="Kind"
            data-testid="kind-select-archived"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">EXPENSE</SelectItem>
            <SelectItem value="INCOME">INCOME</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Parent — disabled */}
      <div className="flex flex-col gap-1.5">
        <Label>Parent category</Label>
        <CategoryPicker
          value={category.parentId ?? null}
          onChange={() => {
            /* intentionally locked */
          }}
          disabled
          placeholder="No parent (top-level)"
          ariaLabel="Parent category"
        />
      </div>

      {/* Color — disabled */}
      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <ColorPicker
          value={category.color}
          onChange={() => {
            /* intentionally locked */
          }}
          disabled
        />
      </div>

      {/* Icon — disabled */}
      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <IconPicker
          value={category.icon}
          onChange={() => {
            /* intentionally locked */
          }}
          disabled
        />
      </div>

      <SubmitButton label="Save name" />
    </form>
  )
}
