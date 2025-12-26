export const runtime = "nodejs"

import { NextResponse } from "next/server"
import crypto from "crypto"

/**
 * Base64 STANDARD (NON url-safe)
 */
function b64Encode(buf: Buffer) {
  return buf.toString("base64")
}
function b64EncodeFromString(s: string) {
  return b64Encode(Buffer.from(s, "utf8"))
}
function b64DecodeToBuffer(b64: string) {
  return Buffer.from(b64, "base64")
}

/**
 * Redsys signature (HMAC_SHA256_V1)
 * Steps:
 * 1) K = Base64Decode(secretKeyB64)  (must be 24 bytes for 3DES)
 * 2) K' = 3DES-CBC (IV=0) encrypt(order padded to 8 bytes with 0x00) using K (no auto padding)
 * 3) HMAC-SHA256 over Base64Decode(MerchantParameters) using key K'
 * 4) Output Base64 STANDARD
 */
function redsysSignature(merchantParamsB64: string, order: string, secretKeyB64: string) {
  const secretKey = Buffer.from(secretKeyB64, "base64")
  if (secretKey.length !== 24) {
    throw new Error(
      `REDSYS_SECRET_KEY must be Base64 of 24 bytes (3DES key). Got ${secretKey.length} bytes`
    )
  }

  const iv = Buffer.alloc(8, 0)

  // order must be ASCII-ish; keep as utf8
  const orderBuf = Buffer.from(order, "utf8")
  const padLen = (8 - (orderBuf.length % 8)) % 8
  const orderPadded = padLen ? Buffer.concat([orderBuf, Buffer.alloc(padLen, 0)]) : orderBuf

  const cipher = crypto.createCipheriv("des-ede3-cbc", secretKey, iv)
  cipher.setAutoPadding(false)
  const key3DES = Buffer.concat([cipher.update(orderPadded), cipher.final()])

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

/**
 * Redsys ORDER constraints (common):
 * - 4..12 chars
 * - usually numeric (safer)
 *
 * We generate ALWAYS 12 digits from sessionId (digits only) + fallback timestamp.
 */
function makeOrderId(sessionId: string) {
  const digits = String(sessionId || "").replace(/\D/g, "")
  const fallback = String(Date.now()).replace(/\D/g, "")
  const base = digits.length >= 4 ? digits : fallback
  return base.slice(-12).padStart(12, "0")
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const sessionId = String(body.sessionId || "")
    const amountCents = Number(body.amountCents ?? 0)

    if (!sessionId || !Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid sessionId/amount" }, { status: 400 })
    }

    const merchantCode = (process.env.REDSYS_MERCHANT_CODE || "").trim()
    const terminal = (process.env.REDSYS_TERMINAL || "").trim()
    const currency = (process.env.REDSYS_CURRENCY || "978").trim()
    const secretKey = (process.env.REDSYS_SECRET_KEY || "").trim()

    if (!merchantCode || !terminal || !secretKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Redsys env",
          missing: {
            REDSYS_MERCHANT_CODE: !merchantCode,
            REDSYS_TERMINAL: !terminal,
            REDSYS_SECRET_KEY: !secretKey,
          },
        },
        { status: 400 }
      )
    }

    // Validate secret key format early (will throw if wrong length)
    // (kept inside signature fn, but this makes the error clearer)
    const secretLen = Buffer.from(secretKey, "base64").length
    if (secretLen !== 24) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid REDSYS_SECRET_KEY: expected Base64 of 24 bytes, got ${secretLen} bytes`,
        },
        { status: 400 }
      )
    }

    const orderId = makeOrderId(sessionId)

    const urlOk = process.env.REDSYS_RETURN_OK_URL || "http://localhost:3000/thank-you"
    const urlKo = process.env.REDSYS_RETURN_KO_URL || "http://localhost:3000/checkout?payment=failed"
    const merchantUrl =
      process.env.REDSYS_NOTIFICATION_URL || "http://localhost:3000/api/redsys/notification"

    // Redsys expects amount in cents, as string integer
    const params = {
      DS_MERCHANT_AMOUNT: String(Math.trunc(amountCents)),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: currency,
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: String(terminal),

      DS_MERCHANT_MERCHANTURL: merchantUrl,
      DS_MERCHANT_URLOK: urlOk,
      DS_MERCHANT_URLKO: urlKo,

      DS_MERCHANT_MERCHANTNAME: "Checkout",
      DS_MERCHANT_PRODUCTDESCRIPTION: "Ordine ecommerce",
    }

    // Base64 STANDARD of JSON string
    const dsMerchantParameters = b64EncodeFromString(JSON.stringify(params))
    // Signature Base64 STANDARD
    const dsSignature = redsysSignature(dsMerchantParameters, orderId, secretKey)

    return NextResponse.json({
      ok: true,
      redsys: {
        url: getRedsysFormUrl(),
        Ds_SignatureVersion: "HMAC_SHA256_V1",
        Ds_MerchantParameters: dsMerchantParameters,
        Ds_Signature: dsSignature,
        orderId,
        params, // debug
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error", stack: e?.stack ? String(e.stack).slice(0, 500) : undefined },
      { status: 500 }
    )
  }
}