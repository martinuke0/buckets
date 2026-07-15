"use client";
import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { getBankFunctions } from "./functionsClient";
import { logAction } from "@/lib/observability/breadcrumbs";

interface SyncTransactionsResponse {
  added: number;
}

// Firebase callable errors surface raw codes (e.g. "internal", "unauthenticated")
// as err.message. Never show those raw to users — map known cases, else a friendly fallback.
export function friendlyBankError(err: unknown, fallback: string): string {
  const code = (err instanceof Error ? err.message : "").toLowerCase();
  if (code.includes("unauthenticated")) return "Please sign in again to continue.";
  if (code.includes("unavailable") || code.includes("deadline")) return "Couldn't reach the bank service. Please try again.";
  return fallback; // raw Firebase codes are never shown to the user
}

// Sync-only hook: refreshes transactions via the callable. Does NOT initialize
// Plaid Link, so it's safe to mount app-wide (e.g. the nav Sync button) without
// embedding Plaid's script multiple times.
export function useBankSync(): {
  refresh: () => Promise<{ added: number }>;
  busy: boolean;
  lastResult: string | null;
  error: string | null;
} {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const functions = getBankFunctions();

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setLastResult(null);
      const syncFn = httpsCallable<void, SyncTransactionsResponse>(functions, "syncTransactions");
      const result = await syncFn();
      const added = result.data.added;
      logAction("sync", { added });
      setLastResult(added === 0 ? "Up to date" : `${added} new`);
      return { added };
    } catch (err) {
      setError(friendlyBankError(err, "Couldn't refresh transactions. Please try again."));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [functions]);

  return { refresh, busy, lastResult, error };
}
