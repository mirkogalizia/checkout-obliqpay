// src/app/api/cart-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/firebaseAdmin";

// Se vuoi bloccarlo solo al tuo dominio Shopify, puoi mettere qui il dominio esatto:
// es: const ALLOWED_ORIGIN = "https://imjsqk-my.myshopify.com";
const ALLOWED_ORIGIN = process.env.SHOPIFY_STORE_ORIGIN || "*";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

// Preflight CORS
export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 200 }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cart = body.cart;

    if (!cart || !Array.isArray(cart.items)) {
      console.error("[cart-session] Cart non valido o items mancanti:", body);
      return withCors(
        NextResponse.json(
          { error: "Cart non valido ricevuto da Shopify" },
          { status: 400 }
        )
      );
    }

    // Normalizziamo gli items del carrello
    const items = cart.items.map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      title: item.product_title || item.title,
      variant_title: item.variant_title,
      quantity: item.quantity,
      price: item.price, // in centesimi
      line_price: item.line_price,
      image: item.image,
      sku: item.sku,
    }));

    // Totali e valuta
    const currency =
      cart.currency || cart.currency_code || cart.currencyCode || "EUR";

    const subtotal =
      typeof cart.items_subtotal_price === "number"
        ? cart.items_subtotal_price
        : items.reduce(
            (sum: number, it: any) => sum + (it.line_price || 0),
            0
          );

    const sessionId = randomUUID();

    // Salviamo in Firestore per usarlo in /checkout e /api/payments
    await db.collection("checkoutSessions").doc(sessionId).set({
      items,
      currency,
      subtotal,
      createdAt: new Date().toISOString(),
      rawCart: cart,
    });

    console.log("[cart-session] Sessione creata:", sessionId, {
      itemsCount: items.length,
      subtotal,
      currency,
    });

    return withCors(
      NextResponse.json(
        {
          sessionId,
        },
        { status: 200 }
      )
    );
  } catch (err) {
    console.error("[cart-session] Errore interno:", err);
    return withCors(
      NextResponse.json({ error: "Errore interno nel checkout" }, { status: 500 })
    );
  }
}