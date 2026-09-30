"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Pencil,
  AlertCircle,
  Loader2,
  UserPlus,
  UserMinus,
  Undo2,
} from "lucide-react"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { fullNameOf } from "@/lib/names"
import type { PublicUser } from "@/lib/server/auth-db"
import { cn } from "@/lib/utils"

interface EditGroupModalProps {
  open: boolean
  onClose: () => void
  /** Enriched group (with members + user details). */
  group: any | null
  currentUserId?: string | null
  onSaved: (group: any) => void
}

export function EditGroupModal({
  open,
  onClose,
  group,
  currentUserId,
  onSaved,
}: EditGroupModalProps) {
  const [name, setName] = useState("")
  const [researchTitle, setResearchTitle] = useState("")
  const [description, setDescription] = useState("")
  const [stagedRemoveIds, setStagedRemoveIds] = useState<string[]>([])
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null)
  const [stagedAddIds, setStagedAddIds] = useState<string[]>([])
  const [collaborators, setCollaborators] = useState<PublicUser[]>([])
  const [loadingCollabs, setLoadingCollabs] = useState(false)
  const [addSelect, setAddSelect] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Pre-fill from the group every time the modal opens (or a group is picked).
  useEffect(() => {
    if (open && group) {
      setName(group.name ?? "")
      setResearchTitle(group.researchTitle ?? "")
      setDescription(group.description ?? "")
      setStagedRemoveIds([])
      setStagedAddIds([])
      setPendingRemove(null)
      setAddSelect("")
      setError(null)
      setSaving(false)
    }
  }, [open, group])

  // Load the leader's collaborators for the Add-member picker.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function loadCollaborators() {
      setLoadingCollabs(true)
      try {
        const res = await fetch("/api/connections?status=accepted", { cache: "no-store" })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data.ok) setCollaborators(data.acceptedUsers || [])
        }
      } catch {
        // Leave the add-member list empty; name/description editing still works.
      } finally {
        if (!cancelled) setLoadingCollabs(false)
      }
    }
    loadCollaborators()
    return () => {
      cancelled = true
    }
  }, [open ])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  // Shared dismiss: only a genuine outside click closes the panel. Paused
  // while the nested remove-member confirmation is open (it renders in its
  // own portal, outside this panel's bounds, and manages itself).
  useDismissOnOutsideClick({ refs: panelRef, enabled: open && !pendingRemove, onDismiss: onClose })

  if (!open || typeof document === "undefined" || !group) return null

  const groupLeaderId = group.leader || group.ownerId
  const currentMemberIds: string[] = (group.members || []).map((m: any) => m.userId)

  // Members shown in the list: existing minus staged removals, plus staged adds.
  const visibleMembers: any[] = [
    ...(group.members || []).filter((m: any) => !stagedRemoveIds.includes(m.userId)),
    ...stagedAddIds
      .map((id) => collaborators.find((c) => c.id === id))
      .filter(Boolean)
      .map((c: any) => ({
        userId: c.id,
        role: "member",
        user: c,
        staged: true,
      })),
  ]

  // Add-member candidates: collaborators not already in the group (and not staged).
  const addCandidates = collaborators.filter(
    (c) => !currentMemberIds.includes(c.id) && !stagedAddIds.includes(c.id)
  )

  function toggleRemove(userId: string) {
    setStagedRemoveIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  // Staging a removal asks for confirmation first (shared dialog); unstaging
  // is a plain revert. The staged list commits on Save.
  function requestStageRemove(userId: string, name: string) {
    if (stagedRemoveIds.includes(userId)) {
      toggleRemove(userId)
    } else {
      setPendingRemove({ id: userId, name })
    }
  }

  function confirmStageRemove() {
    if (!pendingRemove) return
    setStagedRemoveIds((prev) =>
      prev.includes(pendingRemove.id) ? prev : [...prev, pendingRemove.id]
    )
    setPendingRemove(null)
  }

  function stageAdd() {
    if (!addSelect) return
    setStagedAddIds((prev) => (prev.includes(addSelect) ? prev : [...prev, addSelect]))
    setAddSelect("")
  }

  function unstageAdd(userId: string) {
    setStagedAddIds((prev) => prev.filter((id) => id !== userId))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Group name cannot be empty.")
      return
    }
    const trimmedTitle = researchTitle.trim()
    if (!trimmedTitle) {
      setError("Research title cannot be empty.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          researchTitle: trimmedTitle,
          description,
          addMemberIds: stagedAddIds,
          removeMemberIds: stagedRemoveIds,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to update research group.")
        setSaving(false)
        return
      }
      onSaved(data.group)
      onClose()
    } catch (err) {
      console.error("Update group error:", err)
      setError("Network error occurred. Please try again.")
    } finally {
      setSaving(false)
    }
  }

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
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Pencil className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">Edit Research Group</h2>
              <p className="text-xs text-muted-foreground">Update details and manage members. Only the leader can edit.</p>
            </div>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Group Name */}
            <div>
              <label htmlFor="edit-group-name" className="block text-xs font-semibold text-foreground mb-1">
                Group Name <span className="text-destructive">*</span>
              </label>
              <input
                id="edit-group-name"
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="e.g. Group 4: AI Research Assistant"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
            </div>

            {/* Research Title */}
            <div>
              <label htmlFor="edit-group-research-title" className="block text-xs font-semibold text-foreground mb-1">
                Research Title <span className="text-destructive">*</span>
              </label>
              <input
                id="edit-group-research-title"
                type="text"
                required
                value={researchTitle}
                onChange={(e) => {
                  setResearchTitle(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="e.g. AI-Assisted Learning Environments and Student Research Competencies"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
              <p className="mt-1 text-[0.7rem] text-muted-foreground">
                The actual research title shown on the Research page.
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="edit-group-desc" className="block text-xs font-semibold text-foreground mb-1">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                id="edit-group-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe the research paper or scope of this team..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all resize-none"
              />
            </div>

            {/* Members */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">
                Members ({visibleMembers.length})
              </label>
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-background divide-y divide-border/60">
                {visibleMembers.map((m: any) => {
                  const isSelf = m.userId === currentUserId
                  const isLeader = m.userId === groupLeaderId
                  const stagedForRemoval = stagedRemoveIds.includes(m.userId)
                  const stagedForAdd = !!m.staged
                  return (
                    <li
                      key={m.userId}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2",
                        stagedForRemoval && "opacity-60 bg-destructive/5",
                        stagedForAdd && "bg-brand/5"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                            m.user?.color || "bg-muted"
                          )}
                        >
                          {m.user?.initials || "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {(m.user && fullNameOf(m.user)) || "Member"}
                            {isSelf && <span className="text-brand font-semibold"> (you)</span>}
                          </p>
                          <p className="text-[0.68rem] text-muted-foreground">
                            {isLeader ? "Leader" : m.role === "owner" ? "Owner" : "Member"}
                            {stagedForAdd && " · will be added"}
                            {stagedForRemoval && " · will be removed"}
                          </p>
                        </div>
                      </div>
                      {stagedForAdd ? (
                        <button
                          type="button"
                          onClick={() => unstageAdd(m.userId)}
                          title="Undo add"
                          aria-label={`Undo adding ${fullNameOf(m.user ?? {}) || "member"}`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Undo2 className="size-3.5" />
                        </button>
                      ) : (
                        !isSelf && (
                          <button
                            type="button"
                            onClick={() =>
                              requestStageRemove(m.userId, (m.user && fullNameOf(m.user)) || "Member")
                            }
                            title={stagedForRemoval ? "Undo removal" : `Remove ${fullNameOf(m.user ?? {}) || "member"}`}
                            aria-label={stagedForRemoval ? `Undo removal of ${fullNameOf(m.user ?? {}) || "member"}` : `Remove ${fullNameOf(m.user ?? {}) || "member"}`}
                            className={cn(
                              "flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 text-[0.68rem] font-medium transition-colors",
                              stagedForRemoval
                                ? "text-foreground hover:bg-secondary"
                                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            )}
                          >
                            {stagedForRemoval ? (
                              <>
                                <Undo2 className="size-3" /> Undo
                              </>
                            ) : (
                              <>
                                <UserMinus className="size-3" /> Remove
                              </>
                            )}
                          </button>
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                Removed members keep their chapters, tasks, sources, and activity in group history. Tasks assigned to them stay assigned but are flagged.
              </p>
            </div>

            {/* Add member */}
            <div>
              <label htmlFor="edit-group-add" className="block text-xs font-semibold text-foreground mb-1.5">
                Add Member <span className="text-muted-foreground font-normal">(from your collaborators)</span>
              </label>
              {loadingCollabs ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Loading collaborators…
                </p>
              ) : addCandidates.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                  No collaborators left to add — everyone you&apos;re connected with is already in this group.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    id="edit-group-add"
                    value={addSelect}
                    onChange={(e) => setAddSelect(e.target.value)}
                    className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  >
                    <option value="">Select a collaborator…</option>
                    {addCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {fullNameOf(c) || "Member"} (@{c.username})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={stageAdd}
                    disabled={!addSelect}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <UserPlus className="size-3.5" />
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5 bg-muted/10">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Shared remove-member confirmation (also used on the Team page) */}
      <RemoveMemberDialog
        open={Boolean(pendingRemove)}
        memberName={pendingRemove?.name ?? null}
        groupName={group.name ?? null}
        onClose={() => setPendingRemove(null)}
        onConfirm={confirmStageRemove}
      />
    </div>,
    document.body
  )
}
