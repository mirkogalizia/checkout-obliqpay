"use client"

import { useState, useEffect, useMemo, useRef, FormEvent, ChangeEvent, Suspense } from "react"
import { useSearchParams } from "next/navigation"

interface CartSessionResponse {
  items: Array<{
    title: string
    variantTitle?: string
    quantity: number
    priceCents: number
    linePriceCents?: number
    image?: string
  }>
  subtotalCents?: number
  totalCents?: number
  currency?: string
  shopDomain?: string
}

interface CustomerForm {
  fullName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  postalCode: string
  province: string
  countryCode: string
}

function formatMoney(cents: number, currency: string) {
  const amount = cents / 100
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount)
}

// ✅ IFRAME OBLIQPAY - VERSIONE DEFINITIVA SENZA SANDBOX
function ObliqpayIframe({
  sessionId,
  amountCents,
  currency,
  customerEmail,
  paymentKey,
  onOrderReady,
  onError,
}: {
  sessionId: string
  amountCents: number
  currency: string
  customerEmail: string
  paymentKey: string
  onOrderReady: (data: { orderId: string; checkoutUrl: string }) => void
  onError: (msg: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState("")
  const [orderId, setOrderId] = useState("")
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [showNewWindowOption, setShowNewWindowOption] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setCheckoutUrl("")
    setOrderId("")
    setIframeLoaded(false)
    setShowNewWindowOption(false)
    setLoading(false)
  }, [paymentKey])

  const handlePayment = async () => {
    if (loading) return

    setLoading(true)

    try {
      console.log("🚀 [OBLIQPAY] Inizializzazione pagamento...", {
        amount: (amountCents / 100).toFixed(2),
        currency,
        email: customerEmail
      })

      const r = await fetch("/api/obliqpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          amount: (amountCents / 100).toFixed(2),
          currency: currency.toUpperCase(),
          customer: { email: customerEmail },
        }),
      })

      const json = await r.json().catch(() => ({}))

      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || "Creazione ordine fallita")
      }

      console.log("✅ [OBLIQPAY] Ordine creato:", json.orderId)
      console.log("🔗 [OBLIQPAY] Checkout URL:", json.checkoutUrl)

      setOrderId(json.orderId)
      setCheckoutUrl(json.checkoutUrl)

      onOrderReady({ orderId: json.orderId, checkoutUrl: json.checkoutUrl })

      // Mostra opzione nuova finestra dopo 8 secondi se l'iframe non si carica
      setTimeout(() => {
        if (!iframeLoaded) {
          console.warn("⚠️ [OBLIQPAY] Iframe lento, mostro opzione nuova finestra")
          setShowNewWindowOption(true)
        }
      }, 8000)

    } catch (e: any) {
      console.error("❌ [OBLIQPAY] Errore:", e.message)
      setLoading(false)
      onError(e?.message || "Errore Obliqpay")
    } finally {
      setLoading(false)
    }
  }

  const openInNewWindow = () => {
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank')
    }
  }

  return (
    <div className="border border-gray-300 rounded-xl p-4 bg-white shadow-sm mb-4">
      {!checkoutUrl ? (
        <button
          onClick={handlePayment}
          disabled={loading}
          className="w-full py-4 px-6 text-white font-semibold rounded-xl transition-all"
          style={{
            background: loading 
              ? "#d1d5db" 
              : "linear-gradient(135deg, #2C6ECB 0%, #1f5bb8 100%)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              Inizializzazione pagamento...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              🔒 Paga in maniera sicura
            </span>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-xl border border-green-200">
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span>✅ Pagamento sicuro - Ordine #{orderId.substring(0, 8)}</span>
          </div>

          {!iframeLoaded && (
            <div className="flex items-center justify-center py-16 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-center space-y-3">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
                <p className="text-sm text-gray-600 font-medium">Caricamento form di pagamento sicuro...</p>
                {showNewWindowOption && (
                  <button
                    onClick={openInNewWindow}
                    className="text-xs text-blue-600 hover:text-blue-700 underline mt-2 block"
                  >
                    Problemi? Apri in nuova finestra
                  </button>
                )}
              </div>
            </div>
          )}

          <div 
            className="relative overflow-hidden rounded-xl" 
            style={{ 
              display: iframeLoaded ? "block" : "none",
              height: "700px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              border: "1px solid #e5e7eb"
            }}
          >
            {/* 🔥 IFRAME CORRETTO: SENZA SANDBOX, SOLO allow="payment" */}
            <iframe
              ref={iframeRef}
              src={checkoutUrl}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: "12px",
              }}
              allow="payment"
              title="Obliqpay Checkout Sicuro"
              onLoad={() => {
                console.log("✅ [OBLIQPAY] Iframe caricato con successo")
                setIframeLoaded(true)
                setShowNewWindowOption(false)
              }}
              onError={(e) => {
                console.error("❌ [OBLIQPAY] Errore caricamento iframe:", e)
                setShowNewWindowOption(true)
              }}
            />
          </div>

          {iframeLoaded && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 text-center">
                Completa il pagamento nel form qui sopra
              </p>
              <button
                onClick={openInNewWindow}
                className="w-full py-2 px-4 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all border border-blue-200"
              >
                Preferisci aprire in una nuova finestra? Clicca qui
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center mt-3">
        🔒 Powered by Obliqpay - Pagamento 100% sicuro
      </p>
    </div>
  )
}

function CheckoutInner({
  cart,
  sessionId,
}: {
  cart: CartSessionResponse
  sessionId: string
}) {
  const cartUrl = useMemo(() => {
    if (cart.shopDomain) return `https://${cart.shopDomain}/cart`
    return "https://notforresale.it/cart"
  }, [cart.shopDomain])

  const [customer, setCustomer] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "IT",
  })

  const [useDifferentBilling, setUseDifferentBilling] = useState(false)
  const [billingAddress, setBillingAddress] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "IT",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [calculatedShippingCents, setCalculatedShippingCents] = useState<number>(0)
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false)

  const [lastCalculatedHash, setLastCalculatedHash] = useState<string>("")
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const addressInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)
  const scriptLoadedRef = useRef(false)

  const [obliqpayOrderId, setObliqpayOrderId] = useState<string | null>(null)
  const [paymentKey, setPaymentKey] = useState<string>("")
  const [isPaid, setIsPaid] = useState(false)

  const currency = (cart.currency || "EUR").toUpperCase()

  const subtotalCents = useMemo(() => {
    if (typeof cart.subtotalCents === "number") return cart.subtotalCents
    return cart.items.reduce((sum, item) => {
      const line = item.linePriceCents ?? item.priceCents ?? 0
      return sum + line
    }, 0)
  }, [cart])

  const shippingCents = calculatedShippingCents

  const discountCents = useMemo(() => {
    const shopifyTotal = typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
    const raw = subtotalCents - shopifyTotal
    return raw > 0 ? raw : 0
  }, [subtotalCents, cart.totalCents])

  const totalToPayCents = subtotalCents - discountCents + shippingCents

  const firstName = customer.fullName.split(" ")[0] || ""
  const lastName = customer.fullName.split(" ").slice(1).join(" ") || ""

  const billingFirstName = billingAddress.fullName.split(" ")[0] || ""
  const billingLastName = billingAddress.fullName.split(" ").slice(1).join(" ") || ""

  useEffect(() => {
    let mounted = true
    const win = window as any

    const initAutocomplete = () => {
      if (!mounted || !addressInputRef.current) return
      if (!win.google?.maps?.places) return

      try {
        if (autocompleteRef.current) {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
          autocompleteRef.current = null
        }

        autocompleteRef.current = new win.google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            types: ["address"],
            componentRestrictions: {
              country: ["it", "fr", "de", "es", "at", "be", "nl", "ch", "pt"],
            },
            fields: ["address_components", "formatted_address", "geometry"],
          }
        )

        autocompleteRef.current.addListener("place_changed", () => {
          if (!mounted) return
          handlePlaceSelect()
        })
      } catch (err) {
        console.error("[Autocomplete] Errore:", err)
      }
    }

    if (!win.google?.maps?.places && !scriptLoadedRef.current) {
      scriptLoadedRef.current = true
      const script = document.createElement("script")
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

      if (!apiKey) {
        console.error("[Autocomplete] API Key mancante")
        return
      }

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=it&callback=initGoogleMaps`
      script.async = true
      script.defer = true

      win.initGoogleMaps = () => {
        if (mounted) {
          requestAnimationFrame(() => {
            initAutocomplete()
          })
        }
      }

      script.onerror = () => {
        console.error("[Autocomplete] Errore caricamento")
      }

      document.head.appendChild(script)
    } else if (win.google?.maps?.places) {
      initAutocomplete()
    }

    return () => {
      mounted = false
      if (autocompleteRef.current && win.google?.maps?.event) {
        try {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
        } catch {}
      }
    }
  }, [])

  function handlePlaceSelect() {
    const place = autocompleteRef.current?.getPlace()
    if (!place || !place.address_components) return

    let street = ""
    let streetNumber = ""
    let city = ""
    let province = ""
    let postalCode = ""
    let country = ""

    place.address_components.forEach((component: any) => {
      const types = component.types
      if (types.includes("route")) street = component.long_name
      if (types.includes("street_number")) streetNumber = component.long_name
      if (types.includes("locality")) city = component.long_name
      if (types.includes("postal_town") && !city) city = component.long_name
      if (types.includes("administrative_area_level_3") && !city) city = component.long_name
      if (types.includes("administrative_area_level_2")) province = component.short_name
      if (types.includes("administrative_area_level_1") && !province) province = component.short_name
      if (types.includes("postal_code")) postalCode = component.long_name
      if (types.includes("country")) country = component.short_name
    })

    const fullAddress = streetNumber ? `${street} ${streetNumber}` : street

    setCustomer((prev) => ({
      ...prev,
      address1: fullAddress || prev.address1,
      city: city || prev.city,
      postalCode: postalCode || prev.postalCode,
      province: province || prev.province,
      countryCode: country || prev.countryCode,
    }))
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setCustomer((prev) => ({ ...prev, [name]: value }))
  }

  function isFormValid() {
    const shippingValid =
      customer.fullName.trim().length > 2 &&
      customer.email.trim().includes("@") &&
      customer.email.trim().length > 5 &&
      customer.phone.trim().length > 8 &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2

    if (!useDifferentBilling) return shippingValid

    const billingValid =
      billingAddress.fullName.trim().length > 2 &&
      billingAddress.address1.trim().length > 3 &&
      billingAddress.city.trim().length > 1 &&
      billingAddress.postalCode.trim().length > 2 &&
      billingAddress.province.trim().length > 1 &&
      billingAddress.countryCode.trim().length >= 2

    return shippingValid && billingValid
  }

  useEffect(() => {
    async function calculateShipping() {
      const formHash = JSON.stringify({
        fullName: customer.fullName.trim(),
        email: customer.email.trim(),
        phone: customer.phone.trim(),
        address1: customer.address1.trim(),
        city: customer.city.trim(),
        postalCode: customer.postalCode.trim(),
        province: customer.province.trim(),
        countryCode: customer.countryCode,
        billingFullName: useDifferentBilling ? billingAddress.fullName.trim() : "",
        billingAddress1: useDifferentBilling ? billingAddress.address1.trim() : "",
        subtotal: subtotalCents,
        discount: discountCents,
        total: totalToPayCents,
      })

      if (!isFormValid()) {
        setCalculatedShippingCents(0)
        setShippingError(null)
        setLastCalculatedHash("")
        setObliqpayOrderId(null)
        setPaymentKey("")
        setIsPaid(false)
        return
      }

      if (formHash === lastCalculatedHash) {
        return
      }

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

      debounceTimerRef.current = setTimeout(async () => {
        setIsCalculatingShipping(true)
        setError(null)
        setShippingError(null)

        try {
          const flatShippingCents = 590
          setCalculatedShippingCents(flatShippingCents)
          setLastCalculatedHash(formHash)

          setObliqpayOrderId(null)
          setIsPaid(false)
          setPaymentKey(`${Date.now()}`)

          setIsCalculatingShipping(false)
        } catch (err: any) {
          console.error("Errore calcolo:", err)
          setShippingError(err.message || "Errore nel calcolo del totale")
          setIsCalculatingShipping(false)
        }
      }, 1000)
    }

    calculateShipping()

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [
    customer.fullName,
    customer.email,
    customer.phone,
    customer.address1,
    customer.address2,
    customer.city,
    customer.postalCode,
    customer.province,
    customer.countryCode,
    billingAddress.fullName,
    billingAddress.address1,
    billingAddress.city,
    billingAddress.postalCode,
    billingAddress.province,
    billingAddress.countryCode,
    useDifferentBilling,
    subtotalCents,
    discountCents,
    totalToPayCents,
    lastCalculatedHash,
  ])

  useEffect(() => {
    if (!obliqpayOrderId) return
    if (isPaid) return

    let stop = false
    const interval = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/obliqpay/status?orderId=${encodeURIComponent(obliqpayOrderId)}`
        )
        const j = await r.json().catch(() => ({}))

        const s = j?.order?.status || j?.order?.payment_status

        if (!stop && (s === "paid" || s === "completed" || s === "succeeded")) {
          stop = true
          setIsPaid(true)
          setSuccess(true)
          clearInterval(interval)
          window.location.href = `/thank-you?sessionId=${sessionId}`
        }
      } catch {
        // silent
      }
    }, 2000)

    return () => {
      stop = true
      clearInterval(interval)
    }
  }, [obliqpayOrderId, isPaid, sessionId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
  }

  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background: #fafafa;
          color: #333333;
          -webkit-font-smoothing: antialiased;
        }
        .shopify-input {
          width: 100%;
          padding: 14px 16px;
          font-size: 16px;
          line-height: 1.5;
          color: #333333;
          background: #ffffff;
          border: 1px solid #d9d9d9;
          border-radius: 10px;
          transition: all 0.2s ease;
          -webkit-appearance: none;
          appearance: none;
        }
        .shopify-input:focus {
          outline: none;
          border-color: #2C6ECB;
          box-shadow: 0 0 0 3px rgba(44, 110, 203, 0.1);
        }
        .shopify-input::placeholder { color: #999999; }
        .shopify-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #333333;
          margin-bottom: 8px;
        }
        .shopify-btn {
          width: 100%;
          padding: 18px 24px;
          font-size: 17px;
          font-weight: 600;
          color: #ffffff;
          background: linear-gradient(135deg, #2C6ECB 0%, #1f5bb8 100%);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(44, 110, 203, 0.3);
          -webkit-appearance: none;
          appearance: none;
          touch-action: manipulation;
        }
        .shopify-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #1f5bb8 0%, #164a9e 100%);
          box-shadow: 0 6px 16px rgba(44, 110, 203, 0.4);
          transform: translateY(-2px);
        }
        .shopify-btn:active:not(:disabled) { transform: translateY(0); }
        .shopify-btn:disabled {
          background: #d1d5db;
          cursor: not-allowed;
          box-shadow: none;
        }
        .shopify-section {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .shopify-section-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 20px;
        }
        .summary-toggle {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          -webkit-tap-highlight-color: transparent;
          transition: all 0.2s ease;
        }
        .summary-toggle:active { background: #f9fafb; transform: scale(0.98); }
        .summary-content {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 12px 12px;
          padding: 16px;
          margin-top: -20px;
          margin-bottom: 20px;
        }
        .pac-container {
          background-color: #ffffff !important;
          border: 1px solid #d9d9d9 !important;
          border-radius: 10px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
          margin-top: 4px !important;
          padding: 4px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          z-index: 9999 !important;
        }
        .pac-item {
          padding: 12px 16px !important;
          cursor: pointer !important;
          border: none !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          color: #333333 !important;
        }
        .pac-item:hover { background-color: #f3f4f6 !important; }
        .pac-icon { display: none !important; }
        @media (max-width: 768px) {
          .shopify-input { font-size: 16px !important; }
          .shopify-btn { min-height: 52px; font-size: 16px; }
          .shopify-section { padding: 20px; border-radius: 12px; }
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <a href={cartUrl} className="flex items-center gap-2">
                <img
                  src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
                  alt="Logo"
                  className="h-10"
                  style={{ maxWidth: "160px" }}
                />
              </a>

              <div className="hidden md:flex items-center gap-6">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">SSL Sicuro</span>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-200">
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs font-semibold text-emerald-700">Pagamento Protetto</span>
                </div>
              </div>

              <div className="md:hidden flex items-center gap-2 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-200">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs font-semibold text-emerald-700">Sicuro</span>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-4 md:p-5 border border-blue-100 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Pagamenti</p>
                  <p className="text-xs text-gray-600 leading-tight">100% Sicuri</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Spedizione</p>
                  <p className="text-xs text-gray-600 leading-tight">24/48 ore</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Reso Facile</p>
                  <p className="text-xs text-gray-600 leading-tight">Entro 14 gg</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Supporto</p>
                  <p className="text-xs text-gray-600 leading-tight">7 giorni/7</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 lg:hidden">
          <div
            className="summary-toggle"
            onClick={() => setOrderSummaryExpanded(!orderSummaryExpanded)}
          >
            <div className="flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  transform: orderSummaryExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              >
                <path d="M4 6L8 10L12 6" stroke="#333" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-medium text-blue-600">
                {orderSummaryExpanded ? "Nascondi" : "Mostra"} riepilogo ordine
              </span>
            </div>
            <span className="text-base font-semibold">
              {formatMoney(totalToPayCents, currency)}
            </span>
          </div>

          {orderSummaryExpanded && (
            <div className="summary-content">
              <div className="space-y-3 mb-4">
                {cart.items.map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    {item.image && (
                      <div className="relative flex-shrink-0">
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                        />
                        <span className="absolute -top-2 -right-2 bg-gray-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium shadow-sm">
                          {item.quantity}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.title}
                      </p>
                      {item.variantTitle && (
                        <p className="text-xs text-gray-500 mt-1">{item.variantTitle}</p>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 flex-shrink-0">
                      {formatMoney(item.linePriceCents || item.priceCents || 0, currency)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotale</span>
                  <span className="text-gray-900">{formatMoney(subtotalCents, currency)}</span>
                </div>

                {discountCents > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Sconto</span>
                    <span>-{formatMoney(discountCents, currency)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-600">Spedizione</span>
                  <span className="text-gray-900">
                    {shippingCents > 0 ? formatMoney(shippingCents, currency) : "€5,90"}
                  </span>
                </div>

                <div className="flex justify-between text-base font-semibold pt-3 border-t border-gray-200">
                  <span>Totale</span>
                  <span className="text-lg">{formatMoney(totalToPayCents, currency)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-12">
            <div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="shopify-section">
                  <h2 className="shopify-section-title">Contatti</h2>

                  <div>
                    <label className="shopify-label">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={customer.email}
                      onChange={handleChange}
                      className="shopify-input"
                      placeholder="mario.rossi@esempio.com"
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="flex items-start gap-2 mt-4">
                    <input type="checkbox" id="emailUpdates" className="w-4 h-4 mt-0.5 flex-shrink-0 rounded" />
                    <label htmlFor="emailUpdates" className="text-xs text-gray-600 leading-relaxed">
                      Inviami email con notizie e offerte
                    </label>
                  </div>
                </div>

                <div className="shopify-section">
                  <h2 className="shopify-section-title">Consegna</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="shopify-label">Paese / Regione</label>
                      <select
                        name="countryCode"
                        value={customer.countryCode}
                        onChange={handleChange}
                        className="shopify-input"
                        required
                      >
                        <option value="IT">Italia</option>
                        <option value="FR">Francia</option>
                        <option value="DE">Germania</option>
                        <option value="ES">Spagna</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="shopify-label">Nome</label>
                        <input
                          type="text"
                          name="firstName"
                          value={firstName}
                          onChange={(e) => {
                            setCustomer((prev) => ({
                              ...prev,
                              fullName: `${e.target.value} ${lastName}`.trim(),
                            }))
                          }}
                          className="shopify-input"
                          placeholder="Mario"
                          required
                          autoComplete="given-name"
                        />
                      </div>

                      <div>
                        <label className="shopify-label">Cognome</label>
                        <input
                          type="text"
                          name="lastName"
                          value={lastName}
                          onChange={(e) => {
                            setCustomer((prev) => ({
                              ...prev,
                              fullName: `${firstName} ${e.target.value}`.trim(),
                            }))
                          }}
                          className="shopify-input"
                          placeholder="Rossi"
                          required
                          autoComplete="family-name"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="shopify-label">Azienda (facoltativo)</label>
                      <input type="text" className="shopify-input" placeholder="Nome azienda" autoComplete="organization" />
                    </div>

                    <div>
                      <label className="shopify-label">Indirizzo</label>
                      <input
                        ref={addressInputRef}
                        type="text"
                        name="address1"
                        value={customer.address1}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="Via Roma 123"
                        required
                        autoComplete="address-line1"
                      />
                    </div>

                    <div>
                      <label className="shopify-label">Interno, scala, ecc. (facoltativo)</label>
                      <input
                        type="text"
                        name="address2"
                        value={customer.address2}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="Scala A, Piano 2"
                        autoComplete="address-line2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="shopify-label">CAP</label>
                        <input
                          type="text"
                          name="postalCode"
                          value={customer.postalCode}
                          onChange={handleChange}
                          className="shopify-input"
                          placeholder="00100"
                          required
                          autoComplete="postal-code"
                        />
                      </div>

                      <div>
                        <label className="shopify-label">Città</label>
                        <input
                          type="text"
                          name="city"
                          value={customer.city}
                          onChange={handleChange}
                          className="shopify-input"
                          placeholder="Roma"
                          required
                          autoComplete="address-level2"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="shopify-label">Provincia</label>
                      <input
                        type="text"
                        name="province"
                        value={customer.province}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="RM"
                        required
                        autoComplete="address-level1"
                      />
                    </div>

                    <div>
                      <label className="shopify-label">Telefono</label>
                      <input
                        type="tel"
                        name="phone"
                        value={customer.phone}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="+39 333 1234567"
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>

                <div className="shopify-section">
                  <h2 className="shopify-section-title">Pagamento</h2>

                  {isCalculatingShipping && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                      <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <p className="text-sm text-blue-800 font-medium">Calcolo in corso...</p>
                    </div>
                  )}

                  {isFormValid() && !isCalculatingShipping ? (
                    <ObliqpayIframe
                      sessionId={sessionId}
                      amountCents={totalToPayCents}
                      currency={currency}
                      customerEmail={customer.email}
                      paymentKey={paymentKey}
                      onOrderReady={({ orderId }) => {
                        setError(null)
                        setObliqpayOrderId(orderId)
                      }}
                      onError={(msg) => setError(msg)}
                    />
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                      <p className="text-sm text-gray-600 text-center">
                        Compila tutti i campi per visualizzare i metodi di pagamento
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl mt-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="hidden lg:block">
              <div className="shopify-section sticky top-24">
                <h2 className="shopify-section-title">Riepilogo ordine</h2>

                <div className="space-y-3 mb-4">
                  {cart.items.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      {item.image && (
                        <div className="relative flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                          />
                          <span className="absolute -top-2 -right-2 bg-gray-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium shadow-sm">
                            {item.quantity}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.title}
                        </p>
                        {item.variantTitle && (
                          <p className="text-xs text-gray-500 mt-1">{item.variantTitle}</p>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 flex-shrink-0">
                        {formatMoney(item.linePriceCents || item.priceCents || 0, currency)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotale</span>
                    <span className="text-gray-900">{formatMoney(subtotalCents, currency)}</span>
                  </div>

                  {discountCents > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Sconto</span>
                      <span>-{formatMoney(discountCents, currency)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-gray-600">Spedizione</span>
                    <span className="text-gray-900">
                      {shippingCents > 0 ? formatMoney(shippingCents, currency) : "€5,90"}
                    </span>
                  </div>

                  <div className="flex justify-between text-lg font-bold pt-4 border-t border-gray-200">
                    <span>Totale</span>
                    <span className="text-xl">{formatMoney(totalToPayCents, currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Sessione non valida (manca il sessionId).")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`)
        const data = (await res.json()) as CartSessionResponse | { error?: string }

        if (!res.ok || (data as any).error) {
          setError((data as any).error || "Errore nel recupero del carrello. Riprova dal sito.")
          setLoading(false)
          return
        }

        setCart(data as CartSessionResponse)
        setLoading(false)
      } catch (err: any) {
        console.error("Errore checkout:", err)
        setError(err?.message || "Errore imprevisto nel caricamento del checkout.")
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4" />
          <p className="text-sm text-gray-600 font-medium">Caricamento del checkout...</p>
        </div>
      </div>
    )
  }

  if (error || !cart) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4 p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
          <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900">Impossibile caricare il checkout</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <p className="text-xs text-gray-500">Ritorna al sito e riprova ad aprire il checkout.</p>
        </div>
      </div>
    )
  }

  return <CheckoutInner cart={cart} sessionId={sessionId!} />
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4" />
            <p className="text-sm text-gray-600 font-medium">Caricamento...</p>
          </div>
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  )
}


