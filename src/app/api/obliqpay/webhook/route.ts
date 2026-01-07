// src/app/api/obliqpay/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"
import crypto from "crypto"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    console.log("[obliqpay-webhook] ════════════════════════════════════")
    console.log("[obliqpay-webhook] 🔔 Webhook ricevuto:", new Date().toISOString())

    const { searchParams } = new URL(req.url)
    const secret = searchParams.get("secret")
    const sessionId = searchParams.get("sessionId")

    // ✅ Verifica secret
    if (!secret || secret !== process.env.OBLIQPAY_WEBHOOK_SECRET) {
      console.error("[obliqpay-webhook] ❌ Secret invalido")
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    if (!sessionId) {
      console.error("[obliqpay-webhook] ❌ SessionId mancante")
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    console.log(`[obliqpay-webhook] 🔑 Session ID: ${sessionId}`)

    const body = await req.json().catch(() => null)

    if (!body) {
      console.error("[obliqpay-webhook] ❌ Body vuoto")
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    console.log("[obliqpay-webhook] 📨 Payload:", JSON.stringify(body, null, 2))

    const status = body?.status || body?.payment_status || body?.event
    const orderId = body?.order_id || body?.orderId

    console.log(`[obliqpay-webhook] 📊 Status: ${status}`)
    console.log(`[obliqpay-webhook] 🆔 Order ID: ${orderId}`)

    // ✅ Recupera sessione da Firebase
    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      console.error(`[obliqpay-webhook] ❌ Sessione ${sessionId} NON trovata`)
      return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 })
    }

    const sessionData: any = snap.data() || {}
    console.log(`[obliqpay-webhook] ✅ Sessione trovata`)
    console.log(`[obliqpay-webhook] 📦 Items: ${sessionData.items?.length || 0}`)

    // ✅ Verifica se ordine già creato
    if (sessionData.shopifyOrderId) {
      console.log(`[obliqpay-webhook] ℹ️ Ordine già esistente: #${sessionData.shopifyOrderNumber}`)
      return NextResponse.json({ ok: true, alreadyProcessed: true }, { status: 200 })
    }

    // ✅ Salva webhook in Firebase
    await db.collection(COLLECTION).doc(sessionId).set(
      {
        obliqpay: {
          webhookLast: body,
          status: status || "webhook_received",
          orderId: orderId,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    )

    // ✅ Se pagamento completato → CREA ORDINE SHOPIFY
    if (status === "paid" || status === "completed" || status === "succeeded") {
      console.log("[obliqpay-webhook] 🚀 PAGAMENTO COMPLETATO - Creazione ordine Shopify...")

      const config = await getConfig()
      
      const result = await createShopifyOrder({
        sessionId,
        sessionData,
        obliqpayData: body,
        config,
      })

      if (result.orderId) {
        console.log(`[obliqpay-webhook] 🎉 Ordine creato: #${result.orderNumber} (ID: ${result.orderId})`)

        // ✅ Aggiorna Firebase con dati ordine
        await db.collection(COLLECTION).doc(sessionId).update({
          shopifyOrderId: result.orderId,
          shopifyOrderNumber: result.orderNumber,
          orderCreatedAt: new Date().toISOString(),
          paymentStatus: "paid",
          webhookProcessedAt: new Date().toISOString(),
          paymentMethod: "obliqpay",
        })

        console.log("[obliqpay-webhook] ✅ Dati salvati in Firebase")

        // ✅ Invia Meta Conversions API
        await sendMetaPurchaseEvent({
          obliqpayData: body,
          sessionData,
          sessionId,
          req,
          config,
        })

        // ✅ Svuota carrello Shopify
        if (sessionData.rawCart?.id) {
          console.log(`[obliqpay-webhook] 🧹 Svuotamento carrello...`)
          await clearShopifyCart(sessionData.rawCart.id, config)
        }

        console.log("[obliqpay-webhook] ════════════════════════════════════")
        console.log("[obliqpay-webhook] ✅ COMPLETATO CON SUCCESSO")
        console.log("[obliqpay-webhook] ════════════════════════════════════")

        return NextResponse.json({ 
          ok: true, 
          orderId: result.orderId,
          orderNumber: result.orderNumber 
        }, { status: 200 })
      } else {
        console.error("[obliqpay-webhook] ❌ Creazione ordine FALLITA")
        return NextResponse.json({ ok: true, error: "order_creation_failed" }, { status: 200 })
      }
    }

    console.log(`[obliqpay-webhook] ℹ️ Status ${status} - nessuna azione richiesta`)
    return NextResponse.json({ ok: true }, { status: 200 })

  } catch (error: any) {
    console.error("[obliqpay-webhook] 💥 ERRORE CRITICO:")
    console.error("[obliqpay-webhook] Messaggio:", error.message)
    console.error("[obliqpay-webhook] Stack:", error.stack)
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════
// CREA ORDINE SHOPIFY
// ═══════════════════════════════════════════════════════════════
async function createShopifyOrder({
  sessionId,
  sessionData,
  obliqpayData,
  config,
}: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const adminToken = config.shopify?.adminToken

    console.log("[createShopifyOrder] 🔍 Config Shopify:")
    console.log("[createShopifyOrder]    Domain:", shopifyDomain || "❌ MANCANTE")
    console.log("[createShopifyOrder]    Token:", adminToken ? "✅ Presente" : "❌ MANCANTE")

    if (!shopifyDomain || !adminToken) {
      console.error("[createShopifyOrder] ❌ Config Shopify mancante")
      return { orderId: null, orderNumber: null }
    }

    const customer = sessionData.customer || {}
    const items = sessionData.items || []

    if (items.length === 0) {
      console.error("[createShopifyOrder] ❌ Nessun prodotto nel carrello")
      return { orderId: null, orderNumber: null }
    }

    console.log(`[createShopifyOrder] 📦 Prodotti: ${items.length}`)
    console.log(`[createShopifyOrder] 👤 Cliente: ${customer.email || 'N/A'}`)

    // ✅ Genera email fallback da shopDomain
    const shopBaseDomain = shopifyDomain.replace('.myshopify.com', '.com')
    const fallbackEmail = `noreply@${shopBaseDomain}`
    const customerEmail = customer.email || fallbackEmail

    // ✅ Genera telefono fallback internazionale
    let phoneNumber = (customer.phone || "").trim()
    if (!phoneNumber || phoneNumber.length < 5) {
      phoneNumber = "+00 000 0000000"
      console.log("[createShopifyOrder] ⚠️ Telefono mancante, uso fallback")
    }

    // ✅ Prepara line items
    const lineItems = items.map((item: any, index: number) => {
      let variantId = item.variant_id || item.id
      
      if (typeof variantId === "string") {
        if (variantId.includes("gid://")) {
          variantId = variantId.split("/").pop()
        }
        variantId = variantId.replace(/\D/g, '')
      }

      const variantIdNum = parseInt(variantId)
      
      if (isNaN(variantIdNum) || variantIdNum <= 0) {
        console.error(`[createShopifyOrder] ❌ Variant ID invalido per item ${index + 1}`)
        return null
      }

      const quantity = item.quantity || 1
      const lineTotal = (item.linePriceCents || item.priceCents * quantity || 0) / 100
      const price = lineTotal.toFixed(2)

      console.log(`[createShopifyOrder]    ${index + 1}. ${item.title} - €${price}`)

      return {
        variant_id: variantIdNum,
        quantity: quantity,
        price: price,
      }
    }).filter((item: any) => item !== null)

    if (lineItems.length === 0) {
      console.error("[createShopifyOrder] ❌ Nessun line item valido")
      return { orderId: null, orderNumber: null }
    }

    // ✅ Calcola totale da Obliqpay
    const totalAmount = obliqpayData.amount 
      ? Number(obliqpayData.amount).toFixed(2)
      : (sessionData.totalCents / 100).toFixed(2)
    
    console.log(`[createShopifyOrder] 💰 Totale: €${totalAmount}`)

    const nameParts = (customer.fullName || "Cliente Checkout").trim().split(/\s+/)
    const firstName = nameParts[0] || "Cliente"
    const lastName = nameParts.slice(1).join(" ") || "Checkout"

    const orderPayload = {
      order: {
        email: customerEmail,
        fulfillment_status: "unfulfilled",
        financial_status: "paid",
        send_receipt: true,
        send_fulfillment_receipt: false,

        line_items: lineItems,

        customer: {
          email: customerEmail,
          first_name: firstName,
          last_name: lastName,
          phone: phoneNumber,
        },

        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: customer.address1 || "N/A",
          address2: customer.address2 || "",
          city: customer.city || "N/A",
          province: customer.province || "",
          zip: customer.postalCode || "00000",
          country_code: (customer.countryCode || "IT").toUpperCase(),
          phone: phoneNumber,
        },

        billing_address: {
          first_name: firstName,
          last_name: lastName,
          address1: customer.address1 || "N/A",
          address2: customer.address2 || "",
          city: customer.city || "N/A",
          province: customer.province || "",
          zip: customer.postalCode || "00000",
          country_code: (customer.countryCode || "IT").toUpperCase(),
          phone: phoneNumber,
        },

        shipping_lines: [
          {
            title: "Spedizione Standard",
            price: "5.90",
            code: "STANDARD",
          },
        ],

        transactions: [
          {
            kind: "sale",
            status: "success",
            amount: totalAmount,
            currency: (obliqpayData.currency || sessionData.currency || "EUR").toUpperCase(),
            gateway: "Obliqpay",
            authorization: obliqpayData.order_id || obliqpayData.orderId,
          },
        ],

        note: `Checkout custom - Session: ${sessionId} - Obliqpay Order: ${obliqpayData.order_id || obliqpayData.orderId}`,
        tags: `checkout-custom,obliqpay-paid,automated`,
      },
    }

    console.log("[createShopifyOrder] 📤 Invio a Shopify API...")

    const response = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
        body: JSON.stringify(orderPayload),
      }
    )

    const responseText = await response.text()

    if (!response.ok) {
      console.error("[createShopifyOrder] ❌ ERRORE API Shopify")
      console.error("[createShopifyOrder] Status:", response.status)
      console.error("[createShopifyOrder] Risposta:", responseText)
      
      try {
        const errorData = JSON.parse(responseText)
        console.error("[createShopifyOrder] Errori:", JSON.stringify(errorData, null, 2))
      } catch (e) {}
      
      return { orderId: null, orderNumber: null }
    }

    const result = JSON.parse(responseText)

    if (result.order?.id) {
      console.log("[createShopifyOrder] 🎉 ORDINE CREATO!")
      console.log(`[createShopifyOrder]    #${result.order.order_number} (ID: ${result.order.id})`)
      
      return {
        orderId: result.order.id,
        orderNumber: result.order.order_number,
      }
    }

    console.error("[createShopifyOrder] ❌ Risposta senza order.id")
    return { orderId: null, orderNumber: null }

  } catch (error: any) {
    console.error("[createShopifyOrder] 💥 ERRORE:", error.message)
    return { orderId: null, orderNumber: null }
  }
}

