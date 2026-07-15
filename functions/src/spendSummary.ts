export interface SpendSummaryBucket {
  id: string; name: string; allocated: number; remaining: number;
  spentThisMonth: number; pctUsed: number;
  notable: { description: string; amount: number }[];
}
export interface SpendSummary { buckets: SpendSummaryBucket[]; daysLeftInMonth: number; }

function sameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export function buildSpendSummary(
  buckets: { id: string; name: string; allocated: number; remaining: number }[],
  txns: { description: string; amount: number; bookedAt: string; bucketId: string | null; isIncome: boolean }[],
  now: Date,
): SpendSummary {
  const monthSpends = txns.filter((t) => !t.isIncome && sameMonth(t.bookedAt, now));
  const summaryBuckets: SpendSummaryBucket[] = buckets.map((b) => {
    const own = monthSpends.filter((t) => t.bucketId === b.id);
    const spentThisMonth = own.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const pctUsed = b.allocated > 0 ? Math.round((spentThisMonth / b.allocated) * 100) : 0;
    const notable = [...own]
      .sort((a, c) => Math.abs(c.amount) - Math.abs(a.amount))
      .slice(0, 2)
      .map((t) => ({ description: t.description, amount: Math.abs(t.amount) }));
    return { id: b.id, name: b.name, allocated: b.allocated, remaining: b.remaining, spentThisMonth, pctUsed, notable };
  });
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysLeftInMonth = endOfMonth.getUTCDate() - now.getUTCDate();
  return { buckets: summaryBuckets, daysLeftInMonth };
}
