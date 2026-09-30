/**
 * Deterministic APA 7 citation formatting from fields already on the
 * source record. No AI involved — pure string rules.
 *
 * Returns an HTML string: all user-supplied parts are escaped first, then
 * book titles are wrapped in <em> (the only italics APA needs from the
 * fields we store). Render with dangerouslySetInnerHTML — safe by
 * construction since every dynamic segment is escaped before composition.
 */

export const SOURCE_TYPES = [
  { id: "journal-article", label: "Journal article" },
  { id: "book", label: "Book" },
  { id: "website", label: "Website" },
  { id: "conference-paper", label: "Conference paper" },
  { id: "thesis", label: "Thesis" },
  { id: "other", label: "Other" },
] as const

export type SourceTypeId = (typeof SOURCE_TYPES)[number]["id"]

export function sourceTypeLabel(id?: string | null): string {
  return SOURCE_TYPES.find((t) => t.id === id)?.label ?? "Other"
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Split a stored author string ("A & B", "A; B", "A et al.", single) into parts. */
function splitAuthors(author: string): string[] {
  const trimmed = author.trim()
  if (!trimmed) return []
  for (const sep of [";", " & ", " and "]) {
    if (trimmed.includes(sep)) {
      return trimmed
        .split(sep)
        .map((p) => p.trim())
        .filter(Boolean)
    }
  }
  return [trimmed]
}

/** One author token → APA "Family, F. M." (best effort from stored text). */
function formatAuthorPart(token: string): string {
  const t = token.trim()
  if (!t) return ""
  const etAl = t.match(/^(.*?)\s+et\.?\s*al\.?$/i)
  if (etAl && etAl[1].trim()) return `${etAl[1].trim()} et al.`
  // Corporate author heuristic: contains an acronym (WHO, UNESCO, HAI) or is
  // all-uppercase — keep verbatim instead of mangling into "HAI, S.".
  if (/\b[A-Z]{2,}\b/.test(t) || (t === t.toUpperCase() && /[A-Z]/.test(t))) return t
  if (t.includes(",")) {
    // Already "Family, Given ..." — initial the givens.
    const [family, ...rest] = t.split(",").map((p) => p.trim())
    const initials = rest
      .join(" ")
      .split(/[\s.\-]+/)
      .filter(Boolean)
      .map((w) => `${w[0].toUpperCase()}.`)
      .join(" ")
    return initials ? `${family}, ${initials}` : family
  }
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0]
  const family = words[words.length - 1]
  const initials = words
    .slice(0, -1)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(" ")
  return `${family}, ${initials}`
}

function formatAuthorList(author: string): string {
  const parts = splitAuthors(author).map(formatAuthorPart).filter(Boolean)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]}, & ${parts[1]}`
  return `${parts.slice(0, -1).join(", ")}, & ${parts[parts.length - 1]}`
}

function siteNameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** APA sentence case: lowercase everything, then restore the lead capital,
 * post-colon capitals, and acronyms that were ALL-CAPS in the original
 * (AI, DNA). Curly quotes are normalized to straight ASCII so stored
 * citations match what providers and users expect. */
export function sentenceCase(title: string): string {
  const normalized = title
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
  if (!normalized) return ""
  // Acronyms present in the original, keyed by upper form.
  const acronyms = new Map<string, string>()
  for (const word of normalized.split(/\s+/)) {
    const core = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    if (core.length > 1 && /[A-Z]/.test(core) && core === core.toUpperCase()) {
      const key = core.toUpperCase()
      if (!acronyms.has(key)) acronyms.set(key, core)
    }
  }
  const words = normalized.toLowerCase().split(/(\s+)/)
  let out = ""
  let capitalizeNext = true
  for (const w of words) {
    if (/^\s+$/.test(w) || w === "") {
      out += w
      continue
    }
    // Restore original acronym casing, preserving surrounding punctuation.
    const m = w.match(/^([^A-Za-z0-9]*)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/)
    let restored = w
    if (m) {
      const hit = acronyms.get(m[2].toUpperCase())
      if (hit) restored = `${m[1]}${hit}${m[3]}`
    }
    if (capitalizeNext) {
      out += restored.charAt(0).toUpperCase() + restored.slice(1)
      capitalizeNext = false
    } else {
      out += restored
    }
    if (restored.endsWith(":")) capitalizeNext = true
  }
  return out
}

/** "Family, F. M." from structured given/family parts (never fabricated). */
function formatStructuredAuthor(given: string, family: string): string {
  const fam = family.trim()
  if (!fam) return ""
  const initials = given
    .trim()
    .split(/[\s.\-]+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(" ")
  // Corporate author heuristic (WHO, UNESCO, ...): keep verbatim.
  if (/\b[A-Z]{2,}\b/.test(fam) || (fam === fam.toUpperCase() && /[A-Z]/.test(fam))) {
    return fam
  }
  return initials ? `${fam}, ${initials}` : fam
}

function joinApaAuthors(parts: string[]): string {
  const clean = parts.filter(Boolean)
  if (clean.length === 0) return ""
  if (clean.length === 1) return clean[0]
  if (clean.length === 2) return `${clean[0]}, & ${clean[1]}`
  return `${clean.slice(0, -1).join(", ")}, & ${clean[clean.length - 1]}`
}

function doiUrlOf(doi?: string | null, fallbackUrl?: string | null): string {
  const d = (doi ?? "").trim()
  if (d) {
    return /^https?:\/\//i.test(d) ? d.trim() : `https://doi.org/${d.trim()}`
  }
  return (fallbackUrl ?? "").trim()
}