// ═══════════════════════════════════════════════════════════════
// META CONVERSIONS API - SERVER-SIDE TRACKING
// ═══════════════════════════════════════════════════════════════
async function sendMetaPurchaseEvent({
  obliqpayData,
  sessionData,
  sessionId,
  req,
  config,
}: {
  obliqpayData: any
  sessionData: any
  sessionId: string
  req: NextRequest
  config: any
}) {
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID
  const accessToken = process.env.FB_CAPI_ACCESS_TOKEN

  if (!pixelId || !accessToken) {
    console.log('[obliqpay-webhook] ⚠️ Meta Pixel non configurato (skip CAPI)')
    return
  }

  try {
    console.log('[obliqpay-webhook] 📊 Invio Meta Conversions API...')

    const customer = sessionData.customer || {}
    
    // ✅ HASH dati sensibili (requirement Meta)
    const hashData = (data: string) => {
      return data ? crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex') : undefined
    }

    const eventId = obliqpayData.order_id || obliqpayData.orderId
    const eventTime = Math.floor(Date.now() / 1000)

    const userData: any = {
      client_ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || 
                         req.headers.get('x-real-ip') || 
                         '0.0.0.0',
      client_user_agent: req.headers.get('user-agent') || '',
    }

    // ✅ DATI HASHED (obbligatori per match quality)
    if (customer.email) {
      userData.em = hashData(customer.email)
    }
    if (customer.phone) {
      const cleanPhone = customer.phone.replace(/\D/g, '')
      userData.ph = hashData(cleanPhone)
    }
    if (customer.fullName) {
      const nameParts = customer.fullName.split(' ')
      if (nameParts[0]) userData.fn = hashData(nameParts[0])
      if (nameParts[1]) userData.ln = hashData(nameParts.slice(1).join(' '))
    }
    if (customer.city) {
      userData.ct = hashData(customer.city)
    }
    if (customer.postalCode) {
      userData.zp = customer.postalCode.replace(/\s/g, '').toLowerCase()
    }
    if (customer.countryCode) {
      userData.country = customer.countryCode.toLowerCase()
    }

    // ✅ COOKIE Meta (se disponibili)
    if (sessionData.fbp) {
      userData.fbp = sessionData.fbp
    }
    if (sessionData.fbc) {
      userData.fbc = sessionData.fbc
    }

    // ✅ CUSTOM DATA (parametri acquisto)
    const customData: any = {
      value: obliqpayData.amount || (sessionData.totalCents / 100),
      currency: (obliqpayData.currency || sessionData.currency || 'EUR').toUpperCase(),
      content_type: 'product',
    }

    if (sessionData.items && sessionData.items.length > 0) {
      customData.content_ids = sessionData.items.map((item: any) => String(item.id || item.variant_id))
      customData.num_items = sessionData.items.length
      customData.contents = sessionData.items.map((item: any) => ({
        id: String(item.id || item.variant_id),
        quantity: item.quantity || 1,
        item_price: (item.priceCents || 0) / 100,
      }))
    }

    // ✅ URL dinamico da config
    const checkoutDomain = config.checkoutDomain || process.env.APP_URL || "https://checkout.example.com"

    // ✅ PAYLOAD META CAPI
    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: eventId, // ← DEDUPLICATION con client-side
        event_source_url: `${checkoutDomain}/thank-you?sessionId=${sessionId}`,
        action_source: 'website',
        user_data: userData,
        custom_data: customData,
      }],
      access_token: accessToken,
    }

    console.log('[obliqpay-webhook] 📤 Payload Meta CAPI:', JSON.stringify(payload, null, 2))

    // ✅ INVIO A META
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    const result = await response.json()

    if (response.ok && result.events_received > 0) {
      console.log('[obliqpay-webhook] ✅ Meta CAPI Purchase inviato con successo')
      console.log('[obliqpay-webhook] Event ID:', eventId)
      console.log('[obliqpay-webhook] Events received:', result.events_received)
    } else {
      console.error('[obliqpay-webhook] ❌ Errore Meta CAPI:', result)
    }

  } catch (error: any) {
    console.error('[obliqpay-webhook] ⚠️ Errore invio Meta CAPI:', error.message)
  }
}

