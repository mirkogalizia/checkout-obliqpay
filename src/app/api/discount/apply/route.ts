// src/app/api/discount/apply/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const code = body?.code as string | undefined
    const sessionId = body?.sessionId as string | undefined

    if (!code || !code.trim()) {
      return NextResponse.json(
        { ok: false, error: "Codice mancante." },
        { status: 400 },
      )
    }

    // 🔹 Preleva TUTTA la config da Firestore
    const cfg = await getConfig()
    const shopDomain = cfg.shopify?.shopDomain
    const adminToken = cfg.shopify?.adminToken
    const apiVersion = cfg.shopify?.apiVersion || "2024-10"

    if (!shopDomain || !adminToken) {
      console.error(
        "[/api/discount/apply] Config Shopify mancante in Firestore:",
        cfg.shopify,
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Configurazione Shopify mancante sul server (shopDomain/adminToken).",
        },
        { status: 500 },
      )
    }

    const normalizedCode = code.trim()

    // 1) Lookup del codice sconto
    const lookupUrl = `https://${shopDomain}/admin/api/${apiVersion}/discount_codes/lookup.json?code=${encodeURIComponent(
      normalizedCode,
    )}`

    const lookupRes = await fetch(lookupUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })

    if (!lookupRes.ok) {
      if (lookupRes.status === 404) {
        return NextResponse.json(
          { ok: false, error: "Codice sconto non valido o non attivo." },
          { status: 404 },
        )
      }

      const txt = await lookupRes.text()
      console.error("[discount lookup] Errore:", lookupRes.status, txt)
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel contatto con Shopify (lookup codice).",
        },
        { status: 500 },
      )
    }

    const lookupJson = await lookupRes.json()
    const discountCode = lookupJson?.discount_code

    if (!discountCode?.price_rule_id) {
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o scaduto." },
        { status: 400 },
      )
    }

    const priceRuleId = discountCode.price_rule_id

    // 2) Recupera la price rule per capire tipo e valore
    const prUrl = `https://${shopDomain}/admin/api/${apiVersion}/price_rules/${priceRuleId}.json`
    const prRes = await fetch(prUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })

    if (!prRes.ok) {
      const txt = await prRes.text()
      console.error("[price_rule] Errore:", prRes.status, txt)
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel recupero della regola di sconto da Shopify.",
        },
        { status: 500 },
      )
    }

    const prJson = await prRes.json()
    const priceRule = prJson?.price_rule

    if (!priceRule) {
      return NextResponse.json(
        {
          ok: false,
          error: "Regola di sconto non trovata o non più valida.",
        },
        { status: 400 },
      )
    }

    const valueType = priceRule.value_type as
      | "percentage"
      | "fixed_amount"
      | "shipping"
    const rawValue = Number(priceRule.value) // es. "-10.0" per 10%
    const absValue = Math.abs(rawValue)

    if (valueType !== "percentage") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto non è di tipo percentuale. Al momento sono supportati solo sconti in percentuale.",
        },
        { status: 400 },
      )
    }

    // ✅ Risposta semplice per il frontend
    return NextResponse.json(
      {
        ok: true,
        code: discountCode.code,
        valueType, // "percentage"
        percentValue: absValue, // es. 10
        priceRuleId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[/api/discount/apply] Errore:", err)
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Errore interno applicazione sconto.",
      },
      { status: 500 },
    )
  }
}