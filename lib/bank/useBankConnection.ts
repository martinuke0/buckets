"use client";
import { useState, useCallback, useEffect } from "react";
import { usePlaidLink, type PlaidLinkOptions } from "react-plaid-link";
import { httpsCallable } from "firebase/functions";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp } from "@/lib/firebase/client";

interface CreateLinkTokenResponse {
  linkToken: string;
}

interface ExchangePublicTokenRequest {
  publicToken: string;
}

interface SyncTransactionsResponse {
  added: number;
}

let emulatorConnected = false;

function getFunctionsClient() {
  const functions = getFunctions(getFirebaseApp());

  // Connect to emulator in dev (only once)
  if (process.env.NODE_ENV === "development" && !emulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      emulatorConnected = true;
    } catch (e) {
      // Already connected or error, ignore
    }
  }

  return functions;
}

export function useBankConnection(): {
  connect: () => Promise<void>;
  refresh: () => Promise<{ added: number }>;
  busy: boolean;
  lastResult: string | null;
  error: string | null;
} {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const functions = getFunctionsClient();

  const onSuccess = useCallback(
    async (publicToken: string) => {
      try {
        setBusy(true);
        setError(null);
        const exchangeFn = httpsCallable<ExchangePublicTokenRequest, void>(
          functions,
          "exchangePublicToken"
        );
        await exchangeFn({ publicToken });
        setLastResult("Connected successfully");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to exchange token");
      } finally {
        setBusy(false);
      }
    },
    [functions]
  );

  const config: PlaidLinkOptions = {
    token: linkToken || "",
    onSuccess,
  };

  const { open, ready } = usePlaidLink(config);

  const connect = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      const createLinkTokenFn = httpsCallable<void, CreateLinkTokenResponse>(
        functions,
        "createLinkToken"
      );
      const result = await createLinkTokenFn();
      setLinkToken(result.data.linkToken);
      // Wait for ready and open
      // Note: open will be called via useEffect when ready
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link token");
      setBusy(false);
    }
  }, [functions]);

  // Open Plaid Link when ready
  useEffect(() => {
    if (ready && linkToken) {
      open();
      setBusy(false);
    }
  }, [ready, linkToken, open]);

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setLastResult(null);
      const syncFn = httpsCallable<void, SyncTransactionsResponse>(
        functions,
        "syncTransactions"
      );
      const result = await syncFn();
      const added = result.data.added;
      setLastResult(added === 0 ? "Up to date" : `${added} new`);
      return { added };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync transactions");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [functions]);

  return {
    connect,
    refresh,
    busy,
    lastResult,
    error,
  };
}
