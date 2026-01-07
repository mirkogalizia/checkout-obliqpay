// src/app/api/obliqpay/create-order/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('📥 [CREATE] Body ricevuto:', JSON.stringify(body, null, 2))
    
    if (!body.amount || !body.currency) {
      console.error('❌ [CREATE] amount o currency mancanti')
      return NextResponse.json(
        { error: 'Missing required fields: amount, currency' },
        { status: 400 }
      )
    }

    // ✅ USA OBLIQ_API_KEY (la tua variabile su Vercel)
    const apiKey = process.env.OBLIQ_API_KEY
    
    if (!apiKey) {
      console.error('❌ [CREATE] OBLIQ_API_KEY non configurata')
      return NextResponse.json(
        { error: 'Server configuration error: API key missing' },
        { status: 500 }
      )
    }

    const obliqPayload = {
      amount: parseFloat(body.amount),
      currency: body.currency.toLowerCase(),
      email: body.customer?.email || undefined,
      webhook_url: process.env.APP_URL 
        ? `https://${process.env.APP_URL}/api/obliqpay/webhook`
        : undefined
    }

    console.log('📤 [CREATE] Payload Obliq:', JSON.stringify(obliqPayload, null, 2))
    console.log('🔑 [CREATE] API Key presente:', !!apiKey)

    const obliqResponse = await fetch('https://api.obliqpay.com/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(obliqPayload),
    })
    
    console.log('📡 [CREATE] Status Obliq:', obliqResponse.status)
    
    let obliqData
    try {
      obliqData = await obliqResponse.json()
    } catch (e) {
      const text = await obliqResponse.text()
      console.error('❌ [CREATE] Non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { error: 'Invalid response from payment provider' },
        { status: 502 }
      )
    }
    
    console.log('📥 [CREATE] Risposta Obliq:', JSON.stringify(obliqData, null, 2))

    if (!obliqResponse.ok) {
      console.error('❌ [CREATE] Obliq API error:', obliqData)
      return NextResponse.json(
        { 
          error: 'Obliq API error',
          details: obliqData,
          status: obliqResponse.status
        },
        { status: obliqResponse.status }
      )
    }
    
    console.log('✅ [CREATE] Success, orderId:', obliqData.orderId)
    
    return NextResponse.json({
      ok: true,
      orderId: obliqData.orderId,
      checkoutUrl: obliqData.checkoutUrl,
      expiresAt: obliqData.expiresAt
    })
    
  } catch (error: any) {
    console.error('💥 [CREATE] Catch:', error.message)
    console.error('💥 [CREATE] Stack:', error.stack)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error.message
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
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
