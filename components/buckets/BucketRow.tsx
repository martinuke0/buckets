"use client";

import Link from "next/link";
import type { Bucket } from "@/lib/model/types";
import { pickDotColor } from "@/lib/theme";
import { BucketMenu } from "./BucketMenu";

interface BucketRowProps {
  bucket: Bucket;
  href?: string;
  onPercentChange: (percent: number) => void;
  onRename: (newName: string) => void;
  onRecolor: (colorIndex: number) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

export function BucketRow({
  bucket,
  href,
  onPercentChange,
  onRename,
  onRecolor,
  onDelete,
  dragHandleProps,
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
        role="button"
        tabIndex={0}
        {...dragHandleProps}
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-full w-full"
          style={{ color: "var(--color-muted)" }}
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

      {href ? (
        <Link href={href} className="flex-1 text-sm hover:opacity-80" style={{ color: "var(--color-text)", textDecoration: "none" }}>
          {bucket.name}
        </Link>
      ) : (
        <span className="flex-1 text-sm" style={{ color: "var(--color-text)" }}>{bucket.name}</span>
      )}

      <input
        type="number"
        value={bucket.percent}
        onChange={handlePercentInputChange}
        min="0"
        max="100"
        step="0.1"
        className="w-16 rounded px-2 py-1 text-right text-sm focus:outline-none"
        style={{ background: "var(--color-base)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        aria-label={`${bucket.name} percentage`}
      />
      <span className="text-sm" style={{ color: "var(--color-muted)" }}>%</span>

      <BucketMenu
        bucket={bucket}
        onRename={onRename}
        onRecolor={onRecolor}
        onDelete={onDelete}
      />
    </div>
  );
}
