"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Users,
  ChevronDown,
  Check,
  Plus,
  Folder,
  Shield,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { DeleteGroupModal } from "./delete-group-modal"
import { EditGroupModal } from "./edit-group-modal"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"

export interface GroupSwitcherProps {
  groups: any[]
  activeGroup: any | null
  onSelectGroup: (group: any) => void
  onOpenCreateModal?: () => void
  onGroupDeleted?: (deletedGroupId: string, newActiveGroup: any | null) => void
  onGroupUpdated?: (group: any) => void
  loading?: boolean
}

export function GroupSwitcher({
  groups,
  activeGroup,
  onSelectGroup,
  onOpenCreateModal,
  onGroupDeleted,
  onGroupUpdated,
  loading = false,
}: GroupSwitcherProps) {
  const { currentUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<any | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [groupToEdit, setGroupToEdit] = useState<any | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const updateAlignment = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const midpoint = window.innerWidth / 2
      setAlignRight(rect.left > midpoint)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  // Shared dismiss: only a genuine outside click closes the dropdown.
  useDismissOnOutsideClick({
    refs: containerRef,
    enabled: open,
    onDismiss: () => setOpen(false),
  })

  function handleToggle() {
    if (!open) updateAlignment()
    setOpen((prev) => !prev)
  }

  async function handleConfirmDelete() {
    if (!groupToDelete) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/groups/${groupToDelete.id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setDeleteError(data.error || "Failed to delete research group.")
        return
      }

      onGroupDeleted?.(data.deletedGroupId || groupToDelete.id, data.activeGroup ?? null)
      setGroupToDelete(null)
    } catch (err) {
      console.error("Delete group error:", err)
      setDeleteError("Network error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  if (groups.length === 0) return null

  return (
    <>
      <div ref={containerRef} className="relative inline-block text-left">
        <button
          type="button"
          id="btn-group-switcher"
          onClick={handleToggle}
          disabled={loading}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2 shadow-sm transition-all hover:bg-secondary/60 hover:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/20 active:scale-[0.99] disabled:opacity-50"
        >
          <span className="flex size-7 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <Users className="size-3.5" aria-hidden="true" />
          </span>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground truncate max-w-[140px] sm:max-w-[200px]">
                {activeGroup?.name || "Select Group"}
              </span>
              {activeGroup && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.62rem] font-medium text-muted-foreground">
                  {activeGroup.memberCount ?? activeGroup.members?.length ?? 1}
                </span>
              )}
            </div>
            <p className="text-[0.65rem] text-muted-foreground">Active Workspace</p>
          </div>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-1" />
          ) : (
            <ChevronDown
              className={`size-3.5 text-muted-foreground transition-transform duration-200 ml-1 ${
                open ? "rotate-180 text-foreground" : ""
              }`}
            />
          )}
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Research groups"
            className={`absolute mt-2 ${Z.menu} w-72 rounded-2xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
              alignRight
                ? "right-0 origin-top-right"
                : "left-0 origin-top-left"
            }`}
          >
            <div className="px-3 py-2 border-b border-border/60">
              <p className="text-xs font-semibold text-foreground">Switch Research Group</p>
              <p className="text-[0.68rem] text-muted-foreground">
                Workspace data is scoped to your selected group.
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto py-1 space-y-0.5">
              {groups.map((group) => {
                const isSelected = activeGroup?.id === group.id
                // Leader check against the leader field: current user's ID must match
                const isLeader = Boolean(
                  currentUser?.id &&
                  (group.leader === currentUser.id || (!group.leader && group.ownerId === currentUser.id))
                )

                return (
                  <div
                    key={group.id}
                    className={`w-full flex items-center justify-between gap-1.5 rounded-xl px-2 py-1.5 transition-colors ${
                      isSelected
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setOpen(false)
                        onSelectGroup(group)
                      }}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left py-0.5 rounded-lg focus:outline-none"
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${
                          isSelected ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Folder className="size-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-xs">{group.name}</p>
                        <div className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                          <span>{group.memberCount ?? group.members?.length ?? 0} members</span>
                          {isLeader && (
                            <>
                              <span>•</span>
                              <span className="text-brand font-medium">Leader</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="shrink-0 flex items-center gap-1">
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-brand stroke-[2.5]" />
                      )}

                      {/* Visible only to the group's leader - completely hidden for non-leaders */}
                      {isLeader && (
                        <button
                          type="button"
                          title={`Edit "${group.name}"`}
                          aria-label={`Edit "${group.name}"`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(false)
                            setGroupToEdit(group)
                          }}
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:opacity-100 hover:text-brand hover:bg-brand/10 transition-all focus:opacity-100"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {/* Visible only to the group's leader - completely hidden for non-leaders */}
                      {isLeader && (
                        <button
                          type="button"
                          title={`Delete "${group.name}"`}
                          aria-label={`Delete "${group.name}"`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(false)
                            setDeleteError(null)
                            setGroupToDelete(group)
                          }}
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all focus:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {onOpenCreateModal && (
              <div className="border-t border-border/60 pt-1 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpenCreateModal()
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-brand hover:bg-brand/10 transition-colors"
                >
                  <Plus className="size-3.5" />
                  <span>Create new research group</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Dialog for group leader */}
      <DeleteGroupModal
        open={Boolean(groupToDelete)}
        group={groupToDelete}
        loading={deleteLoading}
        error={deleteError}
        onClose={() => {
          if (!deleteLoading) {
            setGroupToDelete(null)
            setDeleteError(null)
          }
        }}
        onConfirm={handleConfirmDelete}
      />

      {/* Edit Dialog for group leader */}
      <EditGroupModal
        open={Boolean(groupToEdit)}
        group={groupToEdit}
        currentUserId={currentUser?.id}
        onClose={() => setGroupToEdit(null)}
        onSaved={(updated) => {
          setGroupToEdit(null)
          onGroupUpdated?.(updated)
        }}
      />
    </>
  )
}
