import { NextRequest, NextResponse } from "next/server"
import {
  classifySourceInput,
  fetchCrossrefWork,
  fetchOpenAlexWork,
  fetchArxivWork,
  formatAuthorSurnames,
  validYear,
  cleanText,
} from "@/lib/metadata"

const SCRAPE_TIMEOUT_MS = 10000

const BOT_MARKERS =
  /just a moment|client challenge|access denied|attention required|verify you are (a )?human|prove you are human|captcha|forbidden|request blocked|are you a robot|unusual traffic|service unavailable|error 50[034]|account suspended|domain (for sale|parked)/i

function allMatches(html: string, re: RegExp): string[] {
  const out: string[] = []
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
  let m: RegExpExecArray | null
  while ((m = global.exec(html)) !== null) {
    if (m[1]) out.push(m[1])
    if (out.length > 50) break
  }
  return out
}

type Extracted = {
  title: string
  author: string
  year: number | null
  source: "crossref" | "openalex" | "arxiv" | "page"
}

function fromRichWork(
  work: { title: string; authors: { given: string; family: string }[]; year: number | null },
  source: Extracted["source"]
): Extracted {
  return {
    title: work.title,
    author: formatAuthorSurnames(work.authors.map((a) => a.family || a.given)),
    year: work.year,
    source,
  }
}

async function tryScrape(pageUrl: string): Promise<Extracted | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    if (!html || html.length < 200) return null

    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? ""
    // Reject bot-challenge / block / parked pages as failures, never successes.
    if (BOT_MARKERS.test(titleTag) || BOT_MARKERS.test(html.slice(0, 20000))) return null

    const citationTitle =
      html.match(/<meta[^>]*name=["']citation_title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? ""
    const ogTitle =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? ""
    const title = cleanText(citationTitle || ogTitle || titleTag)

    // Multi-author capture: every citation_author / author meta, surname convention.
    const cited = allMatches(html, /<meta[^>]*name=["']citation_author["'][^>]*content=["']([^"']+)["']/i)
    const metaAuthors = allMatches(html, /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i)
    const rawAuthors = cited.length > 0 ? cited : metaAuthors
    let author = ""
    if (rawAuthors.length > 0) {
      // citation_author is usually "Family, Given" — keep the family part.
      const families = rawAuthors.map((a) => a.split(",")[0].trim()).filter(Boolean)
      author = formatAuthorSurnames(families.slice(0, 5))
      if (rawAuthors.length > 5) author = `${families[0]} et al.`
    } else {
      const ogSiteName =
        html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? ""
      try {
        author = cleanText(
          ogSiteName || new URL(pageUrl).hostname.replace(/^www\./, "")
        )
      } catch {
        author = cleanText(ogSiteName)
      }
    }

    // Year is NEVER defaulted: null when no credible date meta is found.
    let year: number | null = null
    const citationDate =
      html.match(/<meta[^>]*name=["']citation_publication_date["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]*name=["']citation_date["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
      ""
    const articleDate =
      html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? ""
    const rawDate = citationDate || articleDate
    if (rawDate) {
      const parsed = new Date(rawDate)
      if (!Number.isNaN(parsed.getTime())) {
        year = validYear(parsed.getFullYear())
      }
    }

    return title ? { title, author, year, source: "page" } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "A valid URL is required" }, { status: 400 })
    }
    const input = url.trim()

    // 1. DOI → Crossref, then OpenAlex.
    const kind = classifySourceInput(input)
    if (kind.kind === "doi") {
      const viaCrossref = await fetchCrossrefWork(kind.doi)
      if (viaCrossref) {
        return NextResponse.json({
          success: true,
          ...fromRichWork(viaCrossref, "crossref"),
        })
      }
      const viaOpenAlex = await fetchOpenAlexWork(`https://doi.org/${kind.doi}`)
      if (viaOpenAlex) {
        return NextResponse.json({
          success: true,
          ...fromRichWork(
            {
              ...viaOpenAlex,
              authors: viaOpenAlex.authors.map((a) => ({
                given: "",
                family: a.family,
              })),
            },
            "openalex"
          ),
        })
      }
      return NextResponse.json({
        needsService: true,
        error: "Could not resolve this DOI automatically. Please fill in the fields below manually.",
      })
    }

    // 2. arXiv → arXiv export API (structured Atom, no scraping).
    if (kind.kind === "arxiv") {
      const viaArxiv = await fetchArxivWork(kind.id)
      if (viaArxiv) {
        return NextResponse.json({ success: true, ...fromRichWork(viaArxiv, "arxiv") })
      }
      return NextResponse.json({
        needsService: true,
        error: "Could not resolve this arXiv ID automatically. Please fill in the fields below manually.",
      })
    }

    // 3. Anything else → hardened scraper fallback.
    if (kind.kind === "invalid") {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }
    const scraped = await tryScrape(kind.url)
    if (scraped) {
      return NextResponse.json({ success: true, ...scraped })
    }
    return NextResponse.json({
      needsService: true,
      error: "Auto-extraction service unavailable (external metadata-extraction service required). Please fill in the fields below manually.",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Extraction failed"
    return NextResponse.json({ needsService: true, error: message }, { status: 500 })
  }
}
