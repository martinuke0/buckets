"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useBuckets } from "@/lib/data/useBuckets";
import { useTransactions } from "@/lib/data/useTransactions";
import { TransactionList } from "@/components/tx/TransactionList";
import { formatEuros } from "@/lib/model/money";
import { pickDotColor } from "@/lib/theme";

export default function BucketDetailPage() {
  const params = useParams();
  const bucketId = params.id as string;
  const { buckets, loading: bucketsLoading } = useBuckets();
  const { transactions, loading: txLoading } = useTransactions();

  if (bucketsLoading || txLoading) {
    return (
      <div style={{ padding: "1rem", color: "var(--color-muted)" }}>Loading...</div>
    );
  }

  const bucket = buckets.find((b) => b.id === bucketId);

  if (!bucket) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ color: "var(--color-text)", marginBottom: "1rem" }}>
          Bucket not found
        </div>
        <Link
          href="/dashboard"
          style={{ color: "var(--color-brand)", textDecoration: "underline" }}
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const filteredTransactions = transactions.filter((t) => t.bucketId === bucketId);
  const low = bucket.allocated > 0 && bucket.remaining <= 0.1 * bucket.allocated;
  const pct = bucket.allocated > 0 ? Math.max(0, Math.min(1, bucket.remaining / bucket.allocated)) : 0;

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

      <div
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--color-card)" }}
      >
        <div
          className="flex justify-between items-center text-lg font-semibold mb-2"
          style={{ color: "var(--color-text)" }}
        >
          <span className="flex items-center gap-2">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: pickDotColor(bucket.colorIndex),
              }}
            />
            {bucket.name}
          </span>
          <span style={{ color: low ? "var(--color-danger)" : "var(--color-success)" }}>
            {formatEuros(bucket.remaining)}
          </span>
        </div>
        <div className="text-sm mb-2" style={{ color: "var(--color-muted)" }}>
          Allocated: {formatEuros(bucket.allocated)}
        </div>
        <div
          className="rounded"
          style={{ background: "var(--color-border)", height: 8 }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: 8,
              borderRadius: 4,
              background: low ? "var(--grad-danger)" : "var(--grad-brand)",
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: "2rem" }}>
        <div
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--color-text)" }}
        >
          Transactions
        </div>
        {filteredTransactions.length === 0 ? (
          <div
            style={{
              color: "var(--color-muted)",
              padding: "2rem",
              textAlign: "center",
            }}
          >
            No transactions in this bucket yet.
          </div>
        ) : (
          <TransactionList transactions={filteredTransactions} />
        )}
      </div>
    </div>
  );
}
