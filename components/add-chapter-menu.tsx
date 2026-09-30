"use client"

import { useEffect, useRef, useState } from "react"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"
import { Plus, Folder, FileText, Check } from "lucide-react"

const options = [
  { id: "chapter", label: "Add chapter", description: "Start a new chapter", icon: Folder },
  { id: "section", label: "Add section", description: "Add a section to a chapter", icon: FileText },
]

export function AddChapterMenu() {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
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

  function handleSelect(id: string) {
    setChosen(id)
    setOpen(false)
    window.setTimeout(() => setChosen(null), 2000)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-[13rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-5 text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-brand">
          <Plus className="size-5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">Add chapter or section</span>
        {chosen && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[oklch(0.55_0.14_155)]">
            <Check className="size-3.5" aria-hidden="true" />
            {options.find((o) => o.id === chosen)?.label}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Add chapter or section"
          className={`absolute bottom-full left-1/2 ${Z.menu} mb-2 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
        >
          {options.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(option.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
