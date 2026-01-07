// src/lib/firebaseAdmin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const apps = getApps()

if (!apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin env vars")
  }

  // ✅ FIX: Rimuovi virgolette esterne se presenti
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1)
  }

  // ✅ FIX: Sostituisci \\n con \n reali
  privateKey = privateKey.replace(/\\n/g, "\n")

  console.log("[Firebase] Initializing with project:", projectId)

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })

  console.log("[Firebase] ✅ Initialized successfully")
}

export const db = getFirestore()
