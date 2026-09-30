/**
 * Shared scholarly-metadata fetching used by BOTH the auto-fill endpoint
 * (/api/extract-metadata, summary-shaped results) and citation generation
 * (/api/cite, full records). One classification + provider stack, two
 * consumers — fixes and fallbacks land in a single place.
 */

export const UA = "et-alicite-metadata/1.0 (research organizer)"
export const API_TIMEOUT_MS = 8000

export type RichAuthor = { given: string; family: string }

export type RichWork = {
  title: string
  authors: RichAuthor[]
  year: number | null
  /** Journal / container / site name, when the provider supplies one. */
  container?: string
  volume?: string
  issue?: string
  articleNumber?: string
  pages?: string
  doi?: string
  provider: "crossref" | "openalex" | "arxiv"
}

export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

export function validYear(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isInteger(n)) return null
  const thisYear = new Date().getFullYear()
  if (n < 1900 || n > thisYear + 1) return null
  return n
}

// Surname convention matching the app's stored style.
export function formatAuthorSurnames(families: string[]): string {
  const clean = families.map((f) => f.trim()).filter(Boolean)
  if (clean.length === 0) return ""
  if (clean.length === 1) return clean[0]
  if (clean.length === 2) return `${clean[0]} & ${clean[1]}`
  return `${clean[0]} et al.`
}

export function surnameOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : displayName.trim()
}

export async function fetchJson(url: string, timeoutMs: number): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as any | null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function crossrefYear(msg: any): number | null {
  const pools = [msg?.published, msg?.["published-print"], msg?.["published-online"]]
  for (const p of pools) {
    const y = validYear(p?.["date-parts"]?.[0]?.[0])
    if (y !== null) return y
  }
  return null
}

function firstString(v: unknown): string {
  return Array.isArray(v) ? cleanText(String(v[0] ?? "")) : cleanText(String(v ?? ""))
}

export async function fetchCrossrefWork(doi: string): Promise<RichWork | null> {
  const data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, API_TIMEOUT_MS)
  const msg = data?.message
  if (!msg) return null
  const title = cleanText(Array.isArray(msg.title) ? msg.title.join(" ") : String(msg.title ?? ""))
  if (!title) return null
  const authors: RichAuthor[] = Array.isArray(msg.author)
    ? msg.author
        .map((a: any) => ({
          given: cleanText(String(a?.given ?? "")),
          family: cleanText(String(a?.family ?? a?.given ?? "")),
        }))
        .filter((a: RichAuthor) => a.family)
    : []
  const pages = cleanText(String(msg.page ?? ""))
  return {
    title,
    authors,
    year: crossrefYear(msg),
    container: firstString(msg["container-title"]) || undefined,
    volume: cleanText(String(msg.volume ?? "")) || undefined,
    issue: cleanText(String(msg.issue ?? "")) || undefined,
    articleNumber: cleanText(String(msg["article-number"] ?? "")) || undefined,
    pages: pages || undefined,
    doi: cleanText(String(msg.DOI ?? "")) || undefined,
    provider: "crossref",
  }
}

export async function fetchOpenAlexWork(workUrl: string): Promise<RichWork | null> {
  const data = await fetchJson(`https://api.openalex.org/works/${workUrl}`, API_TIMEOUT_MS)
  if (!data || data?.error) return null
  const title = cleanText(String(data.title ?? ""))
  if (!title || /^unknown/i.test(title)) return null
  const authors: RichAuthor[] = Array.isArray(data.authorships)
    ? data.authorships
        .map((a: any) => {
          const display = cleanText(String(a?.author?.display_name ?? ""))
          if (!display) return null
          const parts = display.split(/\s+/)
          return {
            given: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
            family: parts.length > 1 ? parts[parts.length - 1] : display,
          } as RichAuthor
        })
        .filter((a: RichAuthor | null): a is RichAuthor => !!a && !!a.family)
    : []
  const biblio = data.biblio ?? {}
  const firstPage = cleanText(String(biblio.first_page ?? ""))
  const lastPage = cleanText(String(biblio.last_page ?? ""))
  const pages =
    firstPage && lastPage && firstPage !== lastPage
      ? `${firstPage}–${lastPage}`
      : firstPage || undefined
  const doiRaw = cleanText(String(data.doi ?? ""))
  return {
    title,
    authors,
    year: validYear(data.publication_year),
    container: cleanText(String(data.primary_location?.source?.display_name ?? "")) || undefined,
    volume: cleanText(String(biblio.volume ?? "")) || undefined,
    issue: cleanText(String(biblio.issue ?? "")) || undefined,
    pages,
    doi: doiRaw || undefined,
    provider: "openalex",
  }
}

