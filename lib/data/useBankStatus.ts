"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface BankStatus {
  connectedAt?: string;
  lastSyncedAt?: string;
}

// Reads the client-visible bank status marker (users/{uid}/meta/bank), written
// by the Functions admin SDK on connect/sync. Access tokens live in the deny-all
// bankConnections/** tree and never reach the client.
export function useBankStatus(): { status: BankStatus | null; loading: boolean } {
  const { user } = useAuth();
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const ref = doc(getDb(), `users/${user.uid}/meta/bank`);
    return onSnapshot(ref, (snap) => {
      setStatus(snap.exists() ? (snap.data() as BankStatus) : null);
      setLoading(false);
    });
  }, [user]);

  return { status, loading };
}
