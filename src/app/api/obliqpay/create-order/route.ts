// src/app/api/obliqpay/create-order/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 🔍 DEBUG: Stampa tutto quello che ricevi
    console.log('📥 [DEBUG] Body ricevuto:', JSON.stringify(body, null, 2))
    console.log('📥 [DEBUG] Headers:', JSON.stringify(Object.fromEntries(request.headers), null, 2))
    
    // Valida i campi obbligatori
    const requiredFields = ['amount', 'currency', 'orderId', 'customer']
    const missingFields = requiredFields.filter(field => !body[field])
    
    if (missingFields.length > 0) {
      console.error('❌ [ERROR] Campi mancanti:', missingFields)
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          missingFields,
          receivedBody: body
        },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      )
    }

    // Valida customer object
    if (!body.customer.email || !body.customer.firstName || !body.customer.lastName) {
      console.error('❌ [ERROR] Dati customer incompleti:', body.customer)
      return NextResponse.json(
        { 
          error: 'Incomplete customer data',
          receivedCustomer: body.customer
        },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      )
    }

    // Chiama API Obliq
    console.log('📤 [DEBUG] Invio a Obliq...')
    
    const obliqPayload = {
      amount: parseFloat(body.amount),
      currency: body.currency,
      order_id: body.orderId,
      customer: {
        email: body.customer.email,
        first_name: body.customer.firstName,
        last_name: body.customer.lastName,
        phone: body.customer.phone || '',
      },
      items: body.items || [],
      shipping_address: body.shippingAddress || null,
      billing_address: body.billingAddress || null,
      metadata: {
        source: 'shopify',
        session_id: body.orderId,
        ...body.metadata
      }
    }

    console.log('📤 [DEBUG] Payload Obliq:', JSON.stringify(obliqPayload, null, 2))

    const obliqResponse = await fetch('https://api.obliq.io/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OBLIQ_API_KEY}`,
      },
      body: JSON.stringify(obliqPayload),
    })
    
    const obliqData = await obliqResponse.json()
    
    console.log('✅ [DEBUG] Risposta Obliq status:', obliqResponse.status)
    console.log('✅ [DEBUG] Risposta Obliq data:', JSON.stringify(obliqData, null, 2))

    if (!obliqResponse.ok) {
      console.error('❌ [ERROR] Obliq API error:', obliqData)
      return NextResponse.json(
        { 
          error: 'Obliq API error',
          details: obliqData,
          status: obliqResponse.status
        },
        { 
          status: obliqResponse.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      )
    }
    
    return NextResponse.json(obliqData, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
    
  } catch (error: any) {
    console.error('💥 [ERROR] Catch:', error.message)
    console.error('💥 [ERROR] Stack:', error.stack)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    )
  }
}

// Gestisci preflight OPTIONS
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  })
}
