"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Avatar, AccessBadge, ViewToggle } from "@/components/primitives"
import { ChangeAccessDialog, UploadFilesModal } from "@/components/home-modals"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { useAuth } from "@/lib/auth-context"
import {
  useActiveGroupId,
  groupToMembers,
  displayMember,
  timeAgo,
} from "@/lib/use-group-research"
import { cn } from "@/lib/utils"
import { useSectionSort } from "@/lib/use-section-view"
import type { DbFolder, DbFile } from "@/lib/server/auth-db"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Search,
  Upload,
  X,
} from "lucide-react"

// Mirrors the server inline allowlist: only these open in a tab, everything
// else is download-only (the server forces attachment + nosniff for them).
const INLINE_EXTS = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt"])
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"])

function extOf(name: string): string {
  const parts = name.split(".")
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : ""
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ ext, className }: { ext: string; className?: string }) {
  if (IMAGE_EXTS.has(ext)) return <FileImage className={className} aria-hidden="true" />
  if (ext === "pdf") return <FileText className={className} aria-hidden="true" />
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) {
    return <FileSpreadsheet className={className} aria-hidden="true" />
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className={className} aria-hidden="true" />
  }
  if (["doc", "docx", "txt", "md", "ppt", "pptx"].includes(ext)) {
    return <FileText className={className} aria-hidden="true" />
  }
  return <File className={className} aria-hidden="true" />
}

const FILE_GRID =
  "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_11rem_8.5rem_6.5rem_6rem_2.5rem]"
const PAGE_SIZE = 50

type SortKey = "name" | "date" | "size"

const FOLDER_FILE_SORT_KEYS: readonly SortKey[] = ["name", "date", "size"]

