// src/app/api/stripe-status/route.ts
import { NextResponse } from 'next/server'
import { getCurrentAccountInfo } from '@/lib/stripeRotation'

export async function GET() {
  try {
    const info = await getCurrentAccountInfo()
    
    console.log('[stripe-status] ✅ Account attivo:', info.account.label)
    console.log('[stripe-status] 🔑 PublishableKey:', info.account.publishableKey?.substring(0, 30))
    
    return NextResponse.json({
      publishableKey: info.account.publishableKey,  // ✅ QUESTO ERA MANCANTE
      accountLabel: info.account.label,
      currentAccount: info.account.label,
      slotNumber: info.slotNumber,
      totalSlots: info.totalSlots,
      nextRotation: info.nextRotation.toISOString(),
      nextRotationLocal: info.nextRotation.toLocaleString('it-IT'),
    })
  } catch (error: any) {
    console.error('[stripe-status] ❌ Errore:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
