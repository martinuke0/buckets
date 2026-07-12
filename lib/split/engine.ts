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

export function splitIncome(income: Cents, rules: SplitRule[]): Allocation[] {
  if (!Number.isInteger(income)) throw new SplitError("income must be an integer number of cents");
  if (income < 0) throw new SplitError("income must be >= 0");
  validateRules(rules);

  // Ideal (fractional) share per bucket, then floor; track remainders.
  const ideal = rules.map((r) => (income * r.percent) / 100);
  const floors = ideal.map((x) => Math.floor(x));
  let distributed = floors.reduce((t, x) => t + x, 0);
  let leftover = income - distributed; // number of whole cents still to hand out

  // Largest-remainder order; ties break by original index (stable).
  const order = rules
    .map((_, i) => i)
    .sort((i, j) => {
      const fi = ideal[i] - floors[i];
      const fj = ideal[j] - floors[j];
      if (fj !== fi) return fj - fi; // larger remainder first
      return i - j;                  // tie -> earlier index first
    });

  const amounts = floors.slice();
  for (let k = 0; k < order.length && leftover > 0; k++) {
    amounts[order[k]] += 1;
    leftover -= 1;
  }

  return rules.map((r, i) => ({ bucketId: r.bucketId, amount: amounts[i] }));
}
