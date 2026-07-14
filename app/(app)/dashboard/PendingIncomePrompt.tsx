"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { confirmPendingIncome, deriveRules } from "@/lib/data/buckets";
import { splitIncome } from "@/lib/split/engine";
import { SplitList } from "@/components/buckets/SplitList";
import { formatEuros } from "@/lib/model/money";
import type { Bucket } from "@/lib/model/types";
import type { PendingIncome } from "@/lib/data/pendingIncome";

export function PendingIncomePrompt({ pending, buckets }: { pending: PendingIncome[]; buckets: Bucket[] }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  if (pending.length === 0) return null;
  const rules = deriveRules(buckets);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
      {pending.map((p) => {
        let preview: { bucketId: string; amount: number }[] = [];
        try { preview = splitIncome(p.amount, rules); } catch { preview = []; }
        return (
          <div key={p.id} className="rounded-2xl p-4" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
            <div style={{ color: "var(--color-text)", fontWeight: 600 }}>
              You received {formatEuros(p.amount)}
            </div>
            <div style={{ color: "var(--color-muted)", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>{p.description}</div>
            <SplitList allocations={preview} buckets={buckets} />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                onClick={async () => { if (!user) return; setBusy(p.id); try { await confirmPendingIncome(user.uid, p.id, rules); } finally { setBusy(null); } }}
                disabled={busy === p.id}
                className="flex-1 rounded-lg py-2 px-4 font-semibold"
                style={{ background: "var(--grad-brand)", color: "var(--color-text)", cursor: busy === p.id ? "not-allowed" : "pointer" }}
              >
                {busy === p.id ? "Applying..." : "Confirm split"}
              </button>
              <Link href="/buckets" className="rounded-lg py-2 px-4 font-semibold" style={{ background: "var(--color-border)", color: "var(--color-text)" }}>
                Adjust
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
