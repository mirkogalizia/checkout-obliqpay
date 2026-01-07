import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const { sessionId, amountCents, currency, email } = await req.json()

    if (!sessionId || !amountCents || !email) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 })
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 })
    }

    const data = snap.data() || {}

    // ✅ se già creato e non scaduto, riusa
    if (data?.obliqpay?.checkoutUrl && data?.obliqpay?.orderId && data?.obliqpay?.expiresAt) {
      const exp = new Date(data.obliqpay.expiresAt).getTime()
      if (Date.now() < exp - 10_000) {
        return NextResponse.json({ ok: true, ...data.obliqpay })
      }
    }

    const apiKey = process.env.OBLIQPAY_API_KEY
    const base = process.env.OBLIQPAY_API_BASE || "https://api.obliqpay.com"
    const appUrl = process.env.APP_URL
    const webhookSecret = process.env.OBLIQPAY_WEBHOOK_SECRET

    if (!apiKey || !appUrl || !webhookSecret) {
      return NextResponse.json({ ok: false, error: "Missing env" }, { status: 500 })
    }

    const amount = Number((amountCents / 100).toFixed(2)) // Obliqpay vuole importo decimale

    const webhook_url = `${appUrl}/api/obliqpay/webhook?secret=${encodeURIComponent(webhookSecret)}&sessionId=${encodeURIComponent(sessionId)}`

    const r = await fetch(`${base}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: (currency || "EUR").toUpperCase(),
        email,
        webhook_url,
      }),
    })

    const json = await r.json().catch(() => ({}))
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: json?.error || "Obliqpay create failed", raw: json }, { status: 400 })
    }

    const obliqpay = {
      orderId: json.orderId,
      checkoutUrl: json.checkoutUrl,
      expiresAt: json.expiresAt,
      amountCents,
      currency: (currency || "EUR").toUpperCase(),
      email,
      status: "created",
      updatedAt: new Date().toISOString(),
    }

    await db.collection(COLLECTION).doc(sessionId).set(
      { obliqpay },
      { merge: true }
    )

    return NextResponse.json({ ok: true, ...obliqpay })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 })
  }
}