// src/app/api/obliqpay/create-order/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('📥 [CREATE] Body ricevuto:', JSON.stringify(body, null, 2))
    
    // Validazione input
    if (!body.amount || !body.currency) {
      console.error('❌ [CREATE] amount o currency mancanti')
      return NextResponse.json(
        { 
          ok: false,
          error: 'Missing required fields: amount, currency' 
        },
        { status: 400 }
      )
    }

    // Verifica API Key Obliqpay
    const apiKey = process.env.OBLIQ_API_KEY
    
    if (!apiKey) {
      console.error('❌ [CREATE] OBLIQ_API_KEY non configurata')
      return NextResponse.json(
        { 
          ok: false,
          error: 'Server configuration error: API key missing' 
        },
        { status: 500 }
      )
    }

    // Prepara il payload per Obliqpay
    const obliqPayload = {
      amount: parseFloat(body.amount),
      currency: body.currency.toLowerCase(),
      email: body.email || body.customer?.email || undefined,
      webhook_url: process.env.APP_URL 
        ? `https://${process.env.APP_URL}/api/obliqpay/webhook`
        : undefined,
      metadata: {
        sessionId: body.sessionId || undefined,
        source: 'checkout'
      }
    }

    console.log('📤 [CREATE] Payload Obliq:', JSON.stringify(obliqPayload, null, 2))
    console.log('🔑 [CREATE] API Key presente:', !!apiKey)

    // Chiamata a Obliqpay
    const obliqResponse = await fetch('https://api.obliqpay.com/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(obliqPayload),
    })
    
    console.log('📡 [CREATE] Status Obliq:', obliqResponse.status)
    
    // Parse risposta
    let obliqData
    try {
      obliqData = await obliqResponse.json()
    } catch (e) {
      const text = await obliqResponse.text()
      console.error('❌ [CREATE] Non-JSON response:', text.substring(0, 300))
      return NextResponse.json(
        { 
          ok: false,
          error: 'Invalid response from payment provider',
          details: text.substring(0, 100)
        },
        { status: 502 }
      )
    }
    
    console.log('📥 [CREATE] Risposta Obliq:', JSON.stringify(obliqData, null, 2))

    // Gestione errori specifici
    if (!obliqResponse.ok) {
      console.error('❌ [CREATE] Obliq API error:', obliqData)
      
      // Errore specifico per Stripe non configurato
      if (obliqData.error?.includes('stripe') || 
          obliqData.error?.includes('Stripe') ||
          obliqData.error?.includes('keys') ||
          obliqData.message?.includes('stripe')) {
        return NextResponse.json(
          { 
            ok: false,
            error: 'Stripe non configurato. Vai su dashboard.obliqpay.com e collega il tuo account Stripe.',
            details: obliqData
          },
          { status: 424 }
        )
      }
      
      return NextResponse.json(
        { 
          ok: false,
          error: obliqData.error || obliqData.message || 'Obliq API error',
          details: obliqData
        },
        { status: obliqResponse.status }
      )
    }
    
    // Verifica che la risposta contenga i dati necessari
    if (!obliqData.orderId || !obliqData.checkoutUrl) {
      console.error('❌ [CREATE] Risposta incompleta:', obliqData)
      return NextResponse.json(
        { 
          ok: false,
          error: 'Incomplete response from payment provider',
          details: obliqData
        },
        { status: 502 }
      )
    }
    
    console.log('✅ [CREATE] Success, orderId:', obliqData.orderId)
    
    return NextResponse.json({
      ok: true,
      orderId: obliqData.orderId,
      checkoutUrl: obliqData.checkoutUrl,
      expiresAt: obliqData.expiresAt || null
    })
    
  } catch (error: any) {
    console.error('💥 [CREATE] Catch:', error.message)
    console.error('💥 [CREATE] Stack:', error.stack)
    return NextResponse.json(
      { 
        ok: false,
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

