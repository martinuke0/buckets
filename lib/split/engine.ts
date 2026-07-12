import type { Cents } from "@/lib/model/money";

export interface SplitRule {
  bucketId: string;
  percent: number; // 0–100, may be fractional
}

export interface Allocation {
  bucketId: string;
  amount: Cents;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

const PERCENT_TOLERANCE = 0.001;

export function validateRules(rules: SplitRule[]): void {
  if (rules.length === 0) throw new SplitError("at least one bucket rule is required");

  const seen = new Set<string>();
  let total = 0;
  for (const r of rules) {
    if (seen.has(r.bucketId)) throw new SplitError(`duplicate bucketId: ${r.bucketId}`);
    seen.add(r.bucketId);
    if (!(r.percent >= 0)) throw new SplitError(`percent must be >= 0 for ${r.bucketId}`);
    total += r.percent;
  }
  if (Math.abs(total - 100) > PERCENT_TOLERANCE) {
    throw new SplitError(`percentages must sum to 100 (got ${total})`);
  }
}
