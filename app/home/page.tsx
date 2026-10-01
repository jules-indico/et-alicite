"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Sparkles,
  Home,
  FolderOpen,
  BookOpen,
  CheckSquare,
  Users,
  Clock,
  Star,
  Info,
  Share2,
  Plus,
  Search,
  Folder,
  FileText,
  BookMarked,
  ChevronDown,
  FilePlus2,
  X,
  Menu,
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  TrendingUp,
  Activity,
  Pencil,
  Link2,
  UserPlus,
  FolderPlus,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useSectionView, useSectionSort } from "@/lib/use-section-view"
import { TopNav } from "@/components/top-nav"
import { AiResearchGuide } from "@/components/ai-research-guide"
import { GroupSwitcher } from "@/components/group-switcher"
import { CreateGroupModal } from "@/components/create-group-modal"
import type { PublicUser, DbFolder } from "@/lib/server/auth-db"
import {
  ProgressBar,
  StatusBadge,
  Avatar,
  AvatarStack,
  AccessBadge,
  ViewToggle,
  ChapterChips,
  chapterNamesForSource,
} from "@/components/primitives"
import {
  project,
  members,
  chapterAttachment,
  TASK_STATUSES,
  type Member,
  type Chapter,
  type Task,
  type Source,
  type TaskStatus,
} from "@/lib/research-data"
import { NewChapterModal, NewTaskModal, NewSourceModal, NewFolderModal, FolderDetailsDialog, MergeTargetDialog, type AccessSetting } from "@/components/home-modals"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import {
  useGroupResearch,
  groupToMembers,
  calcGroupProgress,
  chapterTaskProgress,
  displayMember,
  displayActivityActor,
  isGroupLeader,
  timeAgo,
  useNow,
  RECENT_ACTIVITY_LIMIT,
} from "@/lib/use-group-research"
import { cn } from "@/lib/utils"
import { Z, useAnchorPosition } from "@/lib/layers"
import { fullNameOf, firstNameOf } from "@/lib/names"

// ─── Sidebar nav items ──────────────────────────────────────────────────────

const sidebarMain = [
  { label: "Home", href: "/home", icon: Home, id: "nav-home" },
  { label: "Research Workspace", href: "/research", icon: FolderOpen, id: "nav-workspace" },
  { label: "Sources & Citations", href: "/sources", icon: BookOpen, id: "nav-sources" },
  { label: "Tasks & Deadlines", href: "/tasks", icon: CheckSquare, id: "nav-tasks" },
  { label: "Team", href: "/team", icon: Users, id: "nav-team" },
]

type SidebarSecondaryItem =
  | { label: string; href: string; icon: LucideIcon; id: string }
  | { label: string; icon: LucideIcon; id: string; action: "share" }

const sidebarSecondary: SidebarSecondaryItem[] = [
  { label: "Share", icon: Share2, id: "nav-share", action: "share" },
  { label: "Recent", href: "/activity", icon: Clock, id: "nav-recent" },
  { label: "About", href: "/about", icon: Info, id: "nav-about" },
]

// ─── "New" dropdown ──────────────────────────────────────────────────────────

const newMenuItems = [
  { icon: FilePlus2, label: "New chapter or section", desc: "Create a research chapter", id: "new-chapter" },
  { icon: BookOpen, label: "Add Source / Citation", desc: "Cite a book, article, or URL", id: "new-source" },
  { icon: CheckSquare, label: "Create Task", desc: "Assign work to a team member", id: "new-task" },
  { icon: FolderPlus, label: "New research folder", desc: "Organize files in folders", id: "new-folder" },
]

// ─── Helper components ───────────────────────────────────────────────────────

function SidebarNavLink({
  item,
  active,
}: {
  item: { label: string; href: string; icon: LucideIcon; id: string }
  active: boolean
}) {
  return (
    <Link
      href={item.href}
      id={item.id}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </Link>
  )
}

