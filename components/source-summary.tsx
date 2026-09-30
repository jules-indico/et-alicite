import { sources as seedSources, type Chapter, type Source } from "@/lib/research-data"
import { ChapterChips, chapterNamesForSource } from "@/components/primitives"
import { RowActionsMenu } from "@/components/row-actions-menu"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BookMarked, Link2, ChevronRight, ArrowUpRight } from "lucide-react"

function SourceRow({
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
      className="rounded-xl border border-border bg-secondary/40 p-3.5 cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-brand/20"
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
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStatus?.(source.id)
            }}
            title="Click to toggle cited status"
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium cursor-pointer transition-opacity hover:opacity-80 active:scale-95 ${
              source.cited ? "bg-success/15 text-[oklch(0.45_0.12_155)]" : "bg-muted text-muted-foreground"
            }`}
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
          <span key={tag} className="rounded-md bg-card px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
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

export function SourceSummary({
  sources: sourcesProp,
  chapters: chaptersProp,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  sources?: Source[]
  chapters?: Chapter[]
  onToggleStatus?: (id: string) => void
  onEdit?: (source: Source) => void
  onDelete?: (id: string) => void
}) {
  // Group-scoped sources passed by the page; fall back to seed data only when
  // the page renders without a group context.
  const sources = sourcesProp ?? seedSources
  const chapters = chaptersProp ?? []
  const saved = sources.length
  const cited = sources.filter((s) => s.cited).length
  const unused = saved - cited
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="sources-heading">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sky/25 text-brand">
          <BookMarked className="size-4" aria-hidden="true" />
        </span>
        <h2 id="sources-heading" className="text-base font-semibold tracking-tight text-foreground">
          Sources &amp; citations
        </h2>
        <Link
          href="/sources"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="flex flex-col rounded-xl bg-secondary/60 px-3 py-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">{saved}</span>
          <span className="text-xs text-muted-foreground">Saved</span>
        </div>
        <div className="flex flex-col rounded-xl bg-secondary/60 px-3 py-2">
          <span className="text-lg font-semibold tracking-tight text-[oklch(0.45_0.12_155)]">{cited}</span>
          <span className="text-xs text-muted-foreground">Cited</span>
        </div>
        <div className="flex flex-col rounded-xl bg-secondary/60 px-3 py-2">
          <span className="text-lg font-semibold tracking-tight text-muted-foreground">{unused}</span>
          <span className="text-xs text-muted-foreground">Not used</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            chapters={chapters}
            onToggleStatus={onToggleStatus}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  )
}
