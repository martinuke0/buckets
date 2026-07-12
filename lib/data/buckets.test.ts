import { describe, it, expect } from "vitest";
import { deriveRules } from "@/lib/data/buckets";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

describe("deriveRules", () => {
  it("maps buckets to split rules by id and percent", () => {
    expect(deriveRules(buckets)).toEqual([
      { bucketId: "a", percent: 60 },
      { bucketId: "b", percent: 40 },
    ]);
  });
});
