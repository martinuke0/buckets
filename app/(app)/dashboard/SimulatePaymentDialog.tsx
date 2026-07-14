"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { simulatePayment } from "@/lib/data/simulatePayment";
import { toCents } from "@/lib/model/money";
import type { Bucket } from "@/lib/model/types";

export function SimulatePaymentDialog({ buckets, onClose }: { buckets: Bucket[]; onClose: () => void }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? "");
  const [loading, setLoading] = useState(false);

  const cents = toCents(parseFloat(amount) || 0);

  const handleConfirm = async () => {
    if (!user || cents <= 0 || !bucketId) return;
    setLoading(true);
    try {
      const name = buckets.find((b) => b.id === bucketId)?.name ?? "Bucket";
      await simulatePayment(user.uid, bucketId, cents, `Simulated: ${name}`);
      onClose();
    } catch (err) {
      console.error("Failed to simulate payment:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={{ background: "var(--color-card)" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4" style={{ color: "var(--color-text)" }}>Simulate Payment</h2>

        <label className="block mb-4">
          <span className="text-sm font-semibold mb-2 block" style={{ color: "var(--color-text)" }}>Bucket</span>
          <select
            value={bucketId}
            onChange={(e) => setBucketId(e.target.value)}
            className="w-full rounded-lg px-4 py-2"
            style={{ background: "var(--color-base)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          >
            {buckets.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
        </label>

        <label className="block mb-4">
          <span className="text-sm font-semibold mb-2 block" style={{ color: "var(--color-text)" }}>Amount (EUR)</span>
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" step="0.01"
            className="w-full rounded-lg px-4 py-2"
            style={{ background: "var(--color-base)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading || cents <= 0 || !bucketId}
            className="flex-1 rounded-lg py-2 px-4 font-semibold"
            style={{ background: cents > 0 ? "var(--grad-brand)" : "var(--color-border)", color: "var(--color-text)", cursor: cents <= 0 || loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Applying..." : "Confirm"}
          </button>
          <button onClick={onClose} disabled={loading} className="rounded-lg py-2 px-4 font-semibold" style={{ background: "var(--color-border)", color: "var(--color-text)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
