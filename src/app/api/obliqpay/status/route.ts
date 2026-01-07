// src/app/api/obliqpay/status/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get("orderId")

    console.log('🔍 [STATUS] Checking orderId:', orderId)

    if (!orderId) {
      console.error('❌ [STATUS] Missing orderId')
      return NextResponse.json(
        { ok: false, error: "Missing orderId" }, 
        { status: 400 }
      )
    }

    // ✅ USA OBLIQ_API_KEY (la tua variabile su Vercel)
    const apiKey = process.env.OBLIQ_API_KEY
    const base = "https://api.obliqpay.com"
    
    if (!apiKey) {
      console.error('❌ [STATUS] OBLIQ_API_KEY non configurata')
      return NextResponse.json(
        { ok: false, error: "Server configuration error" }, 
        { status: 500 }
      )
    }

    console.log('📡 [STATUS] Calling:', `${base}/orders/${orderId}`)
    console.log('🔑 [STATUS] API Key presente:', !!apiKey)

    const r = await fetch(`${base}/orders/${orderId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    })

    console.log('📡 [STATUS] Response status:', r.status)

    let json
    try {
      json = await r.json()
    } catch (e) {
      const text = await r.text()
      console.error('❌ [STATUS] Non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { ok: false, error: "Invalid response format" }, 
        { status: 502 }
      )
    }

    console.log('📥 [STATUS] Response:', JSON.stringify(json, null, 2))

    if (!r.ok) {
      console.error('❌ [STATUS] API error:', json)
      return NextResponse.json(
        { ok: false, error: "Status failed", raw: json }, 
        { status: r.status }
      )
    }

    console.log('✅ [STATUS] Success')
    return NextResponse.json({ ok: true, order: json })

  } catch (error: any) {
    console.error('💥 [STATUS] Unhandled error:', error.message)
    return NextResponse.json(
      { ok: false, error: "Internal server error", message: error.message }, 
      { status: 500 }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  })
}

