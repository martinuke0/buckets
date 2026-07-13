import { CSSProperties, ReactNode } from "react";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "var(--grad-brand)",
        borderRadius: size * 0.25,
      }}
    />
  );
}

export function Card({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "14px",
        padding: "1rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        textTransform: "uppercase",
        fontSize: "0.75rem",
        letterSpacing: "0.05em",
        color: "var(--color-muted)",
      }}
    >
      {children}
    </div>
  );
}

export function TrustBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "secure" | "neutral";
}) {
  const styles: Record<string, CSSProperties> = {
    secure: {
      background: "rgba(20, 241, 149, 0.1)",
      border: "1px solid rgba(20, 241, 149, 0.3)",
      color: "#14F195",
    },
    neutral: {
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      color: "var(--color-muted)",
    },
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.25rem 0.75rem",
        borderRadius: "999px",
        fontSize: "0.875rem",
        ...styles[tone],
      }}
    >
      {children}
    </div>
  );
}
