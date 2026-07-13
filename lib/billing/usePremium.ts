"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { userDoc } from "@/lib/model/paths";
import { useAuth } from "@/lib/auth/AuthProvider";

export function usePremium(): { premium: boolean; loading: boolean } {
  const { user } = useAuth();
  const [premium, setPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const ref = doc(getDb(), userDoc(user.uid));
    return onSnapshot(ref, (snap) => {
      setPremium(!!snap.data()?.premium);
      setLoading(false);
    });
  }, [user]);

  return { premium, loading };
}
