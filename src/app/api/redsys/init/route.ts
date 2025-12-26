export const runtime = "nodejs"

import { NextResponse } from "next/server"
import crypto from "crypto"

function base64UrlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}
function base64UrlEncodeFromString(s: string) {
  return base64UrlEncode(Buffer.from(s, "utf8"))
}
function base64UrlDecodeToBuffer(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4)
  return Buffer.from(b64, "base64")
}

function redsysSignature(merchantParamsB64Url: string, order: string, secretKeyB64: string) {
  const secretKey = Buffer.from(secretKeyB64, "base64")
  const iv = Buffer.alloc(8, 0)

  const orderBuf = Buffer.from(order, "utf8")
  const padLen = (8 - (orderBuf.length % 8)) % 8
  const orderPadded = padLen ? Buffer.concat([orderBuf, Buffer.alloc(padLen, 0)]) : orderBuf

  const cipher = crypto.createCipheriv("des-ede3-cbc", secretKey, iv)
  cipher.setAutoPadding(false)
  const key3DES = Buffer.concat([cipher.update(orderPadded), cipher.final()])

  const hmac = crypto.createHmac("sha256", key3DES)
  hmac.update(base64UrlDecodeToBuffer(merchantParamsB64Url))
  return base64UrlEncode(hmac.digest())
}

function getRedsysFormUrl() {
  const env = (process.env.REDSYS_ENV || "test").toLowerCase()
  // URL classica del form pago (redirect)
  if (env === "prod") return "https://sis.redsys.es/sis/realizarPago"
  return "https://sis-t.redsys.es:25443/sis/realizarPago"
}

function makeOrderId(sessionId: string) {
  // Redsys ha vincoli sul formato order: manteniamolo semplice, max 12
  // Qui: prendiamo gli ultimi 10 e prefisso "C"
  const clean = sessionId.replace(/[^a-zA-Z0-9]/g, "")
  const tail = clean.slice(-10) || String(Date.now()).slice(-10)
  return `C${tail}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const sessionId = String(body.sessionId || "")
    const amountCents = Number(body.amountCents ?? 0)

    if (!sessionId || !Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid sessionId/amount" }, { status: 400 })
    }

    const merchantCode = process.env.REDSYS_MERCHANT_CODE!
    const terminal = process.env.REDSYS_TERMINAL!
    const currency = process.env.REDSYS_CURRENCY || "978"
    const secretKey = process.env.REDSYS_SECRET_KEY!

    if (!merchantCode || !terminal || !currency || !secretKey) {
      return NextResponse.json({ ok: false, error: "Missing Redsys env" }, { status: 400 })
    }

    const orderId = makeOrderId(sessionId)

    // Per ora mettiamo URL ok/ko/merchanturl a placeholder se non hai dominio
    // (in locale non verranno chiamati da Redsys)
    const urlOk = process.env.REDSYS_RETURN_OK_URL || "http://localhost:3000/thank-you"
    const urlKo = process.env.REDSYS_RETURN_KO_URL || "http://localhost:3000/checkout?payment=failed"
    const merchantUrl = process.env.REDSYS_NOTIFICATION_URL || "http://localhost:3000/api/redsys/notification"

    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: currency,
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: String(terminal),

      // callback (quando avrai dominio pubblico, queste diventano vere)
      DS_MERCHANT_MERCHANTURL: merchantUrl,
      DS_MERCHANT_URLOK: urlOk,
      DS_MERCHANT_URLKO: urlKo,

      // Consigliato: nome commerciante / descrizione
      DS_MERCHANT_MERCHANTNAME: "Checkout",
      DS_MERCHANT_PRODUCTDESCRIPTION: "Ordine ecommerce",
    }

    const dsMerchantParameters = base64UrlEncodeFromString(JSON.stringify(params))
    const dsSignature = redsysSignature(dsMerchantParameters, orderId, secretKey)

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
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 })
  }
}