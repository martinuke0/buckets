import type { Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";
import { pickDotColor } from "@/lib/theme";

interface Allocation {
  bucketId: string;
  amount: number;
}

export function SplitList({
  allocations,
  buckets,
}: {
  allocations: Allocation[];
  buckets: Bucket[];
}) {
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));

  return (
    <div>
      {allocations.map((alloc) => {
        const bucket = bucketMap.get(alloc.bucketId);
        if (!bucket) return null;

        return (
          <div
            key={alloc.bucketId}
            className="flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: pickDotColor(bucket.colorIndex),
                }}
              />
              <span style={{ color: "var(--color-text)" }}>{bucket.name}</span>
            </div>
            <span style={{ color: "var(--color-text)" }}>
              {formatEuros(alloc.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
