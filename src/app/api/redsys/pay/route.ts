export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"  // ✅ Usa la tua lib
import { createRedsysAPI, SANDBOX_URLS, PRODUCTION_URLS } from "redsys-easy"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId, amountCents, idOper, customer, billing } = body

    if (!sessionId || !idOper || !customer) {
      return NextResponse.json({ 
        error: "Dati mancanti" 
      }, { status: 400 })
    }

    // 1) Recupera sessione carrello da Firebase
    const cartSnap = await db.collection("cartSessions").doc(sessionId).get()
    if (!cartSnap.exists) {
      return NextResponse.json({ error: "Sessione non trovata" }, { status: 404 })
    }

    const cartData = cartSnap.data()!

    console.log("💳 Pagamento Redsys:", {
      sessionId,
      orderId: idOper,
      amount: amountCents,
      customer: customer.email,
    })

    // 2) ✅ Recupera config Shopify da Firebase (struttura corretta)
    const config = await getConfig()
    const shopDomain = config.shopify?.shopDomain  // ✅ Corretto
    const accessToken = config.shopify?.adminToken  // ✅ Corretto

    // 3) ✅ Crea ordine in Shopify (se configurato)
    let shopifyOrderId = null
    let shopifyOrderNumber = null

    if (shopDomain && accessToken && cartData.rawCart?.id) {
      try {
        const shopifyOrder = await createShopifyOrder({
          shopDomain,
          accessToken,
          cartId: cartData.rawCart.id,
          customer,
          billing: billing || customer,
          totalCents: amountCents,
        })
        shopifyOrderId = shopifyOrder.id
        shopifyOrderNumber = shopifyOrder.orderNumber
        
        console.log("✅ Ordine Shopify creato:", shopifyOrderNumber)
      } catch (err: any) {
        console.error("⚠️ Errore creazione ordine Shopify:", err)
        // Continua comunque per non bloccare il pagamento
      }
    } else {
      console.warn("⚠️ Shopify non configurato o cartId mancante", {
        hasShopDomain: !!shopDomain,
        hasAccessToken: !!accessToken,
        hasCartId: !!cartData.rawCart?.id
      })
    }

    // 4) ✅ Aggiorna Firebase con ordine completato
    await db.collection("cartSessions").doc(sessionId).update({
      status: "completed",
      paymentMethod: "redsys",
      redsysIdOper: idOper,
      customer,
      billing: billing || customer,
      completedAt: new Date().toISOString(),
      shopifyOrderId,
      shopifyOrderNumber,
      totalPaidCents: amountCents,
    })

    // 5) ✅ Salva ordine separato in collection orders
    await db.collection("orders").add({
      sessionId,
      orderId: idOper,
      paymentMethod: "redsys",
      status: "paid",
      amountCents,
      currency: "EUR",
      customer,
      billing: billing || customer,
      items: cartData.items || [],
      shopifyOrderId,
      shopifyOrderNumber,
      shopDomain,
      createdAt: new Date().toISOString(),
    })

    // 6) TODO: Invia email conferma
    // await sendOrderConfirmationEmail(customer.email, { orderId: idOper, ... })

    return NextResponse.json({
      ok: true,
      orderId: idOper,
      shopifyOrderNumber,
    })
  } catch (e: any) {
    console.error("❌ Errore pagamento:", e)
    return NextResponse.json({ 
      error: e.message || "Errore pagamento" 
    }, { status: 500 })
  }
}

// ✅ Helper per creare ordine Shopify
async function createShopifyOrder(data: {
  shopDomain: string
  accessToken: string
  cartId: string
  customer: any
  billing: any
  totalCents: number
}) {
  const response = await fetch(`https://${data.shopDomain}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": data.accessToken,
    },
    body: JSON.stringify({
      query: `
        mutation cartSubmit($cartId: ID!) {
          cartSubmit(cartId: $cartId) {
            job {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        cartId: data.cartId,
      },
    }),
  })

  const result = await response.json()

  if (result.errors || result.data?.cartSubmit?.userErrors?.length) {
    throw new Error(
      result.data?.cartSubmit?.userErrors[0]?.message || 
      "Errore creazione ordine Shopify"
    )
  }

  return {
    id: result.data.cartSubmit.job.id,
    orderNumber: null, // Viene assegnato dopo dal webhook
  }
}
