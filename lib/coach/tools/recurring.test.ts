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
});
