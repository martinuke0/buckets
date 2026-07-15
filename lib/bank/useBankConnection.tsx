"use client";
import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { httpsCallable } from "firebase/functions";
import { getBankFunctions } from "./functionsClient";
import { friendlyBankError, useBankSync } from "./useBankSync";
import { logAction } from "@/lib/observability/breadcrumbs";

interface CreateLinkTokenResponse {
  linkToken: string;
}

interface ExchangePublicTokenRequest {
  publicToken: string;
}

// Internal launcher: mounted ONLY once a real link token exists. Because
// usePlaidLink embeds Plaid's link-initialize.js the moment it receives a
// token, calling it with a placeholder ("") and then the real token embeds
// the script twice ("embedded more than once" warning). Gating the hook
// behind a non-null token — via this child that only mounts when the token
// is set — keeps the embed to exactly one.
function PlaidLauncher({
  token,
  onPublicToken,
  onExit,
}: {
  token: string;
  onPublicToken: (publicToken: string) => void;
  onExit: () => void;
}): null {
  const { open, ready } = usePlaidLink({ token, onSuccess: onPublicToken, onExit });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return null;
}

// Full bank-connection hook: Plaid Link connect flow + refresh. Mount this ONCE
// (on Settings). For a refresh-only surface (e.g. the nav Sync button), use
// useBankSync instead. Returns `launcher` — render it in your JSX so the Plaid
// script embeds only when a token exists.
export function useBankConnection(): {
  connect: () => Promise<void>;
  refresh: () => Promise<{ added: number }>;
  launcher: React.ReactNode;
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

  const onPublicToken = useCallback(
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
        setLinkToken(null); // unmount launcher; a re-connect fetches a fresh token
      }
    },
    [functions],
  );

  const onExit = useCallback(() => {
    setBusy(false);
    setLinkToken(null); // user closed Plaid without finishing — reset
  }, []);

  const connect = useCallback(async () => {
    try {
      logAction("connect_bank");
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

  const launcher = linkToken ? (
    <PlaidLauncher token={linkToken} onPublicToken={onPublicToken} onExit={onExit} />
  ) : null;

  return {
    connect,
    refresh,
    launcher,
    busy: busy || syncBusy,
    lastResult,
    error: error ?? syncError,
  };
}
