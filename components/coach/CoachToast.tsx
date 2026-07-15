"use client";
import { useEffect } from "react";
import { formatEuros } from "@/lib/model/money";

interface CoachToastProps {
  from: string;
  to: string;
  amount: number;
  onDismiss: () => void;
}

export function CoachToast({ from, to, amount, onDismiss }: CoachToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        margin: "0 auto 0.75rem",
        alignSelf: "center",
        padding: "0.5rem 0.9rem",
        borderRadius: "999px",
        background: "var(--grad-brand)",
        color: "#fff",
        fontSize: "0.8125rem",
        fontWeight: 600,
        boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        zIndex: 10,
      }}
    >
      <span>{formatEuros(amount)} moved: {from} → {to}</span>
    </div>
  );
}
