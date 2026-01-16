import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get("orderId")

    console.log("🔍 [STATUS GET] Request:", { orderId })

    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "orderId mancante" },
        { status: 400 }
      )
    }

    const apiKey = process.env.OBLIQ_API_KEY
    if (!apiKey) {
      console.error("❌ [STATUS GET] OBLIQ_API_KEY non configurata")
      return NextResponse.json(
        { ok: false, error: "Server configuration error" },
        { status: 500 }
      )
    }

    console.log("🚀 [STATUS GET] Calling Obliqpay API...")

    const response = await fetch(`https://api.obliqpay.com/orders/${orderId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    const data = await response.json().catch(() => ({}))

    console.log("📡 [STATUS GET] Response status:", response.status)
    console.log("📥 [STATUS GET] Response data:", JSON.stringify(data, null, 2))

    if (!response.ok) {
      console.error("❌ [STATUS GET] API error:", data)
      return NextResponse.json(
        { ok: false, error: data?.message || "Errore recupero status", detail: data },
        { status: response.status }
      )
    }

    console.log("✅ [STATUS GET] Success")

    return NextResponse.json({
      ok: true,
      order: data,
    })

  } catch (error: any) {
    console.error("💥 [STATUS GET] Exception:", error.message)
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    )
  }
}


