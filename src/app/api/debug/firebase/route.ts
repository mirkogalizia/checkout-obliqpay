import { NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

export async function GET() {
  try {
    const ref = db.collection("_debug").doc("ping")
    await ref.set({ ok: true, updatedAt: new Date().toISOString() }, { merge: true })
    const snap = await ref.get()

    return NextResponse.json({
      ok: true,
      data: snap.data() || null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Firestore error" },
      { status: 500 },
    )
  }
}