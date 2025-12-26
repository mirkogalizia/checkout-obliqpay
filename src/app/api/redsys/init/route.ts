export const runtime = "nodejs"

import { NextResponse } from "next/server"
import crypto from "crypto"

function redsysSignature(merchantParamsB64: string, order: string, secretKeyB64: string) {
  // Decodifica chiave segreta
  const key = Buffer.from(secretKeyB64, "base64")
  
  // Genera chiave derivata con 3DES-CBC
  const cipher = crypto.createCipheriv("des-ede3-cbc", key, Buffer.alloc(8, 0))
  cipher.setAutoPadding(false)
  
  // Padding manuale dell'order
  const orderBytes = Buffer.from(order, "utf8")
  const paddingLength = 8 - (orderBytes.length % 8)
  const paddedOrder = Buffer.concat([
    orderBytes,
    Buffer.alloc(paddingLength === 8 ? 0 : paddingLength, 0)
  ])
  
  const derivedKey = Buffer.concat([cipher.update(paddedOrder), cipher.final()])
  
  // HMAC-SHA256 sui parametri (ancora in base64)
  const hmac = crypto.createHmac("sha256", derivedKey)
  hmac.update(Buffer.from(merchantParamsB64, "base64"))
  
  return hmac.digest("base64")
}

function makeOrderId(sessionId: string) {
  const timestamp = Date.now().toString()
  const numPart = timestamp.slice(-4)
  const alphaPart = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || timestamp.slice(-8)
  return `${numPart}${alphaPart}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const sessionId = String(body.sessionId || "")
    const amountCents = Number(body.amountCents ?? 0)

    if (!sessionId || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 })
    }

    const merchantCode = process.env.REDSYS_MERCHANT_CODE!
    const terminal = process.env.REDSYS_TERMINAL!
    const secretKey = process.env.REDSYS_SECRET_KEY!
    
    const orderId = makeOrderId(sessionId)
    
    // ✅ Parametri nell'ordine corretto (importante!)
    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_MERCHANTURL: "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/api/redsys/notification",
      DS_MERCHANT_URLOK: "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/thank-you",
      DS_MERCHANT_URLKO: "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/checkout?payment=failed"
    }

    // ✅ Codifica compatta (senza spazi)
    const merchantParams = Buffer.from(JSON.stringify(params), "utf8").toString("base64")
    const signature = redsysSignature(merchantParams, orderId, secretKey)
    
    // ✅ Debug log
    console.log("DEBUG Redsys:", {
      order: orderId,
      orderLength: orderId.length,
      amount: amountCents,
      paramsDecoded: params,
      signature
    })

    return NextResponse.json({
      ok: true,
      redsys: {
        url: "https://sis-t.redsys.es:25443/sis/realizarPago",
        Ds_SignatureVersion: "HMAC_SHA256_V1",
        Ds_MerchantParameters: merchantParams,
        Ds_Signature: signature,
        orderId
      }
    })
  } catch (e: any) {
    console.error("Error:", e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
