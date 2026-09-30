import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getAiConfig, summarizeSourceText, INSUFFICIENT_CONTENT_TOKEN } from "@/lib/ai"

export const dynamic = "force-dynamic"

const FETCH_TIMEOUT_MS = 12000
const MAX_CONTENT_CHARS = 12000
const MIN_CONTENT_CHARS = 200

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(Number(n))
      } catch {
        return ""
      }
    })
}

/** Crude but dependency-free readable-text extraction for summarization. */
function extractReadableText(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
  const noTags = noScripts.replace(/<[^>]+>/g, " ")
  return decodeEntities(noTags).replace(/\s+/g, " ").trim()
}

/**
 * On-demand source summarization. Body: { title?, author?, year?, url? }.
 * Requires a fetchable URL — without source content there is nothing to
 * summarize, and the endpoint refuses rather than risk hallucination.
 * Summaries are never auto-generated; the client calls this only when the
 * user clicks Generate, and stores the result itself.
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const config = getAiConfig()
    if (!config.ok) {
      return NextResponse.json({ ok: false, error: config.error }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const author = typeof body.author === "string" ? body.author.trim() : ""
    const year =
      typeof body.year === "number" && Number.isInteger(body.year) ? body.year : null
    const url = typeof body.url === "string" ? body.url.trim() : ""

    if (!url) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This source has no URL attached, so there is no content to summarize from. Attach a link to enable summarization.",
        },
        { status: 400 }
      )
    }

    let pageUrl: string
    try {
      pageUrl = new URL(url.startsWith("http") ? url : `https://${url}`).toString()
    } catch {
      return NextResponse.json({ ok: false, error: "The attached URL is invalid." }, { status: 400 })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let content = ""
    try {
      const res = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
      })
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Could not fetch the linked page (HTTP ${res.status}).` },
          { status: 502 }
        )
      }
      const contentType = res.headers.get("content-type") ?? ""
      if (!/text\/(html|plain)|application\/xhtml/i.test(contentType)) {
        return NextResponse.json(
          { ok: false, error: "The linked file type can't be summarized (HTML pages only)." },
          { status: 400 }
        )
      }
      content = extractReadableText(await res.text()).slice(0, MAX_CONTENT_CHARS)
    } catch {
      return NextResponse.json(
        { ok: false, error: "Could not fetch the linked page (timeout or blocked)." },
        { status: 502 }
      )
    } finally {
      clearTimeout(timer)
    }

    if (content.length < MIN_CONTENT_CHARS) {
      return NextResponse.json(
        { ok: false, error: "The linked page has no readable content to summarize." },
        { status: 400 }
      )
    }

    const result = await summarizeSourceText({
      title: title || "Untitled source",
      author: author || "Unknown author",
      year,
      sourceUrl: pageUrl,
      content,
    })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
    }
    if (result.text.trim() === INSUFFICIENT_CONTENT_TOKEN) {
      return NextResponse.json(
        { ok: false, error: "The linked page has no readable content to summarize." },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, summary: result.text })
  } catch (error) {
    console.error("Summarize error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to generate summary." },
      { status: 500 }
    )
  }
}
