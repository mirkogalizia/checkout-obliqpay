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
    const rawCart = data.rawCart

    if (!rawCart || !rawCart.lines) {
      return NextResponse.json({ error: "Carrello non valido" }, { status: 400 })
    }

    const cfg = await getConfig()
    const shopifyDomain = cfg.shopify.shopDomain
    const storefrontToken = cfg.shopify.storefrontToken

    if (!shopifyDomain || !storefrontToken) {
      console.error("[calculate-shipping] Config Shopify mancante")
      return NextResponse.json({ error: "Configurazione Shopify mancante" }, { status: 500 })
    }

    console.log(`[calculate-shipping] Calcolo per ${destination.city}, ${destination.countryCode}`)

    const shippingRates = await getShopifyShippingRates({
      shopifyDomain,
      storefrontToken,
      cartLines: rawCart.lines.edges || rawCart.lines.nodes || [],
      destination,
    })

    if (!shippingRates || shippingRates.length === 0) {
      console.warn("[calculate-shipping] Nessuna tariffa trovata")
      return NextResponse.json(
        { error: "Nessuna tariffa di spedizione disponibile" },
        { status: 404 }
      )
    }

    shippingRates.sort((a: any, b: any) => parseFloat(a.price.amount) - parseFloat(b.price.amount))

    const selectedRate = shippingRates[0]
    const shippingCents = Math.round(parseFloat(selectedRate.price.amount) * 100)

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
        priceCents: Math.round(parseFloat(rate.price.amount) * 100),
        currency: rate.price.currencyCode,
      })),
    })

    return NextResponse.json({
      shippingCents,
      destination,
      method: selectedRate.title,
      handle: selectedRate.handle,
      currency: selectedRate.price.currencyCode,
      availableRates: shippingRates.map((rate: any) => ({
        title: rate.title,
        handle: rate.handle,
        priceCents: Math.round(parseFloat(rate.price.amount) * 100),
        currency: rate.price.currencyCode,
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

async function getShopifyShippingRates({
  shopifyDomain,
  storefrontToken,
  cartLines,
  destination,
}: {
  shopifyDomain: string
  storefrontToken: string
  cartLines: any[]
  destination: Destination
}) {
  try {
    const lineItems = cartLines.map((line: any) => {
      const node = line.node || line
      return {
        variantId: node.merchandise?.id || node.variant?.id,
        quantity: node.quantity || 1,
      }
    })

    if (lineItems.length === 0) {
      console.warn("[getShopifyShippingRates] Nessun item")
      return null
    }

    const mutation = `
      mutation checkoutCreate($input: CheckoutCreateInput!) {
        checkoutCreate(input: $input) {
          checkout {
            id
            webUrl
            availableShippingRates {
              ready
              shippingRates {
                handle
                title
                priceV2 {
                  amount
                  currencyCode
                }
              }
            }
          }
          checkoutUserErrors {
            message
            field
            code
          }
        }
      }
    `

    const variables = {
      input: {
        lineItems,
        shippingAddress: {
          address1: " ",
          city: destination.city || " ",
          province: destination.province || undefined,
          country: destination.countryCode || "IT",
          zip: destination.postalCode || undefined,
        },
      },
    }

    const response = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[getShopifyShippingRates] HTTP error:", response.status, errorText)
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()

    if (result.errors) {
      console.error("[getShopifyShippingRates] GraphQL errors:", result.errors)
      throw new Error(result.errors[0]?.message || "Errore GraphQL")
    }

    const checkoutUserErrors = result.data?.checkoutCreate?.checkoutUserErrors
    if (checkoutUserErrors && checkoutUserErrors.length > 0) {
      console.error("[getShopifyShippingRates] Checkout errors:", checkoutUserErrors)
      throw new Error(checkoutUserErrors[0]?.message || "Errore checkout")
    }

    const checkout = result.data?.checkoutCreate?.checkout
    if (!checkout) {
      console.error("[getShopifyShippingRates] No checkout")
      return null
    }

    const availableShippingRates = checkout.availableShippingRates
    if (!availableShippingRates?.ready) {
      console.warn("[getShopifyShippingRates] Rates not ready")
      return null
    }

    const shippingRates = availableShippingRates.shippingRates || []

    console.log(
      `[getShopifyShippingRates] ✅ ${shippingRates.length} tariffe:`,
      shippingRates.map((r: any) => `${r.title}: ${r.priceV2?.amount} ${r.priceV2?.currencyCode}`)
    )

    return shippingRates.map((rate: any) => ({
      handle: rate.handle,
      title: rate.title,
      price: {
        amount: rate.priceV2?.amount || rate.price?.amount || "0",
        currencyCode: rate.priceV2?.currencyCode || rate.price?.currencyCode || "EUR",
      },
    }))
  } catch (error: any) {
    console.error("[getShopifyShippingRates] errore:", error)
    throw error
  }
}

