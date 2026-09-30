"use client"

import { useEffect, useRef, type RefObject } from "react"

type DismissableRef = RefObject<HTMLElement | null>

/**
 * Shared outside-dismiss logic for EVERY floating panel, dropdown, modal,
 * and menu in the app. New panels should use this instead of inventing
 * their own close-on-outside-click handling.
 *
 * A panel dismisses ONLY on a genuine outside click: the press (mousedown /
 * touchstart) AND the release (mouseup / touchend) must both land outside
 * every tracked element. A text-selection drag that starts inside the panel
 * and ends outside it never dismisses — only press-outside + release-outside
 * does. When the press was never observed (e.g. it started while disabled),
 * nothing dismisses (conservative: stay open).
 *
 * Listeners use the capture phase so stopPropagation() inside panel content
 * can never blind the tracking.
 */
export function useDismissOnOutsideClick({
  refs,
  enabled = true,
  onDismiss,
}: {
  refs: DismissableRef | DismissableRef[]
  enabled?: boolean
  onDismiss: () => void
}) {
  const list = Array.isArray(refs) ? refs : [refs]
  const refsRef = useRef(list)
  refsRef.current = list
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const pressTarget = useRef<EventTarget | null>(null)

  useEffect(() => {
    if (!enabled) return

    function targetIsOutside(target: EventTarget | null): boolean {
      if (!(target instanceof Node)) return false
      const els = refsRef.current
      for (const r of els) {
        if (r.current && r.current.contains(target)) return false
      }
      return true
    }

    function onPress(e: Event) {
      pressTarget.current = e.target
    }

    function onRelease(e: Event) {
      const startedOutside = targetIsOutside(pressTarget.current)
      const endedOutside = targetIsOutside(e.target)
      pressTarget.current = null
      if (startedOutside && endedOutside) {
        onDismissRef.current()
      }
    }

    document.addEventListener("mousedown", onPress, true)
    document.addEventListener("mouseup", onRelease, true)
    document.addEventListener("touchstart", onPress, true)
    document.addEventListener("touchend", onRelease, true)
    return () => {
      document.removeEventListener("mousedown", onPress, true)
      document.removeEventListener("mouseup", onRelease, true)
      document.removeEventListener("touchstart", onPress, true)
      document.removeEventListener("touchend", onRelease, true)
    }
  }, [enabled])
}
