import { describe, it, expect } from "vitest";
import { runCoachTool, coachToolDeclarations, type CoachToolCtx } from "@/lib/coach/tools";

const ctx: CoachToolCtx = {
  txns: [
    { description: "NETFLIX", amount: -1599, bookedAt: "2026-05-03", isIncome: false },
    { description: "NETFLIX", amount: -1599, bookedAt: "2026-06-02", isIncome: false },
  ],
  currentRules: [
    { bucketId: "fun", percent: 30 },
    { bucketId: "rent", percent: 50 },
    { bucketId: "savings", percent: 20 },
  ],
  income: 200000,
  currentBalance: 100800,
  buckets: [
    { id: "fun", remaining: 30000 },
    { id: "rent", remaining: 50000 },
    { id: "savings", remaining: 20000 },
  ],
};

describe("runCoachTool", () => {
  it("routes find_recurring_charges", () => {
    expect(runCoachTool("find_recurring_charges", {}, ctx)).toEqual([
      { merchant: "netflix", amount: 1599, count: 2 },
    ]);
  });

  it("routes simulate_month using ctx income + args changes", () => {
    const result = runCoachTool("simulate_month", {
      changes: [{ bucketId: "fun", percent: 10 }, { bucketId: "savings", percent: 40 }],
    }, ctx);
    expect(result).toEqual([
      { bucketId: "fun", amount: 20000 },
      { bucketId: "rent", amount: 100000 },
      { bucketId: "savings", amount: 80000 },
    ]);
  });

  it("routes explain_drift", () => {
    expect((runCoachTool("explain_drift", {}, ctx) as { drift: number }).drift).toBe(800);
  });

  it("returns an error object for an unknown tool", () => {
    expect(runCoachTool("nope", {}, ctx)).toEqual({ error: "unknown tool: nope" });
  });

  it("declares exactly the 3 tools by name", () => {
    expect(coachToolDeclarations.map((d) => d.name).sort()).toEqual(
      ["explain_drift", "find_recurring_charges", "simulate_month"],
    );
  });
});
