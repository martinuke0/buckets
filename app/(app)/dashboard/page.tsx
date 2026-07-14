"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBuckets } from "@/lib/data/useBuckets";
import { useTransactions } from "@/lib/data/useTransactions";
import { useBankSync } from "@/lib/bank/useBankSync";
import { useBankStatus } from "@/lib/data/useBankStatus";
import { usePendingIncome } from "@/lib/data/pendingIncome";
import { SafeToSpendHero } from "@/components/buckets/SafeToSpendHero";
import { BucketCard } from "@/components/buckets/BucketCard";
import { TransactionList } from "@/components/tx/TransactionList";
import { SimulateIncomeDialog } from "./SimulateIncomeDialog";
import { SimulatePaymentDialog } from "./SimulatePaymentDialog";
import { PendingIncomePrompt } from "./PendingIncomePrompt";
import { SectionLabel } from "@/components/ui/primitives";
import { anchorBucketsToBalance } from "@/lib/data/buckets";
import { formatEuros } from "@/lib/model/money";

// Coarse "x ago" for the bank status line. Display-only; minute granularity is fine.
function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Page() {
  const { user } = useAuth();
  const { buckets, loading } = useBuckets();
  const { transactions, loading: txLoading } = useTransactions();
  const { refresh, busy: syncBusy, lastResult, error } = useBankSync();
  const { status: bankStatus } = useBankStatus();
  const { pending } = usePendingIncome();
  const [showDialog, setShowDialog] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  if (loading) {
    return (
      <div style={{ color: "var(--color-muted)" }}>Loading...</div>
    );
  }

  // Compute safe to spend (sum of remaining)
  const safeToSpend = buckets.reduce((sum, b) => sum + b.remaining, 0);

  // Month-pacing: how far through the current month we are (honest calendar signal).
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = now.getDate() / daysInMonth;

  // Simple on-track heuristic: if we have any money left and we're not at end of month
  const onTrack = safeToSpend > 0 && monthProgress < 0.9;

  return (
    <div style={{ padding: "1rem" }}>
      <SafeToSpendHero
        safeToSpend={safeToSpend}
        onTrack={onTrack}
        monthProgress={monthProgress}
      />

      {bankStatus?.currentBalance !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 1rem" }}>
          <span style={{ color: "var(--color-muted)", fontSize: "0.8125rem" }}>
            Account balance: {formatEuros(bankStatus.currentBalance)}
          </span>
          {/* Tolerate a 1-cent rounding artifact; only nudge re-anchor on real drift. */}
          {Math.abs(bankStatus.currentBalance - safeToSpend) > 1 && (
            <button
              onClick={() => { if (user && bankStatus.currentBalance !== undefined) void anchorBucketsToBalance(user.uid, bankStatus.currentBalance); }}
              className="rounded-lg py-1 px-2 text-xs font-semibold"
              style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)", cursor: "pointer" }}
            >
              Re-sync buckets to balance
            </button>
          )}
        </div>
      )}

      <PendingIncomePrompt pending={pending} buckets={buckets} />

      <div style={{ marginBottom: "1rem" }}>
        {buckets.map((bucket) => (
          <Link
            key={bucket.id}
            href={`/dashboard/bucket/${bucket.id}`}
            style={{ display: "block", cursor: "pointer", transition: "opacity 0.2s" }}
            className="hover:opacity-80"
          >
            <BucketCard bucket={bucket} />
          </Link>
        ))}
      </div>

      <button
        onClick={() => setShowDialog(true)}
        className="w-full rounded-lg py-3 px-4 font-semibold"
        style={{ background: "var(--grad-brand)", color: "var(--color-text)" }}
      >
        Simulate income
      </button>

      {process.env.NODE_ENV === "development" && (
        <button
          onClick={() => setShowPayment(true)}
          className="w-full rounded-lg py-3 px-4 font-semibold mt-2"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        >
          Simulate payment (dev)
        </button>
      )}

      {showDialog && (
        <SimulateIncomeDialog
          buckets={buckets}
          onClose={() => setShowDialog(false)}
        />
      )}

      {showPayment && (
        <SimulatePaymentDialog buckets={buckets} onClose={() => setShowPayment(false)} />
      )}

      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <SectionLabel>Transactions</SectionLabel>
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

        <div style={{ marginBottom: "0.75rem", fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {bankStatus?.connectedAt ? (
            <>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)", flexShrink: 0 }} />
              <span style={{ color: "var(--color-muted)" }}>
                Bank connected{bankStatus.lastSyncedAt ? ` · synced ${timeAgo(bankStatus.lastSyncedAt)}` : ""}
              </span>
            </>
          ) : (
            <>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-muted)", flexShrink: 0 }} />
              <span style={{ color: "var(--color-muted)" }}>No bank connected</span>
              <Link href="/settings" style={{ color: "var(--color-success)", fontWeight: 600 }}>
                Connect
              </Link>
            </>
          )}
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
          <TransactionList transactions={transactions} />
        )}
      </div>
    </div>
  );
}
