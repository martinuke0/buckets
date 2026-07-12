"use client";
import { BucketSetup } from "@/components/buckets/BucketSetup";
import { useBuckets } from "@/lib/data/useBuckets";
import { saveBuckets } from "@/lib/data/buckets";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Bucket } from "@/lib/model/types";

const DEFAULT_BUCKETS: Omit<Bucket, "id">[] = [
  { name: "Rent", colorIndex: 0, percent: 35, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Savings", colorIndex: 1, percent: 30, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Food", colorIndex: 2, percent: 15, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Nights out", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Gym", colorIndex: 4, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
];

export default function Page() {
  const { user } = useAuth();
  const { buckets, loading } = useBuckets();

  if (loading) {
    return <div className="text-white/50">Loading…</div>;
  }

  const initial: Bucket[] =
    buckets.length > 0
      ? buckets
      : DEFAULT_BUCKETS.map((b) => ({ ...b, id: crypto.randomUUID() }));

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Buckets</h1>
      <BucketSetup
        initial={initial}
        onSave={(b) => user && saveBuckets(user.uid, b)}
      />
    </div>
  );
}
