import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function getAuthClient(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (process.env.NODE_ENV === "development" && !authEmulatorConnected) {
    try {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      authEmulatorConnected = true;
    } catch {
      // Already connected — ignore.
    }
  }
  return auth;
}

export function getDb(): Firestore {
  const db = getFirestore(getFirebaseApp());
  if (process.env.NODE_ENV === "development" && !firestoreEmulatorConnected) {
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      firestoreEmulatorConnected = true;
    } catch {
      // Already connected — ignore.
    }
  }
  return db;
}
