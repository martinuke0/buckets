"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { txCol } from "@/lib/model/paths";
import type { Transaction } from "@/lib/model/types";
import { useAuth } from "@/lib/auth/AuthProvider";

export function useTransactions(): { transactions: Transaction[]; loading: boolean } {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(getDb(), txCol(user.uid)),
      orderBy("bookedAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setTransactions(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, "id">) }))
      );
      setLoading(false);
    });
  }, [user]);

  return { transactions, loading };
}
