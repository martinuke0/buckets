"use client";
import { Card } from "@/components/ui/primitives";

interface UpgradeCardProps {
  onUpgrade: () => void;
}

export function UpgradeCard({ onUpgrade }: UpgradeCardProps) {
  return (
    <Card style={{ textAlign: "center", padding: "3rem 2rem" }}>
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: "600",
          marginBottom: "0.75rem",
          color: "var(--color-text)",
        }}
      >
        Unlock Premium
      </div>
      <div
        style={{
          color: "var(--color-muted)",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
          lineHeight: "1.6",
        }}
      >
        Get access to your AI Coach for personalized financial guidance and expand your budget to
        up to 15 buckets.
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className="px-6 py-3 rounded text-sm font-medium"
        style={{
          background: "var(--grad-brand)",
          color: "var(--color-text)",
        }}
        aria-label="Upgrade to Premium"
      >
        Upgrade to Premium
      </button>
    </Card>
  );
}
