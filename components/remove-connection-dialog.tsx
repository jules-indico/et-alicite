"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { UserMinus, Loader2, X } from "lucide-react"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"

export interface RemoveConnectionDialogProps {
  open: boolean
  /** Display name of the collaborator being removed. */
  memberName: string | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * Shared confirmation dialog for removing a collaborator, used identically
 * by Account > Find collaborators and the Team page. Removing a connection
 * only ends the direct link — the person stays in every shared research
 * group with all of their work kept.
 */
export function RemoveConnectionDialog({
  open,
  memberName,
  loading = false,
  error = null,
  onClose,
  onConfirm,
}: RemoveConnectionDialogProps) {
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

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-200"
      aria-modal="true"
      role="alertdialog"
      aria-labelledby="remove-connection-title"
      aria-describedby="remove-connection-desc"
    >
      <div
        ref={panelRef}
        className="relative flex flex-col w-full max-w-md overflow-hidden rounded-2xl border border-destructive/20 bg-card shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 px-6 py-4 bg-destructive/5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <UserMinus className="size-5" />
            </span>
            <div>
              <h2 id="remove-connection-title" className="text-base font-semibold text-foreground tracking-tight">
                Remove Collaborator
              </h2>
              <p className="text-xs text-muted-foreground">Ends only your direct connection.</p>
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

          <p id="remove-connection-desc" className="text-sm text-foreground leading-relaxed">
            Remove <span className="font-semibold text-foreground">&ldquo;{memberName ?? "this collaborator"}&rdquo;</span> as
            a collaborator? They will remain in any shared research groups with all of their work kept — this only
            ends the direct connection between you two.
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
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-destructive/90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Removing...</span>
              </>
            ) : (
              <span>Remove Collaborator</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
