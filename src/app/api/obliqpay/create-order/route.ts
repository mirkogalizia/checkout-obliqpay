import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, amount, currency, customer } = body

    console.log("🚀 [CREATE] Request:", { sessionId, amount, currency, customer })

    if (!sessionId || !amount || !currency) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    const apiKey = process.env.OBLIQ_API_KEY
    if (!apiKey) {
      console.error("❌ [CREATE] OBLIQ_API_KEY not configured")
      return NextResponse.json(
        { ok: false, error: "Server configuration error" },
        { status: 500 }
      )
    }

    // 🔥 IMPORTANTE: Aggiungi webhook_url come nella documentazione
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://checkout-obliqpay.vercel.app"
    
    const orderPayload = {
      amount: parseFloat(amount),
      currency: currency.toLowerCase(),
      email: customer?.email || "customer@example.com",
      webhook_url: `${baseUrl}/api/obliqpay/webhook`, // ✅ WEBHOOK per notifiche
    }

    console.log("📤 [CREATE] Payload:", JSON.stringify(orderPayload, null, 2))

    const response = await fetch("https://api.obliqpay.com/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    })

    const data = await response.json().catch(() => ({}))

    console.log("📡 [CREATE] Response status:", response.status)
    console.log("📥 [CREATE] Response data:", JSON.stringify(data, null, 2))

    if (!response.ok) {
      console.error("❌ [CREATE] API error:", data)
      return NextResponse.json(
        { ok: false, error: data?.message || "Order creation failed", detail: data },
        { status: response.status }
      )
    }

    // ✅ La risposta contiene: orderId, checkoutUrl
    const orderId = data.orderId || data.id
    const checkoutUrl = data.checkoutUrl

    console.log("✅ [CREATE] Success, orderId:", orderId)

    return NextResponse.json({
      ok: true,
      orderId,
      checkoutUrl,
    })

  } catch (error: any) {
    console.error("💥 [CREATE] Exception:", error.message)
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

