export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createRedsysAPI, SANDBOX_URLS, PRODUCTION_URLS } from "redsys-easy"

function makeOrderId(sessionId: string) {
  const timestamp = Date.now().toString()
  const numPart = timestamp.slice(-4)
  const alphaPart = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || timestamp.slice(-8)
  return `${numPart}${alphaPart}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId, amountCents, email } = body

    if (!sessionId || !amountCents || amountCents <= 0) {
      return NextResponse.json({ 
        error: "sessionId o amountCents mancante/invalido" 
      }, { status: 400 })
    }

    const merchantCode = process.env.REDSYS_MERCHANT_CODE!
    const terminal = process.env.REDSYS_TERMINAL!
    const secretKey = process.env.REDSYS_SECRET_KEY!
    const isProduction = process.env.REDSYS_ENV === "prod"

    if (!merchantCode || !terminal || !secretKey) {
      return NextResponse.json({ 
        error: "Configurazione Redsys mancante" 
      }, { status: 500 })
    }

    const redsysAPI = createRedsysAPI({
      secretKey,
      urls: isProduction ? PRODUCTION_URLS : SANDBOX_URLS,
    })

    const orderId = makeOrderId(sessionId)

    // ✅ Parametri per InSite (iframe carta)
    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: "978", // EUR
      DS_MERCHANT_TRANSACTIONTYPE: "0" as const,
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_MERCHANTURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/redsys/notification`,
      DS_MERCHANT_URLOK: `${process.env.NEXT_PUBLIC_APP_URL}/thank-you`,
      DS_MERCHANT_URLKO: `${process.env.NEXT_PUBLIC_APP_URL}/checkout?payment=failed`,
      // ✅ InSite specifico
      DS_MERCHANT_PAYMETHODS: "C", // Solo carta
    }

    const { body: formData } = redsysAPI.createRedirectForm(params)

    console.log("✅ InSite init:", { orderId, amount: amountCents })

    return NextResponse.json({
      ...formData,
      orderId,
    })
  } catch (e: any) {
    console.error("❌ Errore insite-init:", e)
    return NextResponse.json({ 
      error: e.message || "Errore inizializzazione Redsys" 
    }, { status: 500 })
  }
}
