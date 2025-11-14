"use client"

import React, { useEffect, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
)

export type SummaryProps = {
  total: number
  currency: string
  sessionId: string
}

export default function Summary({ total, currency, sessionId }: SummaryProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function setupPayment() {
      if (!sessionId) return
      setLoading(true)
      setSetupError(null)

      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Errore nel setup del pagamento")
        }

        if (!data.clientSecret) {
          throw new Error("Client secret mancante dalla risposta Stripe")
        }

        if (!cancelled) {
          setClientSecret(data.clientSecret as string)
        }
      } catch (err: any) {
        console.error("[Summary] setupPayment error:", err)
        if (!cancelled) {
          setSetupError(
            err?.message || "Errore nel preparare il pagamento. Riprova."
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    setupPayment()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  const appearance: any = {
    theme: "stripe",
    variables: {
      colorPrimary: "#111827",
      colorBackground: "transparent",
      borderRadius: "12px",
      fontFamily:
        "-apple-system, system-ui, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    },
  }

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Totale ordine
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {total.toFixed(2)}{" "}
            <span className="text-sm font-medium text-slate-300">
              {currency}
            </span>
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-200">
            Pagamento sicuro
          </span>
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-300">
        Pagamento elaborato da Stripe. I dati della tua carta non passano mai
        sui server di Not For Resale.
      </p>

      {setupError && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-100">
          {setupError}
        </div>
      )}

      {loading && !clientSecret && (
        <div className="mb-4 text-sm text-slate-300">
          Preparazione del pagamento in corso…
        </div>
      )}

      {clientSecret && stripePromise ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance,
          }}
        >
          <ElementsForm
            sessionId={sessionId}
            total={total}
            currency={currency}
          />
        </Elements>
      ) : null}
    </div>
  )
}

type ElementsFormProps = {
  sessionId: string
  total: number
  currency: string
}

function ElementsForm({ sessionId, total, currency }: ElementsFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN}/thank-you?sessionId=${encodeURIComponent(
            sessionId
          )}`,
        },
        redirect: "if_required", // resta inline, redirect solo se 3DS/forte autenticazione
      })

      if (error) {
        setErrorMessage(error.message || "Pagamento non riuscito, riprova.")
      } else if (
        paymentIntent &&
        (paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing")
      ) {
        window.location.href = `/thank-you?sessionId=${encodeURIComponent(
          sessionId
        )}`
      } else {
        setErrorMessage("Pagamento non completato. Riprova.")
      }
    } catch (err: any) {
      console.error("[ElementsForm] confirmPayment error:", err)
      setErrorMessage(
        err?.message || "Errore imprevisto durante il pagamento. Riprova."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-3">
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-100">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            Elaborazione in corso…
          </span>
        ) : (
          <>
            <span>Paga ora</span>
            <span className="font-mono text-xs text-slate-500 group-hover:text-slate-700">
              {total.toFixed(2)} {currency}
            </span>
          </>
        )}
      </button>

      <p className="text-[11px] leading-relaxed text-slate-400">
        Proseguendo accetti i{" "}
        <a
          href="https://stripe.com/it/legal"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-slate-200"
        >
          Termini di servizio Stripe
        </a>{" "}
        e le{" "}
        <a
          href="https://notforresale.it/policies/privacy-policy"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-slate-200"
        >
          norme sulla privacy
        </a>
        .
      </p>
    </form>
  )
}