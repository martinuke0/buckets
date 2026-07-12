"use client";
import { useState } from "react";
import { useBuckets } from "@/lib/data/useBuckets";
import { SafeToSpendHero } from "@/components/buckets/SafeToSpendHero";
import { BucketCard } from "@/components/buckets/BucketCard";
import { SimulateIncomeDialog } from "./SimulateIncomeDialog";

export default function Page() {
  const { buckets, loading } = useBuckets();
  const [showDialog, setShowDialog] = useState(false);

  if (loading) {
    return (
      <div style={{ color: "var(--color-muted)" }}>Loading...</div>
    );
  }

  // Compute safe to spend (sum of remaining)
  const safeToSpend = buckets.reduce((sum, b) => sum + b.remaining, 0);

  // Simple date-based calculation for demo (display concern, acceptable here)
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = endOfMonth.getDate();
  const currentDay = now.getDate();
  const daysToPayday = daysInMonth - currentDay;
  const monthProgress = currentDay / daysInMonth;

  // Simple on-track heuristic: if we have any money left and we're not at end of month
  const onTrack = safeToSpend > 0 && monthProgress < 0.9;

  return (
    <div>
      <SafeToSpendHero
        safeToSpend={safeToSpend}
        onTrack={onTrack}
        daysToPayday={daysToPayday}
        monthProgress={monthProgress}
      />

      {buckets.map((bucket) => (
        <BucketCard key={bucket.id} bucket={bucket} />
      ))}

      <button
        onClick={() => setShowDialog(true)}
        className="w-full rounded-lg py-3 px-4 mt-4 font-semibold"
        style={{ background: "var(--grad-brand)", color: "var(--color-text)" }}
      >
        Simulate income
      </button>

      {showDialog && (
        <SimulateIncomeDialog
          buckets={buckets}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}
