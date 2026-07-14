import { describe, it, expect } from "vitest";
import { balanceShares } from "@/lib/data/anchor";

describe("balanceShares", () => {
  it("partitions the balance by percent, conserving every cent", () => {
    const rules = [
      { bucketId: "bills", percent: 40 },
      { bucketId: "savings", percent: 25 },
      { bucketId: "food", percent: 20 },
      { bucketId: "fun", percent: 10 },
      { bucketId: "others", percent: 5 },
    ];
    const shares = balanceShares(200000, rules); // €2000.00
    expect(shares.get("bills")).toBe(80000);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(200000);
  });
  it("conserves cents on an amount that doesn't divide evenly", () => {
    const rules = [{ bucketId: "a", percent: 33 }, { bucketId: "b", percent: 33 }, { bucketId: "c", percent: 34 }];
    const shares = balanceShares(100, rules); // 1 euro across thirds
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(100);
  });
});
