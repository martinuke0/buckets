import { describe, it, expect } from "vitest";
import { BUCKET_DOT_COLORS, pickDotColor } from "@/lib/theme";

describe("pickDotColor", () => {
  it("returns a palette color for an index", () => {
    expect(pickDotColor(0)).toBe(BUCKET_DOT_COLORS[0]);
  });
  it("wraps around when index exceeds palette length", () => {
    expect(pickDotColor(BUCKET_DOT_COLORS.length)).toBe(BUCKET_DOT_COLORS[0]);
  });
  it("has at least 6 distinct colors", () => {
    expect(new Set(BUCKET_DOT_COLORS).size).toBeGreaterThanOrEqual(6);
  });
});
