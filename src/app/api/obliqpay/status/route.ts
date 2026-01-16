import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { sessionId, amount, currency, customer } = body

    console.log("📦 [CREATE-ORDER] Request:", { sessionId, amount, currency, customer })

    if (!sessionId || !amount || !currency || !customer?.email) {
      return NextResponse.json(
        { ok: false, error: "Parametri mancanti" },
        { status: 400 }
      )
    }

    const apiKey = process.env.OBLIQ_API_KEY
    if (!apiKey) {
      console.error("❌ [CREATE-ORDER] OBLIQ_API_KEY non configurata")
      return NextResponse.json(
        { ok: false, error: "Server configuration error" },
        { status: 500 }
      )
    }

    const orderPayload = {
      amount: parseFloat(amount),
      currency: currency.toLowerCase(),
      customer: {
        email: customer.email,
      },
      metadata: {
        sessionId: sessionId,
        source: "checkout",
      },
    }

    console.log("🚀 [CREATE-ORDER] Calling Obliqpay API...")

    const response = await fetch("https://api.obliqpay.com/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    })

    const data = await response.json().catch(() => ({}))

    console.log("📡 [CREATE-ORDER] Response status:", response.status)
    console.log("📥 [CREATE-ORDER] Response data:", JSON.stringify(data, null, 2))

    if (!response.ok) {
      console.error("❌ [CREATE-ORDER] API Error:", data)
      return NextResponse.json(
        { ok: false, error: data?.message || "Errore creazione ordine" },
        { status: response.status }
      )
    }

    // 🔥 QUESTO È IL FIX: Restituisci anche il clientSecret!
    const orderId = data.id || data.orderId
    const clientSecret = data.clientSecret || data.client_secret
    const checkoutUrl = data.checkoutUrl || `https://v3.obliqpay.com/checkout/${orderId}`

    if (!clientSecret) {
      console.error("❌ [CREATE-ORDER] clientSecret mancante nella risposta!")
      return NextResponse.json(
        { ok: false, error: "clientSecret mancante" },
        { status: 500 }
      )
    }

    console.log("✅ [CREATE-ORDER] Ordine creato con successo:", orderId)
    console.log("🔑 [CREATE-ORDER] Client Secret:", clientSecret.substring(0, 20) + "...")

    return NextResponse.json({
      ok: true,
      orderId: orderId,
      clientSecret: clientSecret,
      checkoutUrl: checkoutUrl,
    })

  } catch (error: any) {
    console.error("💥 [CREATE-ORDER] Exception:", error.message)
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    )
  }
}

