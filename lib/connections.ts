"use client"

/**
 * Shared connection-removal request used identically by Account > Find
 * collaborators and the Team page. Removes only the connection row —
 * group memberships and all group content are untouched.
 */
export async function deleteConnectionRequest(
  connectionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/connections/${connectionId}`, {
      method: "DELETE",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to remove connection." }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Network error occurred. Please try again." }
  }
}
