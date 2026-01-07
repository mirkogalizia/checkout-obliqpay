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

    // ✅ USA OBLIQPAY_API_KEY (non OBLIQ_API_KEY!)
    const apiKey = process.env.OBLIQPAY_API_KEY
    const base = process.env.OBLIQPAY_API_BASE || "https://api.obliqpay.com"
    
    if (!apiKey) {
      console.error('❌ [STATUS] OBLIQPAY_API_KEY non configurata')
      return NextResponse.json(
        { ok: false, error: "Server configuration error" }, 
        { status: 500 }
      )
    }

    console.log('📡 [STATUS] Calling:', `${base}/orders/${orderId}`)
    console.log('🔑 [STATUS] API Key:', apiKey.substring(0, 10) + '...')

    // ✅ Fetch con timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    let r
    try {
      r = await fetch(`${base}/orders/${orderId}`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.error('💥 [STATUS] Fetch error:', fetchError.message)
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { ok: false, error: "Request timeout", orderId }, 
          { status: 504 }
        )
      }
      
      return NextResponse.json(
        { ok: false, error: "Network error", details: fetchError.message }, 
        { status: 503 }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    console.log('📡 [STATUS] Response status:', r.status)

    let json
    const contentType = r.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      json = await r.json()
    } else {
      const text = await r.text()
      console.error('❌ [STATUS] Non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { ok: false, error: "Invalid response format", orderId }, 
        { status: 502 }
      )
    }

    console.log('📥 [STATUS] Response:', JSON.stringify(json, null, 2))

    if (!r.ok) {
      console.error('❌ [STATUS] API error:', json)
      
      if (r.status === 404) {
        return NextResponse.json(
          { ok: false, error: "Order not found", orderId }, 
          { status: 404 }
        )
      }

      if (r.status === 401) {
        console.error('❌ [STATUS] Unauthorized - verifica OBLIQPAY_API_KEY')
        return NextResponse.json(
          { ok: false, error: "Authentication failed" }, 
          { status: 401 }
        )
      }

      return NextResponse.json(
        { 
          ok: false, 
          error: json.error || json.message || "Status check failed",
          raw: json 
        }, 
        { status: r.status }
      )
    }

    console.log('✅ [STATUS] Success')

    return NextResponse.json({ 
      ok: true, 
      order: json,
      orderId: json.orderId || orderId,
      status: json.status,
      amount: json.amount,
      currency: json.currency,
    })

  } catch (error: any) {
    console.error('💥 [STATUS] Unhandled error:', error.message)
    console.error('💥 [STATUS] Stack:', error.stack)
    
    return NextResponse.json(
      { 
        ok: false, 
        error: "Internal server error", 
        message: error.message,
      }, 
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
