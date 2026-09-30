import { cn } from "@/lib/utils"
import { Sparkles, List, LayoutGrid } from "lucide-react"
import type { Chapter, Member, Source, TaskStatus, ChapterStatus } from "@/lib/research-data"

/** Shared list/grid view toggle (Home sections, folder page). */
export function ViewToggle({
  mode,
  onChange,
}: {
  mode: "list" | "grid"
  onChange: (m: "list" | "grid") => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-pressed={mode === "list"}
        aria-label="List view"
        className={cn(
          "flex size-7 items-center justify-center rounded-lg transition-colors",
          mode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange("grid")}
        aria-pressed={mode === "grid"}
        aria-label="Grid view"
        className={cn(
          "flex size-7 items-center justify-center rounded-lg transition-colors",
          mode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-serif italic tracking-tight", className)}>
      AI
      <Sparkles className="size-[0.7em] shrink-0 fill-current" strokeWidth={1.5} aria-hidden="true" />
    </span>
  )
}

export function Avatar({ member, className }: { member: Member; className?: string }) {
  if (member.avatarUrl) {
    return (
      <span
        className={cn(
          "inline-flex size-7 items-center justify-center overflow-hidden rounded-full ring-2 ring-card",
          className,
        )}
        title={member.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={member.avatarUrl} alt="" className="size-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white ring-2 ring-card",
        member.color,
        className,
      )}
      title={member.name}
    >
      {member.initials}
    </span>
  )
}

export function AvatarStack({ people, max = 4 }: { people: Member[]; max?: number }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} />
      ))}
      {extra > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      )}
    </div>
  )
}

const statusStyles: Record<string, string> = {
  Completed: "bg-success/15 text-[oklch(0.45_0.12_155)]",
  "In progress": "bg-brand/12 text-brand",
  Review: "bg-lavender/20 text-[oklch(0.48_0.1_290)]",
  "To do": "bg-muted text-muted-foreground",
  "Not started": "bg-muted text-muted-foreground",
}

export function StatusBadge({ status }: { status: TaskStatus | ChapterStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {status}
    </span>
  )
}

/**
 * Who-can-see-it badge for research folders/files. Shown to owners on
 * their own items only — other viewers never see access state.
 */
export function AccessBadge({
  access,
  allowedCount,
}: {
  access?: "everyone" | "mine" | "selected"
  allowedCount?: number
}) {
  const label =
    (access ?? "everyone") === "everyone"
      ? "Everyone"
      : access === "mine"
        ? "Only me"
        : `${allowedCount ?? 0} ${(allowedCount ?? 0) === 1 ? "person" : "people"}`
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
      title={`Visible to: ${label}`}
    >
      {label}
    </span>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-lavender transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

/**
 * Resolve a source's chapterIds to chapter titles against the group's
 * chapter list. Dangling IDs (deleted chapters) are dropped.
 */
export function chapterNamesForSource(
  chapters: Chapter[],
  source: Pick<Source, "chapterIds">
): string[] {
  const ids = source.chapterIds ?? []
  if (ids.length === 0) return []
  const byId = new Map(chapters.map((c) => [c.id, c.title] as const))
  return ids
    .map((id) => byId.get(id))
    .filter((t): t is string => typeof t === "string" && t.length > 0)
}

/** Chip-style badges for a source's associated chapters (max 2 + "+N"). */
const CHAPTER_CHIP_LIMIT = 2

export function ChapterChips({ names }: { names: string[] }) {
  if (names.length === 0) return null
  const shown = names.slice(0, CHAPTER_CHIP_LIMIT)
  const extra = names.length - shown.length
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((name) => (
        <span
          key={name}
          className="inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand"
        >
          {name}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand"
          title={names.slice(CHAPTER_CHIP_LIMIT).join(", ")}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