function NewDropdown({
  hideTaskOption,
  onSelect,
}: {
  hideTaskOption?: boolean
  /** Opens an existing creation dialog; the parent owns every modal. */
  onSelect?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Shared anchor tracking: document coords on open (+ resize only).
  // Absolutely-positioned menus ride with the document — scrolling needs
  // no JS, so there is no lag and no snap-back.
  const menuPos = useAnchorPosition({
    anchorRef: btnRef,
    open,
    width: 256,
    gap: 8,
  })

  function openMenu() {
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  // Shared dismiss: only a genuine outside click closes the menu (tracks
  // both the button and the portaled menu element).
  useDismissOnOutsideClick({
    refs: [btnRef, menuRef],
    enabled: open,
    onDismiss: () => setOpen(false),
  })

  const menu = open && menuPos ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Create new"
      style={{ top: menuPos.top, left: menuPos.left }}
      // z-30, not Z.menu: this menu is anchored inside the z-30 sidebar,
      // so it must paint above it (portal-at-body-end wins the tie). It
      // never overlaps the top nav spatially — the sidebar starts below it.
      className="absolute z-30 w-64 origin-top-left overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl"
    >
      {newMenuItems
        .filter((item) => !(hideTaskOption && item.id === "new-task"))
        .map((item) => (
        <button
          key={item.id}
          id={item.id}
          role="menuitem"
          type="button"
          onClick={() => {
            setOpen(false)
            onSelect?.(item.id)
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-lavender/15 text-brand">
            <item.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{item.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
          </span>
        </button>
      ))}
    </div>
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id="btn-new"
        onClick={openMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition-all",
          "bg-gradient-to-r from-brand to-lavender shadow-md shadow-brand/20",
          "hover:opacity-90 hover:shadow-lg hover:shadow-brand/30 active:scale-[0.99]",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
        New
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </>
  )
}

// ─── Shared Grid Definitions for Column Alignment ───────────────────────────

const TASK_GRID = "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_11rem_7rem_8.5rem_2.5rem]"
const SOURCE_GRID = "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem_7rem_2.5rem]"
const CHAPTER_GRID = "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_7.5rem_2.5rem]"
const FOLDER_LIST_GRID = "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_2.5rem]"

import { RowActionsMenu } from "@/components/row-actions-menu"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"

// ─── Chapter folder card & row ────────────────────────────────────────────────

function renderChapterIcon(chapter: Chapter, isLibrary: boolean, isDraft: boolean) {
  if (chapter.iconName) {
    if (["📚", "🔬", "📊", "💡", "📝", "🏷️", "🧠", "🔍"].includes(chapter.iconName)) {
      return <span className="text-base select-none">{chapter.iconName}</span>
    }
    const iconMap: Record<string, any> = {
      Folder,
      FileText,
      BookMarked,
      BookOpen,
      CheckSquare,
      Sparkles,
      Star,
    }
    const CustomIcon = iconMap[chapter.iconName] || Folder
    return <CustomIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
  }
  const DefaultIcon = isLibrary ? BookMarked : isDraft ? FileText : Folder
  return <DefaultIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
}

function ChapterFolderCard({
  chapter,
  tasks,
  onDelete,
  onEdit,
  onOpen,
}: {
  chapter: Chapter
  tasks: Task[]
  onDelete?: (id: string) => void
  onEdit?: (chapter: Chapter) => void
  onOpen?: (chapter: Chapter) => void
}) {
  const isLibrary = chapter.id === "c5"
  const isDraft = chapter.id === "c4"
  const taskProgress = chapterTaskProgress(chapter.id, tasks)
  // Whole-card click opens the attachment dialog (uploaded file first, then
  // URL). Chapters with nothing attached are not clickable. Inner controls
  // (⋮ menu) stop propagation so they keep their own actions, and
  // text-selection drags never trigger navigation.
  const openTarget = chapterAttachment(chapter)

  function handleOpen(e?: React.MouseEvent) {
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    onOpen?.(chapter)
  }

  const iconGradients: Record<string, string> = {
    Completed: "from-[oklch(0.68_0.13_155)]/25 to-sky/25 text-[oklch(0.45_0.12_155)]",
    "In progress": "from-brand/20 to-lavender/20 text-brand",
    Review: "from-lavender/25 to-brand/15 text-[oklch(0.48_0.1_290)]",
    "Not started": "from-muted/60 to-muted/30 text-muted-foreground",
  }
  const iconStyle = iconGradients[chapter.status] ?? iconGradients["In progress"]

  const colorTagStyles: Record<string, string> = {
    brand: "bg-brand ring-brand/30",
    emerald: "bg-[oklch(0.68_0.13_155)] ring-[oklch(0.68_0.13_155)]/30",
    sky: "bg-sky-500 ring-sky-500/30",
    amber: "bg-[oklch(0.78_0.12_75)] ring-[oklch(0.78_0.12_75)]/30",
    rose: "bg-rose-500 ring-rose-500/30",
  }

  return (
    <div
      onClick={openTarget ? handleOpen : undefined}
      title={openTarget ? "Preview what will open" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-brand/25",
        openTarget && "cursor-pointer"
      )}
    >
      {openTarget ? (
        <button
          type="button"
          onClick={handleOpen}
          title="Preview what will open"
          className="flex flex-1 items-center gap-3 min-w-0 text-left cursor-pointer"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
              iconStyle,
            )}
          >
            {renderChapterIcon(chapter, isLibrary, isDraft)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground leading-snug">
                {chapter.title}
              </p>
              {chapter.colorTag && colorTagStyles[chapter.colorTag] && (
                <span
                  className={cn("size-2 shrink-0 rounded-full ring-2", colorTagStyles[chapter.colorTag])}
                  title={`Color tag: ${chapter.colorTag}`}
                />
              )}
            </div>
            {chapter.description && (
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {chapter.description}
              </p>
            )}
            <p className="text-[0.7rem] text-muted-foreground/80 mt-0.5">
              {chapter.label} ·{" "}
              {taskProgress.percent === null ? (
                <span className="font-medium">No tasks yet</span>
              ) : (
                <span>
                  {taskProgress.percent}% · {taskProgress.completed}/{taskProgress.total} tasks
                </span>
              )}
            </p>
          </div>
        </button>
      ) : (
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
              iconStyle,
            )}
          >
            {renderChapterIcon(chapter, isLibrary, isDraft)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground leading-snug">
                {chapter.title}
              </p>
              {chapter.colorTag && colorTagStyles[chapter.colorTag] && (
                <span
                  className={cn("size-2 shrink-0 rounded-full ring-2", colorTagStyles[chapter.colorTag])}
                  title={`Color tag: ${chapter.colorTag}`}
                />
              )}
            </div>
            {chapter.description && (
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {chapter.description}
              </p>
            )}
            <p className="text-[0.7rem] text-muted-foreground/80 mt-0.5">
              {chapter.label} ·{" "}
              {taskProgress.percent === null ? (
                <span className="font-medium">No tasks yet</span>
              ) : (
                <span>
                  {taskProgress.percent}% · {taskProgress.completed}/{taskProgress.total} tasks
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {onDelete && (
        <RowActionsMenu
          onDelete={() => onDelete(chapter.id)}
          deleteLabel="Delete chapter"
          onEdit={onEdit ? () => onEdit(chapter) : undefined}
          editLabel="Edit chapter"
        />
      )}
    </div>
  )
}

function ChapterRow({
  chapter,
  tasks,
  onDelete,
  onEdit,
  onOpen,
}: {
  chapter: Chapter
  tasks: Task[]
  onDelete?: (id: string) => void
  onEdit?: (chapter: Chapter) => void
  onOpen?: (chapter: Chapter) => void
}) {
  const isLibrary = chapter.id === "c5"
  const isDraft = chapter.id === "c4"
  const taskProgress = chapterTaskProgress(chapter.id, tasks)
  const openTarget = chapterAttachment(chapter)

  function handleOpen(e?: React.MouseEvent) {
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    onOpen?.(chapter)
  }

  const iconGradients: Record<string, string> = {
    Completed: "from-[oklch(0.68_0.13_155)]/25 to-sky/25 text-[oklch(0.45_0.12_155)]",
    "In progress": "from-brand/20 to-lavender/20 text-brand",
    Review: "from-lavender/25 to-brand/15 text-[oklch(0.48_0.1_290)]",
    "Not started": "from-muted/60 to-muted/30 text-muted-foreground",
  }
  const iconStyle = iconGradients[chapter.status] ?? iconGradients["In progress"]

  return (
    <li
      onClick={openTarget ? handleOpen : undefined}
      title={openTarget ? "Preview what will open" : undefined}
      className={cn(
        "group grid items-center gap-4 py-2.5 px-4 rounded-xl transition-colors hover:bg-secondary/50",
        CHAPTER_GRID,
        openTarget && "cursor-pointer"
      )}
    >
      {openTarget ? (
        <button
          type="button"
          onClick={handleOpen}
          title="Preview what will open"
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
        >
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br", iconStyle)}>
            {renderChapterIcon(chapter, isLibrary, isDraft)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{chapter.title}</p>
            {chapter.description && (
              <p className="truncate text-xs text-muted-foreground">{chapter.description}</p>
            )}
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br", iconStyle)}>
            {renderChapterIcon(chapter, isLibrary, isDraft)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{chapter.title}</p>
            {chapter.description && (
              <p className="truncate text-xs text-muted-foreground">{chapter.description}</p>
            )}
          </div>
        </div>
      )}
      <span className="hidden sm:block text-sm text-muted-foreground truncate">{chapter.label}</span>
      <div className="hidden sm:flex items-center gap-2 min-w-0">
        {taskProgress.percent === null ? (
          <span className="text-xs font-medium text-muted-foreground">No tasks yet</span>
        ) : (
          <>
            <ProgressBar value={taskProgress.percent} className="w-16 h-1.5 shrink-0" />
            <span className="text-xs text-muted-foreground">{taskProgress.percent}%</span>
          </>
        )}
      </div>
      <div className="hidden sm:flex items-center">
        <span className="text-xs text-muted-foreground">
          {taskProgress.percent === null
            ? "—"
            : `${taskProgress.completed}/${taskProgress.total} tasks`}
        </span>
      </div>
      <div className="flex justify-end">
        {onDelete && (
          <RowActionsMenu
            onDelete={() => onDelete(chapter.id)}
            deleteLabel="Delete chapter"
            onEdit={onEdit ? () => onEdit(chapter) : undefined}
            editLabel="Edit chapter"
          />
        )}
      </div>
    </li>
  )
}

// ─── Task row (aligned grid) ──────────────────────────────────────────────────

function TaskRow({
  task,
  viewMode,
  members: propMembers,
  onDelete,
  onToggleStatus,
  onEdit,
}: {
  task: Task
  viewMode: "list" | "grid"
  members?: Member[]
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string) => void
  onEdit?: (task: Task) => void
}) {
  const assignee = displayMember(propMembers ?? [], task.assignee)
  // A removed member keeps their assignment, but the roster no longer
  // contains them (displayMember falls back to neutral). Flag it instead of
  // silently unassigning.
  const departed = assignee.name === "Unknown member"
  const assigneeLabel = departed ? "Former member" : assignee.name
  const router = useRouter()

  // Whole-row navigation; inner controls stop propagation so they keep
  // their own actions. A text-selection drag never navigates.
  function openDetail(e: React.MouseEvent) {
    if (window.getSelection()?.toString()) return
    router.push(`/tasks/${task.id}`)
  }

  if (viewMode === "grid") {
    return (
      <div
        onClick={openDetail}
        title="Open task details"
        className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-brand/20"
      >
        <div className="flex items-start justify-between">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand/12 to-lavender/12 text-brand">
            <CheckSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="flex items-center gap-1.5">
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
            {onDelete && (
              <RowActionsMenu
                onDelete={() => onDelete(task.id)}
                deleteLabel="Delete task"
                onEdit={onEdit ? () => onEdit(task) : undefined}
                editLabel="Edit task"
              />
            )}
          </div>
        </div>
        <div className="min-w-0">
          <Link
            href={`/tasks/${task.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Open task details"
            className="block text-sm font-semibold text-foreground leading-snug hover:text-brand hover:underline"
          >
            {task.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{task.chapter}</p>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-border/60">
          <Avatar member={assignee} className="size-6 text-[0.55rem]" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground truncate">{assigneeLabel}</span>
            {departed && (
              <span className="block text-[0.65rem] font-medium text-amber-600 dark:text-amber-400">
                Assignee no longer in group
              </span>
            )}
          </span>
        </div>
      </div>
    )
  }

  return (
    <li
      onClick={openDetail}
      title="Open task details"
      className={cn("group grid items-center gap-4 py-2.5 px-4 rounded-xl cursor-pointer transition-colors hover:bg-secondary/50", TASK_GRID)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand/12 to-lavender/12 text-brand">
          <CheckSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <Link
          href={`/tasks/${task.id}`}
          onClick={(e) => e.stopPropagation()}
          title="Open task details"
          className="truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
        >
          {task.title}
        </Link>
      </div>
      <span className="hidden sm:block text-sm text-muted-foreground truncate">{task.chapter}</span>
      <div className="hidden sm:flex items-center gap-2 min-w-0">
        <Avatar member={assignee} className="size-6 shrink-0 text-[0.55rem]" />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground truncate">{assigneeLabel}</span>
          {departed && (
            <span className="block text-[0.65rem] font-medium text-amber-600 dark:text-amber-400">
              Assignee no longer in group
            </span>
          )}
        </span>
      </div>
      <span className="hidden sm:block text-xs text-muted-foreground truncate">
        {timeAgo(task.createdAt) ?? "—"}
      </span>
      <div className="hidden sm:flex items-center">
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
      </div>
      <div className="flex justify-end">
        {onDelete && (
          <RowActionsMenu
            onDelete={() => onDelete(task.id)}
            deleteLabel="Delete task"
            onEdit={onEdit ? () => onEdit(task) : undefined}
            editLabel="Edit task"
          />
        )}
      </div>
    </li>
  )
}

// ─── Source row (aligned grid) ────────────────────────────────────────────────

function SourceRow({
  source,
  viewMode,
  chapters,
  onDelete,
  onToggleStatus,
  onEdit,
}: {
  source: Source
  viewMode: "list" | "grid"
  chapters?: Chapter[]
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string) => void
  onEdit?: (source: Source) => void
}) {
  const chapterNames = chapterNamesForSource(chapters ?? [], source)
  const router = useRouter()

  // Whole-card navigation; inner controls stop propagation so they keep
  // their own actions, and text-selection drags never navigate.
  function openDetail(e?: React.MouseEvent) {
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    router.push(`/sources/${source.id}`)
  }

  if (viewMode === "grid") {
    return (
      <div
        onClick={openDetail}
        title="Open source details"
        className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-brand/20"
      >
        <div className="flex items-start justify-between">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky/20 to-lavender/20 text-[oklch(0.48_0.1_290)]">
            <BookOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleStatus?.(source.id)
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium cursor-pointer transition-opacity hover:opacity-80 active:scale-95",
                source.cited ? "bg-success/15 text-[oklch(0.45_0.12_155)]" : "bg-muted text-muted-foreground"
              )}
              title="Click to toggle status"
            >
              {source.cited ? "Cited" : "Unused"}
            </button>
            {onDelete && (
              <RowActionsMenu
                onDelete={() => onDelete(source.id)}
                deleteLabel="Delete source"
                onEdit={onEdit ? () => onEdit(source) : undefined}
                editLabel="Edit source"
              />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/sources/${source.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Open source details"
            className="block text-sm font-semibold text-foreground leading-snug line-clamp-2 hover:text-brand hover:underline"
          >
            {source.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{source.author} · {source.year}</p>
          {chapterNames.length > 0 && (
            <div className="mt-1.5">
              <ChapterChips names={chapterNames} />
            </div>
          )}
        </div>
        {source.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/60">
            {source.tags.map((t) => (
              <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <li
      onClick={openDetail}
      title="Open source details"
      className={cn("group grid items-center gap-4 py-2.5 px-4 rounded-xl cursor-pointer transition-colors hover:bg-secondary/50", SOURCE_GRID)}
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

// ─── Section header with collapse toggle ─────────────────────────────────────

// ─── Research folder card & row ───────────────────────────────────────────────

// Sortable columns for the Research files list view (same keys as the
// per-folder file list: name, upload date, total size).
const FOLDER_SORT_KEYS = ["name", "date", "size"] as const

// Sortable columns for the Research chapters list view.
const CHAPTER_SORT_KEYS = ["name", "completion"] as const

// Sortable column for the Sources list view.
const SOURCE_SORT_KEYS = ["title"] as const

// Sortable columns for the Research tasks list view.
const TASK_SORT_KEYS = ["name", "created"] as const

type TaskSortKey = (typeof TASK_SORT_KEYS)[number]

type SourceSortKey = (typeof SOURCE_SORT_KEYS)[number]

type ChapterSortKey = (typeof CHAPTER_SORT_KEYS)[number]

type FolderSortKey = (typeof FOLDER_SORT_KEYS)[number]

/** Same byte formatting as the per-folder file list. */
function formatFolderSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Clickable sort label with direction indicator (mirrors the file list). */
function ListSortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onToggle,
}: {
  label: string
  sortKey: string
  activeKey: string
  dir: "asc" | "desc"
  onToggle: (key: any) => void
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

/**
 * Floating copy of the dragged folder that follows the pointer. Renders the
 * real card/row component (identical markup, badge, and ⋮ button) inside a
 * portal (fixed, pointer-events-free, top z-index), sized to the measured
 * original and moved with translate3d; the original stays put dimmed.
 */
function FolderDragPreview({
  folder,
  variant,
  isOwner,
  width,
  height,
  x,
  y,
  offsetX,
  offsetY,
}: {
  folder: DbFolder
  variant: "card" | "row"
  isOwner: boolean
  width: number
  height: number
  x: number
  y: number
  offsetX: number
  offsetY: number
}) {
  if (typeof document === "undefined") return null
  return createPortal(
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed left-0 top-0 ${Z.dragPreview}`}
      style={{
        width,
        height,
        transform: `translate3d(${x - offsetX}px, ${y - offsetY}px, 0)`,
      }}
    >
      <div
        className="h-full w-full origin-top-left scale-[1.03] opacity-90 shadow-xl"
        style={{ transformOrigin: `${offsetX}px ${offsetY}px` }}
      >
        {variant === "row" ? (
          <FolderRow folder={folder} isOwner={isOwner} canDelete={false} preview />
        ) : (
          <FolderCard folder={folder} isOwner={isOwner} canDelete={false} preview />
        )}
      </div>
    </div>,
    document.body
  )
}

function FolderCard({
  folder,
  isOwner,
  isLeader,
  canDelete,
  onDelete,
  onEdit,
  onDownload,
  onDetails,
  onMerge,
  preview,
  drag,
}: {
  folder: DbFolder
  isOwner: boolean
  isLeader?: boolean
  canDelete: boolean
  onDelete?: (id: string) => void
  onEdit?: (folder: DbFolder) => void
  onDownload?: (folder: DbFolder) => void
  onDetails?: (folder: DbFolder) => void
  onMerge?: (folder: DbFolder) => void
  /** Preview copy (floating drag ghost): identical visuals, no identity or interactions. */
  preview?: boolean
  drag?: {
    sourceId: string | null
    overId: string | null
    active: boolean
    pressingId: string | null
    bind: (folder: DbFolder, draggable: boolean, variant?: "card" | "row") => {
      onPointerDown: (e: React.PointerEvent) => void
      onPointerMove: (e: React.PointerEvent) => void
      onPointerUp: (e: React.PointerEvent) => void
      onPointerCancel: (e: React.PointerEvent) => void
    }
    consumeDragEnd: () => boolean
  }
}) {
  const router = useRouter()

  // Whole-card click opens the folder page. Inner controls (⋮ menu) stop
  // propagation so they keep their own actions, and text-selection drags
  // never trigger navigation. A release ending a merge-drag is swallowed too.
  function handleOpen(e?: React.MouseEvent) {
    if (drag?.consumeDragEnd()) return
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    router.push(`/files/${folder.id}`)
  }

  const dragging = !!drag?.active
  const isLifted = drag?.sourceId === folder.id
  const isDropTarget = dragging && !isLifted && drag?.overId === folder.id
  const dragHandlers = drag?.bind(folder, (isOwner || !!isLeader) && !!onMerge, "card") ?? {}
  const pressLocked = !!drag && (drag.pressingId === folder.id || isLifted)

  return (
    <div
      onClick={preview ? undefined : handleOpen}
      title={`Open ${folder.name}`}
      {...(preview ? {} : { "data-folder-id": folder.id })}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      {...(preview ? {} : dragHandlers)}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-brand/25 cursor-pointer",
        isLifted && "opacity-60 scale-[0.98] cursor-grabbing",
        isDropTarget && "ring-2 ring-brand bg-brand/5",
        pressLocked && "select-none"
      )}
    >
      <button
        type="button"
        data-hold-drag
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={handleOpen}
        title={`Open ${folder.name}`}
        className="flex flex-1 items-center gap-3 min-w-0 text-left cursor-pointer"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/20 to-lavender/20 text-brand">
          <Folder className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground leading-snug">
            {folder.name}
          </p>
          <p className="truncate text-[0.7rem] text-muted-foreground/80 mt-0.5">
            Research folder · Updated {timeAgo(folder.updatedAt) ?? "recently"}
          </p>
          {isOwner && (
            <p className="mt-1">
              <AccessBadge access={folder.access} allowedCount={folder.allowedIds?.length} />
            </p>
          )}
        </div>
      </button>

      <RowActionsMenu
        onDelete={onDelete && canDelete ? () => onDelete(folder.id) : undefined}
        deleteLabel="Delete folder"
        onEdit={(isOwner || isLeader) && onEdit ? () => onEdit(folder) : undefined}
        editLabel="Edit folder"
        onDownload={onDownload ? () => onDownload(folder) : undefined}
        downloadLabel="Download"
        onDetails={onDetails ? () => onDetails(folder) : undefined}
        detailsLabel="Details"
        onMerge={(isOwner || isLeader) && onMerge ? () => onMerge(folder) : undefined}
        mergeLabel="Merge into"
      />
    </div>
  )
}

function FolderRow({
  folder,
  isOwner,
  isLeader,
  canDelete,
  onDelete,
  onEdit,
  onDownload,
  onDetails,
  onMerge,
  preview,
  drag,
}: {
  folder: DbFolder
  isOwner: boolean
  isLeader?: boolean
  canDelete: boolean
  onDelete?: (id: string) => void
  onEdit?: (folder: DbFolder) => void
  onDownload?: (folder: DbFolder) => void
  onDetails?: (folder: DbFolder) => void
  onMerge?: (folder: DbFolder) => void
  /** Preview copy (floating drag ghost): identical visuals, no identity or interactions. */
  preview?: boolean
  drag?: {
    sourceId: string | null
    overId: string | null
    active: boolean
    pressingId: string | null
    bind: (folder: DbFolder, draggable: boolean, variant?: "card" | "row") => {
      onPointerDown: (e: React.PointerEvent) => void
      onPointerMove: (e: React.PointerEvent) => void
      onPointerUp: (e: React.PointerEvent) => void
      onPointerCancel: (e: React.PointerEvent) => void
    }
    consumeDragEnd: () => boolean
  }
}) {
  const router = useRouter()

  function handleOpen(e?: React.MouseEvent) {
    if (drag?.consumeDragEnd()) return
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    e?.stopPropagation()
    router.push(`/files/${folder.id}`)
  }

  const dragging = !!drag?.active
  const isLifted = drag?.sourceId === folder.id
  const isDropTarget = dragging && !isLifted && drag?.overId === folder.id
  const dragHandlers = drag?.bind(folder, (isOwner || !!isLeader) && !!onMerge, "row") ?? {}
  const pressLocked = !!drag && (drag.pressingId === folder.id || isLifted)

  return (
    <li
      onClick={preview ? undefined : handleOpen}
      title={`Open ${folder.name}`}
      {...(preview ? {} : { "data-folder-id": folder.id })}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      {...(preview ? {} : dragHandlers)}
      className={cn(
        "group flex sm:grid items-center gap-4 px-4 py-3 cursor-pointer transition-colors rounded-xl",
        FOLDER_LIST_GRID,
        preview
          ? "border border-border bg-card shadow-xl"
          : "hover:bg-secondary/40",
        isLifted && "opacity-60 cursor-grabbing",
        isDropTarget && "ring-2 ring-brand bg-brand/5",
        pressLocked && "select-none"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/20 to-lavender/20 text-brand">
          <Folder className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground leading-snug">
            {folder.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.7rem] text-muted-foreground/80">
            <span>Research folder</span>
            {isOwner && (
              <AccessBadge access={folder.access} allowedCount={folder.allowedIds?.length} />
            )}
          </p>
        </div>
      </div>
      <span className="hidden sm:block text-xs text-muted-foreground truncate">
        {timeAgo(folder.createdAt) ?? "—"}
      </span>
      <span className="hidden sm:block text-xs text-muted-foreground truncate">
        {formatFolderSize(folder.totalSize ?? 0)}
      </span>
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu
            onDelete={onDelete && canDelete ? () => onDelete(folder.id) : undefined}
            deleteLabel="Delete folder"
            onEdit={(isOwner || isLeader) && onEdit ? () => onEdit(folder) : undefined}
            editLabel="Edit folder"
            onDownload={onDownload ? () => onDownload(folder) : undefined}
            downloadLabel="Download"
            onDetails={onDetails ? () => onDetails(folder) : undefined}
            detailsLabel="Details"
            onMerge={(isOwner || isLeader) && onMerge ? () => onMerge(folder) : undefined}
            mergeLabel="Merge into"
          />
        </div>
    </li>
  )
}

function SectionHeader({
  title,
  collapsed,
  onToggle,
  action,
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  action?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-brand transition-colors"
        aria-expanded={!collapsed}
      >
        <ChevronDown
          className={cn("size-4 transition-transform text-muted-foreground", collapsed && "-rotate-90")}
          aria-hidden="true"
        />
        {title}
      </button>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}

function SidebarProgress({
  tasks,
  sources,
  hasActiveGroup,
}: {
  tasks: Task[]
  sources: Source[]
  hasActiveGroup: boolean
}) {
  const progress = calcGroupProgress(tasks, sources)
  // No active group at all (zero groups, or active group deleted with none
  // reassigned) must never show a leftover percentage — same empty treatment
  // as a group with no trackable work yet. Chapters don't factor in: their
  // contribution flows entirely through attributed tasks.
  const hasWork = hasActiveGroup && (tasks.length > 0 || sources.length > 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-lavender/15 text-brand">
          <TrendingUp className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold text-foreground">Project progress</span>
      </div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">Overall</span>
        {hasWork ? (
          <span className="text-lg font-bold tracking-tight text-foreground">{progress}%</span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">No work yet</span>
        )}
      </div>
      <ProgressBar value={hasWork ? progress : 0} className="h-1.5" />
      {hasWork && (
        <p className="mt-2 text-[0.65rem] text-muted-foreground">
          {tasks.filter((t) => t.status === "Completed").length}/{tasks.length} tasks
          {" · "}{sources.filter((s) => s.cited).length}/{sources.length} cited
        </p>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { authState, currentUser } = useAuth()
  const router = useRouter()
  const [aiOpen, setAiOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chaptersCollapsed, setChaptersCollapsed] = useState(false)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false)
  const [foldersCollapsed, setFoldersCollapsed] = useState(false)
  const [foldersExpanded, setFoldersExpanded] = useState(false)

  // Section view modes (grid/list) — persisted per-user via useSectionView
  const [chapterView, setChapterView] = useSectionView("chapters", "grid")
  const [taskView, setTaskView] = useSectionView("tasks", "list")
  const [sourceView, setSourceView] = useSectionView("sources", "list")
  const [folderView, setFolderView] = useSectionView("folders", "grid")

  // Research files list sort (list view only) — persisted per-user with the
  // same account mechanism as the view modes.
  const [folderSort, setFolderSort] = useSectionSort(
    "folders",
    { key: "date", dir: "desc" },
    FOLDER_SORT_KEYS
  )

  function toggleFolderSort(key: FolderSortKey) {
    if (key === folderSort.key) {
      setFolderSort({ key, dir: folderSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setFolderSort({ key, dir: key === "name" ? "asc" : "desc" })
    }
  }

  // Research chapters list sort (list view only) — same persisted
  // per-user mechanism. Completion ranks by the displayed task-derived
  // progress (completed/total ratio), highest first by default.
  const [chapterSort, setChapterSort] = useSectionSort(
    "chapters",
    { key: "completion", dir: "desc" },
    CHAPTER_SORT_KEYS
  )

  function toggleChapterSort(key: ChapterSortKey) {
    if (key === chapterSort.key) {
      setChapterSort({ key, dir: chapterSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setChapterSort({ key, dir: key === "name" ? "asc" : "desc" })
    }
  }

  // Sources list sort (list view only, title A-Z by default) — same
  // persisted per-user mechanism.
  const [sourceSort, setSourceSort] = useSectionSort(
    "sources",
    { key: "title", dir: "asc" },
    SOURCE_SORT_KEYS
  )

  function toggleSourceSort(key: SourceSortKey) {
    if (key === sourceSort.key) {
      setSourceSort({ key, dir: sourceSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setSourceSort({ key, dir: "asc" })
    }
  }

  // Research tasks list sort (list view only, newest first by default) —
  // same persisted per-user mechanism.
  const [taskSort, setTaskSort] = useSectionSort(
    "tasks",
    { key: "created", dir: "desc" },
    TASK_SORT_KEYS
  )

  function toggleTaskSort(key: TaskSortKey) {
    if (key === taskSort.key) {
      setTaskSort({ key, dir: taskSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setTaskSort({ key, dir: key === "name" ? "asc" : "desc" })
    }
  }

  // Modal open states
  const [createChapterOpen, setCreateChapterOpen] = useState(false)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [createSourceOpen, setCreateSourceOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

  // Share dialog (leader-only invite link for the active group).
  const [shareOpen, setShareOpen] = useState(false)
  const [invite, setInvite] = useState<{ token: string; enabled: boolean; linkPath: string } | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteToggling, setInviteToggling] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function openShare() {
    if (!activeGroup?.id) return
    setShareOpen(true)
    setInviteError(null)
    setCopied(false)
    setInviteLoading(true)
    try {
      const res = await fetch(`/api/groups/${activeGroup.id}/invite`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load the invite link.")
      setInvite(data.invite)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to load the invite link.")
    } finally {
      setInviteLoading(false)
    }
  }

  async function toggleInvite() {
    if (!activeGroup?.id || !invite || inviteToggling) return
    setInviteToggling(true)
    setInviteError(null)
    try {
      const res = await fetch(`/api/groups/${activeGroup.id}/invite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !invite.enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to update the invite link.")
      setInvite({ ...invite, enabled: data.enabled })
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to update the invite link.")
    } finally {
      setInviteToggling(false)
    }
  }

  function inviteUrl(): string {
    if (typeof window === "undefined" || !invite) return ""
    return `${window.location.origin}${invite.linkPath}`
  }

  async function copyInviteLink() {
    const url = inviteUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setInviteError("Couldn't copy automatically — long-press the link to copy it manually.")
    }
  }

  // Item being edited (null = creating). Passed as `initial` to the modals.
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingSource, setEditingSource] = useState<Source | null>(null)
  const [editingFolder, setEditingFolder] = useState<DbFolder | null>(null)

  // Pending delete awaiting confirmation (shared dialog, per-type wording).
  type PendingDelete = { kind: "chapter" | "task" | "source" | "folder"; id: string; name: string } | null
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function requestDelete(kind: "chapter" | "task" | "source" | "folder", id: string) {
    const name =
      kind === "chapter"
        ? (chapterList.find((c) => c.id === id)?.title ?? "this chapter")
        : kind === "task"
          ? (taskList.find((t) => t.id === id)?.title ?? "this task")
          : kind === "folder"
            ? (folderList.find((f) => f.id === id)?.name ?? "this folder")
            : (sourceList.find((s) => s.id === id)?.title ?? "this source")
    setDeleteError(null)
    setPendingDelete({ kind, id, name })
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      if (pendingDelete.kind === "chapter") await handleDeleteChapter(pendingDelete.id)
      else if (pendingDelete.kind === "task") await handleDeleteTask(pendingDelete.id)
      else if (pendingDelete.kind === "folder") await handleDeleteFolder(pendingDelete.id)
      else await handleDeleteSource(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  function deleteMessage() {
    if (!pendingDelete) return null
    const name = <span className="font-semibold text-foreground">&ldquo;{pendingDelete.name}&rdquo;</span>
    if (pendingDelete.kind === "chapter") {
      const n = taskList.filter((t) => t.chapterId === pendingDelete.id).length
      return (
        <>
          Delete {name}? Its {n} attributed task{n === 1 ? "" : "s"} will be unassigned from this
          chapter, and linked sources will be kept but unlinked. This cannot be undone.
        </>
      )
    }
    if (pendingDelete.kind === "folder") {
      return (
        <>
          Delete {name}? All files inside this folder will be deleted too. This cannot be undone.
        </>
      )
    }
    return <>Delete {name}? This cannot be undone.</>
  }

  // Group states
  const [groups, setGroups] = useState<any[]>([])
  const [activeGroup, setActiveGroup] = useState<any | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [switchingGroup, setSwitchingGroup] = useState(false)
  const [acceptedCollaborators, setAcceptedCollaborators] = useState<PublicUser[]>([])
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false)

  // Research tasks are leader-managed: only the group leader sees the
  // add/edit/delete entry points. Members keep read access everywhere.
  const isLeader = isGroupLeader(activeGroup, currentUser?.id)

  // Group-scoped research data — the server is the source of truth, so every
  // member of the active group loads and mutates the SAME chapters, tasks,
  // sources, and activity feed (filtered by groupId, never by user id).
  const {
    chapters: chapterList,
    tasks: taskList,
    sources: sourceList,
    folders: folderList,
    activities: activityList,
    createChapter: createChapterOnServer,
    updateChapter: updateChapterOnServer,
    deleteChapter: deleteChapterOnServer,
    createTask: createTaskOnServer,
    updateTask: updateTaskOnServer,
    deleteTask: deleteTaskOnServer,
    createSource: createSourceOnServer,
    updateSource: updateSourceOnServer,
    deleteSource: deleteSourceOnServer,
    createFolder: createFolderOnServer,
    renameFolder: renameFolderOnServer,
    deleteFolder: deleteFolderOnServer,
    logActivity: logActivityOnServer,
    reload: reloadResearch,
  } = useGroupResearch(activeGroup?.id ?? null)

  // Load user groups and active group
  useEffect(() => {
    let isMounted = true
    async function loadGroupsAndWorkspace() {
      try {
        const [gRes, aRes, cRes] = await Promise.all([
          fetch("/api/groups", { cache: "no-store" }),
          fetch("/api/groups/active", { cache: "no-store" }),
          fetch("/api/connections?status=accepted", { cache: "no-store" }),
        ])

        if (!isMounted) return

        let userGroups: any[] = []
        if (gRes.ok) {
          const gData = await gRes.json()
          if (gData.ok) {
            userGroups = gData.groups || []
            setGroups(userGroups)
          }
        }

        let currentActive: any = null
        if (aRes.ok) {
          const aData = await aRes.json()
          if (aData.ok && aData.activeGroup) {
            currentActive = aData.activeGroup
          }
        }

        // If no active group returned but user has groups, fallback to first
        if (!currentActive && userGroups.length > 0) {
          currentActive = userGroups[0]
        }

        if (currentActive) {
          setActiveGroup(currentActive)
          // Research data for the group loads via useGroupResearch above.
        }

        if (cRes.ok) {
          const cData = await cRes.json()
          if (cData.ok) {
            setAcceptedCollaborators(cData.acceptedUsers || [])
          }
        }
      } catch (err) {
        console.error("Failed to load workspace data:", err)
      } finally {
        if (isMounted) setLoadingGroups(false)
      }
    }

    loadGroupsAndWorkspace()
    return () => {
      isMounted = false
    }
  }, [])

  async function handleSelectGroup(group: any) {
    if (activeGroup?.id === group.id) return
    setSwitchingGroup(true)
    try {
      const res = await fetch("/api/groups/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        const nextGroup = data.activeGroup || group
        setActiveGroup(nextGroup)
        // useGroupResearch reloads the next group's shared data automatically.
      }
    } catch (err) {
      console.error("Failed to switch group:", err)
    } finally {
      setSwitchingGroup(false)
    }
  }

  function handleGroupCreated(newGroup: any) {
    setGroups((prev) => [newGroup, ...prev])
    setActiveGroup(newGroup)
    // useGroupResearch loads the new (empty) group's shared data automatically.
  }

  function handleGroupUpdated(updatedGroup: any) {
    setGroups((prev) => prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g)))
    if (activeGroup?.id === updatedGroup.id) {
      setActiveGroup(updatedGroup)
    }
    // Sidebar member summary, assignee dropdown, and task lists all read
    // from activeGroup/groups, so they reflect the update immediately.
    // Research data reloads for the group to pick up any membership changes.
    reloadResearch()
  }

  function handleGroupDeleted(deletedGroupId: string, newActiveGroup: any | null) {
    // Server cascade-deletes the group's shared research data.
    setGroups((prev) => prev.filter((g) => g.id !== deletedGroupId))
    if (activeGroup?.id === deletedGroupId) {
      setActiveGroup(newActiveGroup)
    }
  }

  const [searchQuery, setSearchQuery] = useState("")

  // Tick so relative activity timestamps ("5m ago") stay correct while open.
  useNow()

  useEffect(() => {
    if (authState.status === "unauthenticated") router.replace("/login")
  }, [authState.status, router])

  const userName = (currentUser && fullNameOf(currentUser)) || "Someone"
  const userInitials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 3)
    .toUpperCase()
  const actor = { name: userName, initials: userInitials }

  const groupMembers: Member[] = (activeGroup?.members && activeGroup.members.length > 0)
    ? groupToMembers(activeGroup)
    : members

  async function handleCreateChapter(newCh: Omit<Chapter, "id">) {
    try {
      if (editingChapter) {
        const updated = await updateChapterOnServer(editingChapter.id, {
          ...newCh,
          updated: "Just now",
        })
        if (updated) {
          await logActivityOnServer("edited chapter", updated.title, actor)
        }
        setEditingChapter(null)
      } else {
        await createChapterOnServer(newCh, actor)
      }
    } catch (err) {
      console.error("Failed to save chapter:", err)
    }
  }

  async function handleDeleteChapter(id: string) {
    const target = chapterList.find((c) => c.id === id)
    try {
      await deleteChapterOnServer(id)
      if (target) {
        await logActivityOnServer("deleted chapter", target.title, actor)
      }
      // Deleting a chapter unlinks it from sources server-side — refresh so
      // rows stop showing the removed chapter immediately.
      await reloadResearch()
    } catch (err) {
      console.error("Failed to delete chapter:", err)
    }
  }

  const folderLeaderId = activeGroup ? (activeGroup.leader || activeGroup.ownerId) : null
  function isFolderOwner(folder: DbFolder): boolean {
    return !!currentUser && folder.createdBy === currentUser.id
  }
  function canDeleteFolder(folder: DbFolder): boolean {
    if (!currentUser) return false
    // Owner always; leader sees a Delete entry too (the server allows it
    // for accessible or ownerless items and 404s/403s the rest).
    return folder.createdBy === currentUser.id || folderLeaderId === currentUser.id
  }

  // Folder details dialog (anyone who can see the folder).
  const [detailsFolder, setDetailsFolder] = useState<DbFolder | null>(null)

  // Inline notice for folder download outcomes (e.g. nothing accessible).
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null)
  const downloadNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flashDownloadNotice(text: string) {
    setDownloadNotice(text)
    if (downloadNoticeTimer.current) clearTimeout(downloadNoticeTimer.current)
    downloadNoticeTimer.current = setTimeout(() => setDownloadNotice(null), 4000)
  }

  async function handleDownloadFolder(folder: DbFolder) {
    if (!activeGroup?.id) return
    try {
      const res = await fetch(
        `/api/folders/${folder.id}/download?groupId=${encodeURIComponent(activeGroup.id)}`
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        flashDownloadNotice(data.error || "Download failed. Please try again.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${folder.name}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      flashDownloadNotice("Download failed. Please try again.")
    }
  }

  async function handleCreateFolder(newF: { name: string; access: AccessSetting["access"]; allowedIds: string[] }) {
    try {
      if (editingFolder) {
        // Non-owners may rename (leader) but never re-share: strip access
        // fields so the owner-only server rule can't reject the rename.
        const patch =
          editingFolder.createdBy === currentUser?.id
            ? newF
            : { name: newF.name }
        await renameFolderOnServer(editingFolder.id, patch)
        setEditingFolder(null)
      } else {
        await createFolderOnServer(newF)
      }
    } catch (err) {
      console.error("Failed to save folder:", err)
    }
  }

  async function handleDeleteFolder(id: string) {
    try {
      await deleteFolderOnServer(id)
    } catch (err) {
      console.error("Failed to delete folder:", err)
    }
  }

  // Merge flow: pick target → confirm (shared dialog) → atomic server merge
  // → reload list → success/error notice (same inline toast as downloads).
  const [mergeSource, setMergeSource] = useState<DbFolder | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  // Full reset: dismissing the confirm (Cancel/X/Esc/backdrop) must close
  // the whole flow — clearing only the target re-opens the picker.
  function resetMergeFlow() {
    setMergeSource(null)
    setMergeTargetId(null)
    setMergeError(null)
  }

  // Targets the viewer can merge into: own folders for owners, every
  // other folder for the leader (who may merge any pair). Source excluded.
  const mergeTargets = mergeSource && currentUser
    ? folderList.filter(
        (f) => f.id !== mergeSource.id && (f.createdBy === currentUser.id || isLeader)
      )
    : []
  const mergeTarget = mergeTargetId
    ? (folderList.find((f) => f.id === mergeTargetId) ?? null)
    : null

  async function handleConfirmMerge() {
    if (!mergeSource || !mergeTarget || !activeGroup?.id || merging) return
    setMerging(true)
    setMergeError(null)
    try {
      const res = await fetch(
        `/api/folders/${mergeSource.id}/merge?groupId=${encodeURIComponent(activeGroup.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: activeGroup.id, targetFolderId: mergeTarget.id }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMergeError(data.error || "Merge failed. Please try again.")
        return
      }
      setMergeSource(null)
      setMergeTargetId(null)
      await reloadResearch()
      flashDownloadNotice(
        `Merged “${mergeSource.name}” into “${mergeTarget.name}” (${data.moved} file${data.moved === 1 ? "" : "s"} moved).`
      )
    } catch {
      setMergeError("Merge failed. Please try again.")
    } finally {
      setMerging(false)
    }
  }

  // Drag-to-merge (native pointer events, no new deps): press-and-hold a
  // card ~400ms to lift it, drop onto another card to merge. A quick click
  // still opens the folder. Only owners can lift a card (same rule as the
  // menu item); the server re-checks both folders on confirm.
  const [dragSource, setDragSource] = useState<DbFolder | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [pressId, setPressId] = useState<string | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdPos = useRef<{ x: number; y: number } | null>(null)
  const pressEl = useRef<Element | null>(null)
  // Pointer currently driving a press/drag (touch pointer ids identify the
  // finger; mouse/pen have their own). Guards against second-finger moves
  // ending or steering someone else's drag.
  const activePointerId = useRef<number | null>(null)
  const dragOverRef = useRef<string | null>(null)
  const dragEndAt = useRef(0)
  // Grab geometry for the floating preview: card rect + pointer offset
  // inside it, plus the latest pointer position (rAF-throttled into state).
  const grabRef = useRef<{ w: number; h: number; ox: number; oy: number; variant: "card" | "row" } | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const rafId = useRef(0)
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null)

  function clearHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    holdPos.current = null
    // Restore panning: the press element gets touch-action back whether a
    // drag started or not (no-op when never suppressed).
    const el = pressEl.current as HTMLElement | null
    if (el && el.style.touchAction === "none") {
      el.style.touchAction = ""
    }
    pressEl.current = null
    activePointerId.current = null
    setPressId(null)
  }

  function cancelDrag() {
    const wasActive = dragSource !== null
    clearHold()
    if (wasActive) dragEndAt.current = Date.now()
    dragOverRef.current = null
    pointerRef.current = null
    grabRef.current = null
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
      rafId.current = 0
    }
    setPreviewPos(null)
    setDragSource(null)
    setDragOverId(null)
  }

  // Consumed by card click handlers: a release that ends a drag must not
  // also navigate.
  function consumeDragEnd(): boolean {
    if (Date.now() - dragEndAt.current < 350) {
      dragEndAt.current = 0
      return true
    }
    return false
  }

  function bindFolderDrag(folder: DbFolder, draggable: boolean, variant: "card" | "row" = "card") {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (!draggable) return
        if (e.pointerType === "mouse" && e.button !== 0) return
        const t = e.target as HTMLElement
        // Skip real controls (⋮ menu, links, inputs) — but the card's own
        // open button is marked hold-through, otherwise the guard below
        // would swallow presses on the whole card surface.
        if (t.closest("a, input, textarea, select")) return
        const btn = t.closest("button")
        if (btn && !btn.hasAttribute("data-hold-drag")) return
        holdPos.current = { x: e.clientX, y: e.clientY }
        pressEl.current = e.currentTarget
        // Suppress touch panning synchronously from press (no React
        // round-trip): otherwise a drifting finger starts a page scroll
        // during the hold window and the drag can never activate. If the
        // gesture proves to be a scroll (moves past slop before the hold
        // completes), clearHold hands panning straight back.
        ;(e.currentTarget as HTMLElement).style.touchAction = "none"
        const rect = (e.currentTarget as Element).getBoundingClientRect()
        grabRef.current = {
          w: rect.width,
          h: rect.height,
          ox: e.clientX - rect.left,
          oy: e.clientY - rect.top,
          variant,
        }
        pointerRef.current = { x: e.clientX, y: e.clientY }
        setPressId(folder.id)
        const pointerId = e.pointerId
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null
          holdPos.current = null
          activePointerId.current = pointerId
          // Suppress touch scrolling synchronously at lift time (before any
          // move), so the browser can't steal the gesture mid-drag. Set
          // directly on the element — no React round-trip — and only for
          // the active drag; normal scrolling is untouched otherwise.
          const pressed = pressEl.current as HTMLElement | null
          if (pressed) {
            pressed.style.touchAction = "none"
          }
          // Capture so moves keep arriving even off-card (mouse + touch).
          try {
            pressEl.current?.setPointerCapture?.(pointerId)
          } catch {
            // Non-critical: moves still arrive via the window listener.
          }
          dragOverRef.current = null
          setDragOverId(null)
          const p = pointerRef.current
          setPreviewPos(p ? { x: p.x, y: p.y } : null)
          setDragSource(folder)
        }, 400)
      },
      onPointerMove: (e: React.PointerEvent) => {
        // Ignore other pointers (e.g. a second finger) entirely.
        if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
        pointerRef.current = { x: e.clientX, y: e.clientY }
        // Moved before the hold completed: a scroll/click gesture, not a lift.
        if (!holdPos.current || dragSource) return
        const dx = e.clientX - holdPos.current.x
        const dy = e.clientY - holdPos.current.y
        if (dx * dx + dy * dy > 400) clearHold()
      },
      onPointerUp: (e: React.PointerEvent) => {
        // A second finger lifting must not end the press/drag. With no
        // active drag, any release is a plain click: leave native click to
        // open the folder.
        if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
        clearHold()
      },
      onPointerCancel: (e: React.PointerEvent) => {
        if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
        cancelDrag()
      },
      onContextMenu: (e: React.MouseEvent) => {
        // Don't let the context menu interrupt a press-and-hold or drag.
        if (holdPos.current || dragSource) e.preventDefault()
      },
    }
  }

  useEffect(() => {
    if (!dragSource) return
    const source = dragSource
    function onMove(e: PointerEvent) {
      // Only the pointer driving this drag may steer it.
      if (e.pointerId !== activePointerId.current) return
      pointerRef.current = { x: e.clientX, y: e.clientY }
      // One rAF-flushed position update per frame keeps the preview smooth.
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = 0
          const p = pointerRef.current
          if (p) setPreviewPos({ x: p.x, y: p.y })
        })
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-folder-id]")
      const id = el?.getAttribute("data-folder-id") ?? null
      const over = id && id !== source.id ? id : null
      dragOverRef.current = over
      setDragOverId(over)
    }
    function onUp(e: PointerEvent) {
      // A second finger lifting must not end someone else's drag.
      if (e.pointerId !== activePointerId.current) return
      const over = dragOverRef.current
      cancelDrag()
      if (over) {
        // Same merge confirmation as the menu flow (source deleted, target kept).
        setMergeTargetId(null)
        setMergeError(null)
        setMergeSource(source)
        setMergeTargetId(over)
      }
    }
    function onCancel(e: PointerEvent) {
      // Browser took the gesture back (multi-touch, alert, etc.): always
      // reset so no press/drag state can stick.
      if (e.pointerId !== activePointerId.current) return
      cancelDrag()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancelDrag()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("keydown", onKey)
    }
  }, [dragSource])

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current)
    }
  }, [])

  async function handleCreateTask(newT: Omit<Task, "id">) {
    try {
      if (editingTask) {
        const updated = await updateTaskOnServer(editingTask.id, newT)
        if (updated) {
          await logActivityOnServer("edited task", updated.title, actor)
        }
        setEditingTask(null)
      } else {
        await createTaskOnServer(newT, actor)
      }
    } catch (err) {
      console.error("Failed to save task:", err)
    }
  }

  async function handleDeleteTask(id: string) {
    const target = taskList.find((t) => t.id === id)
    try {
      await deleteTaskOnServer(id)
      if (target) {
        await logActivityOnServer("deleted task", target.title, actor)
      }
    } catch (err) {
      console.error("Failed to delete task:", err)
    }
  }

  async function handleToggleTaskStatus(id: string) {
    const statusCycle: TaskStatus[] = [...TASK_STATUSES]
    const task = taskList.find((t) => t.id === id)
    if (!task) return
    const currentIdx = statusCycle.indexOf(task.status)
    const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length]
    try {
      await updateTaskOnServer(id, { status: nextStatus })
      if (nextStatus === "Completed") {
        await logActivityOnServer("completed task", task.title, actor)
      }
    } catch (err) {
      console.error("Failed to update task:", err)
    }
  }

  async function handleCreateSource(newS: Omit<Source, "id">) {
    try {
      if (editingSource) {
        const updated = await updateSourceOnServer(editingSource.id, newS)
        if (updated) {
          await logActivityOnServer("edited source", updated.title, actor)
        }
        setEditingSource(null)
      } else {
        await createSourceOnServer(newS, actor)
      }
    } catch (err) {
      console.error("Failed to save source:", err)
    }
  }

  async function handleDeleteSource(id: string) {
    const target = sourceList.find((s) => s.id === id)
    try {
      await deleteSourceOnServer(id)
      if (target) {
        await logActivityOnServer("deleted source", target.title, actor)
      }
    } catch (err) {
      console.error("Failed to delete source:", err)
    }
  }

  async function handleToggleSourceStatus(id: string) {
    const source = sourceList.find((s) => s.id === id)
    if (!source) return
    const nextCited = !source.cited
    try {
      await updateSourceOnServer(id, { cited: nextCited })
      await logActivityOnServer(nextCited ? "cited source" : "uncited source", source.title, actor)
    } catch (err) {
      console.error("Failed to update source:", err)
    }
  }

  if (authState.status === "loading" || authState.status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="size-8 animate-spin rounded-full border-4 border-border border-t-brand" />
      </div>
    )
  }

  const firstName = (currentUser && firstNameOf(currentUser)) || "Researcher"
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  // Filter data by search
  const filteredChapters = searchQuery
    ? chapterList.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : chapterList

  const filteredTasks = searchQuery
    ? taskList.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : taskList

  const filteredSources = searchQuery
    ? sourceList.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.author.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sourceList

  const filteredFolders = searchQuery
    ? folderList.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : folderList
  const FOLDER_LIMIT = 5
  // Home preview: most recently updated first (stable for items without
  // timestamps), shared by all four sections.
  function sortRecent<T extends { updatedAt?: string | null; createdAt?: string | null }>(
    items: T[]
  ): T[] {
    return [...items].sort((a, b) => {
      const ka = a.updatedAt ?? a.createdAt ?? ""
      const kb = b.updatedAt ?? b.createdAt ?? ""
      return ka < kb ? 1 : ka > kb ? -1 : 0
    })
  }
  const orderedFolders = sortRecent(filteredFolders)
  // List view applies the persisted user sort (name, folder creation date,
  // total size of accessible files inside); grid keeps recency order.
  const userSortedFolders = [...filteredFolders].sort((a, b) => {
    const dir = folderSort.dir === "asc" ? 1 : -1
    if (folderSort.key === "name") return a.name.localeCompare(b.name) * dir
    if (folderSort.key === "size")
      return ((a.totalSize ?? 0) - (b.totalSize ?? 0)) * dir
    return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir
  })
  const baseFolders = folderView === "list" ? userSortedFolders : orderedFolders
  const visibleFolders = foldersExpanded ? baseFolders : baseFolders.slice(0, FOLDER_LIMIT)
  // Chapters list view applies the persisted user sort (name, task
  // completion via the displayed task-derived progress); grid keeps recency.
  const userSortedChapters = [...filteredChapters].sort((a, b) => {
    const dir = chapterSort.dir === "asc" ? 1 : -1
    if (chapterSort.key === "name") return a.title.localeCompare(b.title) * dir
    const pa = chapterTaskProgress(a.id, taskList).percent ?? -1
    const pb = chapterTaskProgress(b.id, taskList).percent ?? -1
    return (pa - pb) * dir
  })
  const baseChapters = chapterView === "list" ? userSortedChapters : sortRecent(filteredChapters)
  const visibleChapters = baseChapters.slice(0, FOLDER_LIMIT)
  // Sources list view applies the persisted title sort; grid keeps recency.
  const userSortedSources = [...filteredSources].sort((a, b) => {
    const dir = sourceSort.dir === "asc" ? 1 : -1
    return a.title.localeCompare(b.title) * dir
  })
  const baseSources = sourceView === "list" ? userSortedSources : sortRecent(filteredSources)
  const visibleSources = baseSources.slice(0, FOLDER_LIMIT)
  // Tasks list view applies the persisted user sort (name, creation date);
  // grid keeps recency order.
  const userSortedTasks = [...filteredTasks].sort((a, b) => {
    const dir = taskSort.dir === "asc" ? 1 : -1
    if (taskSort.key === "name") return a.title.localeCompare(b.title) * dir
    // Dateless tasks rank below all dated ones (same nulls-last-in-desc
    // convention as chapter completion), reversibly.
    const stamp = (iso?: string): number => {
      const t = Date.parse(iso ?? "")
      return Number.isNaN(t) ? -1 : t
    }
    return (stamp(a.createdAt) - stamp(b.createdAt)) * dir
  })
  const baseTasks = taskView === "list" ? userSortedTasks : sortRecent(filteredTasks)
  const visibleTasks = baseTasks.slice(0, FOLDER_LIMIT)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top nav */}
      <TopNav onToggleAi={() => setAiOpen((v) => !v)} aiOpen={aiOpen} />

      {/* Body: sidebar + main */}
      <div className="relative flex flex-1">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-foreground/10 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-background/95 backdrop-blur pt-16 transition-transform duration-300 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-none lg:pt-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Sidebar navigation"
        >
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {/* New button */}
            <div className="mb-3">
              <NewDropdown
                hideTaskOption={!isLeader}
                onSelect={(id) => {
                  if (id === "new-chapter") setCreateChapterOpen(true)
                  else if (id === "new-source") setCreateSourceOpen(true)
                  else if (id === "new-task") setCreateTaskOpen(true)
                  else if (id === "new-folder") setCreateFolderOpen(true)
                }}
              />
            </div>

            {/* Main nav */}
            <nav aria-label="Main">
              {sidebarMain.map((item) => (
                <SidebarNavLink
                  key={item.id}
                  item={item}
                  active={item.href === "/home"}
                />
              ))}
            </nav>

            {/* Divider */}
            <div className="my-2 h-px bg-border" role="separator" />

            {/* Secondary nav */}
            <nav aria-label="Secondary">
              {sidebarSecondary.map((item) => {
                // Share opens the invite-link dialog (leader-only, hidden
                // entirely for other members) instead of navigating.
                if ("action" in item) {
                  if (!isLeader) return null
                  return (
                    <button
                      key={item.id}
                      id={item.id}
                      type="button"
                      onClick={() => void openShare()}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                    >
                      <item.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      {item.label}
                    </button>
                  )
                }
                return <SidebarNavLink key={item.id} item={item} active={false} />
              })}
            </nav>

            {/* Divider */}
            <div className="my-2 h-px bg-border" role="separator" />

            {/* Progress card — live calculation from active group's data */}
            <SidebarProgress
              tasks={taskList}
              sources={sourceList}
              hasActiveGroup={!!activeGroup}
            />

            {/* Team avatars - uses real active group members */}
            {activeGroup ? (
              <Link
                href="/team"
                title="View team"
                aria-label="View team"
                className="mt-3 block rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-secondary/40"
              >
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  {activeGroup.name}
                </p>
                <AvatarStack people={groupMembers} max={5} />
                <p className="mt-2 text-xs text-muted-foreground">{groupMembers.length} member{groupMembers.length === 1 ? "" : "s"}</p>
              </Link>
            ) : (
              <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Research Team</p>
                <p className="text-[0.68rem] text-muted-foreground">No active group selected.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle sidebar"
          className="fixed bottom-4 left-4 z-40 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-brand to-lavender text-white shadow-lg shadow-brand/30 lg:hidden"
        >
          {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        {/* ── Main content ─────────────────────────────────────── */}
        <main
          className={cn(
            "flex-1 min-w-0 px-4 py-6 sm:px-6 sm:py-8 transition-[padding] duration-300",
            aiOpen ? "lg:pr-[23.5rem]" : "",
          )}
        >
          {/* Search bar (Drive-style, full-width) */}
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15 transition-all">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="home-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chapters, tasks, sources…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
              aria-label="Search workspace"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Welcome heading & Group switcher */}
          {!searchQuery && (
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {greeting}, {firstName} 👋
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeGroup ? (
                    <>
                      Working in <span className="font-semibold text-foreground">{activeGroup.name}</span>
                      {" "}— your research workspace.
                    </>
                  ) : (
                    <>
                      Welcome to <span className="font-medium text-foreground">{project.shortName}</span>
                      {" "}— your research workspace.
                    </>
                  )}
                </p>
              </div>

              {groups.length > 0 && (
                <div className="shrink-0">
                  <GroupSwitcher
                    groups={groups}
                    activeGroup={activeGroup}
                    onSelectGroup={handleSelectGroup}
                    onOpenCreateModal={() => setCreateGroupModalOpen(true)}
                    onGroupDeleted={handleGroupDeleted}
                    onGroupUpdated={handleGroupUpdated}
                    loading={switchingGroup}
                  />
                </div>
              )}
            </div>
          )}

          {searchQuery && (
            <p className="mb-6 text-sm text-muted-foreground">
              Showing results for{" "}
              <span className="font-medium text-foreground">"{searchQuery}"</span>
            </p>
          )}

          {!loadingGroups && groups.length === 0 ? (
            <div className="my-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 p-8 sm:p-14 text-center shadow-sm">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-lavender/15 text-brand shadow-sm mb-4">
                <Users className="size-8" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                No active research group found
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                To start organizing research chapters, assigning tasks, citing sources, and tracking team contributions, create or join a research group with your collaborators.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/account#collaborators"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                >
                  <UserPlus className="size-4" />
                  Find Collaborators & Create Group
                </Link>
                <button
                  type="button"
                  onClick={() => setCreateGroupModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <FolderPlus className="size-4" />
                  Create Group Now
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
            {/* ── Research files section ── */}
            <section aria-labelledby="folders-heading">
              <SectionHeader
                title="Research files"
                collapsed={foldersCollapsed}
                onToggle={() => setFoldersCollapsed((v) => !v)}
                action={
                  <div className="flex items-center gap-3">
                    {filteredFolders.length > FOLDER_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setFoldersExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                      >
                        {foldersExpanded ? "Show less" : "View all"}
                        {!foldersExpanded && (
                          <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}
                    {folderList.length > 0 && (
                      <button
                        type="button"
                        id="btn-add-folder"
                        onClick={() => setCreateFolderOpen(true)}
                        title="New folder"
                        aria-label="New folder"
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-brand/50 hover:text-brand hover:bg-brand/5"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <ViewToggle mode={folderView} onChange={setFolderView} />
                  </div>
                }
              />

              {downloadNotice && (
                <p className="mt-2 text-xs text-muted-foreground" role="status">
                  {downloadNotice}
                </p>
              )}

              {!foldersCollapsed && (
                <>
                  {folderList.length === 0 ? (
                    /* Empty state: single card/button in place of the grid */
                    <button
                      type="button"
                      onClick={() => setCreateFolderOpen(true)}
                      className="mt-3 flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-muted-foreground transition-all hover:border-brand/50 hover:bg-card hover:text-brand"
                    >
                      <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-brand shadow-sm">
                        <Plus className="size-5" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-semibold text-foreground">+ New folder</span>
                      <span className="text-xs text-muted-foreground">No research folders yet. Click to create your first folder.</span>
                    </button>
                  ) : (
                    <>
                      {folderView === "grid" && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {visibleFolders.map((folder) => (
                            <FolderCard
                              key={folder.id}
                              folder={folder}
                              isOwner={isFolderOwner(folder)}
                              isLeader={isLeader}
                              canDelete={canDeleteFolder(folder)}
                              onDelete={(id) => requestDelete("folder", id)}
                              onEdit={(f) => {
                                setEditingFolder(f)
                                setCreateFolderOpen(true)
                              }}
                              onDownload={handleDownloadFolder}
                              onDetails={(f) => setDetailsFolder(f)}
                              onMerge={(f) => {
                                setMergeTargetId(null)
                                setMergeError(null)
                                setMergeSource(f)
                              }}
                              drag={{
                                sourceId: dragSource?.id ?? null,
                                overId: dragOverId,
                                active: dragSource !== null,
                                pressingId: pressId,
                                bind: bindFolderDrag,
                                consumeDragEnd,
                              }}
                            />
                          ))}
                          {!foldersExpanded && filteredFolders.length > FOLDER_LIMIT && (
                            <button
                              type="button"
                              onClick={() => setFoldersExpanded(true)}
                              title="Show all folders"
                              aria-label="Show all folders"
                              className="flex min-h-[4rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground transition-colors hover:border-brand/50 hover:bg-card hover:text-brand"
                            >
                              <ArrowRight className="size-5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                      {folderView === "list" && (
                        <div className="mt-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                          <div className={cn("hidden sm:grid items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", FOLDER_LIST_GRID)}>
                            <span className="pl-11">
                              <ListSortHeader
                                label="Name"
                                sortKey="name"
                                activeKey={folderSort.key}
                                dir={folderSort.dir}
                                onToggle={toggleFolderSort}
                              />
                            </span>
                            <ListSortHeader
                              label="Date uploaded"
                              sortKey="date"
                              activeKey={folderSort.key}
                              dir={folderSort.dir}
                              onToggle={toggleFolderSort}
                            />
                            <ListSortHeader
                              label="File size"
                              sortKey="size"
                              activeKey={folderSort.key}
                              dir={folderSort.dir}
                              onToggle={toggleFolderSort}
                            />
                            <span />
                          </div>
                          <ul className="divide-y divide-border/60 px-2 py-1">
                            {visibleFolders.map((folder) => (
                              <FolderRow
                                key={folder.id}
                                folder={folder}
                                isOwner={isFolderOwner(folder)}
                                isLeader={isLeader}
                                canDelete={canDeleteFolder(folder)}
                                onDelete={(id) => requestDelete("folder", id)}
                                onEdit={(f) => {
                                  setEditingFolder(f)
                                  setCreateFolderOpen(true)
                                }}
                                onDownload={handleDownloadFolder}
                                onDetails={(f) => setDetailsFolder(f)}
                                onMerge={(f) => {
                                  setMergeTargetId(null)
                                  setMergeError(null)
                                  setMergeSource(f)
                                }}
                                drag={{
                                  sourceId: dragSource?.id ?? null,
                                  overId: dragOverId,
                                  active: dragSource !== null,
                                  pressingId: pressId,
                                  bind: bindFolderDrag,
                                  consumeDragEnd,
                                }}
                              />
                            ))}
                            {!foldersExpanded && filteredFolders.length > FOLDER_LIMIT && (
                              <li>
                                <button
                                  type="button"
                                  onClick={() => setFoldersExpanded(true)}
                                  title="Show all folders"
                                  aria-label="Show all folders"
                                  className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-brand"
                                >
                                  <ArrowRight className="size-4" aria-hidden="true" />
                                </button>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </section>

            {/* ── Research chapters section ── */}
            <section aria-labelledby="chapters-heading">
              <SectionHeader
                title="Research chapters"
                collapsed={chaptersCollapsed}
                onToggle={() => setChaptersCollapsed((v) => !v)}
                action={
                  <div className="flex items-center gap-3">
                    <Link
                      href="/research"
                      className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    {chapterList.length > 0 && (
                      <button
                        type="button"
                        id="btn-add-chapter"
                        onClick={() => setCreateChapterOpen(true)}
                        title="Add chapter"
                        aria-label="Add chapter"
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-brand/50 hover:text-brand hover:bg-brand/5"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <ViewToggle mode={chapterView} onChange={setChapterView} />
                  </div>
                }
              />

              {!chaptersCollapsed && (
                <>
                  {chapterList.length === 0 ? (
                    /* Empty state: single card/button in place of the list/grid */
                    <button
                      type="button"
                      onClick={() => setCreateChapterOpen(true)}
                      className="mt-3 flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-muted-foreground transition-all hover:border-brand/50 hover:bg-card hover:text-brand"
                    >
                      <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-brand shadow-sm">
                        <Plus className="size-5" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-semibold text-foreground">+ New research chapter</span>
                      <span className="text-xs text-muted-foreground">No research chapters yet. Click to create your first chapter.</span>
                    </button>
                  ) : (
                    <>
                      {chapterView === "grid" && (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {visibleChapters.map((chapter) => (
                            <ChapterFolderCard
                              key={chapter.id}
                              chapter={chapter}
                              tasks={taskList}
                              onOpen={(ch) => router.push(`/chapters/${ch.id}`)}
                              onDelete={(id) => requestDelete("chapter", id)}
                              onEdit={(ch) => {
                                setEditingChapter(ch)
                                setCreateChapterOpen(true)
                              }}
                            />
                          ))}
                          {filteredChapters.length > FOLDER_LIMIT && (
                            <Link
                              href="/research"
                              title="View all chapters"
                              aria-label="View all chapters"
                              className="flex min-h-[4rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground transition-colors hover:border-brand/50 hover:bg-card hover:text-brand"
                            >
                              <ArrowRight className="size-5" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      )}
                      {chapterView === "list" && (
                        <div className="mt-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                          <div className={cn("hidden sm:grid items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", CHAPTER_GRID)}>
                            <span className="pl-11">
                              <ListSortHeader
                                label="Chapter name"
                                sortKey="name"
                                activeKey={chapterSort.key}
                                dir={chapterSort.dir}
                                onToggle={toggleChapterSort}
                              />
                            </span>
                            <span>Label</span>
                            <ListSortHeader
                              label="Task completion"
                              sortKey="completion"
                              activeKey={chapterSort.key}
                              dir={chapterSort.dir}
                              onToggle={toggleChapterSort}
                            />
                            <span>Tasks</span>
                            <span />
                          </div>
                          <ul className="divide-y divide-border/60 px-2 py-1">
                            {visibleChapters.map((chapter) => (
                              <ChapterRow
                                key={chapter.id}
                                chapter={chapter}
                                tasks={taskList}
                                onOpen={(ch) => router.push(`/chapters/${ch.id}`)}
                                onDelete={(id) => requestDelete("chapter", id)}
                                onEdit={(ch) => {
                                  setEditingChapter(ch)
                                  setCreateChapterOpen(true)
                                }}
                              />
                            ))}
                            {filteredChapters.length > FOLDER_LIMIT && (
                              <li>
                                <Link
                                  href="/research"
                                  title="View all chapters"
                                  aria-label="View all chapters"
                                  className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-brand"
                                >
                                  <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </section>

            {/* ── Sources & citations section ───────────────────────────── */}
            <section aria-labelledby="sources-heading">
              <SectionHeader
                title="Sources & citations"
                collapsed={sourcesCollapsed}
                onToggle={() => setSourcesCollapsed((v) => !v)}
                action={
                  <div className="flex items-center gap-3">
                    <Link
                      href="/sources"
                      className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    {sourceList.length > 0 && (
                      <button
                        type="button"
                        id="btn-add-source"
                        onClick={() => setCreateSourceOpen(true)}
                        title="Add source"
                        aria-label="Add source"
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-brand/50 hover:text-brand hover:bg-brand/5"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <ViewToggle mode={sourceView} onChange={setSourceView} />
                  </div>
                }
              />

              {!sourcesCollapsed && (
                <>
                  {sourceList.length === 0 ? (
                    /* Empty state: single card/button in place of the list/table */
                    <button
                      type="button"
                      onClick={() => setCreateSourceOpen(true)}
                      className="mt-3 flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-muted-foreground transition-all hover:border-brand/50 hover:bg-card hover:text-brand"
                    >
                      <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-brand shadow-sm">
                        <Plus className="size-5" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-semibold text-foreground">+ New source</span>
                      <span className="text-xs text-muted-foreground">No sources saved yet. Click to cite your first article, paper, or URL.</span>
                    </button>
                  ) : (
                    <>
                      {sourceView === "list" && (
                        <div className="mt-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                          {/* List header with identical column widths as rows */}
                          <div className={cn("hidden sm:grid items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", SOURCE_GRID)}>
                            <span className="pl-11">
                              <ListSortHeader
                                label="Title"
                                sortKey="title"
                                activeKey={sourceSort.key}
                                dir={sourceSort.dir}
                                onToggle={toggleSourceSort}
                              />
                            </span>
                            <span>Author</span>
                            <span>Year</span>
                            <span>Status</span>
                            <span />
                          </div>
                          <ul className="divide-y divide-border/60 px-2 py-1">
                            {visibleSources.map((source) => (
                              <SourceRow
                                key={source.id}
                                source={source}
                                viewMode="list"
                                chapters={chapterList}
                                onDelete={(id) => requestDelete("source", id)}
                                onToggleStatus={handleToggleSourceStatus}
                                onEdit={(s) => {
                                  setEditingSource(s)
                                  setCreateSourceOpen(true)
                                }}
                              />
                            ))}
                            {filteredSources.length > FOLDER_LIMIT && (
                              <li>
                                <Link
                                  href="/sources"
                                  title="View all sources"
                                  aria-label="View all sources"
                                  className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-brand"
                                >
                                  <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {sourceView === "grid" && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {visibleSources.map((source) => (
                            <SourceRow
                              key={source.id}
                              source={source}
                              viewMode="grid"
                              chapters={chapterList}
                              onDelete={(id) => requestDelete("source", id)}
                              onToggleStatus={handleToggleSourceStatus}
                              onEdit={(s) => {
                                setEditingSource(s)
                                setCreateSourceOpen(true)
                              }}
                            />
                          ))}
                          {filteredSources.length > FOLDER_LIMIT && (
                            <Link
                              href="/sources"
                              title="View all sources"
                              aria-label="View all sources"
                              className="flex min-h-[4rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground transition-colors hover:border-brand/50 hover:bg-card hover:text-brand"
                            >
                              <ArrowRight className="size-5" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </section>

            {/* ── Research tasks section ──────── */}
            <section aria-labelledby="tasks-heading">
              <SectionHeader
                title="Research tasks"
                collapsed={tasksCollapsed}
                onToggle={() => setTasksCollapsed((v) => !v)}
                action={
                  <div className="flex items-center gap-3">
                    <Link
                      href="/tasks"
                      className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    {taskList.length > 0 && isLeader && (
                      <button
                        type="button"
                        id="btn-add-task"
                        onClick={() => setCreateTaskOpen(true)}
                        title="Add task"
                        aria-label="Add task"
                        className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-brand/50 hover:text-brand hover:bg-brand/5"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <ViewToggle mode={taskView} onChange={setTaskView} />
                  </div>
                }
              />

              {!tasksCollapsed && (
                <>
                  {taskList.length === 0 ? (
                    isLeader ? (
                      /* Empty state: single card/button in place of the list/table */
                      <button
                        type="button"
                        onClick={() => setCreateTaskOpen(true)}
                        className="mt-3 flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-muted-foreground transition-all hover:border-brand/50 hover:bg-card hover:text-brand"
                      >
                        <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-brand shadow-sm">
                          <Plus className="size-5" aria-hidden="true" />
                        </span>
                        <span className="text-sm font-semibold text-foreground">+ New research task</span>
                        <span className="text-xs text-muted-foreground">No tasks assigned yet. Click to create and assign your first research task.</span>
                      </button>
                    ) : (
                      <div className="mt-3 flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
                        <span className="text-sm font-semibold text-foreground">No tasks yet</span>
                        <span className="text-xs text-muted-foreground">Tasks assigned by your group leader will appear here.</span>
                      </div>
                    )
                  ) : (
                    <>
                      {taskView === "list" && (
                        <div className="mt-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                          {/* List header with identical column widths as rows */}
                          <div className={cn("hidden sm:grid items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", TASK_GRID)}>
                            <span className="pl-11">
                              <ListSortHeader
                                label="Task name"
                                sortKey="name"
                                activeKey={taskSort.key}
                                dir={taskSort.dir}
                                onToggle={toggleTaskSort}
                              />
                            </span>
                            <span>Chapter</span>
                            <span>Assignee</span>
                            <ListSortHeader
                              label="Date created"
                              sortKey="created"
                              activeKey={taskSort.key}
                              dir={taskSort.dir}
                              onToggle={toggleTaskSort}
                            />
                            <span>Status</span>
                            <span />
                          </div>
                          <ul className="divide-y divide-border/60 px-2 py-1">
                            {visibleTasks.map((task) => (
                              <TaskRow
                                key={task.id}
                                task={task}
                                viewMode="list"
                                members={groupMembers}
                                onDelete={isLeader ? (id) => requestDelete("task", id) : undefined}
                                onToggleStatus={handleToggleTaskStatus}
                                onEdit={
                                  isLeader
                                    ? (t) => {
                                        setEditingTask(t)
                                        setCreateTaskOpen(true)
                                      }
                                    : undefined
                                }
                              />
                            ))}
                            {filteredTasks.length > FOLDER_LIMIT && (
                              <li>
                                <Link
                                  href="/tasks"
                                  title="View all tasks"
                                  aria-label="View all tasks"
                                  className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-brand"
                                >
                                  <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {taskView === "grid" && (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {visibleTasks.map((task) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              viewMode="grid"
                              members={groupMembers}
                              onDelete={isLeader ? (id) => requestDelete("task", id) : undefined}
                              onToggleStatus={handleToggleTaskStatus}
                              onEdit={
                                isLeader
                                  ? (t) => {
                                      setEditingTask(t)
                                      setCreateTaskOpen(true)
                                    }
                                  : undefined
                              }
                            />
                          ))}
                          {filteredTasks.length > FOLDER_LIMIT && (
                            <Link
                              href="/tasks"
                              title="View all tasks"
                              aria-label="View all tasks"
                              className="flex min-h-[4rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground transition-colors hover:border-brand/50 hover:bg-card hover:text-brand"
                            >
                              <ArrowRight className="size-5" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </section>

            {/* ── Recent activity strip ─────────────────────────────────── */}
            {!searchQuery && (
              <section aria-labelledby="activity-heading">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h2
                    id="activity-heading"
                    className="text-sm font-semibold text-foreground"
                  >
                    Recent activity
                  </h2>
                  {activityList.length > 0 && (
                    <Link
                      href="/activity"
                      className="ml-auto flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
                {activityList.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center">
                    <Activity className="size-7 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">No activity yet. Actions you take will appear here.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                    <ul className="divide-y divide-border/60 px-4">
                      {activityList.slice(0, RECENT_ACTIVITY_LIMIT).map((activity) => {
                        const actor = displayActivityActor(groupMembers, activity)
                        const displayName = fullNameOf(actor) || "Member"
                        const displayInitials = actor.initials
                        const displayColor = actor.color
                        return (
                          <li key={activity.id} className="flex items-center gap-4 py-3">
                            <span
                              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white ${displayColor}`}
                              aria-hidden="true"
                            >
                              {displayInitials}
                            </span>
                            <span className="flex-1 min-w-0 text-sm text-muted-foreground leading-snug">
                              <span className="font-medium text-foreground">
                                {firstNameOf(actor) || displayName}
                              </span>{" "}
                              {activity.action}{" "}
                              <span className="font-medium text-foreground">
                                {activity.target}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {timeAgo(activity.createdAt) ?? activity.time}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Empty state when search has no results */}
            {searchQuery &&
              filteredChapters.length === 0 &&
              filteredTasks.length === 0 &&
              filteredSources.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <span className="flex size-16 items-center justify-center rounded-full bg-secondary">
                    <Search className="size-7 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium text-foreground">No results found</p>
                  <p className="text-sm text-muted-foreground">
                    Nothing matched &ldquo;{searchQuery}&rdquo;. Try a different keyword.
                  </p>
                </div>
              )}
          </div>
          )}
        </main>

        {/* AI Guide panel */}
        <AiResearchGuide open={aiOpen} onClose={() => setAiOpen(false)} />

        {/* Floating Modals / Panels */}
        <NewFolderModal
          open={createFolderOpen}
          onClose={() => {
            setCreateFolderOpen(false)
            setEditingFolder(null)
          }}
          onCreate={handleCreateFolder}
          initial={editingFolder}
          members={groupMembers}
          canEditAccess={!editingFolder || editingFolder.createdBy === currentUser?.id}
        />
        {detailsFolder && (
          <FolderDetailsDialog
            open={Boolean(detailsFolder)}
            onClose={() => setDetailsFolder(null)}
            folder={detailsFolder}
            groupId={activeGroup?.id ?? ""}
            groupName={activeGroup?.name ?? "your research group"}
            creatorName={(() => {
              const m = groupMembers.find((gm) => gm.id === detailsFolder.createdBy)
              return m ? m.name : "Former member"
            })()}
          />
        )}
        {mergeSource && !mergeTargetId && (
          <MergeTargetDialog
            open={Boolean(mergeSource)}
            onClose={() => setMergeSource(null)}
            onPick={(targetId) => setMergeTargetId(targetId)}
            sourceName={mergeSource.name}
            targets={mergeTargets}
          />
        )}
        {dragSource && previewPos && grabRef.current && (
          <FolderDragPreview
            folder={dragSource}
            variant={grabRef.current.variant}
            isOwner={isFolderOwner(dragSource)}
            width={grabRef.current.w}
            height={grabRef.current.h}
            x={previewPos.x}
            y={previewPos.y}
            offsetX={grabRef.current.ox}
            offsetY={grabRef.current.oy}
          />
        )}
        {mergeSource && mergeTarget && (
          <RemoveMemberDialog
            open={Boolean(mergeSource && mergeTarget)}
            memberName={null}
            groupName={null}
            loading={merging}
            error={mergeError}
            title="Merge folders?"
            subtitle="The source folder will be deleted."
            message={
              <span>
                Move everything from{" "}
                <span className="font-semibold text-foreground">“{mergeSource.name}”</span>{" "}
                into{" "}
                <span className="font-semibold text-foreground">“{mergeTarget.name}”</span>?
                Files with the same name are kept as copies. “{mergeSource.name}” will be
                deleted afterwards. This cannot be undone.
              </span>
            }
            confirmLabel="Merge folders"
            confirmingLabel="Merging…"
            onClose={() => {
              if (!merging) resetMergeFlow()
            }}
            onConfirm={handleConfirmMerge}
          />
        )}
        <NewChapterModal
          open={createChapterOpen}
          onClose={() => {
            setCreateChapterOpen(false)
            setEditingChapter(null)
          }}
          onCreate={handleCreateChapter}
          initial={editingChapter}
        />
        <NewTaskModal
          open={createTaskOpen}
          onClose={() => {
            setCreateTaskOpen(false)
            setEditingTask(null)
          }}
          chapters={chapterList}
          members={groupMembers}
          onCreate={handleCreateTask}
          initial={editingTask}
        />
        <NewSourceModal
          open={createSourceOpen}
          onClose={() => {
            setCreateSourceOpen(false)
            setEditingSource(null)
          }}
          onCreate={handleCreateSource}
          initial={editingSource}
          chapters={chapterList}
        />
        <CreateGroupModal
          open={createGroupModalOpen}
          onClose={() => setCreateGroupModalOpen(false)}
          collaborators={acceptedCollaborators}
          onCreated={handleGroupCreated}
        />

        {/* Share dialog (leader-only invite link, same dialog pattern) */}
        <RemoveMemberDialog
          open={shareOpen}
          memberName={null}
          groupName={null}
          error={inviteError}
          title="Share group"
          subtitle={
            activeGroup?.name
              ? `Invite people to “${activeGroup.name}”`
              : "Invite people to your group"
          }
          message={
            <span className="block space-y-3">
              <span className="block text-xs leading-relaxed text-muted-foreground">
                Anyone with this link can request to join. Joining never creates a connection —
                new members stay “Not connected” unless they connect separately.
              </span>
              {inviteLoading ? (
                <span className="block text-xs text-muted-foreground">Loading invite link…</span>
              ) : invite ? (
                <>
                  <span className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {inviteUrl()}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">Invite link</span>
                      <span className="block text-xs text-muted-foreground">
                        {invite.enabled ? "On — new people can request to join." : "Off"}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1 rounded-xl border border-border bg-muted/30 p-1" role="group" aria-label="Invite link">
                      {(
                        [
                          { v: true, label: "On" },
                          { v: false, label: "Off" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          aria-pressed={invite.enabled === opt.v}
                          disabled={inviteToggling}
                          onClick={() => {
                            if (invite.enabled !== opt.v) void toggleInvite()
                          }}
                          className={
                            invite.enabled === opt.v
                              ? "rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
                              : "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </span>
                  </span>
                  {!invite.enabled && (
                    <span className="block rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      The link is off — nobody new can request to join until you turn it back on.
                    </span>
                  )}
                </>
              ) : null}
            </span>
          }
          cancelLabel="Close"
          confirmLabel={copied ? "Copied" : "Copy link"}
          tone="brand"
          icon={<Share2 className="size-5" aria-hidden="true" />}
          onClose={() => {
            setShareOpen(false)
            setInviteError(null)
          }}
          onConfirm={() => void copyInviteLink()}
        />

        {/* Shared delete confirmation (chapters, tasks, sources) */}
        <RemoveMemberDialog
          open={Boolean(pendingDelete)}
          memberName={pendingDelete?.name ?? null}
          groupName={null}
          loading={deleting}
          error={deleteError}
          title={
            pendingDelete?.kind === "chapter"
              ? "Delete Chapter"
              : pendingDelete?.kind === "task"
                ? "Delete Task"
                : pendingDelete?.kind === "folder"
                  ? "Delete Folder"
                  : "Delete Source"
          }
          subtitle="This action cannot be undone."
          message={deleteMessage()}
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
      </div>
    </div>
  )
}
