import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get("orderId")

  if (!orderId) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 })

  const apiKey = process.env.OBLIQPAY_API_KEY
  const base = process.env.OBLIQPAY_API_BASE || "https://api.obliqpay.com"
  if (!apiKey) return NextResponse.json({ ok: false, error: "Missing env" }, { status: 500 })

  const r = await fetch(`${base}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  const json = await r.json().catch(() => ({}))
  if (!r.ok) return NextResponse.json({ ok: false, error: "Status failed", raw: json }, { status: 400 })

  return NextResponse.json({ ok: true, order: json })
}