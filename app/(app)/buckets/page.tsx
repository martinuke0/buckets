"use client";
import { BucketSetup } from "@/components/buckets/BucketSetup";
import { useBuckets } from "@/lib/data/useBuckets";
import { saveBuckets, deleteBucketAndRedistribute } from "@/lib/data/buckets";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePremium } from "@/lib/billing/usePremium";
import { startCheckout } from "@/lib/billing/startCheckout";
import type { Bucket } from "@/lib/model/types";
import { SectionLabel } from "@/components/ui/primitives";

const DEFAULT_BUCKETS: Omit<Bucket, "id">[] = [
  { name: "Housing", colorIndex: 0, percent: 35, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Savings", colorIndex: 1, percent: 30, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Food", colorIndex: 2, percent: 15, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Leisure", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Health", colorIndex: 4, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
];

export default function Page() {
  const { user } = useAuth();
  const { buckets, loading } = useBuckets();
  const { premium } = usePremium();

  if (loading) {
    return <div className="text-white/50">Loading…</div>;
  }

  const initial: Bucket[] =
    buckets.length > 0
      ? buckets
      : DEFAULT_BUCKETS.map((b) => ({ ...b, id: crypto.randomUUID() }));

  return (
    <div style={{ padding: "1rem", maxWidth: "42rem", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <SectionLabel>Buckets</SectionLabel>
      </div>
      <BucketSetup
        initial={initial}
        premium={premium}
        onSave={(b) => user && saveBuckets(user.uid, b)}
        onDelete={(id) => user && deleteBucketAndRedistribute(user.uid, id)}
        onUpgrade={() => user && startCheckout(user.uid)}
      />
    </div>
  );
}
