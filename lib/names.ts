/**
 * First/last name helpers. Display names are composed from firstName +
 * lastName; legacy `displayName`/`name` fields remain as fallback until all
 * callers are verified on the split fields.
 */

export type NameLike = {
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  name?: string | null
}

/**
 * Migration split rule: last word = last name, the rest = first name.
 * Single-word names yield an empty lastName (stays valid until edited).
 */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] }
}

/** "First Last" from split fields, falling back to the legacy full-name value. */
export function fullNameOf(u: NameLike): string {
  const composed = [(u.firstName ?? "").trim(), (u.lastName ?? "").trim()]
    .filter(Boolean)
    .join(" ")
  if (composed) return composed
  return (u.displayName ?? u.name ?? "").trim()
}

/** First name for greetings/short displays, with legacy first-word fallback. */
export function firstNameOf(u: NameLike, fallback = ""): string {
  const first = (u.firstName ?? "").trim()
  if (first) return first
  const legacy = (u.displayName ?? u.name ?? "").trim().split(/\s+/).filter(Boolean)[0]
  return legacy ?? fallback
}
