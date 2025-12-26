export const runtime = "nodejs"

import { NextResponse } from "next/server"

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId") || "sess_test_1234567890"
  const amountCents = Number(searchParams.get("amountCents") || "1000")

  // chiamiamo la tua init interna (stesso deployment)
  const origin = `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`
  const initRes = await fetch(`${origin}/api/redsys/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, amountCents }),
  })

  const json = await initRes.json()
  if (!json?.ok) {
    return NextResponse.json(json, { status: initRes.status })
  }

  const r = json.redsys

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body onload="document.forms[0].submit()">
    <form method="POST" action="${esc(r.url)}">
      <input type="hidden" name="Ds_SignatureVersion" value="${esc(r.Ds_SignatureVersion)}" />
      <input type="hidden" name="Ds_MerchantParameters" value="${esc(r.Ds_MerchantParameters)}" />
      <input type="hidden" name="Ds_Signature" value="${esc(r.Ds_Signature)}" />
      <noscript><button type="submit">Paga</button></noscript>
    </form>
  </body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}