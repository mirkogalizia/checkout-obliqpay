// src/app/api/obliqpay/create-order/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('📥 [CREATE] Body ricevuto:', JSON.stringify(body, null, 2))
    
    if (!body.amount || !body.currency) {
      console.error('❌ [CREATE] amount o currency mancanti')
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: amount, currency' },
        { status: 400 }
      )
    }

    // ✅ USA OBLIQPAY_API_KEY (non OBLIQ_API_KEY!)
    const apiKey = process.env.OBLIQPAY_API_KEY
    const base = process.env.OBLIQPAY_API_BASE || "https://api.obliqpay.com"
    
    if (!apiKey) {
      console.error('❌ [CREATE] OBLIQPAY_API_KEY non configurata')
      return NextResponse.json(
        { ok: false, error: 'Server configuration error: API key missing' },
        { status: 500 }
      )
    }

    const obliqPayload = {
      amount: parseFloat(body.amount),
      currency: body.currency.toLowerCase(),
      email: body.customer?.email || body.email || undefined,
      webhook_url: process.env.NEXT_PUBLIC_BASE_URL 
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/obliqpay/webhook`
        : undefined,
      ...(body.metadata && { metadata: body.metadata }),
      ...(body.description && { description: body.description }),
    }

    console.log('📤 [CREATE] Payload:', JSON.stringify(obliqPayload, null, 2))
    console.log('🔑 [CREATE] API Key:', apiKey.substring(0, 10) + '...')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let obliqResponse
    try {
      obliqResponse = await fetch(`${base}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(obliqPayload),
        signal: controller.signal,
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.error('💥 [CREATE] Fetch error:', fetchError.message)
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { ok: false, error: 'Request timeout' },
          { status: 504 }
        )
      }
      
      return NextResponse.json(
        { ok: false, error: 'Network error', details: fetchError.message },
        { status: 503 }
      )
    } finally {
      clearTimeout(timeoutId)
    }
    
    console.log('📡 [CREATE] Status:', obliqResponse.status)

    let obliqData
    const contentType = obliqResponse.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      obliqData = await obliqResponse.json()
    } else {
      const text = await obliqResponse.text()
      console.error('❌ [CREATE] Non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { ok: false, error: 'Invalid response format' },
        { status: 502 }
      )
    }
    
    console.log('📥 [CREATE] Response:', JSON.stringify(obliqData, null, 2))

    if (!obliqResponse.ok) {
      console.error('❌ [CREATE] API error:', obliqData)
      
      return NextResponse.json(
        { 
          ok: false,
          error: obliqData.error || obliqData.message || 'Order creation failed',
          details: obliqData,
        },
        { status: obliqResponse.status }
      )
    }
    
    if (!obliqData.orderId || !obliqData.checkoutUrl) {
      console.error('❌ [CREATE] Missing fields:', obliqData)
      return NextResponse.json(
        { ok: false, error: 'Invalid response: missing orderId or checkoutUrl' },
        { status: 502 }
      )
    }
    
    console.log('✅ [CREATE] Success, orderId:', obliqData.orderId)
    
    return NextResponse.json({
      ok: true,
      orderId: obliqData.orderId,
      checkoutUrl: obliqData.checkoutUrl,
      expiresAt: obliqData.expiresAt,
      status: obliqData.status || 'pending',
    })
    
  } catch (error: any) {
    console.error('💥 [CREATE] Unhandled error:', error.message)
    console.error('💥 [CREATE] Stack:', error.stack)
    
    return NextResponse.json(
      { 
        ok: false,
        error: 'Internal server error', 
        message: error.message,
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  })
}
