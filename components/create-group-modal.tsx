"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Users,
  AlertCircle,
  Loader2,
  Check,
  FolderPlus,
} from "lucide-react"
import type { PublicUser } from "@/lib/server/auth-db"
import { fullNameOf } from "@/lib/names"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"

interface CreateGroupModalProps {
  open: boolean
  onClose: () => void
  collaborators: PublicUser[]
  onCreated: (group: any) => void
}

export function CreateGroupModal({
  open,
  onClose,
  collaborators,
  onCreated,
}: CreateGroupModalProps) {
  const [name, setName] = useState("")
  const [researchTitle, setResearchTitle] = useState("")
  const [description, setDescription] = useState("")
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setName("")
      setResearchTitle("")
      setDescription("")
      setSelectedMemberIds([])
      setError(null)
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  // Shared dismiss: only a genuine outside click closes the panel.
  useDismissOnOutsideClick({ refs: panelRef, enabled: open, onDismiss: onClose })

  if (!open || typeof document === "undefined") return null

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  function handleSelectAll() {
    if (selectedMemberIds.length === collaborators.length) {
      setSelectedMemberIds([])
    } else {
      setSelectedMemberIds(collaborators.map((c) => c.id))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Please enter a research group name.")
      return
    }
    const trimmedTitle = researchTitle.trim()
    if (!trimmedTitle) {
      setError("Please enter the research title this group is working on.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          researchTitle: trimmedTitle,
          description: description.trim() || undefined,
          memberIds: selectedMemberIds,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to create research group.")
        setLoading(false)
        return
      }

      onCreated(data.group)
      onClose()
    } catch (err) {
      console.error("Create group error:", err)
      setError("Network error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const allSelected = collaborators.length > 0 && selectedMemberIds.length === collaborators.length

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
              <FolderPlus className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">Create Research Group</h2>
              <p className="text-xs text-muted-foreground">Collaborate on papers with your accepted connections.</p>
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
              <label htmlFor="group-name" className="block text-xs font-semibold text-foreground mb-1">
                Group Name <span className="text-destructive">*</span>
              </label>
              <input
                id="group-name"
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
              <label htmlFor="group-research-title" className="block text-xs font-semibold text-foreground mb-1">
                Research Title <span className="text-destructive">*</span>
              </label>
              <input
                id="group-research-title"
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
              <label htmlFor="group-desc" className="block text-xs font-semibold text-foreground mb-1">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                id="group-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe the research paper or scope of this team..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all resize-none"
              />
            </div>

            {/* Collaborators Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-foreground">
                  Select Members from Collaborators ({selectedMemberIds.length}/{collaborators.length})
                </label>
                {collaborators.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>

              {collaborators.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
                  <Users className="size-6 text-muted-foreground mx-auto mb-1.5 opacity-60" />
                  <p className="text-xs font-medium text-foreground">No collaborators yet</p>
                  <p className="text-[0.7rem] text-muted-foreground mt-0.5">
                    Connect with other researchers first before adding them to groups. You can still create this group and add members later.
                  </p>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-background divide-y divide-border/60">
                  {collaborators.map((c) => {
                    const isSelected = selectedMemberIds.includes(c.id)
                    return (
                      <div
                        key={c.id}
                        onClick={() => toggleMember(c.id)}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                          isSelected ? "bg-brand/5" : "hover:bg-secondary/40"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${c.color}`}
                          >
                            {c.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{fullNameOf(c) || "Member"}</p>
                            <p className="text-[0.68rem] text-muted-foreground truncate">@{c.username}</p>
                          </div>
                        </div>

                        <div
                          className={`size-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-brand border-brand text-white"
                              : "border-border bg-background"
                          }`}
                        >
                          {isSelected && <Check className="size-3 stroke-[3]" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5 bg-muted/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
