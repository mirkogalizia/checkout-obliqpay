'use client'

import React, { useEffect, useState } from 'react'

type CheckoutItem = {
  id: string
  title: string
  variantTitle?: string
  image?: string
  quantity: number
  price: number // in centesimi
  line_price?: number // in centesimi
}

type CheckoutSession = {
  items: CheckoutItem[]
  subtotal: number // in centesimi
  total: number // in centesimi
  currency: string
}

function getSessionIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return params.get('sessionId')
}

export default function CheckoutPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CheckoutSession | null>(null)
  const [paying, setPaying] = useState(false)

  // Form state (step 1: solo UI, non usata dal backend ancora)
  const [customer, setCustomer] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })

  const [address, setAddress] = useState({
    country: 'IT',
    address1: '',
    address2: '',
    zip: '',
    city: '',
    province: '',
    notes: '',
  })

  useEffect(() => {
    const id = getSessionIdFromLocation()
    setSessionId(id)
  }, [])

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError('Nessun carrello trovato. Torna al negozio e riprova.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`)
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Errore nel recupero del carrello')
        }

        setData(json as CheckoutSession)
      } catch (err: any) {
        console.error('[checkout] errore caricamento carrello', err)
        setError(err.message || 'Errore durante il caricamento del carrello')
      } finally {
        setLoading(false)
      }
    }

    if (sessionId !== null) {
      void load()
    }
  }, [sessionId])

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionId) {
      setError('Sessione checkout non valida. Torna al negozio e riprova.')
      return
    }

    // Piccola validazione base lato client (step 1: solo UI)
    if (!customer.firstName || !customer.lastName || !customer.email) {
      setError('Compila nome, cognome ed email per continuare.')
      return
    }
    if (!address.address1 || !address.zip || !address.city) {
      setError('Compila indirizzo, CAP e città per continuare.')
      return
    }

    try {
      setPaying(true)
      setError(null)

      // Per ora NON passiamo ancora i dati di spedizione a /api/payments
      // (Step 2-3 li useremo per calcolo spedizione e metadata)
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          // future: customer, address, shippingRate, ...
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.url) {
        console.error('[checkout] errore pagamento', json)
        throw new Error(json.error || 'Errore nel tentativo di pagamento')
      }

      // Redirect a Stripe Checkout
      window.location.href = json.url as string
    } catch (err: any) {
      console.error('[checkout] errore pagamento', err)
      setError(err.message || 'Errore nel reindirizzamento al pagamento')
      setPaying(false)
    }
  }

  const currency = data?.currency || 'EUR'
  const subtotal = data ? data.subtotal / 100 : 0
  const total = data ? data.total / 100 : 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-6xl grid gap-8 lg:grid-cols-[minmax(0,2fr),minmax(0,1.5fr)]">
        {/* Colonna sinistra: header + form */}
        <div className="space-y-6">
          {/* Header glassy */}
          <div className="rounded-3xl bg-slate-900/60 border border-white/10 shadow-[0_0_40px_rgba(15,23,42,0.9)] p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-1">Secure Checkout</div>
              <div className="text-lg font-semibold">Checkout App</div>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connessione sicura
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
              <div className="h-10 w-10 rounded-2xl bg-slate-800/70 flex items-center justify-center border border-white/10">
                <span className="text-[10px] font-semibold">NFR</span>
              </div>
              <div className="leading-tight">
                <div className="font-medium">Not For Resale</div>
                <div className="text-[10px] text-slate-400">Pagamento gestito da Stripe</div>
              </div>
            </div>
          </div>

          {/* Contenuto principale */}
          <form
            onSubmit={handlePay}
            className="rounded-3xl bg-slate-900/70 border border-white/10 backdrop-blur-xl shadow-[0_0_80px_rgba(15,23,42,1)] p-6 sm:p-8 space-y-8"
          >
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-semibold">Completa il tuo ordine</h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Rivedi il riepilogo e paga in modo sicuro con carta tramite Stripe.
              </p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Pagamenti crittografati e conformi PCI-DSS
              </p>
            </div>

            {/* Stato caricamento / errore */}
            {loading && (
              <div className="text-sm text-slate-300 bg-slate-800/60 border border-slate-700 rounded-2xl px-4 py-3">
                Caricamento carrello in corso...
              </div>
            )}

            {error && (
              <div className="text-sm text-red-300 bg-red-950/60 border border-red-800 rounded-2xl px-4 py-3">
                {error}
              </div>
            )}

            {/* 1. Dati cliente */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-100">Dati cliente</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Nome</label>
                  <input
                    type="text"
                    required
                    value={customer.firstName}
                    onChange={e => setCustomer(c => ({ ...c, firstName: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="Mario"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Cognome</label>
                  <input
                    type="text"
                    required
                    value={customer.lastName}
                    onChange={e => setCustomer(c => ({ ...c, lastName: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="Rossi"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Email</label>
                  <input
                    type="email"
                    required
                    value={customer.email}
                    onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="mario.rossi@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Telefono (opzionale)</label>
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="+39 ..."
                  />
                </div>
              </div>
            </section>

            {/* 2. Indirizzo di spedizione */}
            <section className="space-y-4 pt-4 border-t border-white/5">
              <h2 className="text-sm font-semibold text-slate-100">Indirizzo di spedizione</h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs text-slate-400">Paese</label>
                  <select
                    value={address.country}
                    onChange={e => setAddress(a => ({ ...a, country: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                  >
                    <option value="IT">Italia</option>
                    <option value="FR">Francia</option>
                    <option value="DE">Germania</option>
                    <option value="ES">Spagna</option>
                    <option value="AT">Austria</option>
                    {/* qui poi mettiamo quelle che usi di più */}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">CAP</label>
                  <input
                    type="text"
                    required
                    value={address.zip}
                    onChange={e => setAddress(a => ({ ...a, zip: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="41121"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Provincia</label>
                  <input
                    type="text"
                    value={address.province}
                    onChange={e => setAddress(a => ({ ...a, province: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="MO"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Indirizzo</label>
                <input
                  type="text"
                  required
                  value={address.address1}
                  onChange={e => setAddress(a => ({ ...a, address1: e.target.value }))}
                  className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                  placeholder="Via del Voltone 2/A"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Complemento indirizzo (opzionale)</label>
                <input
                  type="text"
                  value={address.address2}
                  onChange={e => setAddress(a => ({ ...a, address2: e.target.value }))}
                  className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                  placeholder="Interno, scala, citofono…"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Città</label>
                  <input
                    type="text"
                    required
                    value={address.city}
                    onChange={e => setAddress(a => ({ ...a, city: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="Modena"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Note per il corriere (opzionale)</label>
                  <input
                    type="text"
                    value={address.notes}
                    onChange={e => setAddress(a => ({ ...a, notes: e.target.value }))}
                    className="w-full rounded-2xl bg-slate-950/60 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/50 transition"
                    placeholder="Es: lascia al vicino, portone verde…"
                  />
                </div>
              </div>
            </section>

            {/* 3. Pulsante pagamento */}
            <section className="pt-4 border-t border-white/5 space-y-3">
              <button
                type="submit"
                disabled={paying || loading || !data}
                className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-semibold text-sm py-3.5 flex items-center justify-center gap-2 shadow-[0_14px_45px_rgba(16,185,129,0.45)] transition-transform hover:-translate-y-[1px] active:translate-y-0 active:shadow-[0_8px_30px_rgba(16,185,129,0.55)]"
              >
                {paying ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    <span>Reindirizzamento al pagamento…</span>
                  </>
                ) : (
                  <>
                    <span>Paga ora con carta</span>
                    {data && (
                      <span className="text-xs font-normal text-slate-900/80 bg-emerald-300/90 px-2 py-0.5 rounded-full">
                        Totale {total.toFixed(2)} {currency}
                      </span>
                    )}
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-500 text-center">
                Pagamento sicuro gestito da Stripe. I dati della tua carta non transitano mai sui nostri server.
              </p>
            </section>
          </form>
        </div>

        {/* Colonna destra: riepilogo ordine */}
        <div className="space-y-4">
          <div className="rounded-3xl bg-slate-900/70 border border-white/10 backdrop-blur-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Articoli nel carrello</h2>
              <span className="text-xs text-slate-400">
                {data?.items?.length || 0} articolo{(data?.items?.length || 0) === 1 ? '' : 'i'}
              </span>
            </div>

            {!data && !loading && (
              <p className="text-sm text-slate-400">Nessun carrello trovato.</p>
            )}

            {data && (
              <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                {data.items.map(item => {
                  const linePriceCents =
                    (item.line_price ?? (item.price * item.quantity) ?? 0)
                  const linePrice = linePriceCents / 100

                  return (
                    <div
                      key={item.id}
                      className="flex gap-3 rounded-2xl bg-slate-950/60 border border-white/5 p-3"
                    >
                      {item.image && (
                        <div className="relative h-16 w-16 rounded-2xl bg-slate-900 overflow-hidden border border-white/10 shrink-0">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                          {item.quantity > 1 && (
                            <span className="absolute -top-1 -right-1 text-[11px] bg-slate-900/90 text-slate-50 px-1.5 py-0.5 rounded-full border border-white/15">
                              x{item.quantity}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-100 truncate">
                              {item.title}
                            </div>
                            {item.variantTitle && (
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {item.variantTitle}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-500 mt-1">
                              {item.quantity} × {(item.price / 100).toFixed(2)} {currency}
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-slate-50 whitespace-nowrap">
                            {linePrice.toFixed(2)} {currency}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {data && (
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Subtotale prodotti</span>
                  <span>
                    {subtotal.toFixed(2)} {currency}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Spedizione</span>
                  <span>Calcolata dopo</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-50 pt-1">
                  <span>Totale ordine</span>
                  <span>
                    {total.toFixed(2)} {currency}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Eventuali sconti, voucher o promozioni applicati nel carrello Shopify sono già inclusi nel totale.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-slate-900/60 border border-emerald-500/20 p-4 text-[11px] text-slate-300 space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-400/40 text-[11px] text-emerald-300">
                ✓
              </span>
              <span className="font-medium">Protezione acquisti &amp; sicurezza</span>
            </div>
            <p>
              Il pagamento è elaborato da Stripe su infrastruttura certificata. I dati della carta non vengono salvati
              sui nostri server e non sono accessibili al merchant.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}