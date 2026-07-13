export function HomeIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function BucketsIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="4" rx="2" />
      <rect x="3" y="11" width="18" height="4" rx="2" />
      <rect x="3" y="17" width="18" height="4" rx="2" />
    </svg>
  );
}

export function CoachIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SettingsIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 6v6m0-13a9 9 0 0 1 6.36 2.64M12 7a9 9 0 0 1 6.36-2.64M12 1a9 9 0 0 0-6.36 2.64M12 7a9 9 0 0 0-6.36-2.64m6.36 10a9 9 0 0 1 6.36 2.64M12 17a9 9 0 0 1 6.36 2.64m0 0A9 9 0 0 1 12 23m6.36-3.36A9 9 0 0 0 12 23m0 0a9 9 0 0 1-6.36-3.36M12 17a9 9 0 0 0-6.36 2.64" />
      <path d="M19.07 4.93l-4.24 4.24m0 5.66l4.24 4.24M4.93 4.93l4.24 4.24m0 5.66l-4.24 4.24" />
    </svg>
  );
}

export function SyncIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}
