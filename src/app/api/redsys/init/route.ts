export const runtime = "nodejs"

import { NextResponse } from "next/server"
import crypto from "crypto"

// ✅ BASE64 STANDARD (non url-safe)
function b64Encode(buf: Buffer) {
  return buf.toString("base64")
}

function b64EncodeFromString(s: string) {
  return b64Encode(Buffer.from(s, "utf8"))
}

function b64DecodeToBuffer(b64: string) {
  return Buffer.from(b64, "base64")
}

function redsysSignature(merchantParamsB64: string, order: string, secretKeyB64: string) {
  const secretKey = Buffer.from(secretKeyB64, "base64")
  const iv = Buffer.alloc(8, 0)

  // ✅ 3DES-CBC su order con padding corretto
  const orderBuf = Buffer.from(order, "utf8")
  const blockSize = 8
  const padLen = blockSize - (orderBuf.length % blockSize)
  
  // ✅ Applica sempre il padding (fix per ordini multipli di 8)
  const orderPadded = Buffer.concat([orderBuf, Buffer.alloc(padLen, 0)])

  const cipher = crypto.createCipheriv("des-ede3-cbc", secretKey, iv)
  cipher.setAutoPadding(false)
  const key3DES = Buffer.concat([cipher.update(orderPadded), cipher.final()])

  // ✅ HMAC-SHA256 sui parametri merchant (decodificati da base64)
  const hmac = crypto.createHmac("sha256", key3DES)
  hmac.update(b64DecodeToBuffer(merchantParamsB64))

  return b64Encode(hmac.digest())
}

function getRedsysFormUrl() {
  const env = (process.env.REDSYS_ENV || "test").toLowerCase()
  return env === "prod" 
    ? "https://sis.redsys.es/sis/realizarPago" 
    : "https://sis-t.redsys.es:25443/sis/realizarPago"
}

// ✅ Genera orderId con primi 4 caratteri numerici (requisito Redsys)
function makeOrderId(sessionId: string) {
  const timestamp = Date.now().toString()
  const first4 = timestamp.slice(-4) // Ultimi 4 digit del timestamp
  
  const clean = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)
  const tail = clean || timestamp.slice(-8)
  
  // Formato: 4 digit numerici + max 8 alfanumerici = max 12 char
  return `${first4}${tail}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const sessionId = String(body.sessionId || "")
    const amountCents = Number(body.amountCents ?? 0)

    // ✅ Validazione input
    if (!sessionId || !Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "Invalid sessionId or amountCents" 
      }, { status: 400 })
    }

    // ✅ Validazione env variables
    const merchantCode = process.env.REDSYS_MERCHANT_CODE || ""
    const terminal = process.env.REDSYS_TERMINAL || ""
    const currency = process.env.REDSYS_CURRENCY || "978"
    const secretKey = process.env.REDSYS_SECRET_KEY || ""

    if (!merchantCode || !terminal || !secretKey) {
      return NextResponse.json({ 
        ok: false, 
        error: "Missing Redsys configuration" 
      }, { status: 500 })
    }

    const orderId = makeOrderId(sessionId)

    const urlOk = process.env.REDSYS_RETURN_OK_URL || 
      "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/thank-you"
    const urlKo = process.env.REDSYS_RETURN_KO_URL || 
      "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/checkout?payment=failed"
    const merchantUrl = process.env.REDSYS_NOTIFICATION_URL || 
      "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/api/redsys/notification"

    // ✅ Parametri merchant (tutti come stringhe)
    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: currency,
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_MERCHANTURL: merchantUrl,
      DS_MERCHANT_URLOK: urlOk,
      DS_MERCHANT_URLKO: urlKo,
      DS_MERCHANT_MERCHANTNAME: "Checkout",
      DS_MERCHANT_PRODUCTDESCRIPTION: "Ordine ecommerce",
    }

    // ✅ Codifica parametri in base64
    const dsMerchantParameters = b64EncodeFromString(JSON.stringify(params))
    
    // ✅ Genera firma HMAC_SHA256_V1
    const dsSignature = redsysSignature(dsMerchantParameters, orderId, secretKey)

    // ✅ Log in development
    if (process.env.NODE_ENV === "development") {
      console.log("🔐 Redsys Debug:", {
        orderId,
        amount: amountCents,
        signature: dsSignature,
      })
    }

    return NextResponse.json({
      ok: true,
      redsys: {
        url: getRedsysFormUrl(),
        Ds_SignatureVersion: "HMAC_SHA256_V1",
        Ds_MerchantParameters: dsMerchantParameters,
        Ds_Signature: dsSignature,
        orderId,
      },
    })
  } catch (e: any) {
    console.error("❌ Redsys init error:", e)
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || "Internal error" 
    }, { status: 500 })
  }
}
