"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { NewSourceModal } from "@/components/home-modals"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { ChapterChips, ViewToggle, chapterNamesForSource } from "@/components/primitives"
import { SourceListRow, SOURCE_LIST_GRID } from "@/components/source-row"
import { useSectionView, useSectionSort } from "@/lib/use-section-view"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"
import { type Chapter, type Source } from "@/lib/research-data"
import { useActiveGroupId, useGroupResearch } from "@/lib/use-group-research"
import { cn } from "@/lib/utils"
import { BookMarked, Link2, ChevronDown, ChevronRight, Check, Plus } from "lucide-react"

type Filter = "all" | "cited" | "unused"

/** Sortable columns for the Sources page sort dropdown. */
const SOURCE_SORT_KEYS = ["title", "created", "updated"] as const

type SourceSortKey = (typeof SOURCE_SORT_KEYS)[number]

function sortLabel(sort: { key: string; dir: "asc" | "desc" }): string {
  if (sort.key === "title") return `Title ${sort.dir === "asc" ? "A–Z" : "Z–A"}`
  if (sort.key === "created")
    return `Entry created · ${sort.dir === "desc" ? "Newest" : "Oldest"}`
  return `Most recently updated · ${sort.dir === "desc" ? "Newest" : "Oldest"}`
}

/** Sentinel id for the "no chapter" option in the chapter filter. */
const UNATTRIBUTED = "__unattributed"

