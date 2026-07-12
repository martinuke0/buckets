"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { applyIncome, deriveRules } from "@/lib/data/buckets";
import { splitIncome } from "@/lib/split/engine";
import { toCents } from "@/lib/model/money";
import { SplitList } from "@/components/buckets/SplitList";
import type { Bucket } from "@/lib/model/types";
import Link from "next/link";

export function SimulateIncomeDialog({
  buckets,
  onClose,
}: {
  buckets: Bucket[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if buckets are valid (not empty and sum to 100)
  const totalPercent = buckets.reduce((sum, b) => sum + b.percent, 0);
  const bucketsValid = buckets.length > 0 && Math.abs(totalPercent - 100) < 0.001;

  if (!bucketsValid) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      >
        <div
          className="rounded-2xl p-6 max-w-md w-full mx-4"
          style={{ background: "var(--color-card)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            className="text-xl font-bold mb-4"
            style={{ color: "var(--color-text)" }}
          >
            Set up your buckets first
          </h2>
          <p
            className="mb-4"
            style={{ color: "var(--color-muted)" }}
          >
            You need to configure your buckets with percentages that sum to 100% before you can simulate income.
          </p>
          <div className="flex gap-2">
            <Link
              href="/buckets"
              className="flex-1 rounded-lg py-2 px-4 text-center font-semibold"
              style={{ background: "var(--grad-brand)", color: "var(--color-text)" }}
            >
              Go to Buckets
            </Link>
            <button
              onClick={onClose}
              className="rounded-lg py-2 px-4 font-semibold"
              style={{ background: "var(--color-border)", color: "var(--color-text)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const euros = parseFloat(amount) || 0;
  const cents = toCents(euros);

  // Generate preview if valid amount
  let preview = null;
  try {
    if (cents > 0) {
      const rules = deriveRules(buckets);
      preview = splitIncome(cents, rules);
    }
  } catch (err) {
    // Invalid split, preview stays null
  }

  const handleConfirm = async () => {
    if (!user || cents <= 0) return;
    setLoading(true);
    try {
      await applyIncome(user.uid, cents);
      onClose();
    } catch (err) {
      console.error("Failed to apply income:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full mx-4"
        style={{ background: "var(--color-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: "var(--color-text)" }}
        >
          Simulate Income
        </h2>

        <label className="block mb-4">
          <span
            className="text-sm font-semibold mb-2 block"
            style={{ color: "var(--color-text)" }}
          >
            Amount (EUR)
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg px-4 py-2"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
            step="0.01"
          />
        </label>

        {preview && (
          <div className="mb-4">
            <div
              className="text-sm font-semibold mb-2"
              style={{ color: "var(--color-text)" }}
            >
              Preview
            </div>
            <div
              className="rounded-lg p-3"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
            >
              <SplitList allocations={preview} buckets={buckets} />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading || cents <= 0}
            className="flex-1 rounded-lg py-2 px-4 font-semibold"
            style={{
              background: cents > 0 ? "var(--grad-brand)" : "var(--color-border)",
              color: "var(--color-text)",
              opacity: loading ? 0.6 : 1,
              cursor: cents <= 0 || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Applying..." : "Confirm"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg py-2 px-4 font-semibold"
            style={{
              background: "var(--color-border)",
              color: "var(--color-text)",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
