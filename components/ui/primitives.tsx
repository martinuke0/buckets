import { CSSProperties, ReactNode, useId } from "react";

// Bucket mark: outline bucket with the Solana gradient as a "liquid" fill inside.
// The fill mirrors the balance-bar visual — the mark IS the product.
export function Logo({ size = 32 }: { size?: number }) {
  const gid = useId();
  const cid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      role="img"
      aria-label="Buckets"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
        <clipPath id={cid}>
          <path d="M14 22 L58 22 L52 60 Q52 62 50 62 L22 62 Q20 62 20 60 Z" />
        </clipPath>
      </defs>
      <rect x="12" y="34" width="48" height="30" fill={`url(#${gid})`} clipPath={`url(#${cid})`} />
      <path
        d="M14 22 L58 22 L52 60 Q52 62 50 62 L22 62 Q20 62 20 60 Z"
        stroke="var(--color-text)"
        strokeWidth="2.5"
        fill="none"
        strokeLinejoin="round"
      />
      <ellipse cx="36" cy="22" rx="22" ry="4" stroke="var(--color-text)" strokeWidth="2.5" fill="none" />
      <path
        d="M22 22 Q22 10 36 10 Q50 10 50 22"
        stroke="var(--color-text)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Wordmark: "Buckets" in the Solana gradient. Standalone text mark; used when the
// icon would be too small (dense text runs, footer credits, etc).
export function Wordmark({ size = 20 }: { size?: number }) {
  const gid = useId();
  return (
    <svg
      width={size * 6}
      height={size * 1.4}
      viewBox="0 0 240 56"
      role="img"
      aria-label="Buckets"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <text
        x="0"
        y="40"
        fill={`url(#${gid})`}
        fontFamily="-apple-system, SF Pro Display, system-ui, sans-serif"
        fontWeight="800"
        fontSize="38"
        letterSpacing="-1"
      >
        Buckets
      </text>
    </svg>
  );
}

// Lockup: the primary Buckets brand. Bucket-as-B + small "uckets" — the bucket
// icon takes the place of the "B" so the whole mark reads as the word "Buckets".
// Use this in AppShell top bar, sign-in H1, splash screens.
export function Lockup({ size = 32 }: { size?: number }) {
  const gid = useId();
  const cid = useId();
  const w = (size / 32) * 180; // proportional viewBox width — keeps intrinsic aspect ratio
  return (
    <svg
      width={w}
      height={size * (72 / 32)}
      viewBox="0 0 180 72"
      role="img"
      aria-label="Buckets"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
        <clipPath id={cid}>
          <path d="M4 20 L60 20 L54 62 Q54 64 52 64 L14 64 Q12 64 12 62 Z" />
        </clipPath>
      </defs>
      {/* Bucket-as-B: outline with gradient fill + "B" inside */}
      <rect x="2" y="32" width="60" height="34" fill={`url(#${gid})`} clipPath={`url(#${cid})`} />
      <path
        d="M4 20 L60 20 L54 62 Q54 64 52 64 L14 64 Q12 64 12 62 Z"
        stroke="var(--color-text)"
        strokeWidth="2.5"
        fill="none"
        strokeLinejoin="round"
      />
      <ellipse cx="32" cy="20" rx="28" ry="4" stroke="var(--color-text)" strokeWidth="2.5" fill="none" />
      <path
        d="M14 20 Q14 6 32 6 Q50 6 50 20"
        stroke="var(--color-text)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x="32"
        y="54"
        textAnchor="middle"
        fill="var(--color-text)"
        fontFamily="-apple-system, SF Pro Display, system-ui, sans-serif"
        fontWeight="900"
        fontSize="30"
      >
        B
      </text>
      {/* "uckets" — extra-small, muted, optically centered on the bucket body */}
      <text
        x="66"
        y="50"
        fill="var(--color-text)"
        fontFamily="-apple-system, SF Pro Display, system-ui, sans-serif"
        fontWeight="600"
        fontSize="20"
        letterSpacing="-0.6"
        dominantBaseline="middle"
        opacity="0.85"
      >
        uckets
      </text>
    </svg>
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
      color: "var(--color-success)",
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
