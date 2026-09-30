"use client"

import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { MoreVertical } from "lucide-react"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z, useAnchorPosition } from "@/lib/layers"

/**
 * Shared ⋮ row-actions menu (Edit / Open / Download / Access / Delete) used
 * identically on Home and Research pages. Delete acts immediately (same as
 * Home — no separate confirmation dialog); callers log the matching
 * Recent-activity entry.
 */
export function RowActionsMenu({
  onDelete,
  deleteLabel = "Delete",
  onEdit,
  editLabel = "Edit",
  onAccess,
  accessLabel = "Change access",
  onOpen,
  openLabel = "Open",
  downloadUrl,
  downloadLabel = "Download",
  onDownload,
  onDetails,
  detailsLabel = "Details",
  onMerge,
  mergeLabel = "Merge into",
}: {
  onDelete?: () => void
  deleteLabel?: string
  onEdit?: () => void
  editLabel?: string
  onAccess?: () => void
  accessLabel?: string
  onOpen?: () => void
  openLabel?: string
  downloadUrl?: string
  downloadLabel?: string
  onDownload?: () => void
  onDetails?: () => void
  detailsLabel?: string
  onMerge?: () => void
  mergeLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Shared anchor tracking: document coords on open (+ resize only).
  // Absolutely-positioned menus ride with the document — scrolling needs
  // no JS, so there is no lag and no snap-back.
  const menuPos = useAnchorPosition({
    anchorRef: btnRef,
    open,
    width: 140,
    gap: 6,
  })

  function toggleMenu(e: React.MouseEvent) {
    e.stopPropagation()
    setOpen((v) => !v)
  }

  // Shared dismiss: only a genuine outside click closes the menu (tracks
  // both the button and the portaled menu element).
  useDismissOnOutsideClick({
    refs: [btnRef, menuRef],
    enabled: open,
    onDismiss: () => setOpen(false),
  })

  const menu = open && menuPos ? (
    <div
      ref={menuRef}
      style={{ top: menuPos.top, left: menuPos.left }}
      className={`absolute ${Z.menu} w-[140px] rounded-xl border border-border bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100`}
    >
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onEdit()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{editLabel}</span>
        </button>
      )}
      {onOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onOpen()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{openLabel}</span>
        </button>
      )}
      {onDownload && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onDownload()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{downloadLabel}</span>
        </button>
      )}
      {downloadUrl && (
        <a
          href={downloadUrl}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{downloadLabel}</span>
        </a>
      )}
      {onMerge && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onMerge()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{mergeLabel}</span>
        </button>
      )}
      {onDetails && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onDetails()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{detailsLabel}</span>
        </button>
      )}
      {onAccess && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onAccess()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <span>{accessLabel}</span>
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
            onDelete()
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          <span>{deleteLabel}</span>
        </button>
      )}
    </div>
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="More options"
        onClick={toggleMenu}
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-70 hover:opacity-100 hover:bg-secondary transition-all"
      >
        <MoreVertical className="size-4" aria-hidden="true" />
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </>
  )
}
