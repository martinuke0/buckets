import { describe, it, expect } from "vitest";
import { normalizeMerchant, chooseBucket, type CategoryRule } from "@/lib/categorize/rules";

describe("normalizeMerchant", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeMerchant("  TESCO   STORES  ")).toBe("tesco stores");
  });
  it("strips trailing card-processor noise", () => {
    expect(normalizeMerchant("AMZN Mktp*A1B2C3")).toBe("amzn mktp");
  });
});

describe("chooseBucket", () => {
  const rules: CategoryRule[] = [{ merchant: "tesco stores", bucketId: "food" }];
  const bucketIds = ["food", "fun", "savings"];

  it("returns the rule's bucket on a normalized match", () => {
    expect(chooseBucket("TESCO STORES", rules, bucketIds)).toEqual({ bucketId: "food" });
  });
  it("needs AI when no rule matches", () => {
    expect(chooseBucket("Some New Cafe", rules, bucketIds)).toEqual({ needsAI: true });
  });
  it("needs AI when the matched rule points at a deleted bucket", () => {
    expect(chooseBucket("TESCO STORES", [{ merchant: "tesco stores", bucketId: "gone" }], bucketIds)).toEqual({ needsAI: true });
  });
});
