import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";
import { getFirebaseApp } from "@/lib/firebase/client";

let emulatorConnected = false;

// Shared Firebase Functions client for bank callables. Connects to the local
// emulator once in development. Used by both useBankConnection and useBankSync
// so there is a single client-init path.
export function getBankFunctions(): Functions {
  const functions = getFunctions(getFirebaseApp());
  if (process.env.NODE_ENV === "development" && !emulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      emulatorConnected = true;
    } catch {
      // Already connected — ignore.
    }
  }
  return functions;
}
