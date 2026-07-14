import { splitIncome, type SplitRule } from "@/lib/split/engine";

// Shares of `balanceCents` per bucket by percent (largest-remainder, conserves cents).
// Returns a map bucketId -> cents. Sum of values === balanceCents when percents sum to 100.
export function balanceShares(balanceCents: number, rules: SplitRule[]): Map<string, number> {
  const allocs = splitIncome(balanceCents, rules);
  return new Map(allocs.map((a) => [a.bucketId, a.amount]));
}
