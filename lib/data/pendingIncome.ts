"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { pendingIncomeCol } from "@/lib/model/paths";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface PendingIncome {
  id: string; amount: number; description: string; bookedAt: string; resolved: boolean;
}

export function usePendingIncome(): { pending: PendingIncome[]; loading: boolean } {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingIncome[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const q = collection(getDb(), pendingIncomeCol(user.uid));
    return onSnapshot(q, (snap) => {
      setPending(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PendingIncome, "id">) }))
          .filter((p) => !p.resolved),
      );
      setLoading(false);
    });
  }, [user]);
  return { pending, loading };
}
