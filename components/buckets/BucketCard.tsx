import type { Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";
import { pickDotColor } from "@/lib/theme";

export function BucketCard({ bucket }: { bucket: Bucket }) {
  const low = bucket.allocated > 0 && bucket.remaining <= 0.1 * bucket.allocated;
  const pct = bucket.allocated > 0 ? Math.max(0, Math.min(1, bucket.remaining / bucket.allocated)) : 0;
  return (
    <div data-testid={`bucket-${bucket.id}`} data-low={low}
      className="rounded-2xl p-4 mb-2" style={{ background: "var(--color-card)" }}>
      <div className="flex justify-between items-center text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        <span className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: pickDotColor(bucket.colorIndex) }} />
          {bucket.name}
        </span>
        <span style={{ color: low ? "#FF5E57" : "#14F195" }}>{formatEuros(bucket.remaining)}</span>
      </div>
      <div className="mt-2 rounded" style={{ background: "var(--color-border)", height: 8 }}>
        <div style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, background: low ? "var(--grad-danger)" : "var(--grad-brand)" }} />
      </div>
    </div>
  );
}
