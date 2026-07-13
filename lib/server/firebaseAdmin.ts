/**
 * SERVER-ONLY Firebase Admin initialization.
 * This file must never be imported by client code.
 */
import admin from "firebase-admin";

// Initialize Firebase Admin once
if (!admin.apps.length) {
  // Service account credentials from environment variables
  // Required env vars:
  // - FIREBASE_PROJECT_ID
  // - FIREBASE_PRIVATE_KEY (must preserve newlines: replace \n with actual newlines)
  // - FIREBASE_CLIENT_EMAIL
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    throw new Error(
      "Missing Firebase Admin environment variables. Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL",
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      privateKey,
      clientEmail,
    }),
  });
}

const db = admin.firestore();

/**
 * Set the premium status for a user.
 * Merges the premium field without clobbering other fields in the document.
 */
export async function adminSetPremium(uid: string, value: boolean): Promise<void> {
  await db.collection("users").doc(uid).set({ premium: value }, { merge: true });
}
