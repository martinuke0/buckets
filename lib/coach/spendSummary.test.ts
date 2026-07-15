import { describe, it, expect } from "vitest";
import { buildSpendSummary } from "../../functions/src/spendSummary";

const now = new Date("2026-07-15T12:00:00Z");
const buckets = [
  { id: "fun", name: "Fun", allocated: 12000, remaining: -4000 },
  { id: "food", name: "Food", allocated: 20000, remaining: 8000 },
];
const txns = [
  { description: "Nightclub", amount: -8000, bookedAt: "2026-07-03", bucketId: "fun", isIncome: false },
  { description: "Bar", amount: -8000, bookedAt: "2026-07-10", bucketId: "fun", isIncome: false },
  { description: "Groceries", amount: -12000, bookedAt: "2026-07-05", bucketId: "food", isIncome: false },
  { description: "Old spend", amount: -5000, bookedAt: "2026-06-20", bucketId: "fun", isIncome: false }, // prior month — excluded
  { description: "Salary", amount: 200000, bookedAt: "2026-07-01", bucketId: null, isIncome: true },     // income — excluded
];

describe("buildSpendSummary", () => {
  it("sums current-month spends per bucket, excludes prior months + income", () => {
    const s = buildSpendSummary(buckets, txns, now);
    const fun = s.buckets.find((b) => b.id === "fun")!;
    expect(fun.spentThisMonth).toBe(16000);   // 8000 + 8000, June excluded
    expect(fun.pctUsed).toBe(133);            // 16000/12000
    expect(fun.notable.length).toBe(2);
  });
  it("pctUsed is 0 when allocated is 0 (no divide-by-zero)", () => {
    const s = buildSpendSummary([{ id: "x", name: "X", allocated: 0, remaining: 0 }], [], now);
    expect(s.buckets[0].pctUsed).toBe(0);
  });
  it("computes days left in month from now (deterministic)", () => {
    const s = buildSpendSummary(buckets, txns, now);
    expect(s.daysLeftInMonth).toBe(16); // Jul has 31 days; 31-15
  });
});
