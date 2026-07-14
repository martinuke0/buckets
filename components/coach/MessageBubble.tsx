"use client";

interface MessageBubbleProps {
  role: "user" | "coach";
  text: string;
}

export function MessageBubble({ role, text }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          padding: "0.75rem 1rem",
          borderRadius: "1rem",
          background: isUser ? "var(--grad-brand)" : "var(--color-base)",
          color: "var(--color-text)",
          fontSize: "0.875rem",
          lineHeight: "1.5",
        }}
      >
        {text}
      </div>
    </div>
  );
}
