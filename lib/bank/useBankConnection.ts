"use client";
import { useState, useCallback, useEffect } from "react";
import { usePlaidLink, type PlaidLinkOptions } from "react-plaid-link";
import { httpsCallable } from "firebase/functions";
import { getBankFunctions } from "./functionsClient";
import { friendlyBankError, useBankSync } from "./useBankSync";

interface CreateLinkTokenResponse {
  linkToken: string;
}

interface ExchangePublicTokenRequest {
  publicToken: string;
}

// Full bank-connection hook: Plaid Link connect flow + refresh. Mount this ONCE
// (on Settings), not app-wide — usePlaidLink embeds Plaid's script. For a
// refresh-only surface (e.g. the nav Sync button), use useBankSync instead.
export function useBankConnection(): {
  connect: () => Promise<void>;
  refresh: () => Promise<{ added: number }>;
  busy: boolean;
  lastResult: string | null;
  error: string | null;
} {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const functions = getBankFunctions();
  // Reuse the sync-only hook for refresh + its lastResult (single source of truth).
  const { refresh, busy: syncBusy, lastResult, error: syncError } = useBankSync();

  const onSuccess = useCallback(
    async (publicToken: string) => {
      try {
        setBusy(true);
        setError(null);
        const exchangeFn = httpsCallable<ExchangePublicTokenRequest, void>(functions, "exchangePublicToken");
        await exchangeFn({ publicToken });
      } catch (err) {
        setError(friendlyBankError(err, "Couldn't finish connecting your bank. Please try again."));
      } finally {
        setBusy(false);
      }
    },
    [functions],
  );

  const config: PlaidLinkOptions = { token: linkToken || "", onSuccess };
  const { open, ready } = usePlaidLink(config);

  const connect = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      const createLinkTokenFn = httpsCallable<void, CreateLinkTokenResponse>(functions, "createLinkToken");
      const result = await createLinkTokenFn();
      setLinkToken(result.data.linkToken);
    } catch (err) {
      setError(friendlyBankError(err, "Couldn't start the bank connection. Please try again."));
      setBusy(false);
    }
  }, [functions]);

  useEffect(() => {
    if (ready && linkToken) {
      open();
      setBusy(false);
    }
  }, [ready, linkToken, open]);

  return {
    connect,
    refresh,
    busy: busy || syncBusy,
    lastResult,
    error: error ?? syncError,
  };
}
