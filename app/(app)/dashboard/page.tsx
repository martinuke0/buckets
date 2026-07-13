"use client";
import { useState } from "react";
import { useBuckets } from "@/lib/data/useBuckets";
import { useTransactions } from "@/lib/data/useTransactions";
import { useBankConnection } from "@/lib/bank/useBankConnection";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SafeToSpendHero } from "@/components/buckets/SafeToSpendHero";
import { BucketCard } from "@/components/buckets/BucketCard";
import { TransactionList } from "@/components/tx/TransactionList";
import { SimulateIncomeDialog } from "./SimulateIncomeDialog";
import { recategorize } from "@/lib/data/recategorize";

export default function Page() {
  const { buckets, loading } = useBuckets();
  const { transactions, loading: txLoading } = useTransactions();
  const { refresh, busy: syncBusy, lastResult, error } = useBankConnection();
  const { user } = useAuth();
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

      <div className="mt-8">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 className="text-xl font-bold">Transactions</h2>
          <button
            onClick={() => { void refresh(); }}
            disabled={syncBusy}
            className="rounded-lg py-2 px-3 text-sm font-semibold"
            style={{
              background: syncBusy ? "var(--color-muted)" : "var(--grad-brand)",
              color: "var(--color-text)",
              cursor: syncBusy ? "not-allowed" : "pointer",
            }}
          >
            {syncBusy ? "Syncing..." : "Refresh"}
          </button>
        </div>
        {error && (
          <div style={{ color: "var(--color-danger)", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        {lastResult && (
          <div style={{ color: "var(--color-success)", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
            {lastResult}
          </div>
        )}
        {txLoading ? (
          <div style={{ color: "var(--color-muted)" }}>Loading...</div>
        ) : (
          <TransactionList
            transactions={transactions}
            buckets={buckets}
            onRecategorize={(txnId, bucketId) => {
              const txn = transactions.find((t) => t.id === txnId);
              if (txn && user) {
                void recategorize(user.uid, txn, bucketId, buckets);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
