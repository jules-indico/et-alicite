import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { listJoinRequests, resolveJoinRequest } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

/** Leader-only: pending join requests (non-leaders get 403, never the list). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await listJoinRequests(user.id, id)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, requests: result.requests })
  } catch (error) {
    console.error("List join requests error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list join requests." },
      { status: 500 }
    )
  }
}

/** Leader-only: accept/decline ({ requestId, action: "accept" | "decline" }). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { requestId, action } = body
    if (typeof requestId !== "string" || !requestId.trim()) {
      return NextResponse.json(
        { ok: false, error: "Request body must include { requestId }." },
        { status: 400 }
      )
    }
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json(
        { ok: false, error: "Action must be 'accept' or 'decline'." },
        { status: 400 }
      )
    }
    const result = await resolveJoinRequest(user.id, id, requestId.trim(), action)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, request: result.request })
  } catch (error) {
    console.error("Resolve join request error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to resolve join request." },
      { status: 500 }
    )
  }
}
