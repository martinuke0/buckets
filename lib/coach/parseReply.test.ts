import { describe, it, expect } from "vitest";
import { parseCoachReplyStream } from "@/lib/coach/parseReply";

describe("parseCoachReplyStream", () => {
  it("returns whole text as reply when no delimiter", () => {
    const r = parseCoachReplyStream("hello there");
    expect(r).toEqual({ reply: "hello there" });
  });
  it("splits reply and JSON footer on the delimiter", () => {
    const raw = 'Move some to savings?\n---META---\n{"suggestion":{"type":"rebalance","fromBucketId":"fun","toBucketId":"savings","amount":4000},"memory":"saving for a car"}';
    const r = parseCoachReplyStream(raw);
    expect(r.reply).toBe("Move some to savings?");
    expect(r.suggestion).toEqual({ type: "rebalance", fromBucketId: "fun", toBucketId: "savings", amount: 4000 });
    expect(r.memory).toBe("saving for a car");
  });
  it("returns reply only when footer JSON is malformed (never throws)", () => {
    const raw = "reply text\n---META---\n{not json";
    const r = parseCoachReplyStream(raw);
    expect(r.reply).toBe("reply text");
    expect(r.suggestion).toBeUndefined();
    expect(r.memory).toBeUndefined();
  });
  it("trims trailing whitespace off reply but preserves interior newlines", () => {
    const raw = "line1\nline2   \n---META---\n{}";
    expect(parseCoachReplyStream(raw).reply).toBe("line1\nline2");
  });
  it("handles a delimiter with no JSON after (just the marker)", () => {
    expect(parseCoachReplyStream("hello\n---META---\n")).toEqual({ reply: "hello" });
    expect(parseCoachReplyStream("hello\n---META---")).toEqual({ reply: "hello" });
  });
  it("handles an empty reply (delimiter at start)", () => {
    const r = parseCoachReplyStream("\n---META---\n{\"suggestion\":null,\"memory\":\"x\"}");
    expect(r.reply).toBe("");
    expect(r.memory).toBe("x");
  });
});
