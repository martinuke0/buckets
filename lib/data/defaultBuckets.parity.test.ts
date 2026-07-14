import { describe, it, expect } from "vitest";
// SERVER = the functions-local copy (functions/src is CJS, so this test must live
// in the root ESM tree and reach into it by relative path — a vitest file cannot
// live under functions/ where package.json is "type":"commonjs").
import { DEFAULT_BUCKETS as SERVER } from "../../functions/src/defaultBuckets";
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
