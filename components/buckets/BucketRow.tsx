"use client";

import type { Bucket } from "@/lib/model/types";
import { pickDotColor } from "@/lib/theme";
import { BucketMenu } from "./BucketMenu";

interface BucketRowProps {
  bucket: Bucket;
  onPercentChange: (percent: number) => void;
  onRename: (newName: string) => void;
  onRecolor: (colorIndex: number) => void;
  onDelete: () => void;
}

export function BucketRow({
  bucket,
  onPercentChange,
  onRename,
  onRecolor,
  onDelete,
}: BucketRowProps) {
  const handlePercentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      onPercentChange(value);
    }
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="inline-block h-5 w-5 cursor-grab"
        aria-label="Drag to reorder"
        role="img"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-full w-full text-gray-500"
        >
          <circle cx="7" cy="5" r="1.5" />
          <circle cx="13" cy="5" r="1.5" />
          <circle cx="7" cy="10" r="1.5" />
          <circle cx="13" cy="10" r="1.5" />
          <circle cx="7" cy="15" r="1.5" />
          <circle cx="13" cy="15" r="1.5" />
        </svg>
      </span>

      <span
        className="inline-block h-4 w-4 rounded-full"
        style={{ backgroundColor: pickDotColor(bucket.colorIndex) }}
        aria-hidden="true"
      />

      <span className="flex-1 text-sm text-gray-200">{bucket.name}</span>

      <input
        type="number"
        value={bucket.percent}
        onChange={handlePercentInputChange}
        min="0"
        max="100"
        step="0.1"
        className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
        aria-label={`${bucket.name} percentage`}
      />
      <span className="text-sm text-gray-400">%</span>

      <BucketMenu
        bucket={bucket}
        onRename={onRename}
        onRecolor={onRecolor}
        onDelete={onDelete}
      />
    </div>
  );
}
