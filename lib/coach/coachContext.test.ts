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

describe("buildCoachContext transactions section", () => {
  it("omits the transactions section when contextTxns is empty", () => {
    const { prompt } = buildCoachContext(summary, [], []);
    expect(prompt).not.toMatch(/Recent transactions/);
  });
  it("renders txns with a `pre` tag for pre-anchor entries and none for post-anchor", () => {
    const { prompt } = buildCoachContext(summary, [], [
      { description: "Nightclub", amount: -8000, bookedAt: "2026-07-10", bucketId: "fun", isIncome: false, isPreAnchor: false },
      { description: "Groceries", amount: -1200, bookedAt: "2026-06-20", bucketId: "food", isIncome: false, isPreAnchor: true },
    ]);
    expect(prompt).toMatch(/Recent transactions/);
    expect(prompt).toMatch(/Nightclub.*-€80\.00.*Fun/);
    // pre-anchor row carries the `pre` tag
    expect(prompt).toMatch(/Groceries.*-€12\.00.*Food.*pre/);
    // post-anchor row does NOT carry `pre`
    const nightclubLine = prompt.split("\n").find((l) => l.includes("Nightclub")) ?? "";
    expect(nightclubLine.includes(" · pre")).toBe(false);
    // guidance line present
    expect(prompt).toMatch(/Pre-anchor entries are historical/);
  });
  it("instructs the model on the ---META--- contract", () => {
    const { prompt } = buildCoachContext(summary, [], []);
    expect(prompt).toMatch(/---META---/);
  });
});

describe("buildCoachContext today grounding", () => {
  it("includes a Today is <date>. header when today is supplied", () => {
    const { prompt } = buildCoachContext(summary, [], [], "2026-07-16");
    expect(prompt).toMatch(/Today is 2026-07-16\./);
  });
  it("omits the today header when today is not supplied (backward compat)", () => {
    const { prompt } = buildCoachContext(summary, [], []);
    expect(prompt).not.toMatch(/Today is /);
  });
});

describe("buildCoachContext anti-hallucination rules", () => {
  it("tells the model it cannot move money itself", () => {
    const { prompt } = buildCoachContext(summary, []);
    expect(prompt).toMatch(/cannot move money yourself/i);
    expect(prompt).toMatch(/Apply button/);
  });
  it("forbids past-tense claims of having moved money", () => {
    const { prompt } = buildCoachContext(summary, []);
    expect(prompt).toMatch(/transfers are complete/);
    expect(prompt).toMatch(/NEVER say/);
  });
  it("teaches single-rebalance-per-turn for multi-transfer requests", () => {
    const { prompt } = buildCoachContext(summary, []);
    expect(prompt).toMatch(/only ONE rebalance per turn/);
    expect(prompt).toMatch(/queue the next one after they apply/);
  });
});
