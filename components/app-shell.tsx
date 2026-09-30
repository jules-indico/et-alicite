"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { TopNav, type NavSearch } from "@/components/top-nav"
import { AiResearchGuide } from "@/components/ai-research-guide"
import { useAuth } from "@/lib/auth-context"

export function AppShell({
  children,
  navSearch,
}: {
  children: ReactNode
  /** Page-scoped top-right search. Absent = hidden (Home, Team, detail pages). */
  navSearch?: NavSearch
}) {
  const [aiOpen, setAiOpen] = useState(false)
  const { authState } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authState.status === "unauthenticated") {
      router.replace("/login")
    }
  }, [authState.status, router])

  if (authState.status === "loading" || authState.status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="size-8 animate-spin rounded-full border-4 border-border border-t-brand" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav onToggleAi={() => setAiOpen((v) => !v)} aiOpen={aiOpen} search={navSearch} />

      <div className="relative">
        <main
          className={cn(
            "mx-auto max-w-7xl space-y-6 px-4 py-6 transition-[padding] duration-300 sm:px-6 sm:py-8",
            aiOpen ? "lg:pr-[23.5rem]" : "",
          )}
        >
          {children}
        </main>

        <AiResearchGuide open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>
    </div>
  )
}
