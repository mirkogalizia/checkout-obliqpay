// src/app/thank-you/page.tsx
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

type OrderData = {
  shopifyOrderNumber?: string
  shopifyOrderId?: string
  email?: string
  totalCents?: number
  currency?: string
  shopDomain?: string
  items?: Array<{
    title: string
    quantity: number
    image?: string
  }>
}

function ThankYouContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadOrderData() {
      if (!sessionId) {
        setError("Sessione non valida")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Errore caricamento ordine")
        }

        setOrderData({
          shopifyOrderNumber: data.shopifyOrderNumber,
          shopifyOrderId: data.shopifyOrderId,
          email: data.customer?.email,
          totalCents: data.totalCents,
          currency: data.currency || "EUR",
          shopDomain: data.shopDomain,
          items: data.items?.slice(0, 3) || [],
        })
        setLoading(false)
      } catch (err: any) {
        console.error("Errore caricamento ordine:", err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadOrderData()
  }, [sessionId])

  // ✅ LINK DINAMICI IN BASE AL DOMINIO SHOPIFY
  const shopUrl = orderData?.shopDomain 
    ? `https://${orderData.shopDomain}`
    : "https://imjsqk-my.myshopify.com"

  const formatMoney = (cents: number | undefined) => {
    const value = (cents ?? 0) / 100
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-400">Caricamento ordine...</p>
        </div>
      </div>
    )
  }

  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-white">Ordine non trovato</h1>
          <p className="text-gray-400">{error}</p>
          <a
            href={shopUrl}
            className="inline-block mt-8 px-8 py-4 bg-white text-black font-bold rounded-none hover:bg-gray-200 transition uppercase tracking-wider"
          >
            Torna alla home
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          background: #000;
          color: #fff;
        }

        .nfr-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .nfr-card {
          background: #111;
          border: 1px solid #222;
          padding: 32px;
          margin-bottom: 24px;
        }

        .nfr-btn-primary {
          display: inline-block;
          padding: 16px 32px;
          background: #fff;
          color: #000;
          font-weight: 700;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 1px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          font-size: 14px;
        }

        .nfr-btn-primary:hover {
          background: #f0f0f0;
          transform: translateY(-2px);
        }

        .nfr-btn-secondary {
          display: inline-block;
          padding: 16px 32px;
          background: transparent;
          color: #fff;
          font-weight: 700;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 1px;
          border: 2px solid #fff;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          font-size: 14px;
        }

        .nfr-btn-secondary:hover {
          background: #fff;
          color: #000;
          transform: translateY(-2px);
        }

        .nfr-badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 16px;
          background: #00ff00;
          color: #000;
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .nfr-divider {
          height: 1px;
          background: #222;
          margin: 24px 0;
        }

        @media (max-width: 768px) {
          .nfr-card {
            padding: 24px;
          }

          .nfr-btn-primary,
          .nfr-btn-secondary {
            width: 100%;
            padding: 14px 24px;
            font-size: 13px;
          }
        }
      `}</style>

      <div className="min-h-screen bg-black text-white">
        {/* Header */}
        <header className="border-b border-[#222] py-6">
          <div className="nfr-container">
            <div className="flex justify-center">
              <a href={shopUrl}>
                <img
                  src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
                  alt="Not For Resale"
                  className="h-12 sm:h-16 cursor-pointer brightness-0 invert"
                  style={{ maxWidth: "240px", width: "auto" }}
                />
              </a>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="nfr-container py-12 md:py-20">
          {/* Success Section */}
          <div className="text-center mb-12 md:mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-[#00ff00] rounded-full mb-6">
              <svg
                className="w-12 h-12 text-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tight">
              Ordine Confermato
            </h1>
            <p className="text-lg md:text-xl text-gray-400 font-medium">
              Grazie per il tuo acquisto
            </p>
          </div>

          {/* Order Details */}
          <div className="max-w-3xl mx-auto">
            <div className="nfr-card mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-6 border-b border-[#222]">
                <div className="mb-4 md:mb-0">
                  <p className="text-sm text-gray-500 uppercase tracking-wider mb-2">
                    Numero Ordine
                  </p>
                  <p className="text-3xl md:text-4xl font-black">
                    #{orderData.shopifyOrderNumber || "Elaborazione"}
                  </p>
                </div>
                <div>
                  <span className="nfr-badge">
                    ✓ Pagamento Completato
                  </span>
                </div>
              </div>

              {orderData.email && (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 uppercase tracking-wider mb-2">
                    Conferma Inviata A
                  </p>
                  <p className="text-lg font-bold">{orderData.email}</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Controlla la tua casella email per tutti i dettagli dell'ordine
                  </p>
                </div>
              )}

              {orderData.totalCents && (
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wider mb-2">
                    Totale Pagato
                  </p>
                  <p className="text-2xl font-black">
                    {formatMoney(orderData.totalCents)}
                  </p>
                </div>
              )}
            </div>

            {/* Items Preview */}
            {orderData.items && orderData.items.length > 0 && (
              <div className="nfr-card mb-6">
                <h2 className="text-xl font-black mb-6 uppercase tracking-wide">
                  Articoli Acquistati
                </h2>
                <div className="space-y-4">
                  {orderData.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      {item.image && (
                        <div className="w-16 h-16 bg-[#222] flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-bold text-sm">{item.title}</p>
                        <p className="text-xs text-gray-500">Quantità: {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            <div className="nfr-card mb-8" style={{ background: '#0a0a0a', border: '1px solid #333' }}>
              <h2 className="text-xl font-black mb-6 uppercase tracking-wide flex items-center gap-2">
                <span>📦</span> Prossimi Step
              </h2>
              <div className="space-y-4 text-sm md:text-base">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-black text-sm">
                    1
                  </span>
                  <p className="text-gray-300">
                    <strong className="text-white">Email di conferma</strong> - Riceverai tutti i dettagli del tuo ordine
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-black text-sm">
                    2
                  </span>
                  <p className="text-gray-300">
                    <strong className="text-white">Preparazione</strong> - Il tuo ordine verrà preparato entro 1-2 giorni lavorativi
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-black text-sm">
                    3
                  </span>
                  <p className="text-gray-300">
                    <strong className="text-white">Spedizione BRT Express 24h</strong> - Tracking disponibile via email
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <a href={shopUrl} className="nfr-btn-primary">
                Torna alla Home
              </a>
              <a href={`${shopUrl}/collections/all`} className="nfr-btn-secondary">
                Continua lo Shopping
              </a>
            </div>

            {/* Support */}
            <div className="text-center pt-8 border-t border-[#222]">
              <p className="text-sm text-gray-500 uppercase tracking-wider mb-3">
                Hai Bisogno di Aiuto?
              </p>
              <a
                href={`${shopUrl}/pages/contatti`}
                className="text-white hover:text-gray-300 font-bold uppercase tracking-wide text-sm transition underline"
              >
                Contatta il Supporto →
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-[#222] py-8 mt-12">
          <div className="nfr-container text-center">
            <p className="text-xs text-gray-600 uppercase tracking-wider">
              © 2025 Not For Resale. All Rights Reserved.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <p className="text-sm text-gray-400">Caricamento...</p>
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  )
}
