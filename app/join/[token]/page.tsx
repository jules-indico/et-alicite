"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { useAuth } from "@/lib/auth-context"
import { UserPlus, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react"

type Resolution =
  | { status: "member" | "pending" | "requested"; group: { id: string; name: string; researchTitle: string } }

export default function JoinPage() {
  const params = useParams()
  const rawToken = params.token
  const token = Array.isArray(rawToken) ? rawToken[0] : (rawToken as string)
  const { authState } = useAuth()
  const router = useRouter()

  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [going, setGoing] = useState(false)

  // Not signed in → login, then straight back here.
  useEffect(() => {
    if (authState.status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
    }
  }, [authState.status, router, token])

  useEffect(() => {
    if (authState.status !== "authenticated" || !token) return
    let cancelled = false
    async function resolve() {
      try {
        const res = await fetch(`/api/join/${encodeURIComponent(token)}`, {
          method: "POST",
          cache: "no-store",
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !data.ok) {
          setError(data.error || "This invite link is invalid.")
          return
        }
        setResolution({ status: data.status, group: data.group })
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Check your connection and reload.")
      }
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [authState.status, token])

  async function goToGroup() {
    if (!resolution || going) return
    setGoing(true)
    try {
      // Make the joined group active so Home opens in the right workspace.
      await fetch("/api/groups/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: resolution.group.id }),
      }).catch(() => null)
    } finally {
      router.push("/home")
    }
  }

  const groupName = resolution?.group.name ?? "this group"

  return (
    <AppShell>
      <PageIntro
        icon={UserPlus}
        eyebrow="Group invite"
        title={resolution ? groupName : "Join group"}
        description="You've been invited to join a research group on et-alicite."
      />

      <div className="mx-auto w-full max-w-md">
        {authState.status !== "authenticated" || (!resolution && !error) ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {authState.status !== "authenticated" ? "Taking you to login…" : "Checking your invite…"}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-card p-8 text-center">
            <AlertCircle className="size-7 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">This link didn&apos;t work</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Link href="/home" className="mt-1 text-xs font-medium text-brand hover:underline">
              Go to Home
            </Link>
          </div>
        ) : resolution?.status === "member" ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <CheckCircle2 className="size-7 text-[oklch(0.45_0.12_155)]" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              You&apos;re already a member of “{groupName}”
            </p>
            <button
              type="button"
              onClick={() => void goToGroup()}
              disabled={going}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {going ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Go to group
            </button>
          </div>
        ) : resolution?.status === "pending" ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <Clock className="size-7 text-brand" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Your request is pending approval</p>
            <p className="text-xs text-muted-foreground">
              The leader of “{groupName}” hasn&apos;t approved you yet. Check back later.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <CheckCircle2 className="size-7 text-[oklch(0.45_0.12_155)]" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Request sent</p>
            <p className="text-xs text-muted-foreground">
              The group leader will need to approve you before you can join “{groupName}”.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
