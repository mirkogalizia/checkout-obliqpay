import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    console.log("🔔 [WEBHOOK] Received:", JSON.stringify(body, null, 2))

    const { event, order_id, status, amount, currency, payment_status } = body

    // ✅ Verifica evento payment.completed
    if (event === "payment.completed" && status === "completed") {
      console.log(`✅ [WEBHOOK] Payment completed for order ${order_id}: ${amount} ${currency}`)
      
      // TODO: Aggiorna database, invia email, ecc.
      // await updateOrderInDatabase(order_id, { status: 'paid' })
    }

    // ✅ Rispondi sempre con 200
    return NextResponse.json({ received: true }, { status: 200 })

  } catch (error: any) {
    console.error("❌ [WEBHOOK] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
