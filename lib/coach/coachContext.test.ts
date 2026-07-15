import { describe, it, expect } from "vitest";
import { buildCoachContext } from "../../functions/src/coachContext";
import type { SpendSummary } from "../../functions/src/spendSummary";

const summary: SpendSummary = {
  daysLeftInMonth: 16,
  buckets: [
    { id: "fun", name: "Fun", allocated: 12000, remaining: -4000, spentThisMonth: 16000, pctUsed: 133, notable: [{ description: "Nightclub", amount: 8000 }] },
    { id: "food", name: "Food", allocated: 20000, remaining: 8000, spentThisMonth: 12000, pctUsed: 60, notable: [] },
  ],
};

describe("buildCoachContext", () => {
  it("includes per-bucket spend figures and days left", () => {
    const { prompt, bucketIds } = buildCoachContext(summary, []);
    expect(prompt).toMatch(/Fun/);
    expect(prompt).toMatch(/133%/);
    expect(prompt).toMatch(/16 days left/);
    expect(bucketIds).toEqual(["fun", "food"]);
  });
  it("injects remembered goals when present", () => {
    const { prompt } = buildCoachContext(summary, ["Saving for a car", "Eat out less"]);
    expect(prompt).toMatch(/Saving for a car/);
    expect(prompt).toMatch(/Eat out less/);
  });
  it("omits the goals section when there are no memories", () => {
    const { prompt } = buildCoachContext(summary, []);
    expect(prompt).not.toMatch(/stated goals/i);
  });
});
