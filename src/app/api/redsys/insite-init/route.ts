export const runtime = "nodejs"

import { NextResponse } from "next/server"

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
    const isProduction = process.env.REDSYS_ENV === "prod"

    if (!merchantCode || !terminal) {
      return NextResponse.json({ 
        error: "Configurazione Redsys mancante" 
      }, { status: 500 })
    }

    const orderId = makeOrderId(sessionId)

    // ✅ PARAMETRI RAW per InSite (NON Base64!)
    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_MERCHANTURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/redsys/notification`,
      DS_MERCHANT_URLOK: `${process.env.NEXT_PUBLIC_APP_URL}/thank-you`,
      DS_MERCHANT_URLKO: `${process.env.NEXT_PUBLIC_APP_URL}/checkout?payment=failed`,
      DS_MERCHANT_PAYMETHODS: "C",
    }

    console.log("✅ InSite init:", { orderId, amount: amountCents, env: isProduction ? 'PROD' : 'TEST' })

    // ✅ Ritorna parametri RAW + scriptUrl
    return NextResponse.json({
      params,  // ✅ Oggetto JSON diretto, NON Base64
      orderId,
      scriptUrl: isProduction 
        ? "https://sis.redsys.es/sis/NC/redsysV3.js"
        : "https://sis-t.redsys.es:25443/sis/NC/sandbox/redsysV3.js",
    })
  } catch (e: any) {
    console.error("❌ Errore insite-init:", e)
    return NextResponse.json({ 
      error: e.message || "Errore inizializzazione Redsys" 
    }, { status: 500 })
  }
}
