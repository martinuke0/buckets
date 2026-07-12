import { describe, it, expect } from "vitest";
import { formatEuros, toCents } from "@/lib/model/money";

describe("formatEuros", () => {
  it("formats whole euros", () => { expect(formatEuros(120000)).toBe("€1,200.00"); });
  it("formats cents", () => { expect(formatEuros(4280)).toBe("€42.80"); });
  it("formats zero", () => { expect(formatEuros(0)).toBe("€0.00"); });
});

describe("toCents", () => {
  it("converts euros to integer cents", () => { expect(toCents(123.45)).toBe(12345); });
  it("rounds to nearest cent", () => { expect(toCents(0.005)).toBe(1); });
});
