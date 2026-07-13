"use client";
import { useBankConnection } from "@/lib/bank/useBankConnection";

export default function Page() {
  const { connect, busy, error } = useBankConnection();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Bank Connection</h2>
        <button
          onClick={connect}
          disabled={busy}
          className="rounded-lg py-2 px-4 font-semibold"
          style={{
            background: busy ? "var(--color-muted)" : "var(--grad-brand)",
            color: "var(--color-text)",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Connecting..." : "Connect a bank"}
        </button>
        {error && (
          <div style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
