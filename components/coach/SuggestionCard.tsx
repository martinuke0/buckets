"use client";
import type { CoachSuggestion } from "@/lib/coach/suggestion";
import type { Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";

interface SuggestionCardProps {
  suggestion: CoachSuggestion;
  buckets: Bucket[];
  onApply: () => void;
  onDismiss: () => void;
}

export function SuggestionCard({ suggestion, buckets, onApply, onDismiss }: SuggestionCardProps) {
  const from = buckets.find((b) => b.id === suggestion.fromBucketId);
  const to = buckets.find((b) => b.id === suggestion.toBucketId);
  if (!from || !to) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", marginLeft: "2px", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={onApply}
        aria-label="Apply suggestion"
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "5px 12px", borderRadius: "8px",
          background: "var(--grad-brand)", color: "var(--color-text)",
          fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
        }}
      >
        Move {formatEuros(suggestion.amount)}: {from.name} → {to.name}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        style={{ background: "none", color: "var(--color-muted)", fontSize: "0.8125rem", cursor: "pointer" }}
      >
        Not now
      </button>
    </div>
  );
}
