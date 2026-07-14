// Pure mapper for the bulk-categorization response. Kept separate from the Gemini
// SDK call so it can be unit-tested without mocking @google/genai across the
// CJS/ESM package boundary. Turns the model's JSON text into a bucketId-or-null
// array aligned to the input transactions (length `count`, same index order).
//
// Robust by construction: bad JSON, non-array, out-of-range indices, unknown or
// "none" bucketIds, and omitted indices all resolve to null. Never throws.
export function mapBatchResponse(
  rawText: string | null | undefined,
  count: number,
  validIds: string[],
): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: count }, () => null);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText ?? "[]");
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;

  const valid = new Set(validIds);
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const i = typeof rec.index === "number" ? rec.index : -1;
    const bucketId = rec.bucketId;
    if (i >= 0 && i < count && typeof bucketId === "string" && valid.has(bucketId)) {
      out[i] = bucketId;
    }
  }
  return out;
}
