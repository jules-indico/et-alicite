"use client"

import { useEffect, useState, type RefObject } from "react"

/**
 * Single shared stacking scale for the whole app. Every dropdown/menu uses
 * `Z.menu`, so the sticky top nav (`Z.topNav`) always paints above them and
 * no component can drift above it with an arbitrary z-index. Overlays,
 * modals, and dialogs intentionally sit above the nav; the drag ghost floats
 * above everything except dialogs.
 *
 * Values are literal Tailwind classes so the scanner picks them up — always
 * reference these tokens instead of writing z-* classes inline.
 */
export const Z = {
  /** All dropdowns/menus (row ⋮ menus, New-item, switcher, settings, pickers). */
  menu: "z-20",
  /** Sticky top navigation bar — above every menu, below every modal. */
  topNav: "z-30",
  /** Full-screen interaction overlays (mobile sidebar backdrop, drop hint). */
  overlay: "z-40",
  /** Centered modals (create/edit panels, crop overlay). */
  modal: "z-50",
  /** Folder drag ghost — follows the pointer above content. */
  dragPreview: "z-[9999]",
  /** Confirmation dialogs — above everything. */
  dialog: "z-[10000]",
} as const

export type AnchorRect = { right: number; bottom: number; left: number }

export function computeMenuPos(
  rect: AnchorRect | null,
  opts: { width: number; gap?: number; scrollX?: number; scrollY?: number }
): { top: number; left: number } | null {
  if (!rect) return null
  // Document coords (position:absolute portaled to body): the menu rides
  // with the document on the compositor thread, so scrolling needs no JS
  // at all. Viewport coords must NEVER be paired with position:fixed here,
  // and scroll offsets must NEVER be paired with it either — both mismatch
  // variants caused the old lag-then-snap behavior.
  const scrollX = opts.scrollX ?? (typeof window !== "undefined" ? window.scrollX : 0)
  const scrollY = opts.scrollY ?? (typeof window !== "undefined" ? window.scrollY : 0)
  return {
    top: rect.bottom + scrollY + (opts.gap ?? 6),
    left: Math.max(8, rect.right - opts.width + scrollX),
  }
}

/**
 * Shared anchor tracking for EVERY JS-positioned floating menu
 * (row ⋮ menus, the Home New-item menu). Computes document coordinates on
 * open and recomputes on window resize only. Scrolling needs no updates:
 * absolutely-positioned menus move with the document itself, so the menu
 * stays glued to its trigger with zero main-thread work — no lag, no snap.
 */
export function useAnchorPosition({
  anchorRef,
  open,
  width,
  gap,
}: {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  width: number
  gap?: number
}): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = () =>
      setPos(
        computeMenuPos(anchorRef.current?.getBoundingClientRect() ?? null, { width, gap })
      )
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open, width, gap, anchorRef])

  return pos
}
