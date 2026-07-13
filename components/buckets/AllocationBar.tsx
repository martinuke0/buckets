"use client";

import type { Bucket } from "@/lib/model/types";
import { pickDotColor } from "@/lib/theme";
import { resplitAdjacent } from "@/lib/buckets/edit";
import { useRef } from "react";

interface AllocationBarProps {
  buckets: Bucket[];
  onChange: (buckets: Bucket[]) => void;
}

export function AllocationBar({ buckets, onChange }: AllocationBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (leftIndex: number, e: globalThis.PointerEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const newLeftPercent = ((e.clientX - rect.left) / rect.width) * 100;
    onChange(resplitAdjacent(buckets, leftIndex, newLeftPercent));
  };

  const handlePointerDown = (leftIndex: number, e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const moveHandler = (moveEvent: Event) => {
      if (!(moveEvent instanceof globalThis.PointerEvent)) return;
      handlePointerMove(leftIndex, moveEvent);
    };

    const upHandler = () => {
      target.removeEventListener("pointermove", moveHandler);
      target.removeEventListener("pointerup", upHandler);
    };

    target.addEventListener("pointermove", moveHandler);
    target.addEventListener("pointerup", upHandler);
  };

  const handleKeyDown = (leftIndex: number, e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(resplitAdjacent(buckets, leftIndex, buckets[leftIndex].percent + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(resplitAdjacent(buckets, leftIndex, buckets[leftIndex].percent - 1));
    }
  };

  return (
    <div
      ref={barRef}
      className="relative flex h-4 w-full overflow-hidden rounded"
      role="group"
      aria-label="Bucket allocation bar"
    >
      {buckets.map((bucket, i) => (
        <div key={bucket.id} className="relative flex">
          <div
            data-testid={`seg-${bucket.id}`}
            style={{
              width: `${bucket.percent}%`,
              backgroundColor: pickDotColor(bucket.colorIndex),
            }}
            className="h-full"
          />
          {i < buckets.length - 1 && (
            <button
              data-testid={`divider-${i}`}
              role="slider"
              tabIndex={0}
              aria-label={`Adjust allocation between ${bucket.name} and ${buckets[i + 1].name}`}
              aria-valuemin={0}
              aria-valuemax={bucket.percent + buckets[i + 1].percent}
              aria-valuenow={bucket.percent}
              onPointerDown={(e) => handlePointerDown(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="absolute right-0 top-0 h-full w-2 -translate-x-1/2 cursor-ew-resize rounded-full focus:outline-none"
              style={{ background: "var(--color-text)", opacity: 0.5 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
