"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTransactions } from "@/lib/data/useTransactions";
import { useBuckets } from "@/lib/data/useBuckets";
import { useAuth } from "@/lib/auth/AuthProvider";
import { recategorize } from "@/lib/data/recategorize";
import { formatEuros } from "@/lib/model/money";
import { pickDotColor } from "@/lib/theme";

export default function TxDetailPage() {
  const params = useParams();
  const txnId = params.id as string;
  const { user } = useAuth();
  const { transactions, loading: txLoading } = useTransactions();
  const { buckets, loading: bLoading } = useBuckets();
  const [error, setError] = useState<string | null>(null);

  if (txLoading || bLoading) {
    return <div style={{ padding: "1rem", color: "var(--color-muted)" }}>Loading...</div>;
  }

  const txn = transactions.find((t) => t.id === txnId);
  if (!txn) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ color: "var(--color-text)", marginBottom: "1rem" }}>Transaction not found</div>
        <Link href="/dashboard" style={{ color: "var(--color-brand)", textDecoration: "underline" }}>Back to dashboard</Link>
      </div>
    );
  }

  const currentBucket = buckets.find((b) => b.id === txn.bucketId);

  const onMove = async (bucketId: string) => {
    if (!user) return;
    try {
      setError(null);
      await recategorize(user.uid, txn, bucketId, buckets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move this transaction.");
    }
  };

  return (
    <div style={{ padding: "1rem" }}>
      <Link
        href="/dashboard"
        style={{
          color: "var(--color-brand)",
          textDecoration: "underline",
          fontSize: "0.875rem",
          display: "inline-block",
          marginBottom: "1rem"
        }}
      >
        ← Back to dashboard
      </Link>

      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--color-card)" }}>
        <div style={{ fontWeight: 600, fontSize: "1.125rem", color: "var(--color-text)" }}>{txn.description}</div>
        <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginTop: "0.25rem" }}>{txn.bookedAt}</div>
        <div style={{ fontWeight: 700, fontSize: "1.5rem", marginTop: "0.5rem", color: txn.amount > 0 ? "var(--color-success)" : "var(--color-text)" }}>
          {formatEuros(txn.amount)}
        </div>
        <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
          {currentBucket ? `In ${currentBucket.name}` : "Uncategorized"}
        </div>
      </div>

      {!txn.isIncome && (
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.75rem" }}>
            Move to bucket
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {buckets.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { void onMove(b.id); }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left"
                style={{
                  background: b.id === txn.bucketId ? "var(--grad-brand)" : "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: pickDotColor(b.colorIndex) }} />
                {b.name}
              </button>
            ))}
          </div>
          {error && (
            <div style={{ color: "var(--color-danger)", fontSize: "0.875rem", marginTop: "0.75rem" }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
