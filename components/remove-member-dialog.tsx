"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { UserMinus, Loader2, X } from "lucide-react"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { cn } from "@/lib/utils"

export interface RemoveMemberDialogProps {
  open: boolean
  /** Display name of the member being removed. */
  memberName: string | null
  /** Name of the research group they are removed from. */
  groupName: string | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
  /**
   * Generic overrides so this one shared dialog also serves other delete
   * confirmations (chapters, tasks, sources). When provided, they replace
   * the member-specific title/subtitle/message/confirm label above.
   */
  title?: string
  subtitle?: string
  message?: ReactNode
  confirmLabel?: string
  confirmingLabel?: string
  /** Cancel-button text override (e.g. "Close" for info-only dialogs). */
  cancelLabel?: string
  /**
   * Visual tone for non-destructive confirmations reusing this dialog
   * (e.g. opening an attachment). Defaults to the destructive styling.
   */
  tone?: "danger" | "brand"
  /** Header icon override (defaults to the destructive UserMinus). */
  icon?: ReactNode
}

/**
 * Shared confirmation for removing a member from a research group, used
 * identically everywhere member removal exists (Team page, Edit-group
 * panel). Removal revokes group access but keeps the member's existing
 * contributions in group history.
 */
export function RemoveMemberDialog({
  open,
  memberName,
  groupName,
  loading = false,
  error = null,
  onClose,
  onConfirm,
  title,
  subtitle,
  message,
  confirmLabel,
  confirmingLabel,
  cancelLabel,
  tone = "danger",
  icon,
}: RemoveMemberDialogProps) {
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
      aria-labelledby="remove-member-title"
      aria-describedby="remove-member-desc"
    >
      <div
        ref={panelRef}
        className="relative flex flex-col w-full max-w-md overflow-hidden rounded-2xl border border-destructive/20 bg-card shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className={cn("flex items-start justify-between border-b border-border/80 px-6 py-4", tone === "brand" ? "bg-brand/5" : "bg-destructive/5")}>
          <div className="flex items-center gap-3">
            <span className={cn(
              "flex size-10 items-center justify-center rounded-xl",
              tone === "brand" ? "bg-brand/10 text-brand" : "bg-destructive/15 text-destructive"
            )}>
              {icon ?? <UserMinus className="size-5" />}
            </span>
            <div>
              <h2 id="remove-member-title" className="text-base font-semibold text-foreground tracking-tight">
                {title ?? "Remove Member"}
              </h2>
              <p className="text-xs text-muted-foreground">{subtitle ?? "They lose access, their work stays."}</p>
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

          <p id="remove-member-desc" className="text-sm text-foreground leading-relaxed">
            {message ?? (
              <>
                Remove <span className="font-semibold text-foreground">&ldquo;{memberName ?? "this member"}&rdquo;</span>
                {groupName ? (
                  <>
                    {" "}from <span className="font-semibold text-foreground">&ldquo;{groupName}&rdquo;</span>
                  </>
                ) : null}
                ? They will lose access to this group&apos;s chapters, tasks, and sources, but their existing
                contributions remain in the group&apos;s history.
              </>
            )}
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
            {cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity disabled:opacity-50",
              tone === "brand"
                ? "bg-gradient-to-r from-brand to-lavender hover:opacity-90"
                : "bg-destructive hover:bg-destructive/90"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{confirmingLabel ?? "Removing..."}</span>
              </>
            ) : (
              <span>{confirmLabel ?? "Remove Member"}</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
