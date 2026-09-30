"use client"

import { cn } from "@/lib/utils"
import { BrandMark } from "@/components/primitives"
import { Sparkles, X, ArrowUp, Compass } from "lucide-react"

const suggestions = [
  "What should I include in this section?",
  "Help me find related literature",
  "Explain this research concept",
  "Check my section for missing elements",
  "Help organize these sources",
]

export function AiResearchGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-label="AI Research Guide"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(22rem,90vw)] flex-col border-l border-border bg-card shadow-xl transition-transform duration-300 lg:z-30",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-br from-brand/10 to-lavender/10 px-4 py-3.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-lavender text-white shadow-sm">
            <Sparkles className="size-4 fill-current" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              <BrandMark className="text-sm" /> Research Guide
            </p>
            <p className="truncate text-xs text-muted-foreground">Contextual assistant</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Research Guide"
            className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          <Compass className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
          <span>
            You&apos;re working on <span className="font-medium text-foreground">Chapter 2 — Related Literature</span>
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm text-brand-foreground">
              Help me find RRLs related to our topic.
            </p>
          </div>

          <div className="flex gap-2">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-lavender text-white">
              <Sparkles className="size-3.5 fill-current" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-secondary px-3.5 py-2.5 text-sm text-foreground">
              <p>Sure — I can help you identify relevant related literature for your study on AI-assisted learning.</p>
              <p className="mt-2">Based on your topic, here are a few directions to explore:</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Intelligent tutoring systems and academic performance</li>
                <li>Self-regulated learning with AI tools</li>
                <li>Digital literacy among college researchers</li>
              </ul>
              <p className="mt-2 text-muted-foreground">Want me to save these as sources to Chapter 2?</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/50 px-3 py-2">
            <BrandMark className="text-sm text-brand" />
            <input
              type="text"
              placeholder="Ask the research guide…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="button"
              aria-label="Send message"
              className="flex size-8 items-center justify-center rounded-xl bg-brand text-brand-foreground transition-colors hover:opacity-90"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
