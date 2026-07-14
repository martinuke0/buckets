"use client";
import type { CoachSuggestion } from "@/lib/coach/suggestion";
import type { Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";
import { Card } from "@/components/ui/primitives";

interface SuggestionCardProps {
  suggestion: CoachSuggestion;
  buckets: Bucket[];
  onApply: () => void;
  onDismiss: () => void;
}

export function SuggestionCard({ suggestion, buckets, onApply, onDismiss }: SuggestionCardProps) {
  const fromBucket = buckets.find((b) => b.id === suggestion.fromBucketId);
  const toBucket = buckets.find((b) => b.id === suggestion.toBucketId);

  if (!fromBucket || !toBucket) {
    return null;
  }

  return (
    <Card style={{ padding: "1rem", marginTop: "0.5rem" }}>
      <div style={{ color: "var(--color-text)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
        Shift {formatEuros(suggestion.amount)} from {fromBucket.name} to {toBucket.name}?
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={onApply}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{
            background: "var(--grad-brand)",
            color: "var(--color-text)",
          }}
          aria-label="Apply suggestion"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{
            background: "var(--color-base)",
            color: "var(--color-muted)",
            border: "1px solid var(--color-border)",
          }}
          aria-label="Dismiss suggestion"
        >
          Dismiss
        </button>
      </div>
    </Card>
  );
}