function SourceCard({
  source,
  chapters,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  source: Source
  chapters: Chapter[]
  onToggleStatus?: (id: string) => void
  onEdit?: (source: Source) => void
  onDelete?: (id: string) => void
}) {
  const chapterNames = chapterNamesForSource(chapters, source)
  const router = useRouter()

  function openDetail(e?: React.MouseEvent) {
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    router.push(`/sources/${source.id}`)
  }

  return (
    <article
      onClick={openDetail}
      title="Open source details"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-brand/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/sources/${source.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Open source details"
            className="block text-sm font-medium leading-snug text-foreground hover:text-brand hover:underline"
          >
            {source.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {source.author} ({source.year})
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStatus?.(source.id)
            }}
            title="Click to toggle cited status"
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.65rem] font-medium cursor-pointer transition-opacity hover:opacity-80 active:scale-95",
              source.cited ? "bg-success/15 text-[oklch(0.45_0.12_155)]" : "bg-muted text-muted-foreground",
            )}
          >
            {source.cited ? "Cited" : "Unused"}
          </button>
          {(onEdit || onDelete) && (
            <RowActionsMenu
              onDelete={onDelete ? () => onDelete(source.id) : undefined}
              deleteLabel="Delete source"
              onEdit={onEdit ? () => onEdit(source) : undefined}
              editLabel="Edit source"
            />
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {source.tags.map((tag) => (
          <span key={tag} className="rounded-md bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>

      {chapterNames.length > 0 && (
        <div className="mt-2">
          <ChapterChips names={chapterNames} />
        </div>
      )}

      {source.usedIn.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-brand/8 px-2.5 py-1.5 text-xs text-brand">
          <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">Used in:</span>
          <span className="flex flex-wrap items-center gap-1 text-foreground/70">
            {source.usedIn.map((step, i) => (
              <span key={step} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 opacity-50" aria-hidden="true" />}
                {step}
              </span>
            ))}
          </span>
        </div>
      )}
    </article>
  )
}

function Stat({
  label,
  value,
  tone,
  active,
  onSelect,
}: {
  label: string
  value: number
  tone: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={`Show ${label.toLowerCase()} sources`}
      className={cn(
        "flex cursor-pointer flex-col rounded-2xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-brand/40",
        active ? "border-brand/60" : "border-border",
      )}
    >
      <span className={cn("text-2xl font-semibold tracking-tight", tone)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  )
}

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All sources" },
  { id: "cited", label: "Cited" },
  { id: "unused", label: "Not used" },
]

export default function SourcesPage() {
  const [filter, setFilter] = useState<Filter>("all")
  // List/grid choice, persisted per-user on the account (same section key
  // as the Home workspace sources section, so both stay in sync).
  const [view, setView] = useSectionView("sources", "grid")
  // Chapter multi-select filter (empty = no filtering). UNATTRIBUTED matches
  // sources with no chapter attribution.
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  // Persisted per-user sort (shares the "sources" record with Home, so the
  // Title order syncs both ways; created/updated stay page-only).
  const [sourceSort, setSourceSort] = useSectionSort(
    "sources",
    { key: "title", dir: "asc" },
    SOURCE_SORT_KEYS
  )
  const chapterMenuRef = useRef<HTMLDivElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick({
    refs: [chapterMenuRef, statusMenuRef, sortMenuRef],
    enabled: chapterMenuOpen || statusMenuOpen || sortMenuOpen,
    onDismiss: () => {
      setChapterMenuOpen(false)
      setStatusMenuOpen(false)
      setSortMenuOpen(false)
    },
  })

  function closeOtherMenus(except: "chapter" | "status" | "sort") {
    if (except !== "chapter") setChapterMenuOpen(false)
    if (except !== "status") setStatusMenuOpen(false)
    if (except !== "sort") setSortMenuOpen(false)
  }

  function selectSort(key: SourceSortKey) {
    // Reselecting the active option flips direction (same toggle pattern
    // as the header sort buttons); new columns take their natural default.
    if (key === sourceSort.key) {
      setSourceSort({ key, dir: sourceSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setSourceSort({ key, dir: key === "title" ? "asc" : "desc" })
    }
  }
  const { currentUser } = useAuth()
  const { activeGroupId } = useActiveGroupId()
  // Group-scoped library: every member of the active group sees the same sources.
  const {
    sources,
    chapters,
    loading,
    createSource,
    updateSource,
    deleteSource,
    logActivity,
  } = useGroupResearch(activeGroupId)

  // Sources-only creation: the exact panel used on Home.
  const [sourceOpen, setSourceOpen] = useState(false)

  // Page-scoped search (top-right pill): title + author, within the
  // active group's already-loaded library. Combines with the status tabs.
  const [searchQuery, setSearchQuery] = useState("")

  // Item being edited (null = creating): same edit/delete flow as Home.
  const [editingSource, setEditingSource] = useState<Source | null>(null)

  // Pending delete awaiting confirmation (shared dialog).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await handleDeleteSource(pendingDelete)
      setPendingDelete(null)
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  const actorName = (currentUser && fullNameOf(currentUser)) || "Someone"
  const actor = {
    name: actorName,
    initials: actorName
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 3)
      .toUpperCase(),
  }

  async function handleCreateSource(newS: Omit<Source, "id">) {
    try {
      if (editingSource) {
        const updated = await updateSource(editingSource.id, newS)
        if (updated) {
          await logActivity("edited source", updated.title, actor)
        }
        setEditingSource(null)
      } else {
        await createSource(newS, actor)
      }
    } catch (err) {
      console.error("Failed to save source:", err)
    }
  }

  async function handleDeleteSource(id: string) {
    const target = sources.find((s) => s.id === id)
    try {
      await deleteSource(id)
      if (target) {
        await logActivity("deleted source", target.title, actor)
      }
    } catch (err) {
      console.error("Failed to delete source:", err)
    }
  }

  async function handleToggleSourceStatus(id: string) {
    const source = sources.find((s) => s.id === id)
    if (!source) return
    const nextCited = !source.cited
    try {
      await updateSource(id, { cited: nextCited })
      await logActivity(nextCited ? "cited source" : "uncited source", source.title, actor)
    } catch (err) {
      console.error("Failed to update source:", err)
    }
  }

  function toggleChapterFilter(id: string) {
    setSelectedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  function matchesChapterFilter(s: Source): boolean {
    if (selectedChapters.length === 0) return true
    const ids = s.chapterIds ?? []
    if (ids.length === 0) return selectedChapters.includes(UNATTRIBUTED)
    return ids.some((id) => selectedChapters.includes(id))
  }

  function matchesSearch(s: Source): boolean {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return s.title.toLowerCase().includes(q) || s.author.toLowerCase().includes(q)
  }

  // Chapter + search narrow the library first; stats and the "N shown"
  // count reflect this combined subset, and the Cited/Not used tab applies
  // on top exactly as before.
  const base = sources.filter((s) => matchesChapterFilter(s) && matchesSearch(s))
  const visible = base.filter((s) => {
    if (filter === "cited" && !s.cited) return false
    if (filter === "unused" && s.cited) return false
    return true
  })

  const saved = base.length
  const cited = base.filter((s) => s.cited).length
  const unused = saved - cited

  // Persisted sort applies to the filtered list in both views. Missing
  // timestamps rank below all dated entries (reversibly).
  const stamp = (iso?: string | null): number => {
    const t = Date.parse(iso ?? "")
    return Number.isNaN(t) ? -1 : t
  }
  const sorted = [...visible].sort((a, b) => {
    const dir = sourceSort.dir === "asc" ? 1 : -1
    if (sourceSort.key === "title") return a.title.localeCompare(b.title) * dir
    if (sourceSort.key === "created")
      return (stamp(a.createdAt) - stamp(b.createdAt)) * dir
    return (stamp(a.updatedAt) - stamp(b.updatedAt)) * dir
  })

  return (
    <AppShell
      navSearch={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search sources…",
      }}
    >
      <PageIntro
        icon={BookMarked}
        eyebrow="Literature review"
        title="Sources"
        description="Every reference your group has saved, tagged, and cited across the study — in one searchable library."
        action={
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            disabled={!activeGroupId}
            title="Add source"
            aria-label="Add source"
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            New source
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Saved" value={saved} tone="text-foreground" active={filter === "all"} onSelect={() => setFilter("all")} />
        <Stat label="Cited" value={cited} tone="text-[oklch(0.45_0.12_155)]" active={filter === "cited"} onSelect={() => setFilter("cited")} />
        <Stat label="Not used" value={unused} tone="text-muted-foreground" active={filter === "unused"} onSelect={() => setFilter("unused")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div ref={statusMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setStatusMenuOpen((v) => !v)
              closeOtherMenus("status")
            }}
            aria-expanded={statusMenuOpen}
            aria-haspopup="listbox"
            aria-label="Filter by cited status"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter !== "all" || statusMenuOpen
                ? "bg-brand text-brand-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {filters.find((f) => f.id === filter)?.label ?? "All sources"}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
          {statusMenuOpen && (
            <div
              role="listbox"
              aria-label="Filter by cited status"
              className={`absolute left-0 ${Z.menu} mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
            >
              {filters.map((f) => {
                const selected = filter === f.id
                return (
                  <div
                    key={f.id}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setFilter(f.id)
                      setStatusMenuOpen(false)
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                      selected ? "bg-brand/5" : "hover:bg-secondary/40",
                    )}
                  >
                    <span className="truncate text-xs font-medium text-foreground">{f.label}</span>
                    <div
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        selected ? "border-brand bg-brand text-white" : "border-border bg-background",
                      )}
                    >
                      {selected && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div ref={chapterMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setChapterMenuOpen((v) => !v)
              closeOtherMenus("chapter")
            }}
            aria-expanded={chapterMenuOpen}
            aria-haspopup="listbox"
            aria-label="Filter by chapter"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              selectedChapters.length > 0 || chapterMenuOpen
                ? "bg-brand text-brand-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Chapter
            {selectedChapters.length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-foreground/25 text-[0.7rem] font-semibold">
                {selectedChapters.length}
              </span>
            )}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
          {chapterMenuOpen && (
            <div
              role="listbox"
              aria-label="Filter by chapter"
              className={`absolute left-0 ${Z.menu} mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
            >
              {selectedChapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedChapters([])}
                  className="w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-brand transition-colors hover:bg-secondary"
                >
                  Clear selection
                </button>
              )}
              {[{ id: UNATTRIBUTED, title: "General/unattributed", label: "Sources with no chapter" } as Chapter,
                ...chapters].map((c) => {
                const checked = selectedChapters.includes(c.id)
                const isGeneral = c.id === UNATTRIBUTED
                return (
                  <div
                    key={c.id}
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggleChapterFilter(c.id)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                      checked ? "bg-brand/5" : "hover:bg-secondary/40",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
                      {!isGeneral && (
                        <p className="truncate text-[0.68rem] text-muted-foreground">{c.label}</p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked ? "border-brand bg-brand text-white" : "border-border bg-background",
                      )}
                    >
                      {checked && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
              {chapters.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No research chapters yet.
                </p>
              )}
            </div>
          )}
        </div>
        <div ref={sortMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setSortMenuOpen((v) => !v)
              closeOtherMenus("sort")
            }}
            aria-expanded={sortMenuOpen}
            aria-haspopup="listbox"
            aria-label={`Sort sources, current: ${sortLabel(sourceSort)}`}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              sortMenuOpen
                ? "bg-brand text-brand-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="max-w-44 truncate">{sortLabel(sourceSort)}</span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
          {sortMenuOpen && (
            <div
              role="listbox"
              aria-label="Sort sources"
              className={`absolute left-0 ${Z.menu} mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
            >
              {(
                [
                  { key: "title", label: "Title" },
                  { key: "created", label: "Entry created" },
                  { key: "updated", label: "Most recently updated" },
                ] as const
              ).map((opt) => {
                const selected = sourceSort.key === opt.key
                return (
                  <div
                    key={opt.key}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      selectSort(opt.key)
                      setSortMenuOpen(false)
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                      selected ? "bg-brand/5" : "hover:bg-secondary/40",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {opt.label}
                      </span>
                      {selected && (
                        <span className="block text-[0.68rem] text-muted-foreground">
                          {sortLabel(sourceSort)}
                        </span>
                      )}
                    </span>
                    <div
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        selected ? "border-brand bg-brand text-white" : "border-border bg-background",
                      )}
                    >
                      {selected && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <span className="ml-auto flex items-center gap-2">
          <ViewToggle mode={view} onChange={setView} />
          <span className="text-sm text-muted-foreground">{visible.length} shown</span>
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading group sources…</p>
      ) : view === "list" ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className={cn("hidden sm:grid items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", SOURCE_LIST_GRID)}>
            <span className="pl-11">Title</span>
            <span>Author</span>
            <span>Year</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y divide-border/60 px-2 py-1">
            {sorted.map((source) => (
              <SourceListRow
                key={source.id}
                source={source}
                chapters={chapters}
                onToggleStatus={handleToggleSourceStatus}
                onEdit={(s) => {
                  setEditingSource(s)
                  setSourceOpen(true)
                }}
                onDelete={(id) => {
                  setDeleteError(null)
                  setPendingDelete(id)
                }}
              />
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sorted.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              chapters={chapters}
              onToggleStatus={handleToggleSourceStatus}
              onEdit={(s) => {
                setEditingSource(s)
                setSourceOpen(true)
              }}
              onDelete={(id) => {
                setDeleteError(null)
                setPendingDelete(id)
              }}
            />
          ))}
        </div>
      )}

      <NewSourceModal
        open={sourceOpen}
        onClose={() => {
          setSourceOpen(false)
          setEditingSource(null)
        }}
        onCreate={handleCreateSource}
        initial={editingSource}
        chapters={chapters}
      />

      {/* Shared delete confirmation */}
      <RemoveMemberDialog
        open={Boolean(pendingDelete)}
        memberName={sources.find((s) => s.id === pendingDelete)?.title ?? null}
        groupName={null}
        loading={deleting}
        error={deleteError}
        title="Delete Source"
        subtitle="This action cannot be undone."
        message={
          <>
            Delete{" "}
            <span className="font-semibold text-foreground">
              &ldquo;{sources.find((s) => s.id === pendingDelete)?.title ?? "this source"}&rdquo;
            </span>
            ? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onClose={() => {
          if (!deleting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  )
}
