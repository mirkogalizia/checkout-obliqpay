'use client'

import React, { useEffect, useState } from 'react'
import Summary from '@/components/Summary'

type CheckoutItem = {
  key: string
  title: string
  variantTitle?: string | null
  quantity: number
  image?: string | null
  price: number          // in centesimi
  line_price?: number | null // in centesimi
}

type CartSessionResponse = {
  sessionId: string
  currency: string
  subtotal: number       // in centesimi
  total?: number         // in centesimi (se lo calcoliamo lato backend)
  items: CheckoutItem[]
}

export const dynamic = 'force-dynamic'

export default function CheckoutPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [data, setData] = useState<CartSessionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)

        // Leggiamo la sessionId dalla query string, lato client
        let sid: string | null = null
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          sid = params.get('sessionId')
        }

        if (!sid) {
          setError('Nessuna sessione di checkout trovata.')
          setLoading(false)
          return
        }

        setSessionId(sid)

        const url = `/api/cart-session?sessionId=${encodeURIComponent(sid)}`
        const res = await fetch(url)

        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Errore nel recupero del carrello')
        }

        setData(json as CartSessionResponse)
      } catch (err: any) {
        console.error('[checkout] errore:', err)
        setError(err.message || 'Errore inatteso nel caricamento del checkout')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const currency = data?.currency || 'EUR'
  const totalCents =
    data?.total != null
      ? data.total
      : data?.subtotal != null
      ? data.subtotal
      : 0
  const total = totalCents / 100

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#050816] via-[#020617] to-black text-white">
      {/* Barra top “Secure” */}
      <div className="border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            </div>
            <span className="font-medium text-white/80">Secure Checkout</span>
            <span className="text-white/40">• Checkout App</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Connessione sicura</span>
          </div>
        </div>
      </div>

      {/* Contenuto */}
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-10 pt-6 lg:flex-row">
        {/* Colonna sinistra: riepilogo carrello */}
        <section className="flex-1 space-y-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-400/80">
            Checkout
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">
            Completa il tuo ordine
          </h1>
          <p className="text-sm text-white/60">
            Rivedi il riepilogo e paga in modo sicuro con carta tramite Stripe.
            <br className="hidden sm:block" />
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-300/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Pagamenti crittografati e conformi PCI-DSS
            </span>
          </p>

          {/* Stato di caricamento / errore */}
          {loading && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-white/70">
              <span className="inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-400" />
              Caricamento del carrello in corso…
            </div>
          )}

          {error && !loading && (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/40">
                <span>Articoli nel carrello</span>
                <span>{data.items.length} articolo{data.items.length !== 1 ? 'i' : ''}</span>
              </div>

              <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.85)] backdrop-blur-2xl">
                {data.items.map((item) => {
                  const linePriceCents =
                    item.line_price != null
                      ? item.line_price
                      : item.price * item.quantity
                  const linePrice = linePriceCents / 100

                  return (
                    <div
                      key={item.key}
                      className="flex gap-3 rounded-2xl bg-black/20 p-3"
                    >
                      {/* Immagine prodotto */}
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-white/30">
                            Nessuna immagine
                          </div>
                        )}
                      </div>

                      {/* Testi prodotto */}
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                            {item.quantity}x
                          </div>
                          <div className="text-sm font-semibold text-white">
                            {item.title}
                          </div>
                          {item.variantTitle && (
                            <div className="text-xs text-white/50">
                              {item.variantTitle}
                            </div>
                          )}
                        </div>

                        <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                          <span>Prezzo unitario</span>
                          <span>
                            {(item.price / 100).toFixed(2)} {currency}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-xs font-medium text-white">
                          <span>Totale riga</span>
                          <span>
                            {linePrice.toFixed(2)} {currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-2 space-y-1 text-sm text-white/70">
                <div className="flex items-center justify-between">
                  <span>Subtotale prodotti</span>
                  <span>
                    {(data.subtotal / 100).toFixed(2)} {currency}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Spedizione</span>
                  <span>Calcolata dopo</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Colonna destra: riepilogo e pagamento */}
        <aside className="mt-6 w-full max-w-md shrink-0 rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm shadow-[0_24px_80px_rgba(15,23,42,0.95)] backdrop-blur-2xl lg:mt-0">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-300/80">
                Totale ordine
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {total.toFixed(2)} {currency}
              </div>
            </div>
            <div className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/60">
              Pagamento sicuro Stripe
            </div>
          </div>

          <div className="mb-4 rounded-2xl bg-black/30 p-3 text-[11px] text-white/60">
            I dati della tua carta non transitano mai sui nostri server. Il
            pagamento è elaborato da Stripe, conforme agli standard PCI-DSS.
          </div>

          {/* Summary: bottone che chiama /api/payments */}
          <Summary
            total={total}
            currency={currency}
            sessionId={sessionId ?? ''}
          />
        </aside>
      </div>
    </main>
  )
}