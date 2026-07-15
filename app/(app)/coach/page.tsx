"use client";
import { useState } from "react";
import { SectionLabel } from "@/components/ui/primitives";
import { usePremium } from "@/lib/billing/usePremium";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { startCheckout } from "@/lib/billing/startCheckout";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBuckets } from "@/lib/data/useBuckets";
import { useCoach } from "@/lib/coach/useCoach";
import { useCoachMemories, deleteCoachMemory } from "@/lib/data/coachMemories";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { SuggestionCard } from "@/components/coach/SuggestionCard";
import { ReportProblem } from "@/components/observability/ReportProblem";

export default function Page() {
  const { user } = useAuth();
  const { premium, loading: premiumLoading } = usePremium();
  const { buckets, loading: bucketsLoading } = useBuckets();
  const { messages, send, apply, applying, error } = useCoach();
  const { memories, loading: memoriesLoading } = useCoachMemories();
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
          background: "var(--color-card)",
          borderRadius: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        {messages.length === 0 && (
          <div>
            <div style={{ textAlign: "center", color: "var(--color-muted)", marginTop: "3rem", marginBottom: "2rem" }}>
              Hi! I'm your AI coach. Ask me anything about your budget.
            </div>
            {!memoriesLoading && memories.length > 0 && (
              <div style={{ marginTop: "2rem", padding: "1rem", background: "var(--color-base)", borderRadius: "0.5rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.75rem" }}>
                  You told me:
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {memories.map((m) => (
                    <li key={m.id} style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>
                      • {m.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

      {!memoriesLoading && memories.length > 0 && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--color-card)", borderRadius: "0.5rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.5rem" }}>
            Your goals
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {memories.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text)", flex: 1 }}>
                  {m.text}
                </div>
                <button
                  type="button"
                  onClick={() => user && deleteCoachMemory(user.uid, m.id)}
                  style={{
                    background: "none",
                    color: "var(--color-muted)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    padding: "0.25rem 0.5rem",
                  }}
                  aria-label={`Forget goal: ${m.text}`}
                >
                  Forget
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: "var(--color-danger)", fontSize: "0.875rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>{error}</span>
          <ReportProblem summary="Coach send failed" error={error} />
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
            background: "var(--color-base)",
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
            background: input.trim() && !applying ? "var(--grad-brand)" : "var(--color-base)",
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
