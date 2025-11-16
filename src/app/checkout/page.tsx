"use client"

import React, {
  Suspense,
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
} from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
)

const FIXED_SHIPPING_CENTS = 590

/* ---------------------------------------------------------
   TYPES
--------------------------------------------------------- */

type CheckoutItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  priceCents?: number
  linePriceCents?: number
  image?: string
}

type CartSessionResponse = {
  sessionId: string
  currency: string
  items: CheckoutItem[]
  subtotalCents: number
  shippingCents?: number
  totalCents?: number
  rawCart?: any
}

type Customer = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  province: string
  zip: string
  country: string
}

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-black focus:border-black",
        "transition-all",
      ].join(" ")}
      style={{ WebkitAppearance: "none" }}
    />
  )
}

/* ---------------------------------------------------------
   EXPRESS CHECKOUT (Apple Pay / Google Pay)
--------------------------------------------------------- */

function ExpressCheckoutButton({
  sessionId,
  amount,
  currency,
}: {
  sessionId: string
  amount: number
  currency: string
}) {
  const stripe = useStripe()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!stripe) return

    const pr = stripe.paymentRequest({
      country: "IT",
      currency: currency.toLowerCase(),
      total: {
        label: "Totale ordine",
        amount,
      },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
      requestShipping: true,
      shippingOptions: [
        {
          id: "standard",
          label: "Spedizione Standard 24/48h",
          detail: "Consegna stimata",
          amount: FIXED_SHIPPING_CENTS,
        },
      ],
    })

    pr.on("shippingaddresschange", (ev) => {
      ev.updateWith({
        status: "success",
        shippingOptions: [
          {
            id: "standard",
            label: "Spedizione Standard 24/48h",
            detail: "Consegna stimata in 24/48h",
            amount: FIXED_SHIPPING_CENTS,
          },
        ],
      })
    })

    pr.canMakePayment().then((result) => {
      if (result) {
        const elements = stripe.elements()

        const button = (elements as any).create("paymentRequestButton", {
          paymentRequest: pr,
          style: {
            paymentRequestButton: {
              theme: "dark",
              height: "48px",
            },
          },
        })

        button.mount("#express-checkout")
        setReady(true)
      }
    })
  }, [stripe, amount, currency])

  return <div className="mb-6"><div id="express-checkout" /></div>
}

/* ---------------------------------------------------------
   PAYMENT BOX (Carta)
--------------------------------------------------------- */

function PaymentBox({
  clientSecret,
  sessionId,
  customer,
  totalFormatted,
}: any) {
  if (!clientSecret)
    return <div className="text-sm text-gray-500">Caricamento pagamento…</div>

  const appearance: any = {
    theme: "flat",
    labels: "floating",
    variables: {
      colorPrimary: "#000",
      colorBackground: "#fff",
      colorText: "#111",
      borderRadius: "10px",
    },
    rules: {
      ".Input": {
        borderRadius: "10px",
        border: "1px solid #000",
        boxShadow: "none",
      },
      ".Block": {
        borderRadius: "10px",
        border: "1px solid #000",
      },
      ".Input:focus": {
        border: "1px solid #000",
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PaymentBoxInner
        sessionId={sessionId}
        customer={customer}
        totalFormatted={totalFormatted}
      />
    </Elements>
  )
}

function PaymentBoxInner({ sessionId, customer, totalFormatted }: any) {
  const stripe = useStripe()
  const elements = useElements()

  const [cardholderName, setCardholderName] = useState("")
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true)
    setError(null)

    const fullName =
      cardholderName.trim() ||
      `${customer.firstName} ${customer.lastName}`.trim()

    const { error, paymentIntent }: any = await stripe.confirmPayment({
      elements,
      confirmParams: {
        payment_method_data: {
          billing_details: {
            name: fullName,
            email: customer.email,
            phone: customer.phone,
            address: {
              line1: customer.address1,
              line2: customer.address2,
              postal_code: customer.zip,
              city: customer.city,
              state: customer.province,
              country: customer.country,
            },
          },
        },
      },
      redirect: "if_required",
    })

    if (error) {
      setError(error.message)
      setPaying(false)
      return
    }

    if (paymentIntent?.status === "succeeded") {
      window.location.href = `/thank-you?sessionId=${sessionId}&pi=${paymentIntent.id}`
    } else {
      setError("Pagamento non completato.")
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Nome intestatario */}
      <div>
        <label className="block text-xs text-gray-600 mb-1.5">
          Nome intestatario carta
        </label>
        <Input
          placeholder="Es. Mario Rossi"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
        />
      </div>

      {/* Box carta */}
      <div className="rounded-2xl border border-black bg-white px-4 py-5 shadow">
        <PaymentElement />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded-md">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={paying}
        className="w-full rounded-xl bg-black text-white px-4 py-3 text-sm font-semibold disabled:opacity-60"
      >
        {paying ? "Elaborazione…" : `Paga ora ${totalFormatted}`}
      </button>
    </div>
  )
}

