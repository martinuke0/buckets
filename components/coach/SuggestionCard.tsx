"use client";
import type { CoachSuggestion } from "@/lib/coach/suggestion";
import type { Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";

interface SuggestionCardProps {
  suggestion: CoachSuggestion;
  buckets: Bucket[];
  onApply: () => void;
  onDismiss: () => void;
  appliedAt?: string; // ISO — when set, renders the persistent Applied strip in place of the controls
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SuggestionCard({ suggestion, buckets, onApply, onDismiss, appliedAt }: SuggestionCardProps) {
  const from = buckets.find((b) => b.id === suggestion.fromBucketId);
  const to = buckets.find((b) => b.id === suggestion.toBucketId);
  if (!from || !to) return null;

  if (appliedAt) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "8px",
          marginLeft: "2px",
          padding: "5px 12px",
          borderRadius: "8px",
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          color: "var(--color-muted)",
          fontSize: "0.8125rem",
        }}
      >
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)" }} />
        <span>Applied · {from.name} → {to.name} · {formatEuros(suggestion.amount)} · {timeAgo(appliedAt)}</span>
      </div>
    );
  }

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
