"use client";
import { useState } from "react";
import type { Bucket } from "@/lib/model/types";
import { pickDotColor } from "@/lib/theme";

interface BucketSetupProps {
  initial: Bucket[];
  onSave: (buckets: Bucket[]) => void;
}

export function BucketSetup({ initial, onSave }: BucketSetupProps) {
  const [buckets, setBuckets] = useState<Bucket[]>(initial);

  const total = buckets.reduce((sum, b) => sum + b.percent, 0);
  const isValid = Math.abs(total - 100) < 0.001;

  const handlePercentChange = (id: string, newPercent: number) => {
    setBuckets((prev) =>
      prev.map((b) => (b.id === id ? { ...b, percent: newPercent } : b))
    );
  };

  const handleAddBucket = () => {
    const nextColorIndex = buckets.length % 8;
    const newBucket: Bucket = {
      id: crypto.randomUUID(),
      name: "New bucket",
      colorIndex: nextColorIndex,
      percent: 0,
      type: "virtual",
      remaining: 0,
      allocated: 0,
    };
    setBuckets((prev) => [...prev, newBucket]);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {buckets.map((bucket) => (
          <div key={bucket.id} className="flex items-center gap-4">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: pickDotColor(bucket.colorIndex) }}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-white/90">
                {bucket.name}
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={bucket.percent}
                onChange={(e) =>
                  handlePercentChange(bucket.id, Number(e.target.value))
                }
                className="w-full"
              />
            </div>
            <div className="text-sm text-white/70 w-12 text-right">
              {bucket.percent}%
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddBucket}
        className="text-sm text-white/70 hover:text-white/90"
      >
        + Add bucket
      </button>

      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/70">Total:</span>
          <span
            data-testid="total-percent"
            style={{ color: isValid ? "var(--color-success)" : "var(--color-danger)" }}
            className="text-sm font-medium"
          >
            {total}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSave(buckets)}
          disabled={!isValid}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
