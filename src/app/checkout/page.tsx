"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

// -----------------------------------------
// WRAPPER PER SUSPENSE (richiesto da Next 16)
// -----------------------------------------
function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<any[]>([])
  const [currency, setCurrency] = useState("EUR")

  const [subtotal, setSubtotal] = useState(0)
  const [shippingAmount, setShippingAmount] = useState(0)
  const [total, setTotal] = useState(0)

  const [paying, setPaying] = useState(false)

  // Dati cliente
  const [address, setAddress] = useState({
    firstName: "",
    lastName: "",
    email: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "IT",
  })

  // -----------------------------------------
  // CAMBIO CAMPI ADDRESS
  // -----------------------------------------
  function handleAddressChange(
    field: keyof typeof address,
    value: string
  ) {
    setAddress((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // -----------------------------------------
  // CARICA CARRELLO DA FIRESTORE
  // -----------------------------------------
  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Nessuna sessione di checkout trovata.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`
        )
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Errore nel recupero del carrello")
          setLoading(false)
          return
        }

        const items = data.items || []
        const currency = data.currency || "EUR"
        const subtotalCents = Number(data.subtotalCents || 0)
        const shippingCents = Number(data.shippingCents || 0)
        const totalCents =
          data.totalCents != null
            ? Number(data.totalCents)
            : subtotalCents + shippingCents

        setItems(items)
        setCurrency(currency)
        setSubtotal(subtotalCents / 100)
        setShippingAmount(shippingCents / 100)
        setTotal(totalCents / 100)
        setError(null)
      } catch (err) {
        console.error(err)
        setError("Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  // -----------------------------------------
  // CALCOLO SPEDIZIONE
  // -----------------------------------------
  async function handleCalcShipping() {
    if (!sessionId) {
      alert("Sessione non trovata")
      return
    }

    try {
      setPaying(true)

      const res = await fetch("/api/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          address,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Errore nel calcolo della spedizione")
        return
      }

      const shippingCents = Number(data.shippingCents || 0)
      const totalCents = Number(data.totalCents || 0)

      setShippingAmount(shippingCents / 100)
      setTotal(totalCents / 100)
    } catch (err) {
      alert("Errore durante il calcolo della spedizione")
    } finally {
      setPaying(false)
    }
  }

  // -----------------------------------------
  // PAGAMENTO STRIPE
  // -----------------------------------------
  async function handlePay() {
    if (!sessionId) {
      alert("Sessione non trovata")
      return
    }

    try {
      setPaying(true)

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Errore durante il pagamento")
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      alert("Errore durante il pagamento")
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        Caricamento checkout…
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="bg-red-900/40 border border-red-500/60 rounded-2xl px-6 py-4 max-w-md text-center">
          <h1 className="text-lg font-semibold mb-2">Errore checkout</h1>
          <p className="text-sm opacity-90 mb-4">{error}</p>
          <a
            href="/"
            className="px-4 py-2 rounded-full bg-slate-50 text-slate-900 text-sm font-medium"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )
  }

  const itemsCount = items.reduce(
    (acc, it) => acc + Number(it.quantity || 0),
    0
  )

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">

        {/* COLONNA SINISTRA */}
        <section className="bg-slate-900/70 border border-slate-700/60 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-xl">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold">Checkout</h1>
            <p className="text-sm text-slate-300 mt-1">
              Completa i dati e paga in modo sicuro.
            </p>
          </header>

          {/* DATI SPEDIZIONE */}
          <div className="space-y-4 mb-8">
            <h2 className="text-sm font-semibold uppercase text-slate-200">
              Dati di spedizione
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="input"
                placeholder="Nome"
                value={address.firstName}
                onChange={(e) =>
                  handleAddressChange("firstName", e.target.value)
                }
              />
              <input
                className="input"
                placeholder="Cognome"
                value={address.lastName}
                onChange={(e) =>
                  handleAddressChange("lastName", e.target.value)
                }
              />
            </div>

            <input
              className="input"
              placeholder="Email"
              type="email"
              value={address.email}
              onChange={(e) =>
                handleAddressChange("email", e.target.value)
              }
            />

            <input
              className="input"
              placeholder="Indirizzo"
              value={address.address1}
              onChange={(e) =>
                handleAddressChange("address1", e.target.value)
              }
            />

            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="input"
                placeholder="CAP"
                value={address.zip}
                onChange={(e) =>
                  handleAddressChange("zip", e.target.value)
                }
              />
              <input
                className="input"
                placeholder="Città"
                value={address.city}
                onChange={(e) =>
                  handleAddressChange("city", e.target.value)
                }
              />
              <input
                className="input"
                placeholder="Provincia"
                value={address.province}
                onChange={(e) =>
                  handleAddressChange("province", e.target.value)
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 items-center">
              <input
                className="input"
                placeholder="Paese"
                value={address.country}
                onChange={(e) =>
                  handleAddressChange("country", e.target.value)
                }
              />
              <button
                onClick={handleCalcShipping}
                disabled={paying}
                className="btn-primary"
              >
                {paying ? "Calcolo…" : "Calcola spedizione"}
              </button>
            </div>
          </div>

          {/* ARTICOLI */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase text-slate-200">
              Articoli nel carrello ({itemsCount})
            </h2>

            {items.map((item, idx) => {
              const linePrice = Number(item.linePriceCents || 0) / 100
              const unitPrice = Number(item.priceCents || 0) / 100

              return (
                <div
                  key={idx}
                  className="flex justify-between p-3 bg-slate-900/40 border border-slate-800 rounded-2xl"
                >
                  <div>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-slate-400">
                      {item.variantTitle}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {item.quantity}× {unitPrice.toFixed(2)} {currency}
                    </div>
                  </div>

                  <div className="text-sm font-semibold">
                    {linePrice.toFixed(2)} {currency}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* COLONNA DESTRA */}
        <section className="bg-slate-900/80 border border-slate-700/70 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-xl flex flex-col justify-between gap-6">
          <div>
            <h2 className="text-sm font-semibold uppercase text-slate-200 mb-4">
              Totale ordine
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-300">Subtotale</span>
                <span>{subtotal.toFixed(2)} {currency}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-300">Spedizione</span>
                <span>
                  {shippingAmount > 0
                    ? `${shippingAmount.toFixed(2)} ${currency}`
                    : "Calcolata dopo"}
                </span>
              </div>

              <div className="border-t border-slate-700 pt-3 flex justify-between text-base">
                <span className="font-semibold text-slate-100">Totale</span>
                <span className="font-semibold text-lg">
                  {total.toFixed(2)} {currency}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handlePay}
              disabled={paying}
              className="btn-pay"
            >
              {paying ? "Reindirizzamento…" : "Paga ora"}
            </button>
            <p className="text-[11px] text-slate-400 leading-snug">
              Pagamento gestito da Stripe. I dati della tua carta non
              passano mai sui nostri server.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

// ------------------------------------------------------
// STYLES UTILI
// ------------------------------------------------------
const inputStyle =
  "bg-slate-900/60 border border-slate-700/80 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70"
const buttonPrimary =
  "inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-sky-500/90 hover:bg-sky-400 text-sm font-medium text-slate-950 transition"
const buttonPay =
  "w-full inline-flex items-center justify-center px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-slate-950 transition"

// Classi globali
const styleMap: any = {
  input: inputStyle,
  "btn-primary": buttonPrimary,
  "btn-pay": buttonPay,
}

// Proxy per convertire className="input"
Object.assign(globalThis, {
  styleMap,
})

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}