/* ---------------------------------------------------------
   PAGE INNER — LOGICA PRINCIPALE
--------------------------------------------------------- */

function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [currency, setCurrency] = useState("EUR")
  const [subtotalCents, setSubtotalCents] = useState(0)
  const [shippingCents, setShippingCents] = useState(0)
  const [totalCents, setTotalCents] = useState(0)

  const [discountCents, setDiscountCents] = useState(0)
  const [originalSubtotalCents, setOriginalSubtotalCents] = useState(0)
  const [discountCode, setDiscountCode] = useState<string | null>(null)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const [customer, setCustomer] = useState<Customer>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "IT",
  })

  /* ---------------------------------------------------------
     LOAD CART SESSION
  --------------------------------------------------------- */
  useEffect(() => {
    if (!sessionId) {
      setError("Sessione non trovata.")
      setLoading(false)
      return
    }

    ;(async () => {
      const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        setLoading(false)
        return
      }

      setItems(data.items)
      setCurrency(data.currency)

      const raw = data.rawCart || {}
      const original = Number(raw.original_total_price || 0)
      const current = Number(raw.total_price || 0)
      const discount = Number(raw.total_discount || original - current)

      setOriginalSubtotalCents(original)
      setSubtotalCents(current)
      setDiscountCents(discount)

      if (raw.discount_codes?.length)
        setDiscountCode(raw.discount_codes[0].code)

      setLoading(false)
    })()
  }, [sessionId])

  /* ---------------------------------------------------------
     SHIPPING — fixed 5.90
  --------------------------------------------------------- */
  useEffect(() => {
    if (
      customer.firstName &&
      customer.lastName &&
      customer.email &&
      customer.address1 &&
      customer.zip &&
      customer.city &&
      customer.province
    ) {
      setShippingCents(FIXED_SHIPPING_CENTS)
      setTotalCents(subtotalCents + FIXED_SHIPPING_CENTS)
    }
  }, [customer, subtotalCents])

  /* ---------------------------------------------------------
     GENERATE PAYMENT INTENT
  --------------------------------------------------------- */
  useEffect(() => {
    if (!sessionId || !subtotalCents || !shippingCents) return

    ;(async () => {
      const res = await fetch("/api/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          shippingCents,
          customer,
        }),
      })

      const data = await res.json()
      if (res.ok) setClientSecret(data.clientSecret)
    })()
  }, [sessionId, subtotalCents, shippingCents, customer])

  /* ---------------------------------------------------------
     UI
  --------------------------------------------------------- */

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        Caricamento…
      </main>
    )

  if (error)
    return <main className="p-10 text-red-600">{error}</main>

  const totalFormatted = (totalCents / 100).toFixed(2)
  const shippingFormatted = (shippingCents / 100).toFixed(2)
  const subtotalBeforeDiscount = (originalSubtotalCents / 100).toFixed(2)
  const subtotalAfterDiscount = (subtotalCents / 100).toFixed(2)
  const discountFormatted = (discountCents / 100).toFixed(2)

  const itemsCount = useMemo(
    () => items.reduce((acc, it) => acc + it.quantity, 0),
    [items]
  )

  return (
    <main className="min-h-screen bg-white text-black px-4 py-6 md:px-6 lg:px-10">
      {/* HEADER */}
      <header className="mb-8 flex justify-center">
        <Link href={`/checkout?sessionId=${sessionId}`}>
          <img
            src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
            className="h-16 md:h-20 w-auto"
            alt="Logo"
          />
        </Link>
      </header>

      <h1 className="text-2xl md:text-3xl font-semibold mb-4 text-center">
        Checkout
      </h1>

      {/* EXPRESS CHECKOUT */}
      <ExpressCheckoutButton
        sessionId={sessionId}
        amount={totalCents}
        currency={currency}
      />

      <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[2fr_1.3fr] mt-6">
        {/* LEFT — DATI + ARTICOLI */}
        <section className="space-y-8">
          {/* DATI */}
          <div className="border border-gray-200 rounded-3xl p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Dati di spedizione
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Nome"
                value={customer.firstName}
                onChange={(e) =>
                  setCustomer({ ...customer, firstName: e.target.value })
                }
              />
              <Input
                placeholder="Cognome"
                value={customer.lastName}
                onChange={(e) =>
                  setCustomer({ ...customer, lastName: e.target.value })
                }
              />
            </div>

            <div className="mt-3 space-y-3">
              <Input
                placeholder="Email"
                value={customer.email}
                onChange={(e) =>
                  setCustomer({ ...customer, email: e.target.value })
                }
              />
              <Input
                placeholder="Telefono"
                value={customer.phone}
                onChange={(e) =>
                  setCustomer({ ...customer, phone: e.target.value })
                }
              />
              <Input
                placeholder="Indirizzo"
                value={customer.address1}
                onChange={(e) =>
                  setCustomer({ ...customer, address1: e.target.value })
                }
              />
              <Input
                placeholder="Interno / scala (opzionale)"
                value={customer.address2}
                onChange={(e) =>
                  setCustomer({ ...customer, address2: e.target.value })
                }
              />

              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="CAP"
                  value={customer.zip}
                  onChange={(e) =>
                    setCustomer({ ...customer, zip: e.target.value })
                  }
                />
                <Input
                  placeholder="Città"
                  value={customer.city}
                  onChange={(e) =>
                    setCustomer({ ...customer, city: e.target.value })
                  }
                />
                <Input
                  placeholder="Provincia"
                  value={customer.province}
                  onChange={(e) =>
                    setCustomer({ ...customer, province: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* ARTICOLI */}
          <div className="border border-gray-200 rounded-3xl p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Articoli nel carrello ({itemsCount})
            </h2>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const unit = (item.priceCents || 0) / 100
                const line = (item.linePriceCents || 0) / 100

                const originalUnit =
                  item.linePriceCents &&
                  item.quantity &&
                  item.linePriceCents <
                    (item.priceCents || 0) * item.quantity
                    ? (item.priceCents || 0) / 100
                    : null

                return (
                  <div
                    key={idx}
                    className="flex gap-3 rounded-2xl border border-gray-200 p-3 bg-gray-50"
                  >
                    <img
                      src={item.image}
                      className="h-16 w-16 rounded-xl border object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium line-clamp-2">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {item.quantity}× {unit.toFixed(2)} {currency}
                      </div>
                      {originalUnit && (
                        <div className="text-[11px] text-emerald-600 mt-1">
                          Risparmi{" "}
                          {((originalUnit - unit) * item.quantity).toFixed(
                            2
                          )}{" "}
                          {currency}
                        </div>
                      )}
                    </div>

                    <div className="text-sm font-semibold">
                      {line.toFixed(2)} {currency}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* RIGHT — RIEPILOGO + PAYMENT */}
        <section className="space-y-8">
          {/* RIEPILOGO */}
          <div className="border border-gray-200 rounded-3xl p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Riepilogo ordine
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotale prodotti</span>
                <span>{subtotalBeforeDiscount} {currency}</span>
              </div>

              {discountCents > 0 && (
                <div className="flex justify-between">
                  <span>Sconto ({discountCode})</span>
                  <span className="text-red-600">
                    −{discountFormatted} {currency}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Subtotale</span>
                <span>{subtotalAfterDiscount} {currency}</span>
              </div>

              <div className="flex justify-between">
                <span>Spedizione</span>
                <span>
                  {shippingCents ? `${shippingFormatted} ${currency}` : "—"}
                </span>
              </div>
            </div>

            <div className="border-t pt-3 mt-3 flex justify-between text-lg font-semibold">
              <span>Totale</span>
              <span>{totalFormatted} {currency}</span>
            </div>
          </div>

          {/* PAGAMENTO CARTA */}
          <div className="border border-gray-200 rounded-3xl p-6 bg-white shadow-sm">
            <PaymentBox
              clientSecret={clientSecret}
              sessionId={sessionId}
              customer={customer}
              totalFormatted={`${totalFormatted} ${currency}`}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

/* ---------------------------------------------------------
   EXPORT
--------------------------------------------------------- */

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}