import { describe, it, expect } from "vitest";
import { validateRules, SplitError, type SplitRule, splitIncome } from "@/lib/split/engine";

const ok: SplitRule[] = [
  { bucketId: "a", percent: 60 },
  { bucketId: "b", percent: 40 },
];

describe("validateRules", () => {
  it("accepts rules summing to 100", () => {
    expect(() => validateRules(ok)).not.toThrow();
  });
  it("accepts fractional percents summing to 100", () => {
    expect(() => validateRules([
      { bucketId: "a", percent: 12.5 },
      { bucketId: "b", percent: 87.5 },
    ])).not.toThrow();
  });
  it("rejects an empty rule set", () => {
    expect(() => validateRules([])).toThrow(SplitError);
  });
  it("rejects percentages that do not sum to 100", () => {
    expect(() => validateRules([{ bucketId: "a", percent: 90 }])).toThrow(SplitError);
  });
  it("rejects a negative percent", () => {
    expect(() => validateRules([
      { bucketId: "a", percent: -10 },
      { bucketId: "b", percent: 110 },
    ])).toThrow(SplitError);
  });
  it("rejects duplicate bucket ids", () => {
    expect(() => validateRules([
      { bucketId: "a", percent: 50 },
      { bucketId: "a", percent: 50 },
    ])).toThrow(SplitError);
  });
});

function sum(a: { amount: number }[]) { return a.reduce((t, x) => t + x.amount, 0); }

describe("splitIncome", () => {
  it("splits an evenly-divisible income", () => {
    const out = splitIncome(100000, ok); // €1000, 60/40
    expect(out).toEqual([
      { bucketId: "a", amount: 60000 },
      { bucketId: "b", amount: 40000 },
    ]);
  });

  it("conserves every cent when the split does not divide evenly", () => {
    // €10.00 split three ways at 33.33/33.33/33.34 -> must total 1000 cents
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 33.33 },
      { bucketId: "b", percent: 33.33 },
      { bucketId: "c", percent: 33.34 },
    ];
    const out = splitIncome(1000, rules);
    expect(sum(out)).toBe(1000);
  });

  it("distributes leftover cents by largest remainder, ties by order", () => {
    // €0.10 (10 cents) split 3 equal ways: ideal 3.333 each.
    // floors: 3,3,3 = 9; 1 leftover cent -> largest remainder tie -> first bucket.
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 33.34 },
      { bucketId: "b", percent: 33.33 },
      { bucketId: "c", percent: 33.33 },
    ];
    const out = splitIncome(10, rules);
    expect(out).toEqual([
      { bucketId: "a", amount: 4 },
      { bucketId: "b", amount: 3 },
      { bucketId: "c", amount: 3 },
    ]);
    expect(sum(out)).toBe(10);
  });

  it("handles zero income by allocating zero to every bucket", () => {
    const out = splitIncome(0, ok);
    expect(out).toEqual([
      { bucketId: "a", amount: 0 },
      { bucketId: "b", amount: 0 },
    ]);
  });

  it("rejects negative income", () => {
    expect(() => splitIncome(-1, ok)).toThrow(SplitError);
  });

  it("rejects non-integer income", () => {
    expect(() => splitIncome(100.5, ok)).toThrow(SplitError);
  });

  it("is deterministic across repeated calls", () => {
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 33.33 },
      { bucketId: "b", percent: 33.33 },
      { bucketId: "c", percent: 33.34 },
    ];
    expect(splitIncome(9999, rules)).toEqual(splitIncome(9999, rules));
  });
});

describe("splitIncome conservation property", () => {
  it("always sums to income across a range", () => {
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 14.28 },
      { bucketId: "b", percent: 28.57 },
      { bucketId: "c", percent: 57.15 },
    ];
    for (let income = 0; income <= 5000; income++) {
      const out = splitIncome(income, rules);
      expect(out.reduce((t, x) => t + x.amount, 0)).toBe(income);
    }
  });
});
