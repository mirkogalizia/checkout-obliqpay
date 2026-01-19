import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    console.log("🔔 [WEBHOOK] Received:", JSON.stringify(body, null, 2))

    const { 
      event, 
      order_id, 
      orderId,
      status, 
      amount, 
      currency, 
      payment_status,
      metadata,
      customer 
    } = body

    // 🔥 Gestisci sia order_id che orderId (dipende dalla response di Obliqpay)
    const finalOrderId = order_id || orderId

    // ✅ Verifica se il pagamento è completato
    const paymentCompleted = 
      event === "payment.completed" || 
      status === "completed" || 
      status === "paid" ||
      payment_status === "succeeded"

    if (paymentCompleted && finalOrderId) {
      console.log(`✅ [WEBHOOK] Pagamento completato!`)
      console.log(`💰 Ordine: ${finalOrderId}`)
      console.log(`💵 Importo: ${amount} ${currency}`)
      
      // 🎯 Recupera sessionId dai metadata
      const sessionId = metadata?.sessionId
      
      if (sessionId) {
        console.log(`📦 [WEBHOOK] SessionId trovato: ${sessionId}`)
        
        // 🔥 QUI PUOI FARE:
        // 1. Creare l'ordine su Shopify
        // 2. Inviare email di conferma
        // 3. Aggiornare database
        // 4. Salvare i dati del cliente
        
        console.log(`👤 [WEBHOOK] Dati cliente:`, {
          email: customer?.email,
          name: customer?.name,
          phone: customer?.phone,
        })
        
        // TODO: Implementa la logica di creazione ordine
        // await createShopifyOrder(sessionId, finalOrderId, customer)
        // await sendConfirmationEmail(customer.email, finalOrderId)
        
      } else {
        console.warn("⚠️ [WEBHOOK] SessionId non trovato nei metadata")
      }
    } else {
      console.log(`ℹ️ [WEBHOOK] Evento ricevuto: ${event || status}`)
    }

    // ✅ Rispondi sempre con 200 per confermare ricezione
    return NextResponse.json({ 
      received: true,
      orderId: finalOrderId,
      status: "processed" 
    }, { status: 200 })

  } catch (error: any) {
    console.error("❌ [WEBHOOK] Error:", error.message)
    console.error("❌ [WEBHOOK] Stack:", error.stack)
    
    // Anche in caso di errore, rispondi 200 per evitare retry infiniti
    return NextResponse.json({ 
      received: true, 
      error: error.message 
    }, { status: 200 })
  }
}