function allMatches(html: string, re: RegExp): string[] {
  const out: string[] = []
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
  let m: RegExpExecArray | null
  while ((m = global.exec(html)) !== null) {
    if (m[1]) out.push(m[1])
    if (out.length > 60) break
  }
  return out
}

export async function fetchArxivWork(arxivId: string): Promise<RichWork | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
    })
    if (!res.ok) return null
    const xml = await res.text()
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1]
    if (!entry) return null
    const title = cleanText((entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim())
    if (!title) return null
    const names = allMatches(entry, /<name>([^<]+)<\/name>/i)
    const authors: RichAuthor[] = names.slice(0, 12).map((n) => {
      const parts = cleanText(n).split(/\s+/)
      return {
        given: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
        family: parts.length > 1 ? parts[parts.length - 1] : cleanText(n),
      }
    })
    const published = entry.match(/<published>([^<]+)<\/published>/i)?.[1] ?? ""
    let year: number | null = null
    if (published.trim()) {
      const parsed = new Date(published.trim())
      if (!Number.isNaN(parsed.getTime())) year = validYear(parsed.getFullYear())
    }
    const journalRef = cleanText(entry.match(/<arxiv:journal_ref>([^<]+)<\/arxiv:journal_ref>/i)?.[1] ?? "")
    const doi = cleanText(entry.match(/<arxiv:doi>([^<]+)<\/arxiv:doi>/i)?.[1] ?? "")
    return {
      title,
      authors,
      year,
      container: journalRef || undefined,
      doi: doi || undefined,
      provider: "arxiv",
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Input classification (shared by both consumers) ─────────────────────────

export type SourceInputKind =
  | { kind: "doi"; doi: string }
  | { kind: "arxiv"; id: string }
  | { kind: "page"; url: string }
  | { kind: "invalid" }

export function extractDoi(text: string): string | null {
  const m = text.match(/10\.\d{4,}\/\S+/i)
  if (!m) return null
  return m[0].replace(/[).;,>]+$/, "").replace(/\/$/, "")
}

export function extractArxivId(text: string): string | null {
  const m =
    text.match(/arxiv\.org\/(?:abs|pdf)\/([\w.\-]+\/[\w.\-]+|[\w.\-]+)/i) ??
    text.match(/^\s*arxiv:\s*([\w.\-]+\/[\w.\-]+|[\w.\-]+)/i)
  if (!m) return null
  return m[1].replace(/\.pdf$/i, "")
}

export function classifySourceInput(input: string): SourceInputKind {
  const text = (input ?? "").trim()
  if (!text) return { kind: "invalid" }
  const doi = extractDoi(text)
  if (doi) return { kind: "doi", doi }
  const arxivId = extractArxivId(text)
  if (arxivId) return { kind: "arxiv", id: arxivId }
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`).toString()
    return { kind: "page", url }
  } catch {
    return { kind: "invalid" }
  }
}

/** Full-work resolution shared by citation generation (DOI → Crossref → OpenAlex). */
export async function fetchFullWork(input: string): Promise<{ kind: SourceInputKind; work: RichWork | null }> {
  const classified = classifySourceInput(input)
  if (classified.kind === "doi") {
    const viaCrossref = await fetchCrossrefWork(classified.doi)
    if (viaCrossref) return { kind: classified, work: viaCrossref }
    const viaOpenAlex = await fetchOpenAlexWork(`https://doi.org/${classified.doi}`)
    return { kind: classified, work: viaOpenAlex }
  }
  if (classified.kind === "arxiv") {
    return { kind: classified, work: await fetchArxivWork(classified.id) }
  }
  return { kind: classified, work: null }
}