export type CompleteApaInput = {
  title: string
  authors: { given: string; family: string }[]
  year?: number | null
  sourceType?: string | null
  container?: string | null
  volume?: string | null
  issue?: string | null
  articleNumber?: string | null
  pages?: string | null
  doi?: string | null
  url?: string | null
}

/**
 * Complete APA 7 citation from a rich provider record. Every segment is
 * included only when the provider actually supplied it; missing pieces are
 * omitted, never invented. All dynamic text is escaped (book titles keep
 * their <em> italics); render with dangerouslySetInnerHTML.
 */
export function formatApaComplete(input: CompleteApaInput): string {
  const authors = joinApaAuthors(input.authors.map((a) => formatStructuredAuthor(a.given, a.family)))
  const year = input.year && Number.isInteger(input.year) ? String(input.year) : "n.d."
  const title = sentenceCase(input.title)
  const type = input.sourceType ?? "other"
  const head = `${authors ? `${escapeHtml(authors)} ` : ""}(${year}).`
  if (!title) return head

  const link = doiUrlOf(input.doi, input.url)
  const linkTail = link ? ` ${escapeHtml(link)}` : ""

  const joinSegments = (parts: string[]): string =>
    parts
      .map((p) => p.trim().replace(/\.+$/, ""))
      .filter(Boolean)
      .join(". ") + "."

  switch (type) {
    case "journal-article": {
      // Authors (Year). Title. Journal, Vol(Issue), pages-or-Article N. DOI
      // (APA joins the journal tail with commas, not periods.)
      const volIssue = [
        input.volume?.trim() ?? "",
        input.issue?.trim() ? `(${input.issue.trim()})` : "",
      ]
        .join("")
        .trim()
      // A lone number ("343") is an article number in modern journals
      // (Crossref encodes it as `page`); a range ("343–350") stays pages.
      const normalizePages = (p: string): string =>
        p.replace(/(\d)\s*-\s*(\d)/g, "$1–$2")
      let locator = ""
      if (input.articleNumber?.trim()) {
        locator = `Article ${input.articleNumber.trim()}`
      } else if (input.pages?.trim()) {
        const pages = normalizePages(input.pages.trim())
        locator = /^[A-Za-z0-9]+$/.test(pages) ? `Article ${pages}` : pages
      }
      const tail = [
        input.container?.trim() ? escapeHtml(input.container!.trim()) : "",
        volIssue ? escapeHtml(volIssue) : "",
        locator ? escapeHtml(locator) : "",
      ]
        .filter(Boolean)
        .join(", ")
      const body = tail
        ? `${head} ${escapeHtml(title)}. ${tail}.`
        : `${head} ${escapeHtml(title)}.`
      return linkTail ? `${body}${linkTail}` : body
    }
    case "book":
      return `${head} <em>${escapeHtml(title)}</em>.${linkTail}`
    case "website": {
      const site = input.url ? siteNameOf(input.url) : ""
      const segments = [
        `${head} ${escapeHtml(title)}`,
        site ? escapeHtml(site) : "",
      ]
      const body = joinSegments(segments)
      return linkTail ? `${body}${linkTail}` : body
    }
    case "conference-paper":
    case "thesis":
    default: {
      const segments = [
        `${head} ${escapeHtml(title)}`,
        input.container?.trim() ? `In ${escapeHtml(input.container!.trim())}` : "",
        [input.volume?.trim() ?? "", input.pages?.trim() ?? ""].filter(Boolean).join(", "),
      ]
      const body = joinSegments(segments)
      return linkTail ? `${body}${linkTail}` : body
    }
  }
}

export type ApaInput = {
  title: string
  author: string
  year?: number | null
  sourceType?: string | null
  url?: string | null
}

export function formatApa7(input: ApaInput): string {
  const authors = formatAuthorList(input.author)
  const year = input.year && Number.isInteger(input.year) ? String(input.year) : "n.d."
  const title = input.title.trim().replace(/\.*$/, "")
  const type = input.sourceType ?? "other"

  const head = `${authors ? `${escapeHtml(authors)} ` : ""}(${year}).`
  if (!title) return head

  switch (type) {
    case "book":
      return `${head} <em>${escapeHtml(title)}</em>.`
    case "website": {
      const site = input.url ? siteNameOf(input.url) : ""
      const url = (input.url ?? "").trim()
      const tail = [site ? escapeHtml(site) : "", url ? escapeHtml(url) : ""]
        .filter(Boolean)
        .join(". ")
      return tail ? `${head} ${escapeHtml(title)}${title.endsWith("?") ? "" : "."} ${tail}.` : `${head} ${escapeHtml(title)}.`
    }
    case "journal-article":
    case "conference-paper":
    case "thesis":
    default:
      return `${head} ${escapeHtml(title)}.`
  }
}

/** Snapshot of the inputs a stored citation was generated from (staleness check). */
export type ApaInputs = {
  title: string
  author: string
  year: number | null
  sourceType: string
}

export function apaInputsOf(input: ApaInput): ApaInputs {
  return {
    title: input.title.trim(),
    author: input.author.trim(),
    year: input.year && Number.isInteger(input.year) ? input.year : null,
    sourceType: input.sourceType ?? "other",
  }
}

export function apaInputsMatch(a: ApaInputs | undefined | null, b: ApaInputs): boolean {
  if (!a) return false
  return (
    a.title === b.title &&
    a.author === b.author &&
    (a.year ?? null) === (b.year ?? null) &&
    (a.sourceType ?? "other") === (b.sourceType ?? "other")
  )
}
