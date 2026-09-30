"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"
import { Plus, FolderPlus, CheckSquare, BookMarked } from "lucide-react"

export type NewItemKind = "chapter" | "task" | "source"

type MenuAction = {
  id: NewItemKind
  label: string
  description: string
  icon: typeof FolderPlus
}

const actions: MenuAction[] = [
  {
    id: "chapter",
    label: "Chapter",
    description: "New research chapter",
    icon: FolderPlus,
  },
  {
    id: "task",
    label: "Task",
    description: "Assign work to a member",
    icon: CheckSquare,
  },
  {
    id: "source",
    label: "Source / Citation",
    description: "Cite a book, article, or URL",
    icon: BookMarked,
  },
]

export function NewSectionMenu({
  className,
  onNew,
  disabled,
  hideTaskOption,
}: {
  className?: string
  /** Called with the chosen item type; the parent opens the matching creation panel. */
  onNew: (kind: NewItemKind) => void
  disabled?: boolean
  /** Hide the Task option (task creation is leader-only). */
  hideTaskOption?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  // Shared dismiss: only a genuine outside click closes the menu.
  useDismissOnOutsideClick({
    refs: containerRef,
    enabled: open,
    onDismiss: () => setOpen(false),
  })

  function handleAction(id: NewItemKind) {
    setOpen(false)
    onNew(id)
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add a chapter, task, or source"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden="true" />
        New item
      </button>

      {open && !disabled && (
        <div
          role="menu"
          aria-label="New item options"
          className={`absolute right-0 ${Z.menu} mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
        >
          {actions
            .filter((action) => !(hideTaskOption && action.id === "task"))
            .map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                onClick={() => handleAction(action.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{action.label}</span>
                  <span className="block text-xs text-muted-foreground">{action.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
