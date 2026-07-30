import { describe, it, expect } from "vitest";
import { normalizeMerchant, chooseBucket, computeSkipLLMPct, type CategoryRule } from "@/lib/categorize/rules";

describe("normalizeMerchant", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeMerchant("  TESCO   STORES  ")).toBe("tesco stores");
  });
  it("strips trailing card-processor noise", () => {
    expect(normalizeMerchant("AMZN Mktp*A1B2C3")).toBe("amzn mktp");
  });
  it("strips slashes (Firestore doc-id safety)", () => {
    expect(normalizeMerchant("PAYPAL /EBAY")).toBe("paypal ebay");
  });
  it("returns empty string for all-digit input", () => {
    expect(normalizeMerchant("12345")).toBe("");
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

describe("computeSkipLLMPct", () => {
  it("returns 100 when every spend was placed by a rule", () => {
    expect(computeSkipLLMPct(8, 0, 0)).toBe(100);
  });
  it("returns the rounded rule share including noMatch in the denominator", () => {
    // 6 / (6+3+1) = 60%
    expect(computeSkipLLMPct(6, 3, 1)).toBe(60);
    // 1 / (1+1+1) = 33.33 -> 33
    expect(computeSkipLLMPct(1, 1, 1)).toBe(33);
  });
  it("returns 0 when no spend was placed by a rule", () => {
    expect(computeSkipLLMPct(0, 2, 3)).toBe(0);
  });
  it("returns null when there were no spends", () => {
    expect(computeSkipLLMPct(0, 0, 0)).toBeNull();
  });
});
