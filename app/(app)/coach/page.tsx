"use client";
import { useState, useEffect, useRef } from "react";
import { usePremium } from "@/lib/billing/usePremium";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { startCheckout } from "@/lib/billing/startCheckout";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBuckets } from "@/lib/data/useBuckets";
import { useCoach } from "@/lib/coach/useCoach";
import { useCoachMemories, deleteCoachMemory } from "@/lib/data/coachMemories";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { SuggestionCard } from "@/components/coach/SuggestionCard";
import { CoachToast } from "@/components/coach/CoachToast";
import { Sparkle } from "@/components/coach/Sparkle";
import { ReportProblem } from "@/components/observability/ReportProblem";

const SAMPLE_PROMPTS = [
  "Am I overspending on Fun?",
  "How do I hit my Savings goal?",
  "Can I afford €200 this weekend?",
];

export default function Page() {
  const { user } = useAuth();
  const { premium, loading: premiumLoading } = usePremium();
  const { buckets, loading: bucketsLoading } = useBuckets();
  const { messages, send, apply, applying, error, streamingText, justApplied, dismissJustApplied } = useCoach();
  const { memories, loading: memoriesLoading } = useCoachMemories();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message or while streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sending, streamingText]);

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setLastAttempt(trimmed);
    setSending(true);
    try {
      await send(trimmed);
    } finally {
      setSending(false);
    }
  }

  async function handleRetry() {
    if (lastAttempt) void handleSend(lastAttempt);
  }

  async function handleApply(suggestion: NonNullable<typeof messages[number]["suggestion"]>, suggestionId: string, coachMsgId: string) {
    try {
      await apply(suggestion, suggestionId, coachMsgId);
      // No local dismissal — the persistent Applied strip renders in place of the controls
      // once the appliedAt marker lands on the message doc (best-effort, onSnapshot-driven).
    } catch {
      /* useCoach exposes error */
    }
  }

  if (premiumLoading || bucketsLoading) {
    return (
      <div style={{ padding: "1rem", color: "var(--color-muted)" }}>Loading...</div>
    );
  }

  if (!premium) {
    return (
      <div style={{ padding: "1rem" }}>
        <UpgradeCard onUpgrade={() => user && startCheckout(user.uid)} />
      </div>
    );
  }

  const hasConversation = messages.length > 0 || sending;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 7.5rem)" }}>
      {/* Branded header */}
      <div
        style={{
          padding: "0.9rem 1rem",
          background: "var(--grad-brand)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontWeight: 700,
          fontSize: "0.95rem",
        }}
      >
        <Sparkle size={16} />
        <span>MyBuckets Coach</span>
      </div>

      {/* Scroll area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          background: "var(--color-base)",
        }}
      >
        {!hasConversation && (
          <div style={{ maxWidth: 520, margin: "1rem auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--grad-brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                <Sparkle size={22} />
              </div>
              <div style={{ color: "var(--color-text)", fontSize: "1rem", fontWeight: 600, textAlign: "center" }}>
                Hi — I&apos;m your Coach.
              </div>
              <div style={{ color: "var(--color-muted)", fontSize: "0.875rem", textAlign: "center", lineHeight: 1.5 }}>
                Ask me about spending, savings, or what to do this month.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSend(prompt)}
                  disabled={sending}
                  style={{
                    padding: "0.65rem 0.9rem",
                    borderRadius: "12px",
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    fontSize: "0.875rem",
                    textAlign: "left",
                    cursor: sending ? "not-allowed" : "pointer",
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {!memoriesLoading && memories.length > 0 && (
              <div style={{ padding: "0.85rem", background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  You told me
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {memories.map((m) => (
                    <li key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--color-text)" }}>
                      <span style={{ flex: 1 }}>{m.text}</span>
                      <button
                        type="button"
                        onClick={() => user && deleteCoachMemory(user.uid, m.id)}
                        aria-label={`Forget goal: ${m.text}`}
                        style={{ background: "none", border: "none", color: "var(--color-muted)", fontSize: "0.75rem", cursor: "pointer", padding: "0.15rem 0.4rem" }}
                      >
                        Forget
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {justApplied && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CoachToast
              from={buckets.find((b) => b.id === justApplied.from)?.name ?? justApplied.from}
              to={buckets.find((b) => b.id === justApplied.to)?.name ?? justApplied.to}
              amount={justApplied.amount}
              onDismiss={dismissJustApplied}
            />
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <MessageBubble role={msg.role} text={msg.text} />
            {msg.suggestion && msg.suggestionId && (msg.appliedAt || !dismissed.has(msg.suggestionId)) && (
              <div style={{ marginLeft: "34px", marginBottom: "0.75rem" }}>
                <SuggestionCard
                  suggestion={msg.suggestion}
                  buckets={buckets}
                  appliedAt={msg.appliedAt}
                  onApply={() => handleApply(msg.suggestion!, msg.suggestionId!, msg.id)}
                  onDismiss={() => setDismissed((prev) => new Set(prev).add(msg.suggestionId!))}
                />
              </div>
            )}
          </div>
        ))}

        {streamingText !== null && (
          streamingText === "" ? <ThinkingBubble /> : <MessageBubble role="coach" text={streamingText} />
        )}
      </div>

      {/* Error strip */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.6rem 1rem",
            background: "rgba(255,94,87,0.10)",
            borderTop: "1px solid var(--color-border)",
            color: "var(--color-danger)",
            fontSize: "0.8125rem",
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          {lastAttempt && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={sending || applying}
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                padding: "0.25rem 0.65rem",
                borderRadius: "8px",
                fontSize: "0.75rem",
                cursor: sending || applying ? "not-allowed" : "pointer",
              }}
            >
              Retry
            </button>
          )}
          <ReportProblem summary="Coach send failed" error={error} />
        </div>
      )}

      {/* Composer: pill input with inline send */}
      <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--color-border)", background: "var(--color-base)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.35rem 0.35rem 1rem",
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "999px",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend(input);
              }
            }}
            placeholder="Ask your coach…"
            disabled={sending || applying}
            aria-label="Message the coach"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text)",
              fontSize: "0.9rem",
              padding: "0.35rem 0",
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend(input)}
            disabled={!input.trim() || sending || applying}
            aria-label="Send"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: input.trim() && !sending ? "var(--grad-brand)" : "var(--color-border)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: !input.trim() || sending || applying ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l16-8-6 16-2-6-8-2z" fill="currentColor" />
    </svg>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", marginBottom: "0.75rem" }}>
      <span
        aria-hidden="true"
        style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "var(--grad-brand)", color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Sparkle size={13} />
      </span>
      <div
        role="status"
        aria-live="polite"
        aria-label="Coach is thinking"
        style={{
          padding: "0.75rem 1rem",
          borderRadius: "14px 14px 14px 4px",
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          display: "inline-flex",
          gap: "4px",
          alignItems: "center",
        }}
      >
        <Dot delay={0} />
        <Dot delay={0.15} />
        <Dot delay={0.3} />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <>
      <span
        style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--color-muted)",
          display: "inline-block",
          animation: `coach-dot 1.2s ${delay}s infinite ease-in-out`,
        }}
      />
      <style>{`
        @keyframes coach-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
