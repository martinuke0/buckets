import { describe, it, expect } from "vitest";
import { DEFAULT_BUCKETS as SERVER } from "./defaultBuckets";
import { DEFAULT_BUCKETS as CLIENT } from "@/lib/data/defaultBuckets";

describe("default bucket parity (client vs functions)", () => {
  it("both sets are byte-identical in name/percent/color/order", () => {
    expect(SERVER.map((b) => [b.name, b.percent, b.colorIndex])).toEqual(
      CLIENT.map((b) => [b.name, b.percent, b.colorIndex]),
    );
  });
  it("server set sums to 100", () => {
    expect(SERVER.reduce((s, b) => s + b.percent, 0)).toBe(100);
  });
});
