"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { useAuth } from "@/lib/auth-context"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { UserCircle, Info, Sun, Moon, LogOut, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { currentUser, signOut } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      router.push("/login")
    } finally {
      setSigningOut(false)
    }
  }

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

  const isDark = theme === "dark"

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={currentUser ? `Your menu: ${currentUser.name}` : "Your menu"}
        title={currentUser?.name}
        className={cn(
          "flex size-9 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white shadow-sm ring-2 ring-transparent transition-all hover:ring-brand/40",
          currentUser?.avatarUrl
            ? "border border-border bg-card"
            : (currentUser?.color ?? "bg-brand"),
        )}
      >
        {currentUser?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUser.avatarUrl} alt="" className="size-full object-cover" />
        ) : currentUser ? (
          currentUser.initials
        ) : (
          <UserCircle className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Your menu"
          className={`absolute right-0 ${Z.menu} mt-2 w-60 origin-top-right overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
        >
          {currentUser && (
            <Link
              href={`/users/${currentUser.id}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
                <UserCircle className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Account</span>
                <span className="block text-xs text-muted-foreground">View your profile</span>
              </span>
            </Link>
          )}

          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
              <Settings className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">Settings</span>
              <span className="block text-xs text-muted-foreground">Manage your account</span>
            </span>
          </Link>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={isDark}
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
              {isDark ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">Theme</span>
              <span className="block text-xs text-muted-foreground">{isDark ? "Dark mode" : "Light mode"}</span>
            </span>
            <span
              className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-muted transition-colors data-[on=true]:bg-brand"
              data-on={isDark}
              aria-hidden="true"
            >
              <span
                className="ml-0.5 size-4 rounded-full bg-white shadow-sm transition-transform data-[on=true]:translate-x-4"
                data-on={isDark}
              />
            </span>
          </button>

          <Link
            href="/about"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
              <Info className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">About</span>
              <span className="block text-xs text-muted-foreground">What et-alicite is</span>
            </span>
          </Link>

          <div className="my-1 h-px bg-border" role="separator" />

          <button
            type="button"
            id="settings-sign-out"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setConfirmSignOut(true)
            }}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-destructive/8 hover:text-destructive"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground group-hover:text-destructive">
              <LogOut className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Sign out</span>
              <span className="block text-xs text-muted-foreground">Leave this workspace</span>
            </span>
          </button>
        </div>
      )}
      <RemoveMemberDialog
        open={confirmSignOut}
        memberName={null}
        groupName={null}
        loading={signingOut}
        title="Sign out?"
        message="You'll be signed out of your workspace."
        confirmLabel="Sign out"
        confirmingLabel="Signing out…"
        cancelLabel="Cancel"
        onClose={() => {
          if (!signingOut) setConfirmSignOut(false)
        }}
        onConfirm={handleSignOut}
      />
    </div>
  )
}
