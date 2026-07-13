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
