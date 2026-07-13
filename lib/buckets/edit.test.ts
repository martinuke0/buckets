import { describe, it, expect } from "vitest";
import { bucketCapFor, canAddBucket, resplitAdjacent, deleteBucket, setBucketPercent } from "@/lib/buckets/edit";
import type { Bucket } from "@/lib/model/types";

const mk = (id: string, name: string, percent: number, remaining = 0): Bucket =>
  ({ id, name, colorIndex: 0, percent, type: "virtual", remaining, allocated: remaining });

const set: Bucket[] = [mk("rent", "Rent", 35), mk("sav", "Savings", 30, 50000), mk("food", "Food", 15, 18000), mk("fun", "Nights out", 10), mk("gym", "Gym", 10)];

describe("cap", () => {
  it("free=5, premium=15", () => { expect(bucketCapFor(false)).toBe(5); expect(bucketCapFor(true)).toBe(15); });
  it("blocks add at the free cap", () => { expect(canAddBucket(set, false)).toBe(false); expect(canAddBucket(set.slice(0,4), false)).toBe(true); });
  it("premium allows more", () => { expect(canAddBucket(set, true)).toBe(true); });
});

describe("resplitAdjacent", () => {
  it("moving the Rent|Savings divider re-splits only those two, total stays 100", () => {
    const out = resplitAdjacent(set, 0, 40); // Rent 35->40, Savings 30->25
    expect(out[0].percent).toBe(40);
    expect(out[1].percent).toBe(25);
    expect(out.reduce((t, b) => t + b.percent, 0)).toBe(100);
  });
  it("clamps so neither adjacent bucket goes negative", () => {
    const out = resplitAdjacent(set, 0, 999); // can't exceed left+right (65)
    expect(out[0].percent).toBe(65);
    expect(out[1].percent).toBe(0);
    expect(out.reduce((t, b) => t + b.percent, 0)).toBe(100);
  });
});

describe("setBucketPercent", () => {
  const sum = (bs: Bucket[]) => bs.reduce((t, b) => t + b.percent, 0);

  it("edits a non-savings bucket by re-splitting against Savings, total stays 100", () => {
    const out = setBucketPercent(set, "rent", 40); // Rent 35->40, Savings 30->25
    expect(out.find((b) => b.id === "rent")!.percent).toBe(40);
    expect(out.find((b) => b.id === "sav")!.percent).toBe(25);
    expect(sum(out)).toBe(100);
  });

  it("editing the Savings bucket itself keeps total 100 (recipient != edited)", () => {
    const out = setBucketPercent(set, "sav", 40); // must NOT double-count Savings
    expect(out.find((b) => b.id === "sav")!.percent).toBe(40);
    expect(sum(out)).toBe(100); // regression guard: was 110
  });

  it("clamps so the pair can't exceed its combined percent", () => {
    const out = setBucketPercent(set, "rent", 999); // Rent+Savings = 65
    expect(out.find((b) => b.id === "rent")!.percent).toBe(65);
    expect(out.find((b) => b.id === "sav")!.percent).toBe(0);
    expect(sum(out)).toBe(100);
  });
});

describe("deleteBucket", () => {
  it("folds percent + balance into Savings, total stays 100, money conserved", () => {
    const out = deleteBucket(set, "food"); // Food 15% + €180 -> Savings
    expect(out.find((b) => b.id === "food")).toBeUndefined();
    const sav = out.find((b) => b.id === "sav")!;
    expect(sav.percent).toBe(45);          // 30 + 15
    expect(sav.remaining).toBe(68000);     // 50000 + 18000
    expect(out.reduce((t, b) => t + b.percent, 0)).toBe(100);
  });
  it("throws when deleting the last bucket", () => {
    expect(() => deleteBucket([mk("only", "Only", 100)], "only")).toThrow();
  });
});
