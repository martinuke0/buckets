import { describe, it, expect } from "vitest";
import { validateRules, SplitError, type SplitRule } from "@/lib/split/engine";

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
