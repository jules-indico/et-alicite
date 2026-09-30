"use client"

import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { chapterAttachment, type Chapter } from "@/lib/research-data"
import { Link2, Paperclip } from "lucide-react"

function fileKindLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "pdf") return "PDF"
  if (ext === "docx") return "Word"
  if (ext === "txt") return "Text"
  return ext ? ext.toUpperCase() : "File"
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Confirmation shown before opening a chapter's attachment, reusing the
 * shared confirmation dialog (brand tone, no destructive styling).
 * - File/URL attached: shows what will open + Open/Cancel.
 * - Nothing attached: chapter info + notice, with Close/Attach actions.
 */
export function ChapterOpenDialog({
  chapter,
  onClose,
  onAttach,
}: {
  chapter: Chapter | null
  onClose: () => void
  onAttach: (chapter: Chapter) => void
}) {
  if (!chapter) return null

  const target = chapterAttachment(chapter)
  const file = chapter.files?.find((f) => f.url && f.url.trim().length > 0)

  if (!target) {
    return (
      <RemoveMemberDialog
        open
        memberName={null}
        groupName={null}
        tone="brand"
        icon={<Paperclip className="size-5" />}
        title={chapter.title}
        subtitle={chapter.label}
        cancelLabel="Close"
        message={
          <>
            {chapter.description && (
              <span className="mb-2 block text-muted-foreground">{chapter.description}</span>
            )}
            <span>No file or link attached to this chapter yet.</span>
          </>
        }
        confirmLabel="Attach something"
        onClose={onClose}
        onConfirm={() => onAttach(chapter)}
      />
    )
  }

  return (
    <RemoveMemberDialog
      open
      memberName={null}
      groupName={null}
      tone="brand"
      icon={file ? <Paperclip className="size-5" /> : <Link2 className="size-5" />}
      title="Open Attachment"
      subtitle={chapter.title}
      message={
        file ? (
          <span>
            You&apos;re about to open{" "}
            <span className="font-semibold text-foreground">&ldquo;{file.name}&rdquo;</span> (
            {fileKindLabel(file.name)}
            {file.size > 0 ? `, ${formatSize(file.size)}` : ""}) in a new tab.
          </span>
        ) : (
          <span>
            You&apos;ll be redirected to{" "}
            <span className="font-semibold text-foreground break-all">{target}</span> in a new tab.
          </span>
        )
      }
      confirmLabel="Open"
      onClose={onClose}
      onConfirm={() => {
        window.open(target, "_blank", "noopener,noreferrer")
        onClose()
      }}
    />
  )
}
