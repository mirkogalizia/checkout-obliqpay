'use client'

import React, { useState } from 'react'

export type SummaryProps = {
  total: number
  currency: string
  sessionId: string
}

export default function Summary({ total, currency, sessionId }: SummaryProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      })

      const json = await res.json()

      if (!res.ok || !json.url) {
        throw new Error(json.error || 'Errore nel pagamento')
      }

      // Per ora: redirect al Checkout Stripe hosted
      window.location.href = json.url
    } catch (err: any) {
      console.error('[Summary] errore pagamento:', err)
      setError(err.message || 'Errore nel pagamento')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-black/30 p-3 text-sm text-white/80">
        <div className="flex items-center justify-between">
          <span>Totale da pagare</span>
          <span className="text-base font-semibold">
            {total.toFixed(2)} {currency}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={loading || !sessionId}
        className="relative flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-sky-500 px-4 py-3 text-sm font-semibold text-black shadow-[0_0_25px_rgba(16,185,129,0.5)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Reindirizzamento in corso…' : 'Paga ora con carta'}
        <span className="text-xs font-normal text-black/70">
          (Stripe)
        </span>
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}