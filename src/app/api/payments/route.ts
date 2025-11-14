// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getConfig, AppConfig, StripeAccount } from "@/lib/config"

// Per ora: usa il PRIMO account Stripe che ha una secretKey valorizzata
function pickStripeAccount(cfg: AppConfig): StripeAccount | null {
  const list = cfg.stripeAccounts || []
  const withKey = list.filter(
    (a) => typeof a.secretKey === "string" && a.secretKey.length > 0
  )
  return withKey[0] || null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    if (!body) {
      return NextResponse.json(
        { error: "Body JSON non valido" },
        { status: 400 }
      )
    }

    const { sessionId, totalAmount, currency } = body as {
      sessionId?: string
      totalAmount?: number
      currency?: string
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 }
      )
    }

    const amount = Number.isFinite(totalAmount)
      ? Math.round(totalAmount as number)
      : 0

    // Stripe richiede importi in centesimi, minimo 50 (0,50 €)
    if (!amount || amount < 50) {
      return NextResponse.json(
        { error: "Importo non valido (minimo 0,50 €)" },
        { status: 400 }
      )
    }

    // 🔐 Config da Firebase
    const cfg = await getConfig()
    const account = pickStripeAccount(cfg)

    if (!account || !account.secretKey) {
      return NextResponse.json(
        { error: "Nessun account Stripe configurato con secretKey" },
        { status: 500 }
      )
    }

    const stripe = new Stripe(account.secretKey)

    // 👇 niente più cfg.defaultCurrency per non litigare con il tipo
    const usedCurrency = (currency || "eur").toLowerCase()

    // Dominio per redirect
    const baseDomain =
      process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN ||
      "https://checkout-app-green.vercel.app"

    const successUrl = `${baseDomain}/thank-you?sessionId=${encodeURIComponent(
      sessionId
    )}`
    const cancelUrl = `${baseDomain}/checkout?sessionId=${encodeURIComponent(
      sessionId
    )}`

    // 🧾 Checkout Session Stripe (hosted per ora)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        sessionId,
        source: "shopify_custom_checkout",
      },
      line_items: [
        {
          price_data: {
            currency: usedCurrency,
            unit_amount: amount,
            product_data: {
              name: `Ordine Shopify ${sessionId}`,
            },
          },
          quantity: 1,
        },
      ],
    })

    if (!session.url) {
      return NextResponse.json(
        { error: "Impossibile ottenere l'URL di checkout da Stripe" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        url: session.url,
        stripeAccountLabel: account.label ?? "default",
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error("[payments] Errore Stripe/Firebase:", err)
    const message =
      err?.message || "Errore interno durante la creazione del pagamento"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}