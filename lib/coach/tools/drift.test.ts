import { describe, it, expect } from "vitest";
import { explainDrift } from "@/lib/coach/tools/drift";

describe("explainDrift", () => {
  it("computes signed drift = balance minus sum of remaining", () => {
    const result = explainDrift(100800, [
      { id: "fun", remaining: 30000 },
      { id: "rent", remaining: 50000 },
      { id: "savings", remaining: 20000 },
    ]);
    expect(result).toEqual({
      drift: 800,
      byBucket: [
        { bucketId: "fun", remaining: 30000 },
        { bucketId: "rent", remaining: 50000 },
        { bucketId: "savings", remaining: 20000 },
      ],
    });
  });

  it("returns negative drift when buckets exceed balance", () => {
    expect(explainDrift(0, [{ id: "a", remaining: 500 }]).drift).toBe(-500);
  });
});
