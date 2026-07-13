import { describe, it, expect } from "vitest";
import { validateSuggestion, type CoachSuggestion } from "@/lib/coach/suggestion";

const buckets = [{ id: "save", remaining: 50000 }, { id: "fun", remaining: 1500 }];
const base: CoachSuggestion = { type: "rebalance", fromBucketId: "save", toBucketId: "fun", amount: 5000 };

describe("validateSuggestion", () => {
  it("accepts a valid rebalance within available funds", () => {
    expect(validateSuggestion(base, buckets)).toEqual({ ok: true });
  });
  it("rejects an unknown bucket", () => {
    expect(validateSuggestion({ ...base, toBucketId: "ghost" }, buckets).ok).toBe(false);
  });
  it("rejects moving more than the source has", () => {
    expect(validateSuggestion({ ...base, amount: 60000 }, buckets).ok).toBe(false);
  });
  it("rejects same-bucket / non-positive / non-integer amounts", () => {
    expect(validateSuggestion({ ...base, toBucketId: "save" }, buckets).ok).toBe(false);
    expect(validateSuggestion({ ...base, amount: 0 }, buckets).ok).toBe(false);
    expect(validateSuggestion({ ...base, amount: 12.5 }, buckets).ok).toBe(false);
  });
});