export default function FolderDetailPage() {
  const params = useParams()
  const rawId = params.folderId
  const folderId = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  const { currentUser } = useAuth()
  const { activeGroupId, activeGroup } = useActiveGroupId()
  const people = useMemo(() => groupToMembers(activeGroup), [activeGroup])

  const [folder, setFolder] = useState<DbFolder | null>(null)
  const [files, setFiles] = useState<DbFile[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<"list" | "grid">("list")
  const [searchQuery, setSearchQuery] = useState("")
  // Persisted per-user sort (same account mechanism as every other sort).
  const [fileSort, setFileSort] = useSectionSort(
    "folder-files",
    { key: "date", dir: "desc" },
    FOLDER_FILE_SORT_KEYS
  )
  const sortKey = fileSort.key as SortKey
  const sortDir = fileSort.dir
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  // Change-access dialog state (owner only — the menu gates visibility).
  const [accessFile, setAccessFile] = useState<DbFile | null>(null)
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<DbFile | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const leaderId = activeGroup ? activeGroup.leader || activeGroup.ownerId : null

  const load = useCallback(async () => {
    if (!activeGroupId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [foldersRes, filesRes] = await Promise.all([
        fetch(`/api/folders?groupId=${encodeURIComponent(activeGroupId)}`, { cache: "no-store" }),
        fetch(`/api/folders/${folderId}/files?groupId=${encodeURIComponent(activeGroupId)}`, {
          cache: "no-store",
        }),
      ])
      const foldersData = await foldersRes.json().catch(() => ({}))
      const filesData = await filesRes.json().catch(() => ({}))
      if (!foldersRes.ok || !foldersData.ok) {
        setFolder(null)
        setFiles([])
        return
      }
      const found = (foldersData.folders ?? []).find((f: DbFolder) => f.id === folderId) ?? null
      setFolder(found)
      setFiles(found && filesRes.ok && filesData.ok ? (filesData.files ?? []) : [])
    } catch {
      setFolder(null)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [activeGroupId, folderId])

  useEffect(() => {
    load()
  }, [load])

  function canDeleteFile(file: DbFile): boolean {
    if (!currentUser) return false
    return file.uploadedBy === currentUser.id || leaderId === currentUser.id
  }

  function openFile(file: DbFile) {
    window.open(`/api/research-files/${file.storedName}`, "_blank", "noopener,noreferrer")
  }

  // Search filters the server-returned (already access-checked) list only —
  // by name, uploader, and type. No new fetch, so hidden files can't leak.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const base = q
      ? files.filter((f) => {
          const uploader = displayMember(people, f.uploadedBy).name.toLowerCase()
          return (
            f.name.toLowerCase().includes(q) ||
            uploader.includes(q) ||
            extOf(f.name).includes(q) ||
            (f.mimeType || "").toLowerCase().includes(q)
          )
        })
      : files
    const dir = sortDir === "asc" ? 1 : -1
    return [...base].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir
      if (sortKey === "size") return (a.size - b.size) * dir
      return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir
    })
  }, [files, searchQuery, sortKey, sortDir, people])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [files, searchQuery, sortKey, sortDir, folderId])

  const visible = filtered.slice(0, visibleCount)

  function toggleSort(key: SortKey) {
    if (key === fileSort.key) {
      setFileSort({ key, dir: fileSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setFileSort({ key, dir: key === "name" ? "asc" : "desc" })
    }
  }

  function SortHeader({ label, sortKey: key }: { label: string; sortKey: SortKey }) {
    const active = sortKey === key
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        title={`Sort by ${label}`}
        aria-label={`Sort by ${label} ${active ? (sortDir === "asc" ? "ascending" : "descending") : ""}`}
        className="flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
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

  async function handleSaveFileAccess(setting: {
    access: "everyone" | "mine" | "selected"
    allowedIds: string[]
  }) {
    if (!accessFile || !activeGroupId) return
    setAccessSaving(true)
    setAccessError(null)
    try {
      const res = await fetch(
        `/api/folders/${folderId}/files/${accessFile.id}?groupId=${encodeURIComponent(activeGroupId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access: setting.access, allowedIds: setting.allowedIds }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setAccessError(data.error || "Failed to save access. Please try again.")
        return
      }
      setFiles((prev) => prev.map((f) => (f.id === accessFile.id ? data.file : f)))
      setAccessFile(null)
    } catch {
      setAccessError("Failed to save access. Please try again.")
    } finally {
      setAccessSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || !activeGroupId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(
        `/api/folders/${folderId}/files/${pendingDelete.id}?groupId=${encodeURIComponent(activeGroupId)}`,
        { method: "DELETE" }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setDeleteError(data.error || "Failed to delete. Please try again.")
        return
      }
      setFiles((prev) => prev.filter((f) => f.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  function openUpload(preselected: File[]) {
    setDroppedFiles(preselected)
    setUploadOpen(true)
  }

  return (
    <AppShell>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading folder…</p>
      ) : !activeGroupId ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No active research group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Join or create a research group to view this page.
          </p>
        </div>
      ) : !folder ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Not found in this group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This page only shows folders from your active research group.
          </p>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const picked = Array.from(e.dataTransfer.files ?? [])
            if (picked.length > 0) openUpload(picked)
          }}
        >
          {/* Compact header: breadcrumb + count … search + upload + toggle */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 flex-1 items-center gap-1.5"
            >
              <Link
                href="/home"
                className="shrink-0 text-sm font-medium text-brand hover:underline"
              >
                Research files
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
                {folder.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>
            </nav>
            <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm transition-all focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15 sm:w-52 sm:focus-within:w-64">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
                aria-label="Search this folder"
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
            <button
              type="button"
              onClick={() => openUpload([])}
              title="Upload files"
              aria-label="Upload files"
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-sm transition-colors hover:opacity-90"
            >
              <Upload className="size-4" aria-hidden="true" />
              Upload
            </button>
            <ViewToggle mode={view} onChange={setView} />
          </div>

          {dragging && (
            <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand/60 bg-card px-10 py-8 text-center shadow-xl">
                <Upload className="size-8 text-brand" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">Drop files to upload</p>
                <p className="text-xs text-muted-foreground">They&apos;ll be added to {folder.name}</p>
              </div>
            </div>
          )}

          <div className="mt-4">
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
                <p className="text-sm text-muted-foreground">No files yet.</p>
                <button
                  type="button"
                  onClick={() => openUpload([])}
                  className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  <Upload className="size-3.5" aria-hidden="true" />
                  Upload
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  No files match your search{searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ""}.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Clear search
                </button>
              </div>
            ) : view === "list" ? (
              <>
                <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className={cn("hidden sm:grid items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground", FILE_GRID)}>
                    <SortHeader label="Name" sortKey="name" />
                    <span>Uploaded by</span>
                    <SortHeader label="Date uploaded" sortKey="date" />
                    <SortHeader label="File size" sortKey="size" />
                    <span className="text-[0.65rem]">Access</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-border/60 px-2 py-1">
                    {visible.map((file) => {
                      const ext = extOf(file.name)
                      const inline = INLINE_EXTS.has(ext)
                      const uploader = displayMember(people, file.uploadedBy)
                      const departed = uploader.name === "Unknown member"
                      const isOwner = !!currentUser && file.uploadedBy === currentUser.id
                      const url = `/api/research-files/${file.storedName}`
                      return (
                        <li
                          key={file.id}
                          onClick={inline ? () => openFile(file) : undefined}
                          title={inline ? `Open ${file.name}` : file.name}
                          className={cn(
                            "group grid items-center gap-4 rounded-xl px-4 py-2.5 transition-colors hover:bg-secondary/40",
                            FILE_GRID,
                            inline && "cursor-pointer"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/20 to-lavender/20 text-brand">
                              <FileTypeIcon ext={ext} className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground leading-snug" title={file.name}>
                                {file.name}
                              </span>
                              <span className="mt-0.5 block text-[0.68rem] text-muted-foreground sm:hidden">
                                {departed ? "Former member" : uploader.name} · {timeAgo(file.createdAt) ?? "recently"} · {formatSize(file.size)}
                              </span>
                            </span>
                          </span>
                          <span className="hidden min-w-0 items-center gap-2 sm:flex">
                            {departed ? (
                              <>
                                <Avatar member={uploader} className="size-6 shrink-0 text-[0.55rem]" />
                                <span className="truncate text-xs text-muted-foreground">
                                  Former member
                                </span>
                              </>
                            ) : (
                              <Link
                                href={`/users/${file.uploadedBy}`}
                                onClick={(e) => e.stopPropagation()}
                                title={`View ${uploader.name}'s profile`}
                                aria-label={`View ${uploader.name}'s profile`}
                                className="flex min-w-0 items-center gap-2 rounded-lg"
                              >
                                <Avatar member={uploader} className="size-6 shrink-0 text-[0.55rem]" />
                                <span className="truncate text-xs text-muted-foreground hover:text-brand hover:underline">
                                  {uploader.name}
                                </span>
                              </Link>
                            )}
                          </span>
                          <span className="hidden text-xs text-muted-foreground sm:block">
                            {timeAgo(file.createdAt) ?? "recently"}
                          </span>
                          <span className="hidden text-xs text-muted-foreground sm:block">
                            {formatSize(file.size)}
                          </span>
                          <span>
                            {isOwner && (
                              <AccessBadge access={file.access} allowedCount={file.allowedIds?.length} />
                            )}
                          </span>
                          <span className="flex items-center justify-end gap-1">
                            <a
                              href={`${url}?download=1`}
                              onClick={(e) => e.stopPropagation()}
                              title={`Download ${file.name}`}
                              aria-label={`Download ${file.name}`}
                              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-secondary hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Download className="size-4" aria-hidden="true" />
                            </a>
                            {(isOwner || canDeleteFile(file)) && (
                              <RowActionsMenu
                                onOpen={inline ? () => openFile(file) : undefined}
                                openLabel="Open"
                                downloadUrl={`${url}?download=1`}
                                onDelete={
                                  canDeleteFile(file)
                                    ? () => {
                                        setDeleteError(null)
                                        setPendingDelete(file)
                                      }
                                    : undefined
                                }
                                deleteLabel="Delete file"
                                onAccess={isOwner ? () => setAccessFile(file) : undefined}
                                accessLabel="Change access"
                              />
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
                {filtered.length > visibleCount && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                    >
                      Show more ({filtered.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {visible.map((file) => {
                    const ext = extOf(file.name)
                    const inline = INLINE_EXTS.has(ext)
                    const isImage = IMAGE_EXTS.has(ext)
                    const isOwner = !!currentUser && file.uploadedBy === currentUser.id
                    const url = `/api/research-files/${file.storedName}`
                    return (
                      <div
                        key={file.id}
                        onClick={inline ? () => openFile(file) : undefined}
                        title={inline ? `Open ${file.name}` : file.name}
                        className={cn(
                          "group relative flex flex-col rounded-2xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-brand/25",
                          inline && "cursor-pointer"
                        )}
                      >
                        <div className="absolute right-2 top-2 z-10">
                          {(isOwner || canDeleteFile(file)) && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <RowActionsMenu
                                onOpen={inline ? () => openFile(file) : undefined}
                                openLabel="Open"
                                downloadUrl={`${url}?download=1`}
                                onDelete={
                                  canDeleteFile(file)
                                    ? () => {
                                        setDeleteError(null)
                                        setPendingDelete(file)
                                      }
                                    : undefined
                                }
                                deleteLabel="Delete file"
                                onAccess={isOwner ? () => setAccessFile(file) : undefined}
                                accessLabel="Change access"
                              />
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={inline ? () => openFile(file) : undefined}
                          disabled={!inline}
                          title={inline ? `Open ${file.name}` : file.name}
                          className={cn(
                            "flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand/20 to-lavender/20 text-brand",
                            !inline && "cursor-default"
                          )}
                        >
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none"
                              }}
                            />
                          ) : (
                            <FileTypeIcon ext={ext} className="size-10" />
                          )}
                        </button>
                        <p className="mt-2 truncate text-xs font-medium text-foreground" title={file.name}>
                          {file.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                          <span className="uppercase">{ext || "file"}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatSize(file.size)}</span>
                          {isOwner && (
                            <span className="ml-auto">
                              <AccessBadge access={file.access} allowedCount={file.allowedIds?.length} />
                            </span>
                          )}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {filtered.length > visibleCount && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
                    >
                      Show more ({filtered.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <UploadFilesModal
            open={uploadOpen}
            onClose={() => {
              setUploadOpen(false)
              setDroppedFiles([])
            }}
            groupId={activeGroupId ?? ""}
            folderId={folderId}
            members={people}
            initialFiles={droppedFiles}
            onUploaded={(newFiles) => setFiles((prev) => [...prev, ...newFiles])}
          />

          <RemoveMemberDialog
            open={Boolean(pendingDelete)}
            memberName={pendingDelete?.name ?? null}
            groupName={null}
            loading={deleting}
            error={deleteError}
            title="Delete File"
            subtitle="This action cannot be undone."
            message={
              <>
                Delete{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;{pendingDelete?.name ?? "this file"}&rdquo;
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
          {accessFile && (
            <ChangeAccessDialog
              open={Boolean(accessFile)}
              onClose={() => {
                setAccessFile(null)
                setAccessError(null)
              }}
              onSave={handleSaveFileAccess}
              title={`Access: ${accessFile.name}`}
              members={people}
              initial={{
                access: accessFile.access ?? "everyone",
                allowedIds: accessFile.allowedIds ?? [],
              }}
              saving={accessSaving}
            />
          )}
        </div>
      )}
    </AppShell>
  )
}
