import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getGroupSources } from "@/lib/server/auth-db"
import { fetchFullWork } from "@/lib/metadata"
import { formatApa7, formatApaComplete } from "@/lib/apa"
import { scanPdfText, parseDocxCoreXml } from "@/lib/extract-file"
import { fetchBlobBytes } from "@/lib/server/blob"

export const dynamic = "force-dynamic"

/**
 * Complete APA 7 citation generation for one source. Extraction runs here,
 * at generation time, reusing the same provider stack as auto-fill:
 * URL → Crossref/OpenAlex/arXiv full records; uploaded file → embedded
 * metadata (DOI → full record, else Info-dict/core.xml fields).
 * Falls back to the saved three-field format when nothing richer is
 * available — incomplete but correct, never fabricated. The client stores
 * the result via the existing source PATCH; nothing auto-saves here.
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : ""
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : ""
    if (!groupId || !sourceId) {
      return NextResponse.json({ ok: false, error: "groupId and sourceId are required." }, { status: 400 })
    }

    const list = await getGroupSources(user.id, groupId)
    if (!list.ok) {
      return NextResponse.json({ ok: false, error: list.error }, { status: list.status || 400 })
    }
    const source = (list.sources || []).find((s) => s.id === sourceId)
    if (!source) {
      return NextResponse.json({ ok: false, error: "Source not found in this group." }, { status: 404 })
    }

    const sourceType = source.sourceType ?? "other"

    // 1. URL-attached (or reference-linked) source → full provider record.
    const link = (source.attachmentUrl ?? source.url ?? "").trim()
    if (link) {
      const { work } = await fetchFullWork(link)
      if (work) {
        const citation = formatApaComplete({
          title: work.title,
          authors: work.authors,
          year: work.year,
          sourceType,
          container: work.container,
          volume: work.volume,
          issue: work.issue,
          articleNumber: work.articleNumber,
          pages: work.pages,
          doi: work.doi,
          url: link,
        })
        return NextResponse.json({ ok: true, citation, usedRich: true, provider: work.provider })
      }
    }

    // 2. Uploaded file → embedded metadata (DOI → full record, else fields).
    const attached = (source.files ?? []).find((f) => f.storedName)
    if (attached?.storedName && attached.blobUrl) {
      let buffer: Buffer | null = null
      try {
        buffer = await fetchBlobBytes(attached.blobUrl)
      } catch {
        buffer = null
      }
      if (buffer) {
        const lower = attached.name.toLowerCase()
        if (lower.endsWith(".pdf")) {
          const text = Buffer.from(buffer).toString("latin1").slice(0, 2_000_000)
          const scanned = scanPdfText(text, attached.name)
          const doi =
            scanned && "doi" in scanned && typeof scanned.doi === "string" ? scanned.doi : undefined
          if (doi) {
            const { work } = await fetchFullWork(`https://doi.org/${doi}`)
            if (work) {
              return NextResponse.json({
                ok: true,
                citation: formatApaComplete({
                  title: work.title,
                  authors: work.authors,
                  year: work.year,
                  sourceType,
                  container: work.container,
                  volume: work.volume,
                  issue: work.issue,
                  articleNumber: work.articleNumber,
                  pages: work.pages,
                  doi: work.doi,
                  url: link || undefined,
                }),
                usedRich: true,
                provider: work.provider,
              })
            }
          }
          if (scanned && (scanned.title || scanned.author)) {
            return NextResponse.json({
              ok: true,
              citation: formatApaComplete({
                title: scanned.title ?? source.title,
                authors: scanned.author
                  ? [{ given: "", family: scanned.author }]
                  : [{ given: "", family: source.author }],
                year: scanned.year ?? source.year,
                sourceType,
                url: link || undefined,
              }),
              usedRich: true,
              provider: "file",
            })
          }
        } else if (lower.endsWith(".docx")) {
          try {
            const { default: JSZip } = await import("jszip")
            const zip = await JSZip.loadAsync(buffer)
            const coreFile = zip.file("docProps/core.xml")
            if (coreFile) {
              const meta = parseDocxCoreXml(await coreFile.async("string"), attached.name)
              if (meta && (meta.title || meta.author)) {
                return NextResponse.json({
                  ok: true,
                  citation: formatApaComplete({
                    title: meta.title ?? source.title,
                    authors: meta.author
                      ? [{ given: "", family: meta.author }]
                      : [{ given: "", family: source.author }],
                    year: meta.year ?? source.year,
                    sourceType,
                    url: link || undefined,
                  }),
                  usedRich: true,
                  provider: "file",
                })
              }
            }
          } catch {
            // fall through to the saved-fields fallback below
          }
        }
      }
    }

    // 3. Fallback: saved three fields, simple (incomplete but correct) format.
    return NextResponse.json({
      ok: true,
      citation: formatApa7({
        title: source.title,
        author: source.author,
        year: source.year,
        sourceType,
        url: link || undefined,
      }),
      usedRich: false,
    })
  } catch (error) {
    console.error("Cite error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to generate citation." },
      { status: 500 }
    )
  }
}
