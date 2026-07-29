import { describe, it, expect } from "vitest";
import { findRecurringCharges } from "@/lib/coach/tools/recurring";

describe("findRecurringCharges", () => {
  it("flags a merchant billed ~monthly, most-recent amount, integer cents", () => {
    const txns = [
      { description: "NETFLIX *123", amount: -1599, bookedAt: "2026-05-03", isIncome: false },
      { description: "netflix", amount: -1599, bookedAt: "2026-06-02", isIncome: false },
      { description: "Netflix#77", amount: -1699, bookedAt: "2026-07-02", isIncome: false },
    ];
    expect(findRecurringCharges(txns)).toEqual([{ merchant: "netflix", amount: 1699, count: 3 }]);
  });

  it("ignores one-off charges and income", () => {
    const txns = [
      { description: "CORNER SHOP", amount: -450, bookedAt: "2026-07-01", isIncome: false },
      { description: "ACME PAYROLL", amount: 250000, bookedAt: "2026-07-01", isIncome: true },
    ];
    expect(findRecurringCharges(txns)).toEqual([]);
  });

  it("does not flag two charges only 5 days apart", () => {
    const txns = [
      { description: "GYM", amount: -3000, bookedAt: "2026-07-01", isIncome: false },
      { description: "GYM", amount: -3000, bookedAt: "2026-07-06", isIncome: false },
    ];
    expect(findRecurringCharges(txns)).toEqual([]);
  });

  it("flags a merchant seen exactly twice ~monthly (minimum count)", () => {
    const txns = [
      { description: "SPOTIFY", amount: -999, bookedAt: "2026-06-05", isIncome: false },
      { description: "SPOTIFY", amount: -999, bookedAt: "2026-07-05", isIncome: false },
    ];
    expect(findRecurringCharges(txns)).toEqual([{ merchant: "spotify", amount: 999, count: 2 }]);
  });

  it("includes gaps at the 25 and 35 day boundaries, excludes 24 and 36", () => {
    const at = (days: number) => {
      const d = new Date(Date.UTC(2026, 5, 1) + days * 86_400_000);
      return d.toISOString().slice(0, 10);
    };
    // 25-day gap -> included
    expect(findRecurringCharges([
      { description: "A", amount: -100, bookedAt: at(0), isIncome: false },
      { description: "A", amount: -100, bookedAt: at(25), isIncome: false },
    ])).toEqual([{ merchant: "a", amount: 100, count: 2 }]);
    // 35-day gap -> included
    expect(findRecurringCharges([
      { description: "A", amount: -100, bookedAt: at(0), isIncome: false },
      { description: "A", amount: -100, bookedAt: at(35), isIncome: false },
    ])).toEqual([{ merchant: "a", amount: 100, count: 2 }]);
    // 24-day gap -> excluded
    expect(findRecurringCharges([
      { description: "A", amount: -100, bookedAt: at(0), isIncome: false },
      { description: "A", amount: -100, bookedAt: at(24), isIncome: false },
    ])).toEqual([]);
    // 36-day gap -> excluded
    expect(findRecurringCharges([
      { description: "A", amount: -100, bookedAt: at(0), isIncome: false },
      { description: "A", amount: -100, bookedAt: at(36), isIncome: false },
    ])).toEqual([]);
  });

  it("sorts multiple recurring merchants by count desc, then merchant asc", () => {
    const txns = [
      // zed: 2 charges
      { description: "ZED", amount: -200, bookedAt: "2026-05-01", isIncome: false },
      { description: "ZED", amount: -200, bookedAt: "2026-06-01", isIncome: false },
      // able: 2 charges (same count as zed -> alphabetical first)
      { description: "ABLE", amount: -300, bookedAt: "2026-05-02", isIncome: false },
      { description: "ABLE", amount: -300, bookedAt: "2026-06-02", isIncome: false },
      // mid: 3 charges (highest count -> first)
      { description: "MID", amount: -100, bookedAt: "2026-05-03", isIncome: false },
      { description: "MID", amount: -100, bookedAt: "2026-06-03", isIncome: false },
      { description: "MID", amount: -100, bookedAt: "2026-07-03", isIncome: false },
    ];
    expect(findRecurringCharges(txns).map((r) => r.merchant)).toEqual(["mid", "able", "zed"]);
  });
});
