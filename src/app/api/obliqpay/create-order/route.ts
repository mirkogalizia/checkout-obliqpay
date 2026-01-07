// src/app/api/obliqpay/create-order/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('📥 [DEBUG] Body ricevuto:', JSON.stringify(body, null, 2))
    
    // Valida campi obbligatori
    if (!body.amount || !body.currency) {
      console.error('❌ [ERROR] amount o currency mancanti')
      return NextResponse.json(
        { error: 'Missing required fields: amount, currency' },
        { status: 400 }
      )
    }

    // Prepara payload per Obliq (FORMATO CORRETTO)
    const obliqPayload = {
      amount: parseFloat(body.amount),
      currency: body.currency.toLowerCase(), // "eur", "usd", ecc.
      email: body.customer?.email || undefined,
      webhook_url: process.env.NEXT_PUBLIC_BASE_URL 
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/obliqpay/webhook`
        : undefined
    }

    console.log('📤 [DEBUG] Payload Obliq:', JSON.stringify(obliqPayload, null, 2))
    console.log('🔑 [DEBUG] API Key presente?', !!process.env.OBLIQ_API_KEY)

    // ✅ URL CORRETTO
    const obliqResponse = await fetch('https://api.obliqpay.com/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OBLIQ_API_KEY}`,
      },
      body: JSON.stringify(obliqPayload),
    })
    
    const obliqData = await obliqResponse.json()
    
    console.log('📡 [DEBUG] Status Obliq:', obliqResponse.status)
    console.log('📥 [DEBUG] Risposta Obliq:', JSON.stringify(obliqData, null, 2))

    if (!obliqResponse.ok) {
      console.error('❌ [ERROR] Obliq API error:', obliqData)
      return NextResponse.json(
        { 
          error: 'Obliq API error',
          details: obliqData,
          status: obliqResponse.status
        },
        { status: obliqResponse.status }
      )
    }
    
    // ✅ Risposta nel formato atteso dal frontend
    return NextResponse.json({
      ok: true,
      orderId: obliqData.orderId,
      checkoutUrl: obliqData.checkoutUrl,
      expiresAt: obliqData.expiresAt
    })
    
  } catch (error: any) {
    console.error('💥 [ERROR] Catch:', error.message)
    console.error('💥 [ERROR] Stack:', error.stack)
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
