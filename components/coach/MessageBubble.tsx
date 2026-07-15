"use client";
import { Sparkle } from "./Sparkle";

interface MessageBubbleProps {
  role: "user" | "coach";
  text: string;
}

export function MessageBubble({ role, text }: MessageBubbleProps) {
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
      <div style={bubbleStyle}>{text}</div>
    </div>
  );
}
