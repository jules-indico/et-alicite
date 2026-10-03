"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Z } from "@/lib/layers"
import { BrandMark } from "@/components/primitives"
import { SettingsMenu } from "@/components/settings-menu"
import { Search, Bell } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { onNotificationsUpdated } from "@/lib/notifications"

const navItems = [
  { label: "Home", href: "/home" },
  { label: "Research", href: "/research" },
  { label: "Sources", href: "/sources" },
  { label: "Tasks", href: "/tasks" },
  { label: "Team", href: "/team" },
]

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home"
  if (href === "/research") return pathname === "/research"
  return pathname.startsWith(href)
}

export type NavSearch = {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

export function TopNav({
  onToggleAi,
  aiOpen,
  search,
}: {
  onToggleAi: () => void
  aiOpen: boolean
  /** Page-scoped search, provided by the page via AppShell. Absent = hidden. */
  search?: NavSearch
}) {
  const pathname = usePathname()
  const { currentUser } = useAuth()
  const navInputRef = useRef<HTMLInputElement>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // Unread badge: refresh on mount, navigation, and whenever notifications
  // change elsewhere (e.g. marking read on the notifications page).
  useEffect(() => {
    let cancelled = false
    async function loadUnread() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && data.ok) {
          setUnreadCount((data.notifications ?? []).filter((n: { readAt?: string }) => !n.readAt).length)
        }
      } catch {
        // Badge simply stays empty on failure.
      }
    }
    if (currentUser) {
      loadUnread()
      return onNotificationsUpdated(loadUnread)
    } else {
      setUnreadCount(0)
    }
  }, [currentUser, pathname])

  // "/" focuses search from anywhere (the pill off-home, Home's bar on-home).
  useEffect(() => {
    function onSlash(e: KeyboardEvent) {
      if (e.key !== "/") return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      e.preventDefault()
      if (navInputRef.current) {
        navInputRef.current.focus()
      } else {
        document.getElementById("folder-search")?.focus()
          ?? document.getElementById("home-search")?.focus()
      }
    }
    document.addEventListener("keydown", onSlash)
    return () => document.removeEventListener("keydown", onSlash)
  }, [])

  // Filtering is live in the page; submitting just dismisses mobile keyboards.
  function submitNavSearch(e: React.FormEvent) {
    e.preventDefault()
    navInputRef.current?.blur()
  }

  return (
    <header className={`sticky top-0 ${Z.topNav} border-b border-border/70 bg-background/80 backdrop-blur-xl`}>
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
        <Link href="/home" className="flex items-center gap-2.5">
          <img
            src="/icon-192.png"
            alt="et-alicite logo"
            className="size-8 rounded-xl object-cover shadow-sm"
          />
          <span className="text-base font-semibold tracking-tight text-foreground">et-alicite</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {pathname !== "/home" && search && (
            <form
              onSubmit={submitNavSearch}
              role="search"
              className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-sm focus-within:border-brand/50 sm:flex"
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <input
                ref={navInputRef}
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                aria-label={search.placeholder}
                className="hidden w-36 bg-transparent text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:w-44 sm:inline lg:w-60 lg:focus:w-72"
              />
              <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 text-[0.65rem] font-medium lg:inline">
                /
              </kbd>
            </form>
          )}

          <button
            type="button"
            onClick={onToggleAi}
            aria-pressed={aiOpen}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shadow-sm transition-colors",
              aiOpen
                ? "bg-brand text-brand-foreground"
                : "bg-gradient-to-br from-brand to-lavender text-white hover:opacity-90",
            )}
          >
            <BrandMark className="text-sm" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          <Link
            href="/notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            title="Notifications"
            className="relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <Bell className="size-4" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          <SettingsMenu />
        </div>
      </div>

      <nav
        className="flex items-center gap-1 overflow-x-auto border-t border-border/70 px-4 py-2 lg:hidden"
        aria-label="Primary mobile"
      >
        {navItems.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
