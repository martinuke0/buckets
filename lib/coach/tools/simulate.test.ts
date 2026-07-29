import { describe, it, expect } from "vitest";
import { simulateMonth } from "@/lib/coach/tools/simulate";
import { SplitError } from "@/lib/split/engine";

const rules = [
  { bucketId: "fun", percent: 30 },
  { bucketId: "rent", percent: 50 },
  { bucketId: "savings", percent: 20 },
];

describe("simulateMonth", () => {
  it("re-splits income after overwriting one bucket's percent", () => {
    // cut Fun to 10, move the freed 20 into savings -> savings 40
    const result = simulateMonth(200000, rules, [
      { bucketId: "fun", percent: 10 },
      { bucketId: "savings", percent: 40 },
    ]);
    expect(result).toEqual([
      { bucketId: "fun", amount: 20000 },
      { bucketId: "rent", amount: 100000 },
      { bucketId: "savings", amount: 80000 },
    ]);
  });

  it("throws SplitError when changes make percents not sum to 100", () => {
    expect(() => simulateMonth(200000, rules, [{ bucketId: "fun", percent: 10 }])).toThrow(SplitError);
  });

  it("appends a change for an unknown bucket as a new rule", () => {
    // start with fun 30 / rent 50 / savings 20; drop savings to 0 and route it to a new bucket
    const result = simulateMonth(200000, rules, [
      { bucketId: "savings", percent: 0 },
      { bucketId: "gifts", percent: 20 },
    ]);
    expect(result).toEqual([
      { bucketId: "fun", amount: 60000 },
      { bucketId: "rent", amount: 100000 },
      { bucketId: "savings", amount: 0 },
      { bucketId: "gifts", amount: 40000 },
    ]);
  });
});
