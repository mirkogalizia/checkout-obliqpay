// src/app/api/calculate-shipping/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

type Destination = {
  city: string
  province: string
  postalCode: string
  countryCode: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const sessionId = body?.sessionId as string | undefined
    const destination = body?.destination as Destination | undefined

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId mancante" }, { status: 400 })
    }

    if (!destination || !destination.countryCode) {
      return NextResponse.json({ error: "Dati destinazione mancanti" }, { status: 400 })
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json({ error: "Sessione carrello non trovata" }, { status: 404 })
    }

    const data: any = snap.data() || {}

    console.log("[calculate-shipping] Struttura sessione:", {
      sessionId,
      hasRawCart: !!data.rawCart,
      hasRawCartItems: !!data.rawCart?.items,
      rawCartItemsCount: data.rawCart?.items?.length,
    })

    let cartItems: any[] = []

    if (Array.isArray(data.rawCart?.items) && data.rawCart.items.length > 0) {
      cartItems = data.rawCart.items
      console.log("[calculate-shipping] Usando rawCart.items")
    } else if (Array.isArray(data.items) && data.items.length > 0) {
      cartItems = data.items
      console.log("[calculate-shipping] Usando items array")
    }

    if (cartItems.length === 0) {
      console.error("[calculate-shipping] Nessun item trovato")
      return NextResponse.json({ error: "Carrello vuoto" }, { status: 400 })
    }

    const cfg = await getConfig()
    const shopifyDomain = cfg.shopify.shopDomain
    const adminToken = cfg.shopify.adminToken

    if (!shopifyDomain || !adminToken) {
      console.error("[calculate-shipping] Config Shopify mancante")
      return NextResponse.json({ error: "Configurazione Shopify mancante" }, { status: 500 })
    }

    console.log(`[calculate-shipping] Calcolo per ${destination.city}, ${destination.countryCode}`)

    const shippingRates = await calculateShippingWithAdmin({
      shopifyDomain,
      adminToken,
      cartItems,
      destination,
    })

    if (!shippingRates || shippingRates.length === 0) {
      console.warn("[calculate-shipping] Nessuna tariffa trovata")
      
      // Fallback: usa tariffa fissa
      const fallbackShippingCents = getFallbackShipping(destination.countryCode)
      
      await db.collection(COLLECTION).doc(sessionId).update({
        shippingCents: fallbackShippingCents,
        shippingDestination: destination,
        shippingCalculatedAt: new Date().toISOString(),
        shippingMethod: "Spedizione Standard (fallback)",
      })

      return NextResponse.json({
        shippingCents: fallbackShippingCents,
        destination,
        method: "Spedizione Standard (fallback)",
        currency: "EUR",
      })
    }

    shippingRates.sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))

    const selectedRate = shippingRates[0]
    const shippingCents = Math.round(parseFloat(selectedRate.price) * 100)

    console.log(`[calculate-shipping] ✅ ${selectedRate.title} = €${(shippingCents / 100).toFixed(2)}`)

    await db.collection(COLLECTION).doc(sessionId).update({
      shippingCents,
      shippingDestination: destination,
      shippingCalculatedAt: new Date().toISOString(),
      shippingMethod: selectedRate.title,
      shippingHandle: selectedRate.handle,
      availableShippingRates: shippingRates.map((rate: any) => ({
        title: rate.title,
        handle: rate.handle,
        priceCents: Math.round(parseFloat(rate.price) * 100),
        currency: "EUR",
      })),
    })

    return NextResponse.json({
      shippingCents,
      destination,
      method: selectedRate.title,
      handle: selectedRate.handle,
      currency: "EUR",
      availableRates: shippingRates.map((rate: any) => ({
        title: rate.title,
        handle: rate.handle,
        priceCents: Math.round(parseFloat(rate.price) * 100),
        currency: "EUR",
      })),
    })
  } catch (error: any) {
    console.error("[calculate-shipping] errore:", error)
    return NextResponse.json(
      { error: error?.message || "Errore calcolo spedizione" },
      { status: 500 }
    )
  }
}

