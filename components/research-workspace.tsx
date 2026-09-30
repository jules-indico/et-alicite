import { AvatarStack, ProgressBar } from "@/components/primitives"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { chapters as seedChapters, membersByIds, chapterAttachment, type Chapter, type Source, type Task } from "@/lib/research-data"
import { chapterTaskProgress } from "@/lib/use-group-research"
import { useSectionSort } from "@/lib/use-section-view"
import { Folder, FileText, BookMarked, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"

// Sortable columns for the Research page chapter cards. "name" shares the
// saved preference with the Home chapters list (same "chapters" section
// record); "created"/"updated" are Research-only and Home ignores them.
const RESEARCH_SORT_KEYS = ["name", "created", "updated"] as const

type ResearchSortKey = (typeof RESEARCH_SORT_KEYS)[number]

/** Clickable sort label with direction indicator (same pattern as Home). */
function ResearchSortButton({
  label,
  sortKey,
  activeKey,
  dir,
  onToggle,
}: {
  label: string
  sortKey: ResearchSortKey
  activeKey: string
  dir: "asc" | "desc"
  onToggle: (key: ResearchSortKey) => void
}) {
  const active = activeKey === sortKey
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      title={`Sort by ${label}`}
      aria-label={`Sort by ${label} ${active ? (dir === "asc" ? "ascending" : "descending") : ""}`}
      className="flex items-center gap-1 transition-colors hover:text-foreground"
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="size-3.5 text-brand" aria-hidden="true" />
        ) : (
          <ArrowDown className="size-3.5 text-brand" aria-hidden="true" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
      )}
    </button>
  )
}

/** Missing timestamps rank below all dated entries (reversibly). */
function chapterStamp(iso?: string | null): number {
  const t = Date.parse(iso ?? "")
  return Number.isNaN(t) ? -1 : t
}

function ChapterCard({
  chapter,
  tasks,
  sources,
  onEdit,
  onDelete,
  onOpen,
}: {
  chapter: Chapter
  tasks: Task[]
  sources: Source[]
  onEdit?: (chapter: Chapter) => void
  onDelete?: (id: string) => void
  onOpen?: (chapter: Chapter) => void
}) {
  const isLibrary = chapter.id === "c5"
  const Icon = isLibrary ? BookMarked : chapter.id === "c4" ? FileText : Folder
  const tp = chapterTaskProgress(chapter.id, tasks)
  const openTarget = chapterAttachment(chapter)

  function handleOpen(e?: React.MouseEvent) {
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    onOpen?.(chapter)
  }

  // Live count: sources whose chapterIds multi-select includes this chapter.
  // Never the stored chapter.sources number (set once at creation, stale after).
  const linkedSources = sources.filter((s) => (s.chapterIds ?? []).includes(chapter.id)).length
  return (
    <article
      onClick={openTarget ? handleOpen : undefined}
      title={openTarget ? "Preview what will open" : undefined}
      className={`group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-brand/30${openTarget ? " cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky/25 to-lavender/25 text-brand">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="flex items-center gap-1.5">
          {tp.percent !== null && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
              {tp.completed}/{tp.total} tasks
            </span>
          )}
          {(onEdit || onDelete) && (
            <RowActionsMenu
              onDelete={onDelete ? () => onDelete(chapter.id) : undefined}
              deleteLabel="Delete chapter"
              onEdit={onEdit ? () => onEdit(chapter) : undefined}
              editLabel="Edit chapter"
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{chapter.label}</p>
        {openTarget ? (
          <button
            type="button"
            onClick={handleOpen}
            title="Preview what will open"
            className="mt-0.5 block w-full text-left cursor-pointer"
          >
            <span className="text-base font-semibold leading-snug text-foreground hover:underline">{chapter.title}</span>
          </button>
        ) : (
          <h3 className="mt-0.5 text-base font-semibold leading-snug text-foreground">{chapter.title}</h3>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {linkedSources} source{linkedSources === 1 ? "" : "s"}
        {chapter.sectionsTotal > 0 && (
          <>
            {" · "}
            {chapter.sectionsComplete}/{chapter.sectionsTotal} sections
          </>
        )}
      </p>

      <div className="mt-auto pt-4">
        {tp.percent === null ? (
          <div className="mb-2 text-xs font-medium text-muted-foreground">No tasks yet</div>
        ) : (
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{tp.percent}% complete</span>
            <span>{chapter.updated}</span>
          </div>
        )}
        <ProgressBar value={tp.percent ?? 0} />
        <div className="mt-3">
          <AvatarStack people={membersByIds(chapter.assigned)} max={3} />
        </div>
      </div>
    </article>
  )
}

export function ResearchWorkspace({
  chapters: chaptersProp,
  tasks: tasksProp,
  sources: sourcesProp,
  onEditChapter,
  onDeleteChapter,
  onOpenChapter,
}: {
  chapters?: Chapter[]
  tasks?: Task[]
  sources?: Source[]
  onEditChapter?: (chapter: Chapter) => void
  onDeleteChapter?: (id: string) => void
  onOpenChapter?: (chapter: Chapter) => void
}) {
  // Group-scoped chapters passed by the page; fall back to seed data only when
  // the page renders without a group context.
  const chapters = chaptersProp ?? seedChapters
  const tasks = tasksProp ?? []
  const sources = sourcesProp ?? []

  // Persisted per-user sort (shares the "chapters" record with Home, so the
  // Chapter-name order syncs both ways; created/updated stay Research-only).
  const [sort, setSort] = useSectionSort(
    "chapters",
    { key: "updated", dir: "desc" },
    RESEARCH_SORT_KEYS
  )

  function toggleSort(key: ResearchSortKey) {
    if (key === sort.key) {
      setSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" })
    } else {
      setSort({ key, dir: key === "name" ? "asc" : "desc" })
    }
  }

  const dir = sort.dir === "asc" ? 1 : -1
  const sortedChapters = [...chapters].sort((a, b) => {
    if (sort.key === "name") return a.title.localeCompare(b.title) * dir
    if (sort.key === "created")
      return (chapterStamp(a.createdAt) - chapterStamp(b.createdAt)) * dir
    return (chapterStamp(a.updatedAt) - chapterStamp(b.updatedAt)) * dir
  })

  return (
    <section aria-labelledby="workspace-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="workspace-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Research workspace
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
          <ResearchSortButton
            label="Chapter name"
            sortKey="name"
            activeKey={sort.key}
            dir={sort.dir}
            onToggle={toggleSort}
          />
          <ResearchSortButton
            label="Entry created"
            sortKey="created"
            activeKey={sort.key}
            dir={sort.dir}
            onToggle={toggleSort}
          />
          <ResearchSortButton
            label="Most recently updated"
            sortKey="updated"
            activeKey={sort.key}
            dir={sort.dir}
            onToggle={toggleSort}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sortedChapters.map((chapter) => (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            tasks={tasks}
            sources={sources}
            onEdit={onEditChapter}
            onDelete={onDeleteChapter}
            onOpen={onOpenChapter}
          />
        ))}
      </div>
    </section>
  )
}
