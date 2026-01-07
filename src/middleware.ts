// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const rateLimit = new Map<string, { count: number; resetTime: number }>()

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  // Domini permessi per CORS
  const allowedOrigins = [
    'https://cristianmora.myshopify.com',
    'http://localhost:3000',
  ]

  const isAllowedOrigin = origin && allowedOrigins.includes(origin)

  // ✅ CORS: Gestisci preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Rate limiting
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  
  const now = Date.now()
  const windowMs = 60000 // 1 minuto
  const maxRequests = 100 // 100 richieste per minuto

  const record = rateLimit.get(ip)

  if (record && now < record.resetTime) {
    if (record.count >= maxRequests) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin! : '*',
        }}
      )
    }
    record.count++
  } else {
    rateLimit.set(ip, { count: 1, resetTime: now + windowMs })
  }

  // Pulisci vecchie entry
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimit.entries()) {
      if (now > value.resetTime) {
        rateLimit.delete(key)
      }
    }
  }

  // ✅ CORS: Aggiungi header alla risposta
  const response = NextResponse.next()
  
  response.headers.set('Access-Control-Allow-Origin', isAllowedOrigin ? origin! : '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  return response
}

export const config = {
  matcher: '/api/:path*',
}
