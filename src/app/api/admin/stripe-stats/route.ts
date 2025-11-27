// src/app/api/admin/stripe-stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getConfig } from '@/lib/config'
import { getCurrentAccountInfo } from '@/lib/stripeRotation'

export async function GET(request: NextRequest) {
  try {
    // ✅ SIMPLE AUTH: Password via header o query
    const authHeader = request.headers.get('authorization')
    const authQuery = request.nextUrl.searchParams.get('key')
    const correctKey = process.env.ADMIN_SECRET_KEY || 'your-secret-key'

    if (authHeader !== `Bearer ${correctKey}` && authQuery !== correctKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await getConfig()
    const rotationInfo = await getCurrentAccountInfo()

    const activeAccounts = config.stripeAccounts.filter(
      (a) => a.active && a.secretKey && a.publishableKey
    )

    // Calcola start/end di oggi (timezone Europe/Rome)
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    const startTimestamp = Math.floor(startOfDay.getTime() / 1000)
    const endTimestamp = Math.floor(endOfDay.getTime() / 1000)

    // ✅ RECUPERA DATI PER OGNI ACCOUNT
    const accountStats = await Promise.all(
      activeAccounts.map(async (account) => {
        try {
          const stripe = new Stripe(account.secretKey)

          // Recupera tutti i PaymentIntent completati oggi
          const paymentIntents = await stripe.paymentIntents.list({
            created: {
              gte: startTimestamp,
              lte: endTimestamp,
            },
            limit: 100,
          })

          // Filtra solo quelli completati (succeeded)
          const succeededPayments = paymentIntents.data.filter(
            (pi) => pi.status === 'succeeded'
          )

          // Calcola totale incassato in centesimi
          const totalCents = succeededPayments.reduce(
            (sum, pi) => sum + pi.amount,
            0
          )

          // Conta transazioni
          const transactionCount = succeededPayments.length

          return {
            label: account.label,
            order: account.order,
            active: account.active,
            isCurrentlyActive: account.label === rotationInfo.account.label,
            stats: {
              totalEur: totalCents / 100,
              totalCents,
              transactionCount,
              currency: 'EUR',
            },
          }
        } catch (error: any) {
          console.error(`[stripe-stats] Error for ${account.label}:`, error.message)
          return {
            label: account.label,
            order: account.order,
            active: account.active,
            isCurrentlyActive: false,
            stats: {
              totalEur: 0,
              totalCents: 0,
              transactionCount: 0,
              currency: 'EUR',
            },
            error: error.message,
          }
        }
      })
    )

    // Calcola totale complessivo
    const grandTotal = accountStats.reduce(
      (sum, acc) => sum + acc.stats.totalEur,
      0
    )

    const grandTotalTransactions = accountStats.reduce(
      (sum, acc) => sum + acc.stats.transactionCount,
      0
    )

    // ✅ RECUPERA TRANSAZIONI DA TUTTI GLI ACCOUNT (ultimi 100)
    let allTransactions: any[] = []
    
    for (const account of activeAccounts) {
      try {
        const stripe = new Stripe(account.secretKey)
        
        const payments = await stripe.paymentIntents.list({
          limit: 100,
        })

        const txs = payments.data.map(p => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          created: p.created,
          email: p.receipt_email || 'N/A',
          errorCode: p.last_payment_error?.code,
          errorMessage: p.last_payment_error?.message,
          declineCode: p.last_payment_error?.decline_code,
          account: account.label, // Per sapere da quale account
        }))

        allTransactions.push(...txs)
      } catch (error: any) {
        console.error(`[transactions] Error for ${account.label}:`, error.message)
      }
    }

    // Ordina per data (più recenti prima)
    allTransactions.sort((a, b) => b.created - a.created)

    // Prendi solo le ultime 100
    allTransactions = allTransactions.slice(0, 100)

    return NextResponse.json({
      date: now.toISOString(),
      dateLocal: now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
      rotation: {
        currentAccount: rotationInfo.account.label,
        slotNumber: rotationInfo.slotNumber,
        totalSlots: rotationInfo.totalSlots,
        nextRotation: rotationInfo.nextRotation.toISOString(),
        nextRotationLocal: rotationInfo.nextRotation.toLocaleString('it-IT', {
          timeZone: 'Europe/Rome',
        }),
      },
      accounts: accountStats,
      totals: {
        totalEur: grandTotal,
        transactionCount: grandTotalTransactions,
        currency: 'EUR',
      },
      transactions: allTransactions, // ✅ AGGIUNTO
    })
  } catch (error: any) {
    console.error('[stripe-stats] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