// Calcola spedizione usando Shopify Admin API
async function calculateShippingWithAdmin({
  shopifyDomain,
  adminToken,
  cartItems,
  destination,
}: {
  shopifyDomain: string
  adminToken: string
  cartItems: any[]
  destination: Destination
}) {
  try {
    // Prepara line items per draft order
    const lineItems = cartItems.map((item: any) => {
      const variantId = item.variant_id || item.id
      
      if (!variantId) {
        console.error("[calculateShippingWithAdmin] Item senza variant_id:", item)
        return null
      }

      // Rimuovi prefisso gid:// se presente
      let cleanVariantId = variantId
      if (typeof variantId === "string" && variantId.startsWith("gid://")) {
        cleanVariantId = variantId.split("/").pop()
      }

      return {
        variant_id: cleanVariantId,
        quantity: item.quantity || 1,
      }
    }).filter(Boolean)

    if (lineItems.length === 0) {
      throw new Error("Nessun line item valido")
    }

    console.log(`[calculateShippingWithAdmin] Creazione draft order per calcolare spedizione`)

    // Crea un draft order temporaneo
    const draftOrderPayload = {
      draft_order: {
        line_items: lineItems,
        shipping_address: {
          address1: " ",
          city: destination.city || " ",
          province: destination.province || undefined,
          country_code: destination.countryCode || "IT",
          zip: destination.postalCode || undefined,
        },
        use_customer_default_address: false,
      },
    }

    const createResponse = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
        body: JSON.stringify(draftOrderPayload),
      }
    )

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error("[calculateShippingWithAdmin] Errore creazione draft order:", createResponse.status, errorText)
      throw new Error(`Errore creazione draft order: ${createResponse.status}`)
    }

    const draftOrderResult = await createResponse.json()

    if (!draftOrderResult.draft_order?.id) {
      console.error("[calculateShippingWithAdmin] Nessun draft order creato")
      return null
    }

    const draftOrderId = draftOrderResult.draft_order.id

    console.log(`[calculateShippingWithAdmin] Draft order creato: ${draftOrderId}`)

    // Ottieni le shipping rates per questo draft order
    const ratesResponse = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/draft_orders/${draftOrderId}/shipping_rates.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
      }
    )

    if (!ratesResponse.ok) {
      const errorText = await ratesResponse.text()
      console.error("[calculateShippingWithAdmin] Errore recupero shipping rates:", ratesResponse.status, errorText)
      
      // Elimina draft order prima di uscire
      await fetch(
        `https://${shopifyDomain}/admin/api/2024-10/draft_orders/${draftOrderId}.json`,
        {
          method: "DELETE",
          headers: { "X-Shopify-Access-Token": adminToken },
        }
      )
      
      return null
    }

    const ratesResult = await ratesResponse.json()

    // Elimina il draft order (pulizia)
    await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/draft_orders/${draftOrderId}.json`,
      {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": adminToken },
      }
    )

    const shippingRates = ratesResult.shipping_rates || []

    if (shippingRates.length === 0) {
      console.warn("[calculateShippingWithAdmin] Nessuna shipping rate disponibile")
      return null
    }

    console.log(
      `[calculateShippingWithAdmin] ✅ ${shippingRates.length} tariffe:`,
      shippingRates.map((r: any) => `${r.title}: ${r.price} EUR`)
    )

    return shippingRates.map((rate: any) => ({
      handle: rate.handle || rate.id,
      title: rate.title,
      price: rate.price,
    }))
  } catch (error: any) {
    console.error("[calculateShippingWithAdmin] errore:", error)
    throw error
  }
}

// Fallback: tariffe fisse se Shopify non risponde
function getFallbackShipping(countryCode: string): number {
  const country = countryCode.toUpperCase()
  
  if (country === "IT") {
    return 500 // 5€
  } else if (["FR", "DE", "ES", "AT", "BE", "NL", "PT", "IE", "LU"].includes(country)) {
    return 1000 // 10€
  } else if (["GB", "CH", "NO", "SE", "DK", "FI"].includes(country)) {
    return 1500 // 15€
  } else {
    return 2000 // 20€
  }
}

