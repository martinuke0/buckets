// Pure delimiter parser for the coach's streamed reply.
// The server yields free-text FIRST, then (only at the end) a delimiter line
// `\n---META---\n` followed by a JSON object with optional `suggestion` and
// `memory`. That contract lets us stream text unbounded and still deliver
// structured fields at the end. Any parse failure degrades to "reply only".
export function parseCoachReplyStream(
  fullText: string,
): { reply: string; suggestion?: unknown; memory?: unknown } {
  // Match the delimiter with tolerant surrounding whitespace / EOF.
  const marker = /\n---META---\n?/;
  const m = fullText.match(marker);
  if (!m || m.index === undefined) {
    return { reply: fullText.trimEnd() };
  }
  const reply = fullText.slice(0, m.index).trimEnd();
  const footer = fullText.slice(m.index + m[0].length).trim();
  if (!footer) return { reply };
  try {
    const parsed = JSON.parse(footer) as Record<string, unknown>;
    const out: { reply: string; suggestion?: unknown; memory?: unknown } = { reply };
    if (parsed.suggestion !== undefined && parsed.suggestion !== null) out.suggestion = parsed.suggestion;
    if (typeof parsed.memory === "string" && parsed.memory.trim()) out.memory = parsed.memory;
    return out;
  } catch {
    return { reply };
  }
}
