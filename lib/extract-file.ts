/**
 * Client-side file metadata extraction for source auto-fill.
 * Dependency-free: DOCX via the already-installed JSZip + native DOMParser,
 * PDFs via raw byte scans (DOI / Info-dict) with no PDF library.
 *
 * Same quality bar as URL extraction: validators reject empty, garbled,
 * or implausible values — fields stay blank rather than filling garbage.
 * Everything returned here is a *suggestion* for manual review; nothing
 * auto-submits. The URL-based flow (/api/extract-metadata) is untouched.
 */

export type FileMetadata = {
  title?: string
  author?: string
  year?: number | null
  /** DOI discovered inside the file — feed to /api/extract-metadata. */
  doi?: string
}

const MAX_SCAN_CHARS = 2_000_000

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function validTitle(t: string, fileName: string): string | undefined {
  const clean = cleanText(t)
  if (clean.length < 3 || clean.length > 300) return undefined
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) return undefined
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase()
  if (clean.toLowerCase() === base) return undefined
  if (!/[A-Za-z]/.test(clean)) return undefined
  return clean
}

function validAuthor(a: string): string | undefined {
  const clean = cleanText(a)
  if (clean.length < 2 || clean.length > 200) return undefined
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) return undefined
  if (!/[A-Za-z]/.test(clean)) return undefined
  return clean
}

function validYear(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isInteger(n)) return null
  const thisYear = new Date().getFullYear()
  if (n < 1900 || n > thisYear + 1) return null
  return n
}

export function findDoi(text: string): string | undefined {
  const m = text.match(/10\.\d{4,}\/[^\s"'<>()\]]+/i)
  if (!m) return undefined
  return m[0].replace(/[).;,>]+$/, "").replace(/\/$/, "") || undefined
}

// ── DOCX (pure XML parsing — testable without a browser) ────────────────────

export function parseDocxCoreXml(xml: string, fileName: string): FileMetadata | null {
  const tag = (names: string[]): string => {
    for (const name of names) {
      const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)<\\/${name}>`, "i"))
      if (m && m[1].trim()) return m[1].trim()
    }
    return ""
  }
  // dc: / dcterms: prefixes vary (dc:title vs title); match bare or prefixed.
  const title =
    tag(["dc:title", "title"]) ||
    tag(["dcterms:title"])
  const author = tag(["dc:creator", "creator"]) || tag(["dc:creator"])
  const created =
    tag(["dcterms:created", "created"]) || tag(["dcterms:modified", "modified"])
  let year: number | null = null
  const yMatch = created.match(/^(\d{4})/)
  if (yMatch) year = validYear(Number(yMatch[1]))

  const out: FileMetadata = {}
  const goodTitle = title ? validTitle(title, fileName) : undefined
  if (goodTitle) out.title = goodTitle
  const goodAuthor = author ? validAuthor(author) : undefined
  if (goodAuthor) out.author = goodAuthor
  if (year !== null) out.year = year
  return out.title !== undefined || out.author !== undefined || out.year !== undefined ? out : null
}

// ── PDF raw scan (pure string matching — testable without a browser) ────────

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
}

export function scanPdfText(text: string, fileName: string): FileMetadata | null {
  // Tier 1: embedded DOI → full Crossref lookup downstream.
  const doi = findDoi(text)
  if (doi) return { doi }

  // Tier 2: Info-dict Title / Author (literal strings only, not hex).
  const out: FileMetadata = {}
  const titleMatch =
    text.match(/\/Title\s*\(((?:[^()\\]|\\.)*)\)/)?.[1] ?? ""
  const goodTitle = validTitle(unescapePdfString(titleMatch), fileName)
  if (goodTitle) out.title = goodTitle
  const authorMatch =
    text.match(/\/Author\s*\(((?:[^()\\]|\\.)*)\)/)?.[1] ?? ""
  const goodAuthor = validAuthor(unescapePdfString(authorMatch))
  if (goodAuthor) out.author = goodAuthor
  const dateMatch = text.match(/\/CreationDate\s*\(D:(\d{4})/)?.[1]
  if (dateMatch) {
    const y = validYear(Number(dateMatch))
    if (y !== null) out.year = y
  }
  return out.title !== undefined || out.author !== undefined || out.year !== undefined ? out : null
}

// ── Browser wrappers (File / JSZip / DOMParser) ─────────────────────────────

export async function extractDocxMetadata(file: File): Promise<FileMetadata | null> {
  try {
    const { default: JSZip } = await import("jszip")
    const zip = await JSZip.loadAsync(file)
    const coreFile = zip.file("docProps/core.xml")
    if (!coreFile) return null
    const xml = await coreFile.async("string")
    // Prefer DOMParser when available, fall back to regex parsing.
    if (typeof DOMParser !== "undefined") {
      try {
        const doc = new DOMParser().parseFromString(xml, "application/xml")
        const text = (tag: string): string => {
          const els = doc.getElementsByTagName(tag)
          for (let i = 0; i < els.length; i++) {
            const t = els[i].textContent?.trim() ?? ""
            if (t) return t
          }
          return ""
        }
        const title = text("dc:title") || text("title")
        const author = text("dc:creator") || text("creator")
        const created = text("dcterms:created") || text("created")
        const meta: FileMetadata = {}
        const goodTitle = title ? validTitle(title, file.name) : undefined
        if (goodTitle) meta.title = goodTitle
        const goodAuthor = author ? validAuthor(author) : undefined
        if (goodAuthor) meta.author = goodAuthor
        const yMatch = created.match(/^(\d{4})/)
        if (yMatch) {
          const y = validYear(Number(yMatch[1]))
          if (y !== null) meta.year = y
        }
        if (meta.title || meta.author || meta.year !== undefined) return meta
      } catch {
        // fall through to regex parsing below
      }
    }
    return parseDocxCoreXml(xml, file.name)
  } catch {
    return null
  }
}

export async function extractPdfMetadata(file: File): Promise<FileMetadata | null> {
  try {
    const buf = await file.arrayBuffer()
    const text = new TextDecoder("windows-1252").decode(buf.slice(0, MAX_SCAN_CHARS))
    return scanPdfText(text, file.name)
  } catch {
    return null
  }
}

export async function extractFileMetadata(file: File): Promise<FileMetadata | null> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".docx")) return extractDocxMetadata(file)
  if (lower.endsWith(".pdf")) return extractPdfMetadata(file)
  return null
}
