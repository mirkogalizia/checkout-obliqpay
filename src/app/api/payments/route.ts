import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getConfig } from "@/lib/config"
import { db } from "@/lib/firebaseAdmin"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId: string | undefined = body?.sessionId

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 }
      )
    }

    const cfg = await getConfig()
    const accounts = cfg.stripeAccounts || []
    // Per ora: primo account con secretKey impostata
    const account = accounts.find((a: any) => a.secretKey)

    if (!account?.secretKey) {
      console.error("[payments] Nessun account Stripe con secretKey")
      return NextResponse.json(
        { error: "Stripe non configurato" },
        { status: 500 }
      )
    }

    // Leggi la sessione checkout
    const snap = await db.collection("checkoutSessions").doc(sessionId).get()
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Sessione checkout non trovata" },
        { status: 404 }
      )
    }

    const data = snap.data() as any
    const currency = (data.currency || cfg.defaultCurrency || "eur")
      .toString()
      .toLowerCase()

    const subtotalCents = Number(data.subtotalCents || 0)
    const totalCentsDoc = Number(data.totalCents || 0)

    // Se abbiamo totalCents (prodotti + spedizione) > 0, usiamo quello.
    // Altrimenti fallback al solo subtotale prodotti.
    const amountCents =
      totalCentsDoc > 0 ? Math.round(totalCentsDoc) : Math.round(subtotalCents)

    if (!amountCents || amountCents < 50) {
      console.error("[payments] Importo non valido", {
        subtotalCents,
        totalCentsDoc,
      })
      return NextResponse.json(
        { error: "Importo non valido (minimo 0,50 €)" },
        { status: 400 }
      )
    }

    const stripe = new Stripe(account.secretKey)

    const baseDomain =
      process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN ||
      process.env.CHECKOUT_DOMAIN ||
      "http://localhost:3000"

    const successUrl = `${baseDomain}/thank-you?sessionId=${encodeURIComponent(
      sessionId
    )}`
    const cancelUrl = `${baseDomain}/checkout?sessionId=${encodeURIComponent(
      sessionId
    )}`

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: "Ordine Not For Resale",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        nf_session_id: sessionId,
      },
    })

    return NextResponse.json({
      url: checkoutSession.url,
      id: checkoutSession.id,
    })
  } catch (err: any) {
    console.error("[payments] Stripe error:", err)
    return NextResponse.json(
      { error: err?.message || "Errore durante la creazione del pagamento" },
      { status: 500 }
    )
  }
}