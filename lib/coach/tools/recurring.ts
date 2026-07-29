import { normalizeMerchant } from "@/lib/categorize/rules";

export interface RecurringCharge {
  merchant: string;
  amount: number; // integer cents, absolute value of most recent charge
  count: number;
}

const DAY_MS = 86_400_000;

export function findRecurringCharges(
  txns: { description: string; amount: number; bookedAt: string; isIncome: boolean }[],
): RecurringCharge[] {
  const groups = new Map<string, { description: string; amount: number; bookedAt: string }[]>();
  for (const t of txns) {
    if (t.isIncome) continue;
    const key = normalizeMerchant(t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: RecurringCharge[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Date.parse(a.bookedAt) - Date.parse(b.bookedAt));
    let monthly = true;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (Date.parse(sorted[i].bookedAt) - Date.parse(sorted[i - 1].bookedAt)) / DAY_MS;
      if (gap < 25 || gap > 35) { monthly = false; break; }
    }
    if (!monthly) continue;
    const mostRecent = sorted[sorted.length - 1];
    out.push({ merchant, amount: Math.abs(mostRecent.amount), count: sorted.length });
  }

  return out.sort((a, b) => (b.count - a.count) || (a.merchant < b.merchant ? -1 : 1));
}
