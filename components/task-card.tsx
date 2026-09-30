"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Avatar, StatusBadge } from "@/components/primitives"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { displayMember } from "@/lib/use-group-research"
import type { Member, Task } from "@/lib/research-data"

/**
 * Shared task card used identically on the Tasks board and per-member
 * pages: assignee (with departed-member flag), chapter, status badge
 * (clickable only when an onToggleStatus handler is provided), and the
 * shared edit/delete menu.
 */
export function TaskCard({
  task,
  members,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  task: Task
  members: Member[]
  onToggleStatus?: (id: string) => void
  onEdit?: (task: Task) => void
  onDelete?: (id: string) => void
}) {
  const m = displayMember(members, task.assignee)
  const departed = m.name === "Unknown member"
  const router = useRouter()

  function openDetail() {
    if (window.getSelection()?.toString()) return
    router.push(`/tasks/${task.id}`)
  }

  return (
    <li
      onClick={openDetail}
      title="Open task details"
      className="rounded-xl border border-border bg-card p-3 shadow-sm cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-brand/20"
    >
      <Link
        href={`/tasks/${task.id}`}
        onClick={(e) => e.stopPropagation()}
        title="Open task details"
        className="block text-sm font-medium leading-snug text-foreground hover:text-brand hover:underline"
      >
        {task.title}
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <Avatar member={m} className="size-6 text-[0.6rem]" />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground truncate">
            {departed ? "Former member" : m.name} · {task.chapter}
          </span>
          {departed && (
            <span className="block text-[0.65rem] font-medium text-amber-600 dark:text-amber-400">
              Assignee no longer in group
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        {onToggleStatus ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStatus?.(task.id)
            }}
            className="cursor-pointer transition-transform active:scale-95 text-left"
            title="Click to change status"
          >
            <StatusBadge status={task.status} />
          </button>
        ) : (
          <StatusBadge status={task.status} />
        )}
        {(onEdit || onDelete) && (
          <RowActionsMenu
            onDelete={onDelete ? () => onDelete(task.id) : undefined}
            deleteLabel="Delete task"
            onEdit={onEdit ? () => onEdit(task) : undefined}
            editLabel="Edit task"
          />
        )}
      </div>
    </li>
  )
}
