import { describe, it, expect } from "vitest";
import { DEFAULT_BUCKETS } from "@/lib/data/defaultBuckets";

describe("DEFAULT_BUCKETS", () => {
  it("has 5 buckets summing to 100 percent", () => {
    expect(DEFAULT_BUCKETS).toHaveLength(5);
    expect(DEFAULT_BUCKETS.reduce((s, b) => s + b.percent, 0)).toBe(100);
  });
  it("uses the generic universal names in order", () => {
    expect(DEFAULT_BUCKETS.map((b) => b.name)).toEqual(["Bills", "Savings", "Food", "Fun", "Others"]);
  });
  it("all virtual, zeroed, colorIndex 0..4", () => {
    DEFAULT_BUCKETS.forEach((b, i) => {
      expect(b.type).toBe("virtual");
      expect(b.remaining).toBe(0);
      expect(b.allocated).toBe(0);
      expect(b.colorIndex).toBe(i);
    });
  });
});
