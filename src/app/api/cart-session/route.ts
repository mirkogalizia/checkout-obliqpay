// src/app/api/cart-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

// ✅ Funzione per rimuovere undefined/null da oggetti
function cleanObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanObject).filter(item => item !== undefined && item !== null)
  }
  if (obj && typeof obj === 'object') {
    const cleaned: any = {}
    for (const key in obj) {
      if (obj[key] !== undefined && obj[key] !== null) {
        cleaned[key] = cleanObject(obj[key])
      }
    }
    return cleaned
  }
  return obj
}

export async function POST(req: NextRequest) {
  try {
    console.log("[cart-session POST] ✓ Request received")
    
    const body = await req.json()
    const { cart } = body

    if (!cart || !cart.items) {
      return NextResponse.json({ error: "Invalid cart" }, { status: 400 })
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    console.log("[cart-session POST] 🔍 Getting config...")
    const config = await getConfig()
    const shopDomain = config.shopify?.shopDomain || "unknown"

    console.log("[cart-session POST] 📦 Processing", cart.items.length, "items...")
    
    // ✅ Mappatura items con valori garantiti (no undefined)
    const items = cart.items.map((item: any) => {
      const priceEuros = Number(item.price || 0)
      const linePriceEuros = Number(item.line_price || priceEuros * (item.quantity || 1))
      
      return {
        id: String(item.id || ''),
        variant_id: String(item.variant_id || ''),
        product_id: String(item.product_id || ''),
        title: item.title || 'Prodotto',
        quantity: Number(item.quantity || 1),
        price: priceEuros.toFixed(2),
        line_price: linePriceEuros.toFixed(2),
        priceCents: Math.round(priceEuros * 100),
        linePriceCents: Math.round(linePriceEuros * 100),
        image: item.image || ''
      }
    })

    const subtotalEuros = Number(cart.items_subtotal_price || 0)
    const totalEuros = Number(cart.total_price || 0)
    const shippingEuros = Math.max(0, totalEuros - subtotalEuros)

    const subtotalCents = Math.round(subtotalEuros * 100)
    const shippingCents = Math.round(shippingEuros * 100)
    const totalCents = Math.round(totalEuros * 100)

    const docData = {
      sessionId,
      createdAt: new Date().toISOString(),
      currency: cart.currency || "EUR",
      items,
      subtotalCents,
      shippingCents,
      totalCents,
      paymentMethod: "obliqpay",
      shopDomain,
      rawCart: cleanObject(cart),
    }

    console.log("[cart-session POST] 💾 Saving to Firebase...")
    console.log("[cart-session POST] Total:", totalCents, "cents")

    // ✅ Pulisci tutto il documento prima del save
    const cleanedData = cleanObject(docData)

    await db.collection("cartSessions").doc(sessionId).set(cleanedData)
    
    console.log("[cart-session POST] ✅ Saved successfully!")

    return NextResponse.json({ 
      sessionId, 
      success: true 
    })
  } catch (error: any) {
    console.error("[cart-session POST] ❌ Error:", error.message)
    console.error("[cart-session POST] Stack:", error.stack)
    return NextResponse.json({ 
      error: "Errore interno creazione sessione carrello",
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 })
    }

    console.log("[cart-session GET] Fetching session:", sessionId)

    const doc = await db.collection("cartSessions").doc(sessionId).get()

    if (!doc.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json(doc.data())
  } catch (error: any) {
    console.error("[cart-session GET] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
