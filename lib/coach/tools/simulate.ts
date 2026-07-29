import { splitIncome, type SplitRule, type Allocation } from "@/lib/split/engine";

export function simulateMonth(
  income: number,
  currentRules: SplitRule[],
  changes: { bucketId: string; percent: number }[],
): Allocation[] {
  const merged = currentRules.map((r) => ({ ...r }));
  for (const c of changes) {
    const existing = merged.find((r) => r.bucketId === c.bucketId);
    if (existing) existing.percent = c.percent;
    else merged.push({ bucketId: c.bucketId, percent: c.percent });
  }
  return splitIncome(income, merged);
}
