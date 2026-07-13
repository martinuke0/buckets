"use client";
import { useState } from "react";
import { SectionLabel } from "@/components/ui/primitives";
import { usePremium } from "@/lib/billing/usePremium";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { startCheckout } from "@/lib/billing/startCheckout";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBuckets } from "@/lib/data/useBuckets";
import { useCoach } from "@/lib/coach/useCoach";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { SuggestionCard } from "@/components/coach/SuggestionCard";

export default function Page() {
  const { user } = useAuth();
  const { premium, loading: premiumLoading } = usePremium();
  const { buckets, loading: bucketsLoading } = useBuckets();
  const { messages, send, apply, applying, error } = useCoach();
  const [input, setInput] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    await send(text);
  };

  const handleApply = async (suggestion: typeof messages[0]["suggestion"], suggestionId: string) => {
    if (!suggestion || !suggestionId) return;
    try {
      await apply(suggestion, suggestionId);
      setDismissedSuggestions((prev) => new Set(prev).add(suggestionId));
    } catch {
      // Error handled by useCoach
    }
  };

  const handleDismiss = (suggestionId: string) => {
    setDismissedSuggestions((prev) => new Set(prev).add(suggestionId));
  };

  if (premiumLoading || bucketsLoading) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <SectionLabel>Your AI Coach</SectionLabel>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <div style={{ color: "var(--color-muted)" }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!premium) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <SectionLabel>Your AI Coach</SectionLabel>
        </div>
        <UpgradeCard onUpgrade={() => user && startCheckout(user.uid)} />
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", height: "calc(100vh - 4rem)" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <SectionLabel>Your AI Coach</SectionLabel>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          background: "var(--color-surface-1)",
          borderRadius: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--color-muted)", marginTop: "3rem" }}>
            Ask me anything about your budget
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx}>
            <MessageBubble role={msg.role} text={msg.text} />
            {msg.suggestion && msg.suggestionId && !dismissedSuggestions.has(msg.suggestionId) && (
              <SuggestionCard
                suggestion={msg.suggestion}
                buckets={buckets}
                onApply={() => handleApply(msg.suggestion, msg.suggestionId!)}
                onDismiss={() => handleDismiss(msg.suggestionId!)}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ color: "var(--color-danger)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask your coach..."
          disabled={applying}
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: "var(--color-surface-2)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            fontSize: "0.875rem",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || applying}
          className="px-6 py-3 rounded text-sm font-medium"
          style={{
            background: input.trim() && !applying ? "var(--grad-brand)" : "var(--color-surface-2)",
            color: input.trim() && !applying ? "var(--color-text)" : "var(--color-muted)",
            cursor: input.trim() && !applying ? "pointer" : "not-allowed",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
