"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { NewSourceModal } from "@/components/home-modals"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { chapterNamesForSource } from "@/components/primitives"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { type Source } from "@/lib/research-data"
import {
  useActiveGroupId,
  useGroupResearch,
} from "@/lib/use-group-research"
import {
  apaInputsOf,
  apaInputsMatch,
  sourceTypeLabel,
  type ApaInputs,
} from "@/lib/apa"
import { cn } from "@/lib/utils"
import { ArrowLeft, BookMarked, Check, Copy, FileText, Link2, Loader2, Paperclip, Quote, Sparkles, Upload, X } from "lucide-react"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"

export default function SourceDetailPage() {
  const params = useParams()
  const rawId = params.sourceId
  const id = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  const { currentUser } = useAuth()
  const { activeGroupId } = useActiveGroupId()
  // Same underlying source data as Home, Research, and Sources pages.
  const { sources, chapters, updateSource, logActivity } = useGroupResearch(activeGroupId)

  const source = useMemo(
    () => sources.find((s) => s.id === id) ?? null,
    [sources, id]
  )

  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Header status (Cited/Unused) stays directly editable; all other field
  // edits live in the shared Create/Edit panel behind the ⋮ menu.
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  // Attachment open confirmation (same shared-dialog pattern as chapters).
  const [pendingOpen, setPendingOpen] = useState<
    { kind: "file" | "url"; url: string; name: string } | null
  >(null)

  // AI summary generation state (snapshot shape mirrors the stored record).
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const hasSummary = !!source?.summary
  const summaryStale =
    hasSummary &&
    ((source?.summaryInputs?.url ?? null) !== (source?.url ?? null) ||
      (source?.summaryInputs?.title ?? "") !== (source?.title ?? ""))

  async function handleGenerateSummary() {
    if (!source || generatingSummary) return
    setGeneratingSummary(true)
    setSummaryError(null)
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: source.title,
          author: source.author,
          year: source.year,
          url: source.url,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.summary) {
        setSummaryError(data.error || "Failed to generate summary. Please try again.")
        return
      }
      await updateSource(source.id, {
        summary: data.summary,
        summaryInputs: { url: source.url ?? null, title: source.title },
      })
    } catch {
      setSummaryError("Network error occurred. Please try again.")
    } finally {
      setGeneratingSummary(false)
    }
  }

  // Attachment management (mirrors the panel's attach flow): per-mode inputs
  // with auto-fill, saved through the same update path as other edits.
  const [manageMode, setManageMode] = useState<"none" | "file" | "url">("none")
  const [manageFiles, setManageFiles] = useState<File[]>([])
  const [manageUrl, setManageUrl] = useState("")
  const [manageSaving, setManageSaving] = useState(false)
  const [manageLoading, setManageLoading] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  const [manageNotice, setManageNotice] = useState<string | null>(null)
  const manageFileRef = useRef<HTMLInputElement>(null)

  // Reset attachment management when navigating between source detail pages.
  useEffect(() => {
    setManageMode(
      source?.attachmentUrl ? "url" : (source?.files ?? []).some((f) => f.url) ? "file" : "none"
    )
    setManageFiles([])
    setManageUrl(source?.attachmentUrl ?? "")
    setManageError(null)
    setManageNotice(null)
    setError("")
    setStatusError(null)
    setGenerating(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id])

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

  async function applyUrlMetadata(targetUrl: string): Promise<boolean> {
    if (!source) return false
    setManageLoading(true)
    setManageError(null)
    setManageNotice(null)
    try {
      const res = await fetch("/api/extract-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setManageNotice(
          data.error || "Couldn't extract metadata. Fill in the fields manually."
        )
        return false
      }
      // No inline edit form on this page — extracted metadata saves straight
      // to the record (same update path as the edit panel).
      const patch: {
        title?: string
        author?: string
        year?: number
        sourceType?: string
      } = {}
      if (data.title) patch.title = data.title
      if (data.author) patch.author = data.author
      if (data.year) patch.year = data.year
      if (data.source === "crossref" || data.source === "arxiv" || data.source === "openalex") {
        patch.sourceType = "journal-article"
      } else if (data.source === "page") {
        patch.sourceType = "website"
      }
      if (Object.keys(patch).length > 0) {
        const updated = await updateSource(source.id, patch)
        if (updated) {
          await logActivity("edited source", updated.title, actor)
        }
      }
      const via =
        data.source === "crossref"
          ? "via Crossref"
          : data.source === "openalex"
            ? "via OpenAlex"
            : data.source === "arxiv"
              ? "via arXiv"
              : "from the page"
      setManageNotice(`Metadata extracted ${via} — source details updated.`)
      return true
    } catch {
      setManageNotice("Extraction service unavailable. Fill in the fields manually.")
      return false
    } finally {
      setManageLoading(false)
    }
  }

  async function handleManageAutoFillFromUrl() {
    if (!manageUrl.trim()) {
      setManageError("Paste a URL first, then auto-fill from it.")
      return
    }
    await applyUrlMetadata(manageUrl.trim())
  }

  async function handleManageAutoFillFromFile() {
    const file = manageFiles[0]
    if (!file) {
      setManageError("Select a file first, then auto-fill from it.")
      return
    }
    if (!source) return
    setManageError(null)
    setManageNotice(null)
    setManageLoading(true)
    try {
      const { extractFileMetadata } = await import("@/lib/extract-file")
      const meta = await extractFileMetadata(file)
      if (!meta) {
        setManageNotice("Couldn't read metadata from this file. Fill in the fields manually.")
        return
      }
      if (meta.doi) {
        await applyUrlMetadata(`https://doi.org/${meta.doi}`)
        return
      }
      const patch: { title?: string; author?: string; year?: number } = {}
      if (meta.title) patch.title = meta.title
      if (meta.author) patch.author = meta.author
      if (meta.year) patch.year = meta.year
      if (Object.keys(patch).length > 0) {
        const updated = await updateSource(source.id, patch)
        if (updated) {
          await logActivity("edited source", updated.title, actor)
        }
      }
      setManageNotice(
        Object.keys(patch).length > 0
          ? "Metadata read from the file's embedded properties — source details updated."
          : "Couldn't read metadata from this file. Fill in the fields manually."
      )
    } catch {
      setManageNotice("Couldn't read this file. Fill in the fields manually.")
    } finally {
      setManageLoading(false)
    }
  }

  async function uploadManageFiles(): Promise<
    { name: string; size: number; url: string; storedName: string; blobUrl?: string }[] | null
  > {
    const uploaded: { name: string; size: number; url: string; storedName: string; blobUrl?: string }[] = []
    for (const file of manageFiles) {
      const form = new FormData()
      form.append("file", file)
      let res: Response
      try {
        res = await fetch("/api/uploads", { method: "POST", body: form })
      } catch {
        setManageError(`Upload failed for "${file.name}". Check your connection and try again.`)
        return null
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.file) {
        setManageError(data.error || `Upload failed for "${file.name}".`)
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

  function isValidUrl(value: string): boolean {
    try {
      const parsed = new URL(value.trim())
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  // Current attachment, for dirty-checking the manage form.
  const currentFiles = useMemo(
    () => (source?.files ?? []).filter((f) => f.url),
    [source]
  )
  const currentUrl = source?.attachmentUrl ?? ""
  const attachDirty =
    manageMode === "url"
      ? manageUrl.trim() !== currentUrl
      : manageMode === "file"
        ? manageFiles.length > 0 || currentUrl !== ""
        : currentUrl !== "" || currentFiles.length > 0

  async function handleSaveAttachment() {
    if (!source || !attachDirty || manageSaving) return
    setManageSaving(true)
    setManageError(null)
    try {
      if (manageMode === "url") {
        if (!isValidUrl(manageUrl)) {
          setManageError("Paste a valid URL starting with http:// or https://.")
          return
        }
        await updateSource(source.id, { attachmentUrl: manageUrl.trim(), files: [] })
      } else if (manageMode === "file") {
        const uploaded = await uploadManageFiles()
        if (!uploaded) return
        await updateSource(source.id, {
          files: [...currentFiles, ...uploaded],
          attachmentUrl: "",
        })
      } else {
        await updateSource(source.id, { files: [], attachmentUrl: "" })
      }
      await logActivity("edited source", source.title, actor)
      setManageFiles([])
    } catch {
      setManageError("Failed to save attachment. Please try again.")
    } finally {
      setManageSaving(false)
    }
  }

  // Status changes are frequent — applied immediately without the edit panel
  // (same cited/uncited activity convention as the Sources page toggle).
  async function handleStatusChange(nextCited: boolean) {
    if (!source || nextCited === source.cited || statusSaving) return
    setStatusError(null)
    setStatusSaving(true)
    try {
      const updated = await updateSource(source.id, { cited: nextCited })
      if (updated) {
        await logActivity(
          nextCited ? "cited source" : "uncited source",
          updated.title,
          actor
        )
      }
    } catch (err) {
      console.error("Failed to update source status:", err)
      setStatusError("Failed to update status. Please try again.")
    } finally {
      setStatusSaving(false)
    }
  }

  // All other edits go through the shared Create/Edit panel (same modal as
  // the Sources page — no separate form here).
  async function handleSaveSource(newS: Omit<Source, "id">) {
    if (!source) return
    try {
      const updated = await updateSource(source.id, newS)
      if (updated) {
        await logActivity("edited source", updated.title, actor)
      }
    } catch (err) {
      console.error("Failed to save source:", err)
    }
  }

  // Citation generation state, derived from the stored snapshot.
  const storedInputs: ApaInputs | null = source?.apaInputs ?? null
  const hasCitation = !!source?.apaCitation
  const citationStale =
    hasCitation &&
    !!source &&
    !apaInputsMatch(
      storedInputs,
      apaInputsOf({
        title: source.title,
        author: source.author,
        year: source.year,
        sourceType: source.sourceType ?? "other",
        url: source.url,
      })
    )

  async function handleGenerateCitation() {
    if (!source || generating) return
    setGenerating(true)
    setError("")
    try {
      // Extraction runs server-side at generation time (/api/cite reuses the
      // auto-fill provider stack); the result is stored via the normal update.
      const res = await fetch("/api/cite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId, sourceId: source.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.citation) {
        setError(data.error || "Failed to generate citation. Please try again.")
        return
      }
      const inputs = apaInputsOf({
        title: source.title,
        author: source.author,
        year: source.year,
        sourceType: source.sourceType ?? "other",
        url: source.url,
      })
      await updateSource(source.id, { apaCitation: data.citation, apaInputs: inputs })
    } catch (err) {
      console.error("Failed to generate citation:", err)
      setError("Failed to generate citation. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyCitation() {
    if (!source?.apaCitation || copied) return
    // Stored citations are HTML (escaped text, <em> book titles) — decode to
    // plain text so exactly what the user reads is what lands on the clipboard.
    const el = document.createElement("div")
    el.innerHTML = source.apaCitation
    const plain = (el.textContent ?? "").trim()
    if (!plain) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plain)
      } else {
        // Non-secure-context fallback.
        const ta = document.createElement("textarea")
        ta.value = plain
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
    } catch {
      return
    }
    setCopied(true)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  const chapterNames = source ? chapterNamesForSource(chapters, source) : []

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/sources"
          className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to Sources
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Back
        </button>
      </div>

      {!source ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Source not found in this group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This page only shows sources from your active research group.
          </p>
        </div>
      ) : (
        <>
          <section
            aria-labelledby="source-detail-title"
            className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <BookMarked className="size-5" aria-hidden="true" />
              </span>
              <h1
                id="source-detail-title"
                className="min-w-0 flex-1 pt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
              >
                {source.title}
              </h1>
              <span className="flex shrink-0 items-center gap-1.5">
                <select
                  value={source.cited ? "Cited" : "Unused"}
                  disabled={statusSaving}
                  onChange={(e) => handleStatusChange(e.target.value === "Cited")}
                  title="Change status"
                  aria-label="Change source status"
                  className="cursor-pointer rounded-full border border-border bg-secondary/80 px-2.5 py-1 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60"
                >
                  <option value="Unused">Unused</option>
                  <option value="Cited">Cited</option>
                </select>
                <RowActionsMenu onEdit={() => setEditOpen(true)} editLabel="Edit source" />
              </span>
            </div>

            <p className="mt-2 pl-[52px] text-xs text-muted-foreground">
              {`${source.author} (${source.year})${chapterNames.length > 0 ? ` · ${chapterNames.join(" · ")}` : ""}`}
            </p>
            {statusError && (
              <p className="mt-2 pl-[52px] text-xs text-destructive">{statusError}</p>
            )}

            <hr className="my-4 border-border" />

            <div>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <h2 id="source-summary-heading" className="text-base font-semibold tracking-tight text-foreground">
                Summary
              </h2>
              <span className="ml-auto flex items-center gap-2">
                {hasSummary && (
                  <span className="text-[0.65rem] font-medium text-muted-foreground">
                    AI-generated{summaryStale ? " · out of date" : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary || !source?.url}
                  title={
                    !source?.url
                      ? "Attach a URL to this source first — summaries are generated from linked content"
                      : hasSummary
                        ? "Regenerate from the current link"
                        : "Generate from the linked page"
                  }
                  className="rounded-xl bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingSummary ? "Generating…" : hasSummary ? "Regenerate" : "Generate summary"}
                </button>
              </span>
            </div>
            {summaryError && (
              <div className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                {summaryError}
              </div>
            )}
            {hasSummary ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-foreground">{source!.summary}</p>
                {summaryStale && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Title or link changed since this was generated — regenerate to update it.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-muted-foreground">No summary yet.</p>
                {!source?.url && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Attach a URL to this source to enable AI summaries — there is no content to summarize from without a link.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-6 border-t border-border/60 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-sky/25 text-brand">
                <Quote className="size-4" aria-hidden="true" />
              </span>
              <h2 id="source-citation-heading" className="text-base font-semibold tracking-tight text-foreground">
                APA 7 citation
              </h2>
              <span className="ml-auto flex items-center gap-2">
                {hasCitation && (
                  <span className="text-[0.65rem] font-medium text-muted-foreground">
                    {sourceTypeLabel(source?.sourceType)}
                    {citationStale ? " · out of date" : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleGenerateCitation}
                  disabled={generating}
                  title={hasCitation ? "Regenerate from current fields" : "Generate from current fields"}
                  className="rounded-xl bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? "Generating…" : hasCitation ? "Regenerate" : "Generate citation"}
                </button>
              </span>
            </div>
            {hasCitation ? (
              <>
                <div className="mt-3 flex items-start gap-2">
                  <p
                    className="flex-1 text-sm leading-relaxed text-foreground"
                    dangerouslySetInnerHTML={{ __html: source!.apaCitation! }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyCitation}
                    title={copied ? "Copied" : "Copy citation"}
                    aria-label={copied ? "Citation copied" : "Copy citation to clipboard"}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-green-600" aria-hidden="true" />
                        <span className="text-green-600">Copied</span>
                      </>
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {citationStale && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Title, author, year, or type changed since this was generated — regenerate to update it.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No citation generated yet.</p>
            )}
            {error && (
              <div className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
            )}
          </div>

            <div className="mt-6 border-t border-border/60 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Paperclip className="size-4" aria-hidden="true" />
              </span>
              <h2 id="source-attachment-heading" className="text-base font-semibold tracking-tight text-foreground">
                Attachment
              </h2>
            </div>
            {(source?.files ?? []).filter((f) => f.url).length > 0 ? (
              <ul className="mt-3 space-y-2">
                {(source?.files ?? [])
                  .filter((f) => f.url)
                  .map((f, idx) => (
                    <li
                      key={`${f.storedName ?? f.name}-${idx}`}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                        <p className="text-[0.68rem] text-muted-foreground">
                          {f.name.split(".").pop()?.toUpperCase()} · {(f.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingOpen({ kind: "file", url: f.url!, name: f.name })}
                        className="shrink-0 rounded-xl bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        Open
                      </button>
                    </li>
                  ))}
              </ul>
            ) : source?.attachmentUrl ? (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-sm text-foreground">{source.attachmentUrl}</p>
                <button
                  type="button"
                  onClick={() =>
                    setPendingOpen({ kind: "url", url: source!.attachmentUrl!, name: source!.attachmentUrl! })
                  }
                  className="shrink-0 rounded-xl bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Open
                </button>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm text-muted-foreground">No file or link attached.</p>
              </>
            )}

            <div className="mt-4 border-t border-border/60 pt-4">
              <p className="mb-2 text-xs font-semibold text-foreground">
                Update attachment
              </p>
              <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="Attachment type">
                {(["none", "file", "url"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={manageMode === mode}
                    onClick={() => {
                      setManageMode(mode)
                      setManageError(null)
                    }}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      manageMode === mode
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode === "none" ? "None" : mode === "file" ? "Upload file" : "Attach URL"}
                  </button>
                ))}
              </div>

              {manageMode === "url" && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="url"
                    value={manageUrl}
                    onChange={(e) => setManageUrl(e.target.value)}
                    placeholder="https://example.com/paper.pdf"
                    aria-label="Attachment URL"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  />
                  <button
                    type="button"
                    disabled={manageLoading || !manageUrl.trim()}
                    onClick={handleManageAutoFillFromUrl}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                  >
                    {manageLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5 text-brand" />
                    )}
                    Auto-fill
                  </button>
                </div>
              )}

              {manageMode === "file" && (
                <div className="mt-2">
                  <input
                    ref={manageFileRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      if (e.target.files) setManageFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => manageFileRef.current?.click()}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-center transition-colors hover:border-brand/50 hover:bg-secondary/30"
                    >
                      <Upload className="size-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">Choose files</span>
                    </div>
                    <button
                      type="button"
                      disabled={manageLoading || manageFiles.length === 0}
                      onClick={handleManageAutoFillFromFile}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                    >
                      {manageLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5 text-brand" />
                      )}
                      Auto-fill
                    </button>
                  </div>
                  {manageFiles.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {manageFiles.map((file, idx) => (
                        <li
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                        >
                          <span className="truncate text-foreground font-medium">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setManageFiles((prev) => prev.filter((_, i) => i !== idx))}
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

              {manageError && (
                <div className="mt-2 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive">
                  {manageError}
                </div>
              )}
              {manageNotice && (
                <div className="mt-2 rounded-xl border border-brand/20 bg-brand/10 p-2.5 text-xs text-foreground">
                  {manageNotice}
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAttachment}
                  disabled={!attachDirty || manageSaving}
                  className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {manageSaving ? "Saving…" : "Save attachment"}
                </button>
              </div>
            </div>
          </div>

          <RemoveMemberDialog
            open={Boolean(pendingOpen)}
            memberName={null}
            groupName={null}
            tone="brand"
            icon={pendingOpen?.kind === "url" ? <Link2 className="size-5" /> : <Paperclip className="size-5" />}
            title="Open Attachment"
            subtitle={source?.title}
            message={
              pendingOpen?.kind === "url" ? (
                <span>
                  You&apos;ll be redirected to{" "}
                  <span className="font-semibold text-foreground break-all">{pendingOpen.url}</span> in a new tab.
                </span>
              ) : pendingOpen ? (
                <span>
                  You&apos;re about to open{" "}
                  <span className="font-semibold text-foreground">&ldquo;{pendingOpen.name}&rdquo;</span> in a new tab.
                </span>
              ) : null
            }
            confirmLabel="Open"
            onClose={() => setPendingOpen(null)}
            onConfirm={() => {
              if (pendingOpen) window.open(pendingOpen.url, "_blank", "noopener,noreferrer")
              setPendingOpen(null)
            }}
          />

          </section>

          <NewSourceModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onCreate={handleSaveSource}
            initial={source}
            chapters={chapters}
          />
        </>
      )}
    </AppShell>
  )
}
