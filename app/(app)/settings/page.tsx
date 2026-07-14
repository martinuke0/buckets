"use client";
import { useBankConnection } from "@/lib/bank/useBankConnection";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAuthClient } from "@/lib/firebase/client";
import { Card, SectionLabel, TrustBadge } from "@/components/ui/primitives";

export default function Page() {
  const { connect, busy, error } = useBankConnection();
  const { user } = useAuth();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Bank Connection Section */}
      <section>
        <SectionLabel>Bank connection</SectionLabel>
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Connect CTA */}
          <Card>
            <button
              onClick={connect}
              disabled={busy}
              className="rounded-lg py-2 px-4 font-semibold"
              style={{
                background: busy ? "var(--color-muted)" : "var(--grad-brand)",
                color: "var(--color-text)",
                cursor: busy ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              {busy ? "Connecting..." : "Connect a bank"}
            </button>
            {error && (
              <div style={{ color: "var(--color-danger)", marginTop: "0.75rem", fontSize: "0.875rem" }}>
                {error}
              </div>
            )}
          </Card>

          {/* Trust Badges */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <TrustBadge tone="secure">Read-only access</TrustBadge>
            <TrustBadge tone="secure">256-bit encryption</TrustBadge>
          </div>

          {/* Security Reassurance Copy */}
          <div style={{ fontSize: "0.875rem", lineHeight: "1.5", color: "var(--color-muted)" }}>
            Your bank login is entered on your bank&apos;s secure page. We never see your credentials and can&apos;t move money.
          </div>

          {/* Bank-grade connection via a regulated open-banking provider; no vendor name in UI. */}
          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
            Secure bank-grade connection · revoke access anytime
          </div>
        </div>
      </section>

      {/* Account Section */}
      <section>
        <SectionLabel>Account</SectionLabel>
        <div style={{ marginTop: "0.75rem" }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>Email</div>
                <div style={{ fontSize: "1rem", color: "var(--color-text)" }}>
                  {user?.email || "Not available"}
                </div>
              </div>
              <button
                onClick={() => getAuthClient().signOut()}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  color: "var(--color-danger)",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
