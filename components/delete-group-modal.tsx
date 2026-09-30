"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Loader2, X } from "lucide-react"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"

export interface DeleteGroupModalProps {
  open: boolean
  group: { id: string; name: string } | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
}

export function DeleteGroupModal({
  open,
  group,
  loading = false,
  error = null,
  onClose,
  onConfirm,
}: DeleteGroupModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, loading, onClose])

  // Shared dismiss: only a genuine outside click closes the panel (never mid-save).
  useDismissOnOutsideClick({ refs: panelRef, enabled: open && !loading, onDismiss: onClose })

  if (!open || !group || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-200"
      aria-modal="true"
      role="alertdialog"
      aria-labelledby="delete-group-title"
      aria-describedby="delete-group-desc"
    >
      <div
        ref={panelRef}
        className="relative flex flex-col w-full max-w-md overflow-hidden rounded-2xl border border-destructive/20 bg-card shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 px-6 py-4 bg-destructive/5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <h2 id="delete-group-title" className="text-base font-semibold text-foreground tracking-tight">
                Delete Research Group
              </h2>
              <p className="text-xs text-muted-foreground">Action restricted to group leader.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close modal"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-3">
          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <p id="delete-group-desc" className="text-sm text-foreground leading-relaxed">
            Delete <span className="font-semibold text-foreground">&ldquo;{group.name}&rdquo;</span>? This will permanently remove all chapters, tasks, and sources in this group. This cannot be undone.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5 bg-muted/10">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-confirm-delete-group"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-destructive/90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Group</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
