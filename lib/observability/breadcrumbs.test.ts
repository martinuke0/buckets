import { describe, it, expect, beforeEach } from "vitest";
import { logAction, getBreadcrumbs, clearBreadcrumbs } from "@/lib/observability/breadcrumbs";

describe("breadcrumbs", () => {
  beforeEach(() => clearBreadcrumbs());
  it("records actions in order with metadata", () => {
    logAction("connect_bank");
    logAction("sync", { added: 3 });
    const bc = getBreadcrumbs();
    expect(bc.map((b) => b.action)).toEqual(["connect_bank", "sync"]);
    expect(bc[1].meta).toEqual({ added: 3 });
    expect(typeof bc[0].at).toBe("string");
  });
  it("caps at 30, dropping the oldest", () => {
    for (let i = 0; i < 35; i++) logAction(`a${i}`);
    const bc = getBreadcrumbs();
    expect(bc.length).toBe(30);
    expect(bc[0].action).toBe("a5");        // oldest 5 dropped
    expect(bc[29].action).toBe("a34");
  });
  it("getBreadcrumbs returns a copy (caller can't mutate internal state)", () => {
    logAction("x");
    getBreadcrumbs().push({ action: "y", at: "now" });
    expect(getBreadcrumbs().map((b) => b.action)).toEqual(["x"]);
  });
});
