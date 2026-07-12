"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol } from "@/lib/model/paths";
import type { Bucket } from "@/lib/model/types";
import { useAuth } from "@/lib/auth/AuthProvider";

export function useBuckets(): { buckets: Bucket[]; loading: boolean } {
  const { user } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = collection(getDb(), bucketsCol(user.uid));
    return onSnapshot(q, (snap) => {
      setBuckets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bucket, "id">) })));
      setLoading(false);
    });
  }, [user]);

  return { buckets, loading };
}
