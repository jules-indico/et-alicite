"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { ChapterChips, chapterNamesForSource } from "@/components/primitives"
import type { Chapter, Source } from "@/lib/research-data"

/**
 * Column spec for the source list/table view, shared with the list header
 * on consuming pages: title, author, year, status, ⋮.
 */
export const SOURCE_LIST_GRID =
  "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem_7rem_2.5rem]"

/**
 * One source as a full-width table row (title + chapter chips, author,
 * year, cited-status pill, ⋮ menu). Same row style as the Home workspace
 * source list; the whole row opens the source detail page.
 */
export function SourceListRow({
  source,
  chapters,
  onDelete,
  onToggleStatus,
  onEdit,
}: {
  source: Source
  chapters?: Chapter[]
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string) => void
  onEdit?: (source: Source) => void
}) {
  const chapterNames = chapterNamesForSource(chapters ?? [], source)
  const router = useRouter()

  // Whole-row navigation; inner controls stop propagation so they keep
  // their own actions, and text-selection drags never navigate.
  function openDetail(e?: React.MouseEvent) {
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    router.push(`/sources/${source.id}`)
  }

  return (
    <li
      onClick={openDetail}
      title="Open source details"
      className={cn("group grid items-center gap-4 py-2.5 px-4 rounded-xl cursor-pointer transition-colors hover:bg-secondary/50", SOURCE_LIST_GRID)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky/20 to-lavender/20 text-[oklch(0.48_0.1_290)]">
          <BookOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <Link
            href={`/sources/${source.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Open source details"
            className="block truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
          >
            {source.title}
          </Link>
          {chapterNames.length > 0 && (
            <span className="mt-1 block">
              <ChapterChips names={chapterNames} />
            </span>
          )}
        </span>
      </div>
      <span className="hidden sm:block text-sm text-muted-foreground truncate">{source.author}</span>
      <span className="hidden sm:block text-sm text-muted-foreground truncate">{source.year}</span>
      <div className="hidden sm:flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleStatus?.(source.id)
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 active:scale-95",
            source.cited ? "bg-success/15 text-[oklch(0.45_0.12_155)]" : "bg-muted text-muted-foreground"
          )}
          title="Click to toggle cited status"
        >
          <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
          {source.cited ? "Cited" : "Unused"}
        </button>
      </div>
      <div className="flex justify-end">
        {onDelete && (
          <RowActionsMenu
            onDelete={() => onDelete(source.id)}
            deleteLabel="Delete source"
            onEdit={onEdit ? () => onEdit(source) : undefined}
            editLabel="Edit source"
          />
        )}
      </div>
    </li>
  )
}
