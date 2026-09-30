"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { AppShell } from "@/components/app-shell"
import { ProjectHeader } from "@/components/project-header"
import { ResearchWorkspace } from "@/components/research-workspace"
import { NewChapterModal } from "@/components/home-modals"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { ChapterOpenDialog } from "@/components/chapter-open-dialog"
import type { Chapter } from "@/lib/research-data"
import {
  useActiveGroupId,
  useGroupResearch,
  groupToMembers,
  calcGroupProgress,
  timeAgo,
  latestGroupUpdate,
} from "@/lib/use-group-research"

export default function ResearchPage() {
  const { authState, currentUser } = useAuth()
  const router = useRouter()
  const { activeGroupId, activeGroup } = useActiveGroupId()
  // Same group-scoped source of truth as the home workspace: every member of
  // the active group sees identical chapters, tasks, sources, and activity.
  const {
    chapters,
    tasks,
    sources,
    createChapter,
    updateChapter,
    deleteChapter,
    logActivity,
    reload,
  } = useGroupResearch(activeGroupId)
  const people = useMemo(() => groupToMembers(activeGroup), [activeGroup])
  const progress = useMemo(
    () => calcGroupProgress(tasks, sources),
    [tasks, sources]
  )
  // Real "Updated X ago": latest record edit in the group.
  const lastUpdated = useMemo(
    () => timeAgo(latestGroupUpdate(chapters, tasks, sources, [])),
    [chapters, tasks, sources]
  )

  // Page-scoped search (top-right pill): chapters only, from the active
  // group's already-loaded data.
  const [searchQuery, setSearchQuery] = useState("")
  const q = searchQuery.trim().toLowerCase()
  const filteredChapters = q
    ? chapters.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q))
      )
    : chapters

  // Chapter creation ("+ New item" opens the panel directly, same as the
  // "+" buttons on the Sources and Tasks pages).
  const [chapterOpen, setChapterOpen] = useState(false)

  // Item being edited (null = creating): same edit/delete flow as Home.
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)

  // Chapter clicked: confirm before opening its attachment (shared dialog).
  const [pendingOpen, setPendingOpen] = useState<Chapter | null>(null)

  // Pending chapter delete awaiting confirmation (shared dialog).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function requestDelete(id: string) {
    const name = chapters.find((c) => c.id === id)?.title ?? "this chapter"
    setDeleteError(null)
    setPendingDelete({ id, name })
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await handleDeleteChapter(pendingDelete.id)
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
    const n = tasks.filter((t) => t.chapterId === pendingDelete.id).length
    return (
      <>
        Delete {name}? Its {n} attributed task{n === 1 ? "" : "s"} will be unassigned from this
        chapter, and linked sources will be kept but unlinked. This cannot be undone.
      </>
    )
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

  async function handleCreateChapter(newCh: Omit<Chapter, "id">) {
    try {
      if (editingChapter) {
        const updated = await updateChapter(editingChapter.id, {
          ...newCh,
          updated: "Just now",
        })
        if (updated) {
          await logActivity("edited chapter", updated.title, actor)
        }
        setEditingChapter(null)
      } else {
        await createChapter(newCh, actor)
      }
    } catch (err) {
      console.error("Failed to save chapter:", err)
    }
  }

  async function handleDeleteChapter(id: string) {
    const target = chapters.find((c) => c.id === id)
    try {
      await deleteChapter(id)
      if (target) {
        await logActivity("deleted chapter", target.title, actor)
      }
      // Deleting a chapter unlinks it from sources server-side — refresh.
      await reload()
    } catch (err) {
      console.error("Failed to delete chapter:", err)
    }
  }

  useEffect(() => {
    if (authState.status === "unauthenticated") {
      router.replace("/login")
    }
  }, [authState.status, router])

  if (authState.status !== "authenticated") return null

  return (
    <AppShell
      navSearch={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search chapters…",
      }}
    >
      <ProjectHeader
        progress={progress}
        hasActiveGroup={!!activeGroupId}
        researchTitle={activeGroup?.researchTitle}
        members={people}
        lastUpdated={lastUpdated}
        onNewDirect={() => setChapterOpen(true)}
      />
      <ResearchWorkspace
        chapters={filteredChapters}
        tasks={tasks}
        sources={sources}
        onEditChapter={(ch) => {
          setEditingChapter(ch)
          setChapterOpen(true)
        }}
        onDeleteChapter={(id) => requestDelete(id)}
        onOpenChapter={(ch) => setPendingOpen(ch)}
      />

      <NewChapterModal
        open={chapterOpen}
        onClose={() => {
          setChapterOpen(false)
          setEditingChapter(null)
        }}
        onCreate={handleCreateChapter}
        initial={editingChapter}
      />

      {/* Chapter open confirmation (shared dialog) */}
      <ChapterOpenDialog
        chapter={pendingOpen}
        onClose={() => setPendingOpen(null)}
        onAttach={(ch) => {
          setPendingOpen(null)
          setEditingChapter(ch)
          setChapterOpen(true)
        }}
      />

      {/* Chapter delete confirmation (shared dialog) */}
      <RemoveMemberDialog
        open={Boolean(pendingDelete)}
        memberName={pendingDelete?.name ?? null}
        groupName={null}
        loading={deleting}
        error={deleteError}
        title="Delete Chapter"
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
    </AppShell>
  )
}
