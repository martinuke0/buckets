"use client";
import Link from "next/link";
import { Sparkle } from "./Sparkle";

interface MessageBubbleProps {
  role: "user" | "coach";
  text: string;
  citations?: { label: string; txnId: string }[];
}

function renderWithCitations(text: string, citations?: { label: string; txnId: string }[]): React.ReactNode {
  if (!citations || citations.length === 0) return text;
  // Find the first non-overlapping match for each label, left to right.
  type Hit = { start: number; end: number; txnId: string; label: string };
  const hits: Hit[] = [];
  for (const c of citations) {
    if (!c.label) continue;
    const start = text.indexOf(c.label);
    if (start === -1) continue; // label not in reply → skip (no chip)
    hits.push({ start, end: start + c.label.length, txnId: c.txnId, label: c.label });
  }
  hits.sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue; // overlaps a prior chip → skip
    if (h.start > cursor) nodes.push(text.slice(cursor, h.start));
    nodes.push(
      <Link
        key={`${h.txnId}-${h.start}`}
        href={`/dashboard/tx/${h.txnId}`}
        style={{
          color: "var(--color-success)",
          background: "rgba(20,241,149,0.14)",
          border: "1px solid rgba(20,241,149,0.4)",
          borderRadius: "6px",
          padding: "0 0.3rem",
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {h.label}
      </Link>
    );
    cursor = h.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MessageBubble({ role, text, citations }: MessageBubbleProps) {
  const isUser = role === "user";

  // Asymmetric radii = chat-app feel: bubbles round on 3 corners, tuck on the "tail" side.
  // User (right): tuck bottom-right. Coach (left, after avatar): tuck bottom-left.
  const bubbleStyle: React.CSSProperties = {
    maxWidth: "78%",
    padding: "0.6rem 0.9rem",
    borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
    background: isUser ? "var(--grad-brand)" : "var(--color-card)",
    border: isUser ? "none" : "1px solid var(--color-border)",
    color: "var(--color-text)",
    fontSize: "0.875rem",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: "0.5rem",
        marginBottom: "0.75rem",
      }}
    >
      {!isUser && (
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--grad-brand)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Sparkle size={13} />
        </span>
      )}
      <div style={bubbleStyle}>{isUser ? text : renderWithCitations(text, citations)}</div>
    </div>
  );
}
