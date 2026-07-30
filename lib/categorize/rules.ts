export type CategoryRule = { merchant: string; bucketId: string };

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[*#].*$/, "")       // drop processor suffix after * or #
    .replace(/[0-9]+/g, "")       // drop digits
    .replace(/\s+/g, " ")
    .trim();
}

export function chooseBucket(
  description: string,
  rules: CategoryRule[],
  bucketIds: string[],
): { bucketId: string } | { needsAI: true } {
  const key = normalizeMerchant(description);
  const rule = rules.find((r) => r.merchant === key);
  if (rule && bucketIds.includes(rule.bucketId)) return { bucketId: rule.bucketId };
  return { needsAI: true };
}

// Share of a sync's spends placed by a free deterministic rule (no LLM call),
// as a rounded percentage. Denominator includes noMatch (spends nothing placed)
// so the number is honest, not inflated by dropping unplaceable transactions.
// Returns null when there were no spends to categorize.
export function computeSkipLLMPct(ruleHits: number, geminiHits: number, noMatch: number): number | null {
  const total = ruleHits + geminiHits + noMatch;
  if (total <= 0) return null;
  return Math.round((ruleHits / total) * 100);
}
