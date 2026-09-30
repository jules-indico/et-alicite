import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { respondToConnectionRequest } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function PATCH(
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
    const actionInput = body.action || (body.status === "accepted" ? "accept" : body.status === "declined" ? "decline" : null)

    if (actionInput !== "accept" && actionInput !== "decline") {
      return NextResponse.json(
        { ok: false, error: "Action must be either 'accept' or 'decline'." },
        { status: 400 }
      )
    }

    const result = await respondToConnectionRequest(id, user.id, actionInput)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({ ok: true, connection: result.connection })
  } catch (error) {
    console.error("Update connection error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to update connection request." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const result = await respondToConnectionRequest(id, user.id, "decline")
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({ ok: true, message: "Connection removed." })
  } catch (error) {
    console.error("Delete connection error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to remove connection." },
      { status: 500 }
    )
  }
}
