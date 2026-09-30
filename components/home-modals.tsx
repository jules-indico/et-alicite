"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Upload,
  Folder,
  FileText,
  BookMarked,
  BookOpen,
  CheckSquare,
  Sparkles,
  Star,
  Loader2,
  AlertCircle,
  FileCode,
  File,
  Paperclip,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadToBlob } from "@/lib/blob-upload"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { SOURCE_TYPES } from "@/lib/apa"
import type { Chapter, Task, Source, Member, TaskStatus } from "@/lib/research-data"
import type { DbFolder, DbFile } from "@/lib/server/auth-db"

// ─── Modal Shell Component with Backdrop & Outside Click ────────────────────

interface ModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
}

function ModalShell({ open, onClose, title, description, children }: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  // Shared dismiss: only a genuine outside click (press AND release outside
  // the panel) closes it — text-selection drags starting inside never do.
  useDismissOnOutsideClick({ refs: panelRef, enabled: open, onDismiss: onClose })

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/25 backdrop-blur-sm animate-in fade-in duration-200"
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={panelRef}
        className="relative flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── New Research Chapter Modal ─────────────────────────────────────────────

const AVAILABLE_ICONS = [
  { id: "Folder", label: "Folder", icon: Folder },
  { id: "FileText", label: "Document", icon: FileText },
  { id: "BookMarked", label: "Bookmarked", icon: BookMarked },
  { id: "BookOpen", label: "Book", icon: BookOpen },
  { id: "CheckSquare", label: "Checklist", icon: CheckSquare },
  { id: "Sparkles", label: "Sparkles", icon: Sparkles },
  { id: "Star", label: "Star", icon: Star },
]

const EMOJI_OPTIONS = ["📚", "🔬", "📊", "💡", "📝", "🏷️", "🧠", "🔍"]

const COLOR_TAGS = [
  { id: "", label: "Default", class: "bg-muted text-muted-foreground border-border" },
  { id: "brand", label: "Purple", class: "bg-brand/20 text-brand border-brand/40" },
  { id: "emerald", label: "Emerald", class: "bg-[oklch(0.68_0.13_155)]/20 text-[oklch(0.45_0.12_155)] border-[oklch(0.68_0.13_155)]/40" },
  { id: "sky", label: "Sky", class: "bg-sky/20 text-sky-600 dark:text-sky-400 border-sky/40" },
  { id: "amber", label: "Amber", class: "bg-[oklch(0.78_0.12_75)]/20 text-[oklch(0.6_0.15_75)] border-[oklch(0.78_0.12_75)]/40" },
  { id: "rose", label: "Rose", class: "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40" },
]

export function NewChapterModal({
  open,
  onClose,
  onCreate,
  initial,
}: {
  open: boolean
  onClose: () => void
  onCreate: (chapter: Omit<Chapter, "id">) => void
  /** When provided, the modal edits this chapter: fields are pre-filled. */
  initial?: Chapter | null
}) {
  const isEdit = !!initial
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [selectedIcon, setSelectedIcon] = useState(initial?.iconName && !EMOJI_OPTIONS.includes(initial.iconName) ? initial.iconName : "Folder")
  const [selectedEmoji, setSelectedEmoji] = useState(initial?.iconName && EMOJI_OPTIONS.includes(initial.iconName) ? initial.iconName : "")
  const [selectedColor, setSelectedColor] = useState(initial?.colorTag ?? "")
  // Chapter status is deprecated as a progress signal (progress now derives
  // from attributed tasks). The stored value is preserved untouched.
  const [files, setFiles] = useState<File[]>([])
  // Attachment mode: a chapter holds EITHER uploaded file(s) OR one URL.
  const [attachMode, setAttachMode] = useState<"file" | "url">(
    initial?.attachmentUrl ? "url" : "file"
  )
  const [attachUrl, setAttachUrl] = useState(initial?.attachmentUrl ?? "")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-sync fields every time the modal opens (create vs. edit, or a
  // different chapter being edited) since the modal stays mounted.
  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? "")
    setDescription(initial?.description ?? "")
    const icon = initial?.iconName ?? "Folder"
    if (EMOJI_OPTIONS.includes(icon)) {
      setSelectedEmoji(icon)
      setSelectedIcon("")
    } else {
      setSelectedIcon(icon)
      setSelectedEmoji("")
    }
    setSelectedColor(initial?.colorTag ?? "")
    setFiles([])
    setAttachMode(initial?.attachmentUrl ? "url" : "file")
    setAttachUrl(initial?.attachmentUrl ?? "")
    setUploading(false)
    setError("")
  }, [open, initial])

  function resetForm() {
    setTitle("")
    setDescription("")
    setSelectedIcon("Folder")
    setSelectedEmoji("")
    setSelectedColor("")
    setFiles([])
    setAttachMode("file")
    setAttachUrl("")
    setUploading(false)
    setError("")
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const added = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...added])
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function isValidAttachmentUrl(value: string): boolean {
    try {
      const parsed = new URL(value.trim())
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  async function uploadSelectedFiles(): Promise<
    { name: string; size: number; url: string; storedName: string; blobUrl?: string }[] | null
  > {
    const uploaded: { name: string; size: number; url: string; storedName: string; blobUrl?: string }[] = []
    for (const file of files) {
      let storedName: string
      try {
        ;({ storedName } = await uploadToBlob("attachment", file))
      } catch {
        setError(`Upload failed for "${file.name}". Please check your connection and try again.`)
        return null
      }
      let res: Response
      try {
        res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            storedName,
          }),
        })
      } catch {
        setError(`Upload failed for "${file.name}". Please check your connection and try again.`)
        return null
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.file) {
        setError(data.error || `Upload failed for "${file.name}".`)
        return null
      }
      uploaded.push({
        name: data.file.name,
        size: data.file.size,
        url: data.file.url,
        storedName: data.file.storedName,
        blobUrl: data.file.blobUrl,
      })
    }
    return uploaded
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError("Chapter name is required.")
      return
    }

    if (attachMode === "url") {
      if (!isValidAttachmentUrl(attachUrl)) {
        setError("Please enter a valid URL starting with http:// or https://.")
        return
      }
      // URL mode drops any previously uploaded files (mutually exclusive).
      onCreate({
        label: initial?.label ?? `Chapter`,
        title: title.trim(),
        description: description.trim() || undefined,
        status: initial?.status ?? "In progress",
        progress: initial?.progress ?? 0,
        sectionsComplete: initial?.sectionsComplete ?? 0,
        sectionsTotal: initial?.sectionsTotal ?? 0,
        sources: 0,
        assigned: initial?.assigned ?? [],
        updated: "Just now",
        iconName: selectedEmoji || selectedIcon,
        colorTag: selectedColor || undefined,
        files: [],
        attachmentUrl: attachUrl.trim(),
      })

      resetForm()
      onClose()
      return
    }

    // File mode: persist bytes first so the attachment is genuinely openable.
    setUploading(true)
    setError("")
    try {
      const uploaded = await uploadSelectedFiles()
      if (!uploaded) {
        setUploading(false)
        return
      }
      onCreate({
        label: initial?.label ?? `Chapter`,
        title: title.trim(),
        description: description.trim() || undefined,
        status: initial?.status ?? "In progress",
        progress: initial?.progress ?? 0,
        sectionsComplete: initial?.sectionsComplete ?? 0,
        sectionsTotal: initial?.sectionsTotal ?? 0,
        sources: (initial?.files?.length ?? 0) + uploaded.length,
        assigned: initial?.assigned ?? [],
        updated: "Just now",
        iconName: selectedEmoji || selectedIcon,
        colorTag: selectedColor || undefined,
        files: [...(initial?.files ?? []), ...uploaded],
        attachmentUrl: "",
      })

      resetForm()
      onClose()
    } finally {
      setUploading(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title={isEdit ? "Edit Research Chapter" : "Create Research Chapter"}
      description={isEdit ? "Update this chapter's details." : "Add a new chapter or major section to organize research findings."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Chapter Name */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Chapter Name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error) setError("")
            }}
            placeholder="e.g. Chapter 4: Results and Analysis"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
        </div>

        {/* Short Description */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Short Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Overview of experimental findings and statistical data"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Displays under the chapter title on the folder card.
          </p>
        </div>

        {/* Icon & Emoji Picker */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Icon Picker <span className="text-muted-foreground font-normal">(choose icon or emoji)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {AVAILABLE_ICONS.map((item) => {
              const IconComp = item.icon
              const isSelected = selectedIcon === item.id && !selectedEmoji
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedIcon(item.id)
                    setSelectedEmoji("")
                  }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl border transition-all",
                    isSelected
                      ? "border-brand bg-brand/10 text-brand ring-2 ring-brand/30"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                  title={item.label}
                >
                  <IconComp className="size-4" />
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_OPTIONS.map((emoji) => {
              const isSelected = selectedEmoji === emoji
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setSelectedEmoji(emoji)
                    setSelectedIcon("")
                  }}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl border text-sm transition-all",
                    isSelected
                      ? "border-brand bg-brand/10 ring-2 ring-brand/30"
                      : "border-border bg-card hover:bg-secondary"
                  )}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
        </div>

        {/* Color Tag */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Color Tag <span className="text-muted-foreground font-normal">(optional, for grouping)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {COLOR_TAGS.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSelectedColor(tag.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                  tag.class,
                  selectedColor === tag.id ? "ring-2 ring-brand/50 font-semibold" : "opacity-80 hover:opacity-100"
                )}
              >
                {selectedColor === tag.id && <Check className="size-3" />}
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Attachment mode: uploaded file(s) OR one URL, never both */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Attachment <span className="text-muted-foreground font-normal">(optional — file or link, not both)</span>
          </label>
          <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="Attachment type">
            {(["file", "url"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={attachMode === mode}
                onClick={() => setAttachMode(mode)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  attachMode === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "file" ? "Upload file" : "Attach URL"}
              </button>
            ))}
          </div>
        </div>

        {attachMode === "url" && (
          <div>
            <label htmlFor="chapter-url" className="block text-xs font-semibold text-foreground mb-1">
              URL <span className="text-destructive">*</span>
            </label>
            <input
              id="chapter-url"
              type="url"
              value={attachUrl}
              onChange={(e) => {
                setAttachUrl(e.target.value)
                if (error) setError("")
              }}
              placeholder="https://example.com/paper.pdf"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Opens in a new tab when the chapter card is clicked. Attaching a URL removes any uploaded files.
            </p>
          </div>
        )}

        {/* File Upload */}
        {attachMode === "file" && (
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Upload Files <span className="text-muted-foreground font-normal">(.pdf, .docx, .txt — multiple)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card p-4 text-center cursor-pointer transition-colors hover:border-brand/50 hover:bg-secondary/30"
          >
            <Upload className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Click to upload files</span>
            <span className="text-[0.7rem] text-muted-foreground">PDF, DOCX, TXT supported</span>
          </div>

          {isEdit && initial?.files && initial.files.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {initial.files.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-2 truncate rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground font-medium">{file.name}</span>
                  <span className="text-[0.7rem] text-muted-foreground">
                    ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground font-medium">{file.name}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(idx)
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {uploading ? "Uploading…" : isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── New Research Task Modal ────────────────────────────────────────────────

export function NewTaskModal({
  open,
  onClose,
  chapters,
  members,
  onCreate,
  initial,
  defaultStatus,
}: {
  open: boolean
  onClose: () => void
  chapters: Chapter[]
  members: Member[]
  onCreate: (task: Omit<Task, "id">) => void
  /** When provided, the modal edits this task: fields are pre-filled. */
  initial?: Task | null
  /** Status pre-selected for a fresh task (stays changeable). Defaults to "To do". */
  defaultStatus?: TaskStatus
}) {
  const isEdit = !!initial
  // A task may still be assigned to a member who has since left the group.
  // Keep that assignment selectable so unrelated edits don't silently reassign.
  const departedAssigneeId =
    initial && !members.some((m) => m.id === initial.assignee) ? initial.assignee : null
  const [title, setTitle] = useState(initial?.title ?? "")
  const [assignee, setAssignee] = useState(initial?.assignee ?? members[0]?.id ?? "")
  const [chapter, setChapter] = useState(initial?.chapter ?? chapters[0]?.title ?? "")
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? defaultStatus ?? "To do")
  const [error, setError] = useState("")

  // Re-sync fields every time the modal opens since it stays mounted.
  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? "")
    setAssignee(initial?.assignee ?? members[0]?.id ?? "")
    setChapter(initial?.chapter ?? chapters[0]?.title ?? "")
    setDueDate(initial?.dueDate ?? "")
    setDescription(initial?.description ?? "")
    setStatus(initial?.status ?? defaultStatus ?? "To do")
    setError("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  function resetForm() {
    setTitle("")
    setAssignee(members[0]?.id ?? "")
    setChapter(chapters[0]?.title ?? "")
    setDueDate("")
    setDescription("")
    setStatus(defaultStatus ?? "To do")
    setError("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError("Task name is required.")
      return
    }

    // Guard against stale selections: the assignee/chapter must exist in the
    // CURRENT member/chapter lists (props can refresh while the modal sits
    // mounted). A departed assignee kept from edit mode is still accepted.
    // Never fall back to a hardcoded placeholder id.
    const validIds = new Set([...members.map((m) => m.id), ...(departedAssigneeId ? [departedAssigneeId] : [])])
    const validAssignee = validIds.has(assignee) ? assignee : members[0]?.id
    if (!validAssignee) {
      setError("No team member available to assign. Please join or select a research group first.")
      return
    }
    const validChapter = chapters.some((c) => c.title === chapter)
      ? chapter
      : (chapters[0]?.title ?? "General")
    // Stable chapter link for task-derived chapter progress (falls back to
    // the first chapter's ID, or stays unlinked when there are no chapters).
    const chapterId = chapters.find((c) => c.title === validChapter)?.id

    onCreate({
      title: title.trim(),
      assignee: validAssignee,
      chapter: validChapter,
      chapterId,
      status,
      dueDate: dueDate || undefined,
      description: description.trim() || undefined,
    })

    resetForm()
    onClose()
  }

  return (
    <ModalShell
      open={open}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title={isEdit ? "Edit Research Task" : "Create Research Task"}
      description={isEdit ? "Update this task's details." : "Assign a research task or writing assignment to a team member."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Task Name */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Task Name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error) setError("")
            }}
            placeholder="e.g. Write Theoretical Framework"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Cover gaps from 2019–2024 studies, then draft the synthesis matrix."
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Shown on the task&apos;s detail page only.
          </p>
        </div>

        {/* Assignee & Chapter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            >
              {departedAssigneeId && (
                <option value={departedAssigneeId}>
                  Former member (current assignee)
                </option>
              )}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Chapter {chapters.length === 0 && <span className="text-destructive font-normal">(no chapters)</span>}
            </label>
            <select
              value={chapter}
              disabled={chapters.length === 0}
              onChange={(e) => setChapter(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all disabled:opacity-50"
            >
              {chapters.length === 0 ? (
                <option value="">No chapters created yet</option>
              ) : (
                chapters.map((c) => (
                  <option key={c.id} value={c.title}>
                    {c.title}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Due Date & Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Due Date <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Status <span className="text-muted-foreground font-normal">(defaults to To do)</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            >
              <option value="To do">To do</option>
              <option value="In progress">In progress</option>
              <option value="Completed">Completed</option>
            </select>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Status can also be directly toggled or edited later from the table row.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            {isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── New Source & Citation Modal ────────────────────────────────────────────

export function NewSourceModal({
  open,
  onClose,
  onCreate,
  initial,
  chapters,
}: {
  open: boolean
  onClose: () => void
  onCreate: (source: Omit<Source, "id">) => void
  /** When provided, the modal edits this source: fields are pre-filled. */
  initial?: Source | null
  /** Active group's chapters for the multi-select association field. */
  chapters: Chapter[]
}) {
  const isEdit = !!initial
  const [url, setUrl] = useState(initial?.url ?? "")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [author, setAuthor] = useState(initial?.author ?? "")
  const [year, setYear] = useState<number>(initial?.year ?? new Date().getFullYear())
  const [status, setStatus] = useState<"Cited" | "Unused">(initial ? (initial.cited ? "Cited" : "Unused") : "Unused")
  const [sourceType, setSourceType] = useState<string>(initial?.sourceType ?? "other")
  const [chapterIds, setChapterIds] = useState<string[]>(initial?.chapterIds ?? [])
  // Attachment: a source holds EITHER uploaded file(s) OR one URL. The URL
  // input lives in the Attach-URL branch below and doubles as the reference
  // link — one field, no second paste.
  const [attachMode, setAttachMode] = useState<"none" | "file" | "url">(
    initial?.attachmentUrl ? "url" : initial?.files && initial.files.length > 0 ? "file" : "none"
  )
  const [attachFiles, setAttachFiles] = useState<File[]>([])
  // Last URL a successful auto-fill ran against — preserved as the reference
  // link even when the attachment itself is a file or nothing.
  const [extractedUrl, setExtractedUrl] = useState<string>("")
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState("")
  // Create-only reminder when submitting with no chapters selected.
  const [confirmNoChapters, setConfirmNoChapters] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-sync fields every time the modal opens since it stays mounted.
  useEffect(() => {
    if (!open) return
    setUrl(initial?.attachmentUrl ?? initial?.url ?? "")
    setTitle(initial?.title ?? "")
    setAuthor(initial?.author ?? "")
    setYear(initial?.year ?? new Date().getFullYear())
    setStatus(initial ? (initial.cited ? "Cited" : "Unused") : "Unused")
    setSourceType(initial?.sourceType ?? "other")
    setChapterIds(initial?.chapterIds ?? [])
    setAttachMode(initial?.attachmentUrl ? "url" : initial?.files && initial.files.length > 0 ? "file" : "none")
    setAttachFiles([])
    setExtractedUrl("")
    setUploading(false)
    setLoading(false)
    setNotice(null)
    setError("")
    setConfirmNoChapters(false)
  }, [open, initial])

  function resetForm() {
    setUrl("")
    setTitle("")
    setAuthor("")
    setYear(new Date().getFullYear())
    setStatus("Unused")
    setSourceType("other")
    setChapterIds([])
    setAttachMode("none")
    setAttachFiles([])
    setExtractedUrl("")
    setUploading(false)
    setLoading(false)
    setNotice(null)
    setError("")
    setConfirmNoChapters(false)
  }

  function toggleChapter(chapterId: string) {
    setChapterIds((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId]
    )
  }

  async function handleAutoExtract(rawUrl?: string) {
    const target = (rawUrl ?? url).trim()
    if (!target) {
      setError("Please paste a URL first to auto-fill metadata.")
      return
    }
    setError("")
    setLoading(true)
    setNotice(null)

    try {
      const res = await fetch("/api/extract-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      })
      const data = await res.json()

      if (data.success) {
        if (data.title) setTitle(data.title)
        if (data.author) setAuthor(data.author)
        if (data.year) setYear(data.year)
        // Reasonable type guess from the extraction backend (always editable).
        if (data.source === "crossref" || data.source === "arxiv" || data.source === "openalex") {
          setSourceType("journal-article")
        } else if (data.source === "page") {
          setSourceType("website")
        }
        // Remember the link that produced these fields as the reference URL.
        setExtractedUrl(target)
        const via =
          data.source === "crossref"
            ? "via Crossref"
            : data.source === "openalex"
              ? "via OpenAlex"
              : data.source === "arxiv"
                ? "via arXiv"
                : "from the page"
        setNotice(`Metadata successfully extracted ${via}! You can review or edit below.`)
      } else {
        setNotice(
          data.error ||
            "Auto-extraction service not configured (external metadata-extraction service required). Please fill in the fields below manually."
        )
      }
    } catch {
      setNotice(
        "Auto-extraction service unavailable (external metadata-extraction service required). Please fill in the fields below manually."
      )
    } finally {
      setLoading(false)
    }
  }

  // File auto-fill (no new dependencies): DOCX core properties and PDF
  // embedded metadata / DOI scan, then the existing URL endpoint for DOIs.
  async function handleAutoFillFromFile() {
    const file = attachFiles[0]
    if (!file) {
      setError("Select a file first, then auto-fill from it.")
      return
    }
    setError("")
    setLoading(true)
    setNotice(null)
    try {
      const { extractFileMetadata } = await import("@/lib/extract-file")
      const meta = await extractFileMetadata(file)
      if (!meta) {
        setNotice("Couldn't read metadata from this file. Please fill in the fields below manually.")
        return
      }
      if (meta.doi) {
        const doiUrl = `https://doi.org/${meta.doi}`
        setUrl(doiUrl)
        await handleAutoExtract(doiUrl)
        return
      }
      let filled = false
      if (meta.title) {
        setTitle(meta.title)
        filled = true
      }
      if (meta.author) {
        setAuthor(meta.author)
        filled = true
      }
      if (meta.year) {
        setYear(meta.year)
        filled = true
      }
      setNotice(
        filled
          ? "Metadata read from the file's embedded properties! You can review or edit below."
          : "Couldn't read metadata from this file. Please fill in the fields below manually."
      )
    } catch {
      setNotice("Couldn't read this file. Please fill in the fields below manually.")
    } finally {
      setLoading(false)
    }
  }

  function handleAttachFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setAttachFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }

  function removeAttachFile(index: number) {
    setAttachFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function isValidAttachmentUrl(value: string): boolean {
    try {
      const parsed = new URL(value.trim())
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  async function uploadAttachFiles(): Promise<
    { name: string; size: number; url: string; storedName: string; blobUrl?: string }[] | null
  > {
    const uploaded: { name: string; size: number; url: string; storedName: string; blobUrl?: string }[] = []
    for (const file of attachFiles) {
      let storedName: string
      try {
        ;({ storedName } = await uploadToBlob("attachment", file))
      } catch {
        setError(`Upload failed for "${file.name}". Please check your connection and try again.`)
        return null
      }
      let res: Response
      try {
        res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            storedName,
          }),
        })
      } catch {
        setError(`Upload failed for "${file.name}". Please check your connection and try again.`)
        return null
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.file) {
        setError(data.error || `Upload failed for "${file.name}".`)
        return null
      }
      uploaded.push({
        name: data.file.name,
        size: data.file.size,
        url: data.file.url,
        storedName: data.file.storedName,
        blobUrl: data.file.blobUrl,
      })
    }
    return uploaded
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError("Title is required.")
      return
    }
    if (!author.trim()) {
      setError("Author is required.")
      return
    }
    // Create-only reminder: submitting with no chapters selected opens a
    // confirmation instead of creating immediately (edit form unaffected).
    // Shown once per submit — it opens before any upload runs, so going
    // back leaves all entered data and picked files intact.
    if (!isEdit && chapterIds.length === 0) {
      setConfirmNoChapters(true)
      return
    }

    void submitCreate()
  }

  async function submitCreate() {
    // Resolve the attachment first (uploads persist bytes on submit).
    let files = initial?.files ?? []
    let attachmentUrl: string | undefined = initial?.attachmentUrl
    if (attachMode === "url") {
      // Single URL input doubles as reference link and attachment.
      if (!isValidAttachmentUrl(url)) {
        setError("Paste a valid URL above first (starting with http:// or https://).")
        return
      }
      files = []
      attachmentUrl = url.trim()
    } else if (attachMode === "file") {
      setUploading(true)
      setError("")
      try {
        const uploaded = await uploadAttachFiles()
        if (!uploaded) {
          setUploading(false)
          return
        }
        files = [...(initial?.files ?? []), ...uploaded]
        attachmentUrl = ""
      } finally {
        setUploading(false)
      }
    } else {
      // "none": drop any previous attachment only if one existed.
      if (initial?.attachmentUrl || (initial?.files && initial.files.length > 0)) {
        files = []
        attachmentUrl = ""
      }
    }

    onCreate({
      title: title.trim(),
      author: author.trim(),
      year: Number(year) || new Date().getFullYear(),
      tags: initial?.tags ?? [],
      usedIn: initial?.usedIn ?? [],
      cited: status === "Cited",
      // Reference link: the URL field in attach mode, else the last
      // successfully extracted link, else whatever was stored before.
      url: (
        attachMode === "url" ? url.trim() : extractedUrl || initial?.url || ""
      ).trim() || undefined,
      chapterIds,
      sourceType,
      files,
      attachmentUrl,
    })

    resetForm()
    onClose()
  }

  return (
    <ModalShell
      open={open}
      onClose={() => {
        // While the no-chapters reminder is open, Esc/backdrop belong to it
        // (it closes itself); the form stays put with everything intact.
        if (confirmNoChapters) return
        resetForm()
        onClose()
      }}
      title={isEdit ? "Edit Source & Citation" : "Add Source & Citation"}
      description={isEdit ? "Update this source's details." : "Add a literature reference, research paper, book, or web article."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Manual Fallback Fields Header */}
        <div className="pt-1">
          <p className="text-xs font-semibold text-foreground mb-1">
            Source Details <span className="text-muted-foreground font-normal">(manual fallback / editable)</span>
          </p>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Title <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error) setError("")
            }}
            placeholder="e.g. Self-regulated learning through intelligent tutoring systems"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
        </div>

        {/* Author & Year */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Author(s) <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={author}
              onChange={(e) => {
                setAuthor(e.target.value)
                if (error) setError("")
              }}
              placeholder="e.g. Dela Cruz & Tan"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              placeholder="2025"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            />
          </div>
        </div>

        {/* Source type (drives APA 7 formatting) */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Source type</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "Cited" | "Unused")}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          >
            <option value="Unused">Unused</option>
            <option value="Cited">Cited</option>
          </select>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Can also be directly toggled from the table row.
          </p>
        </div>

        {/* Attachment: uploaded file(s) OR the Source URL above as link */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Attachment <span className="text-muted-foreground font-normal">(optional — file or link, not both)</span>
          </label>
          <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="Attachment type">
            {(["none", "file", "url"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={attachMode === mode}
                onClick={() => setAttachMode(mode)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  attachMode === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "none" ? "None" : mode === "file" ? "Upload file" : "Attach URL"}
              </button>
            ))}
          </div>
        </div>

        {attachMode === "url" && (
          <div>
            <label htmlFor="source-attach-url" className="block text-xs font-semibold text-foreground mb-1">
              Attachment URL
            </label>
            <div className="flex items-center gap-2">
              <input
                id="source-attach-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (error) setError("")
                }}
                placeholder="https://doi.org/... or https://arxiv.org/..."
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
              <button
                type="button"
                disabled={loading || !url.trim()}
                onClick={() => handleAutoExtract()}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Extracting…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 text-brand" />
                    <span>Auto-fill from URL</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              This same link is saved as the attachment and used for summaries.
            </p>
          </div>
        )}

        {/* Notice/Flag Banner */}
        {notice && (
          <div className="flex items-start gap-2 rounded-xl bg-brand/10 p-3 text-xs text-foreground border border-brand/20">
            <AlertCircle className="size-4 shrink-0 text-brand mt-0.5" />
            <span className="leading-relaxed">{notice}</span>
          </div>
        )}

        {attachMode === "file" && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Upload Files <span className="text-muted-foreground font-normal">(.pdf, .docx, .txt — multiple)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleAttachFileChange}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card p-4 text-center cursor-pointer transition-colors hover:border-brand/50 hover:bg-secondary/30"
            >
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Click to upload files</span>
              <span className="text-[0.7rem] text-muted-foreground">PDF, DOCX, TXT supported</span>
            </div>
            <button
              type="button"
              disabled={loading || attachFiles.length === 0}
              onClick={handleAutoFillFromFile}
              className="mt-2 flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Extracting…</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5 text-brand" />
                  <span>Auto-fill from file</span>
                </>
              )}
            </button>

            {isEdit && initial?.files && initial.files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {initial.files.map((file, idx) => (
                  <li
                    key={`existing-${file.name}-${idx}`}
                    className="flex items-center gap-2 truncate rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                  >
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground font-medium">{file.name}</span>
                    <span className="text-[0.7rem] text-muted-foreground">(attached)</span>
                  </li>
                ))}
              </ul>
            )}
            {attachFiles.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {attachFiles.map((file, idx) => (
                  <li
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground font-medium">{file.name}</span>
                      <span className="text-[0.7rem] text-muted-foreground">
                        ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeAttachFile(idx)
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Chapters (multi-select — one source can span several chapters) */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Chapters{" "}
            <span className="text-muted-foreground font-normal">
              (optional, select all that apply{chapterIds.length > 0 ? ` — ${chapterIds.length} selected` : ""})
            </span>
          </label>
          {chapterIds.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {chapterIds.length > 2 ? (
                <span className="inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand">
                  {chapterIds.length} chapters
                </span>
              ) : (
                chapterIds.map((id) => {
                  const title = chapters.find((c) => c.id === id)?.title ?? "Unknown chapter"
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand"
                    >
                      <span className="max-w-32 truncate">{title}</span>
                      <button
                        type="button"
                        onClick={() => toggleChapter(id)}
                        aria-label={`Remove ${title}`}
                        className="flex items-center rounded hover:bg-brand/20"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  )
                })
              )}
            </div>
          )}
          {chapters.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              No chapters yet — create a research chapter first, then link this source to it.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background divide-y divide-border/60">
              {chapters.map((c) => {
                const checked = chapterIds.includes(c.id)
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleChapter(c.id)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                      checked ? "bg-brand/5" : "hover:bg-secondary/40"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-[0.68rem] text-muted-foreground truncate">{c.label}</p>
                    </div>
                    <div
                      className={cn(
                        "size-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                        checked ? "bg-brand border-brand text-white" : "border-border bg-background"
                      )}
                    >
                      {checked && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {uploading ? "Uploading…" : isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
      <RemoveMemberDialog
        open={confirmNoChapters}
        memberName={null}
        groupName={null}
        tone="brand"
        icon={<BookOpen className="size-5" />}
        title="No chapter selected"
        message="This source isn't attributed to any research chapter yet. Create it anyway?"
        confirmLabel="Create anyway"
        cancelLabel="Go back"
        onClose={() => setConfirmNoChapters(false)}
        onConfirm={() => {
          setConfirmNoChapters(false)
          void submitCreate()
        }}
      />
    </ModalShell>
  )
}

// ─── New Research Folder Modal ──────────────────────────────────────────────

export type AccessSetting = {
  access: "everyone" | "mine" | "selected"
  allowedIds: string[]
}

/**
 * Shared access picker (Everyone / Only me / Selected members + member
 * multi-select). Used by the folder panel, the Change-access dialog, and
 * the folder-page upload flow.
 */
export function AccessSelector({
  value,
  members,
  onChange,
}: {
  value: AccessSetting
  members: Pick<Member, "id" | "name">[]
  onChange: (next: AccessSetting) => void
}) {
  function toggleMember(id: string) {
    const has = value.allowedIds.includes(id)
    onChange({
      access: "selected",
      allowedIds: has
        ? value.allowedIds.filter((m) => m !== id)
        : [...value.allowedIds, id],
    })
  }

  return (
    <div>
      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="Who can access">
        {(
          [
            { id: "everyone", label: "Everyone" },
            { id: "mine", label: "Only me" },
            { id: "selected", label: "Selected members" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={value.access === opt.id}
            onClick={() => onChange({ access: opt.id, allowedIds: value.allowedIds })}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
              value.access === opt.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value.access === "selected" && (
        <div className="mt-2">
          {members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              No other members in this group yet.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background divide-y divide-border/60">
              {members.map((m) => {
                const checked = value.allowedIds.includes(m.id)
                return (
                  <div
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                      checked ? "bg-brand/5" : "hover:bg-secondary/40"
                    )}
                  >
                    <p className="min-w-0 truncate text-xs font-medium text-foreground">{m.name}</p>
                    <div
                      className={cn(
                        "size-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                        checked ? "bg-brand border-brand text-white" : "border-border bg-background"
                      )}
                    >
                      {checked && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            You always keep access to your own items.
          </p>
        </div>
      )}
    </div>
  )
}

export function NewFolderModal({
  open,
  onClose,
  onCreate,
  initial,
  members,
  canEditAccess = true,
}: {
  open: boolean
  onClose: () => void
  onCreate: (folder: { name: string; access: AccessSetting["access"]; allowedIds: string[] }) => void
  /** When provided, the modal renames this folder: fields are pre-filled. */
  initial?: DbFolder | null
  /** Group members for the access picker (owner sees it; others unaffected). */
  members?: Pick<Member, "id" | "name">[]
  /** Hide the access picker for editors who may rename but not re-share. */
  canEditAccess?: boolean
}) {
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name ?? "")
  const [access, setAccess] = useState<AccessSetting>({
    access: initial?.access ?? "everyone",
    allowedIds: initial?.allowedIds ?? [],
  })
  const [error, setError] = useState("")

  // Re-sync every time the modal opens since it stays mounted.
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? "")
    setAccess({ access: initial?.access ?? "everyone", allowedIds: initial?.allowedIds ?? [] })
    setError("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  function resetForm() {
    setName("")
    setAccess({ access: "everyone", allowedIds: [] })
    setError("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Folder name is required.")
      return
    }
    onCreate({ name: name.trim(), access: access.access, allowedIds: access.allowedIds })
    resetForm()
    onClose()
  }

  return (
    <ModalShell
      open={open}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title={isEdit ? "Edit folder" : "New research folder"}
      description={
        isEdit
          ? "Change the folder name and who can access it."
          : "Organize your group's uploaded files."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Folder name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError("")
            }}
            placeholder="e.g. Survey instruments"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
        </div>

        {canEditAccess && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Who can access
            </label>
            <AccessSelector value={access} members={members ?? []} onChange={setAccess} />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            {isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

/**
 * Upload-files floating panel (folder page): file picker + batch access
 * setting + progress + errors. Reuses the modal shell (press+release
 * outside to close), the shared access picker, and the same 4.5 MB cap.
 */
export function UploadFilesModal({
  open,
  onClose,
  groupId,
  folderId,
  members,
  initialFiles,
  onUploaded,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  folderId: string
  members: Pick<Member, "id" | "name">[]
  initialFiles: File[]
  onUploaded: (files: DbFile[]) => void
}) {
  const [picked, setPicked] = useState<File[]>([])
  const [access, setAccess] = useState<AccessSetting>({ access: "everyone", allowedIds: [] })
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Pre-selected files (e.g. from drag-drop) land here on open.
  useEffect(() => {
    if (!open) return
    setPicked(initialFiles)
    setAccess({ access: "everyone", allowedIds: [] })
    setUploading(false)
    setProgress(0)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function resetForm() {
    setPicked([])
    setAccess({ access: "everyone", allowedIds: [] })
    setUploading(false)
    setProgress(0)
    setError(null)
  }

  function addFiles(list: File[]) {
    setPicked((prev) => [...prev, ...list])
    if (error) setError(null)
  }

  async function handleUpload() {
    if (uploading || picked.length === 0) return
    const tooBig = picked.find((f) => f.size > Math.floor(4.5 * 1024 * 1024))
    if (tooBig) {
      setError(`"${tooBig.name}" exceeds the 4.5 MB per-file limit.`)
      return
    }
    setUploading(true)
    setProgress(0)
    setError(null)
    try {
      // Bytes go client-direct to Blob (one completed upload per file drives
      // the determinate progress bar since per-byte events aren't exposed).
      const completed: { name: string; size: number; mimeType: string; storedName: string }[] = []
      for (const f of picked) {
        const up = await uploadToBlob("research", f, { groupId, folderId })
        completed.push({ name: f.name, size: f.size, mimeType: up.mimeType, storedName: up.storedName })
        setProgress(Math.round((completed.length / picked.length) * 90))
      }
      const res = await fetch(`/api/folders/${folderId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          access: access.access,
          allowedIds: access.allowedIds,
          files: completed,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        // Best-effort: orphaned bytes stay in Blob (unguessable, unlisted).
        setError(data.error || "Upload failed. Please try again.")
        return
      }
      setProgress(100)
      onUploaded(data.files ?? [])
      resetForm()
      onClose()
    } catch {
      setError("Upload failed. Check your connection and try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={() => {
        if (!uploading) {
          resetForm()
          onClose()
        }
      }}
      title="Upload files"
      description="Pick files, choose who can see them, then upload."
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files))
              e.target.value = ""
            }}
            className="hidden"
            aria-label="Choose files to upload"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-center transition-colors hover:border-brand/50 hover:bg-secondary/30 disabled:opacity-50"
          >
            <Upload className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Choose files</span>
          </button>
          {picked.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {picked.map((file, idx) => (
                <li
                  key={`${file.name}-${file.size}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-foreground font-medium">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setPicked((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={uploading}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            New uploads visible to
          </label>
          <AccessSelector value={access} members={members} onChange={setAccess} />
        </div>

        {uploading && (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-lavender transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              if (!uploading) {
                resetForm()
                onClose()
              }
            }}
            disabled={uploading}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || picked.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {uploading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {uploading ? `Uploading… ${progress}%` : `Upload ${picked.length > 0 ? `(${picked.length})` : ""}`}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
export function ChangeAccessDialog({
  open,
  onClose,
  onSave,
  title,
  members,
  initial,
  saving,
}: {
  open: boolean
  onClose: () => void
  onSave: (setting: AccessSetting) => void
  title: string
  members: Pick<Member, "id" | "name">[]
  initial: AccessSetting
  saving?: boolean
}) {
  const [access, setAccess] = useState<AccessSetting>(initial)

  useEffect(() => {
    if (!open) return
    setAccess(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      description="Owners always keep access to their own items."
    >
      <div className="space-y-4">
        <AccessSelector value={access} members={members} onChange={setAccess} />
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(access)}
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save access"}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

/**
 * Read-only folder details (anyone who can see the folder). Contents count
 * only files the viewer can access — the list endpoint already filters.
 */
export function FolderDetailsDialog({
  open,
  onClose,
  folder,
  groupId,
  groupName,
  creatorName,
}: {
  open: boolean
  onClose: () => void
  folder: DbFolder | null
  groupId: string
  groupName: string
  creatorName: string
}) {
  const [count, setCount] = useState<number | null>(null)
  const [totalSize, setTotalSize] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !folder) return
    let cancelled = false
    async function loadContents() {
      setCount(null)
      setTotalSize(null)
      try {
        const res = await fetch(
          `/api/folders/${folder!.id}/files?groupId=${encodeURIComponent(groupId)}`,
          { cache: "no-store" }
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !data.ok) return
        const list = (data.files ?? []) as { size?: number }[]
        setCount(list.length)
        setTotalSize(list.reduce((sum, f) => sum + (f.size || 0), 0))
      } catch {
        // Rows simply stay blank on failure.
      }
    }
    loadContents()
    return () => {
      cancelled = true
    }
  }, [open, folder, groupId])

  function dateTime(iso?: string): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const accessLabel =
    (folder?.access ?? "everyone") === "everyone"
      ? "Everyone"
      : folder?.access === "mine"
        ? "Only you"
        : "Selected members"

  return (
    <ModalShell open={open} onClose={onClose} title="Folder details">
      <div className="space-y-0 divide-y divide-border/60">
        {[
          { label: "Name", value: folder?.name ?? "—" },
          { label: "Type", value: "Research folder" },
          { label: "Created by", value: creatorName },
          { label: "Created", value: dateTime(folder?.createdAt) },
          { label: "Last updated", value: dateTime(folder?.updatedAt) },
          { label: "Access", value: accessLabel },
          {
            label: "Contents",
            value:
              count === null || totalSize === null
                ? "Loading…"
                : `${count} file${count === 1 ? "" : "s"} · ${formatBytes(totalSize)}`,
          },
          { label: "Group", value: groupName },
        ].map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="shrink-0 text-xs text-muted-foreground">{row.label}</span>
            <span className="min-w-0 truncate text-right text-xs font-medium text-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

/**
 * Merge-target picker: choose which folder the source merges into.
 * Lists the caller's editable folders (source excluded); selecting one
 * hands the pair back for the confirmation step.
 */
export function MergeTargetDialog({
  open,
  onClose,
  onPick,
  sourceName,
  targets,
}: {
  open: boolean
  onClose: () => void
  onPick: (targetId: string) => void
  sourceName: string
  targets: { id: string; name: string }[]
}) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Merge into…"
      description={`Move everything from “${sourceName}” into another folder.`}
    >
      <div className="space-y-4">
        {targets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            No other folders you can edit yet. Create one first.
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background divide-y divide-border/60">
            {targets.map((t) => (
              <div
                key={t.id}
                onClick={() => onPick(t.id)}
                className="flex items-center justify-between px-3 py-2 cursor-pointer transition-colors hover:bg-secondary/40"
              >
                <p className="min-w-0 truncate text-xs font-medium text-foreground">{t.name}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