// ═══════════════════════════════════════════════════════════════
// SVUOTA CARRELLO SHOPIFY
// ═══════════════════════════════════════════════════════════════
async function clearShopifyCart(cartId: string, config: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const storefrontToken = config.shopify?.storefrontToken

    if (!shopifyDomain || !storefrontToken) {
      console.log("[clearShopifyCart] ⚠️ Config mancante, skip")
      return
    }

    const queryCart = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          lines(first: 100) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `

    const cartResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({
          query: queryCart,
          variables: { cartId },
        }),
      }
    )

    const cartData = await cartResponse.json()

    if (cartData.errors) {
      console.error("[clearShopifyCart] ❌ Errore query:", cartData.errors)
      return
    }

    const lineIds = cartData.data?.cart?.lines?.edges?.map((edge: any) => edge.node.id) || []

    if (lineIds.length === 0) {
      console.log("[clearShopifyCart] ℹ️ Carrello già vuoto")
      return
    }

    const mutation = `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart {
            id
            totalQuantity
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const removeResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({
          query: mutation,
          variables: { cartId, lineIds },
        }),
      }
    )

    const removeData = await removeResponse.json()

    if (removeData.data?.cartLinesRemove?.userErrors?.length > 0) {
      console.error("[clearShopifyCart] ❌ Errori:", removeData.data.cartLinesRemove.userErrors)
    } else {
      console.log("[clearShopifyCart] ✅ Carrello svuotato")
    }
  } catch (error: any) {
    console.error("[clearShopifyCart] ❌ Errore:", error.message)
  }
}
