import { formatEuros } from "@/lib/model/money";
import type { Cents } from "@/lib/model/money";

export function SafeToSpendHero({
  safeToSpend, onTrack, monthProgress,
}: { safeToSpend: Cents; onTrack: boolean; monthProgress: number }) {
  return (
    <div className="rounded-2xl p-5 mb-4"
      style={{ background: "radial-gradient(130% 130% at 0% 0%, rgba(153,69,255,.28), transparent 60%), var(--color-card)", border: "1px solid var(--color-border)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Safe to spend</div>
      <div className="flex items-baseline gap-2">
        <div className="text-3xl font-extrabold" style={{ color: "var(--color-text)" }}>{formatEuros(safeToSpend)}</div>
        {onTrack && <div className="text-xs" style={{ color: "var(--color-success)" }}>▲ on track</div>}
      </div>
      <div className="mt-2 rounded" style={{ background: "var(--color-border)", height: 6 }}>
        <div style={{ width: `${Math.max(0, Math.min(1, monthProgress)) * 100}%`, height: 6, borderRadius: 3, background: "var(--grad-brand)" }} />
      </div>
    </div>
  );
}
