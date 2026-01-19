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

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://checkout-obliqpay.vercel.app"
    
    // 🔥 PAYLOAD COMPLETO CON TUTTI I DATI CLIENTE
    const orderPayload = {
      amount: parseFloat(amount),
      currency: currency.toLowerCase(),
      
      // ✅ DATI CLIENTE BASE
      email: customer?.email || "customer@example.com",
      name: customer?.name || "",
      phone: customer?.phone || "",
      
      // ✅ INDIRIZZO FATTURAZIONE (per prefill carta)
      billing_address: customer?.billing_address ? {
        line1: customer.billing_address.line1,
        line2: customer.billing_address.line2 || "",
        city: customer.billing_address.city,
        state: customer.billing_address.state,
        postal_code: customer.billing_address.postal_code,
        country: customer.billing_address.country,
      } : undefined,
      
      // ✅ INDIRIZZO SPEDIZIONE
      shipping_address: customer?.shipping_address ? {
        line1: customer.shipping_address.line1,
        line2: customer.shipping_address.line2 || "",
        city: customer.shipping_address.city,
        state: customer.shipping_address.state,
        postal_code: customer.shipping_address.postal_code,
        country: customer.shipping_address.country,
      } : undefined,
      
      // ✅ WEBHOOK per notifiche
      webhook_url: `${baseUrl}/api/obliqpay/webhook`,
    }

    console.log("📤 [CREATE] Payload completo:", JSON.stringify(orderPayload, null, 2))

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

    const orderId = data.orderId || data.id
    const checkoutUrl = data.checkoutUrl

    console.log("✅ [CREATE] Success!")
    console.log("🎯 [CREATE] Order ID:", orderId)
    console.log("🔗 [CREATE] Checkout URL:", checkoutUrl)
    console.log("👤 [CREATE] Customer data:", {
      name: customer?.name,
      email: customer?.email,
      phone: customer?.phone,
      billing_city: customer?.billing_address?.city,
      shipping_city: customer?.shipping_address?.city,
    })

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
