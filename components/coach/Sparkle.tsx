// Small inline sparkle glyph used as the coach's identity mark (header + avatar).
// Inline SVG (no emoji, no font dep), currentColor so callers control fill.
export function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z"
        fill="currentColor"
      />
    </svg>
  );
}
