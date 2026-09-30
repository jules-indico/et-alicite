import { AvatarStack, ProgressBar } from "@/components/primitives"
import { NewSectionMenu, type NewItemKind } from "@/components/new-section-menu"
import { project, type Member } from "@/lib/research-data"
import { Clock, Plus, Users } from "lucide-react"

export function ProjectHeader({
  progress,
  hasActiveGroup = true,
  researchTitle,
  members: membersProp,
  lastUpdated,
  onNew,
  hideTaskOption,
  onNewDirect,
}: {
  /** Group progress percentage, or null when it cannot be computed. */
  progress?: number | null
  /** False when the user has no active research group at all. */
  hasActiveGroup?: boolean
  /** The active group's research title (blank pre-migration groups show a placeholder). */
  researchTitle?: string | null
  /** The active group's real roster (drives count + avatars). */
  members?: Member[]
  /** Relative update text ("2 hours ago") or null when there is no activity yet. */
  lastUpdated?: string | null
  /** All-in-one creation entry point (chapter / task / source). */
  onNew?: (kind: NewItemKind) => void
  /** Hide the Task option in the creation menu (task creation is leader-only). */
  hideTaskOption?: boolean
  /**
   * Direct creation entry point: when provided, renders a "+ New item"
   * button that calls it immediately instead of the chapter/task/source
   * dropdown menu. Pages without task/source sections use this.
   */
  onNewDirect?: () => void
}) {
  // No active group (zero groups, or active group deleted with none
  // reassigned) must never show a stale or hardcoded percentage.
  const showProgress = hasActiveGroup && typeof progress === "number"
  const title = hasActiveGroup ? researchTitle?.trim() || "Untitled research" : project.name
  const people = hasActiveGroup ? (membersProp ?? []) : []
  return (
    <section className="relative rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-gradient-to-br from-brand/25 to-lavender/25 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="mt-3 text-pretty text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden="true" />
              {people.length} member{people.length === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" />
              {lastUpdated ? `Updated ${lastUpdated}` : "No activity yet"}
            </span>
            <AvatarStack people={people} />
          </div>
        </div>

        <div className="w-full max-w-xs shrink-0">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-muted-foreground">Overall progress</span>
            {showProgress ? (
              <span className="text-2xl font-semibold tracking-tight text-foreground">{progress}%</span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">No work yet</span>
            )}
          </div>
          <ProgressBar value={showProgress ? progress : 0} className="mt-2 h-2" />
          {onNewDirect ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={onNewDirect}
                disabled={!hasActiveGroup}
                title="Create a research chapter"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4" aria-hidden="true" />
                New item
              </button>
            </div>
          ) : (
            onNew && (
              <NewSectionMenu className="mt-4" onNew={onNew} disabled={!hasActiveGroup} hideTaskOption={hideTaskOption} />
            )
          )}
        </div>
      </div>
    </section>
  )
}
