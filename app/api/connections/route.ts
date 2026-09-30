import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  getUserConnections,
  getAcceptedConnections,
  sendConnectionRequest,
  type ConnectionStatus,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get("status") as ConnectionStatus | null
    const validStatus = statusParam === "accepted" || statusParam === "pending" ? statusParam : undefined

    const connections = await getUserConnections(user.id, validStatus)
    const acceptedUsers = await getAcceptedConnections(user.id)

    return NextResponse.json({
      ok: true,
      connections,
      acceptedUsers,
    })
  } catch (error) {
    console.error("List connections error:", error)
    return NextResponse.json({ ok: false, error: "Failed to list connections." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { recipientId } = body

    if (!recipientId || typeof recipientId !== "string") {
      return NextResponse.json(
        { ok: false, error: "recipientId is required." },
        { status: 400 }
      )
    }

    const result = await sendConnectionRequest(user.id, recipientId.trim())
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({ ok: true, connection: result.connection })
  } catch (error) {
    console.error("Send connection error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to send connection request." },
      { status: 500 }
    )
  }
}
