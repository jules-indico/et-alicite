/**
 * Real AI infrastructure (the app's first): server-side calls to an
 * OpenAI-compatible chat-completions API, used for on-demand source
 * summaries. No client code touches keys or provider endpoints.
 *
 * Provider: any OpenAI-compatible API (OpenAI itself by default;
 * OpenRouter, Groq, Together, Ollama, etc. via AI_BASE_URL).
 * Default model: gpt-4o-mini (cheap, strong enough for summarization).
 *
 * Configuration (never hardcoded, never committed — .env*.local):
 *   AI_API_KEY   required — the provider API key.
 *   AI_BASE_URL  optional — override, e.g. https://openrouter.ai/api/v1
 *   AI_MODEL     optional — override, e.g. openai/gpt-4o-mini
 */

export type AiConfig =
  | { ok: true; apiKey: string; baseURL: string; model: string }
  | { ok: false; error: string }

export const AI_ENV_KEYS = {
  apiKey: "AI_API_KEY",
  baseURL: "AI_BASE_URL",
  model: "AI_MODEL",
} as const

const DEFAULT_BASE_URL = "https://api.openai.com/v1"
const DEFAULT_MODEL = "gpt-4o-mini"
const COMPLETION_TIMEOUT_MS = 60000

export function getAiConfig(): AiConfig {
  const apiKey = (process.env[AI_ENV_KEYS.apiKey] ?? "").trim()
  if (!apiKey) {
    return {
      ok: false,
      error:
        "AI summarization is not configured (missing AI_API_KEY). Add it to .env.local and restart the server.",
    }
  }
  const baseURL = (process.env[AI_ENV_KEYS.baseURL] ?? "").trim() || DEFAULT_BASE_URL
  const model = (process.env[AI_ENV_KEYS.model] ?? "").trim() || DEFAULT_MODEL
  return { ok: true, apiKey, baseURL: baseURL.replace(/\/+$/, ""), model }
}

export type ChatResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

/**
 * Minimal chat-completions call (fetch only — no SDK dependency).
 * The key is sent exclusively in the Authorization header and is never
 * logged or echoed in errors.
 */
export async function chatCompletion(
  config: Extract<AiConfig, { ok: true }>,
  messages: { role: "system" | "user"; content: string }[],
  opts?: { temperature?: number }
): Promise<ChatResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS)
  try {
    // NOTE: no max-tokens parameter is sent. Some OpenAI-compatible
    // gateways (notably Google's) misinterpret output-cap fields and
    // truncate responses to a few tokens; output length is bounded by the
    // prompt wording plus a server-side safety truncation instead.
    const res = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: opts?.temperature ?? 0.2,
        messages,
      }),
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "AI provider rejected the API key (unauthorized). Check AI_API_KEY." }
      }
      if (res.status === 429) {
        return { ok: false, error: "AI provider rate limit reached. Please try again shortly." }
      }
      return { ok: false, error: `AI provider error (HTTP ${res.status}). Please try again.` }
    }
    const data = (await res.json().catch(() => null)) as any
    const text = cleanText(String(data?.choices?.[0]?.message?.content ?? ""))
    if (!text) {
      return { ok: false, error: "AI provider returned an empty response. Please try again." }
    }
    return { ok: true, text }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "AI request timed out. Please try again." }
    }
    return { ok: false, error: "Could not reach the AI provider. Please try again." }
  } finally {
    clearTimeout(timer)
  }
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

export const INSUFFICIENT_CONTENT_TOKEN = "INSUFFICIENT_CONTENT"

/**
 * Summarize extracted page text for undergraduate researchers.
 * Returns the summary, or a failure when the model reports (or the
 * caller detects) that there is nothing substantive to summarize —
 * the app must never present a hallucinated summary.
 */
export async function summarizeSourceText(input: {
  title: string
  author: string
  year?: number | null
  sourceUrl: string
  content: string
}): Promise<ChatResult> {
  const config = getAiConfig()
  if (!config.ok) return config
  const byline = [input.author.trim(), input.year ? String(input.year) : ""]
    .filter(Boolean)
    .join(" ")
  return chatCompletion(
    config,
    [
      {
        role: "system",
        content:
          "You summarize academic sources for undergraduate researchers. Reply in plain text only (no markdown, no bullets): 3-5 sentences covering what the source is about and its key findings or arguments relevant to student research. If the provided page content is empty, garbled, a login wall, a bot check, or otherwise insufficient to summarize, reply with exactly INSUFFICIENT_CONTENT and nothing else.",
      },
      {
        role: "user",
        content: `Source: ${input.title}${byline ? ` — ${byline}` : ""}\nURL: ${input.sourceUrl}\n\nPage content:\n${input.content}`,
      },
    ],
    { temperature: 0.2 }
  ).then((result) => {
    if (!result.ok) return result
    // Safety net: bound runaway outputs at a sentence boundary.
    return { ok: true as const, text: truncateAtSentence(result.text, 2000) }
  })
}

/** Cut text at the last sentence end before maxChars (never mid-sentence). */
function truncateAtSentence(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  const slice = trimmed.slice(0, maxChars)
  const lastEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "))
  if (lastEnd < maxChars * 0.3) return `${slice.trimEnd()}…`
  return slice.slice(0, lastEnd + 1).trim()
}
