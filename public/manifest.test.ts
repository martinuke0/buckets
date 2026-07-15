import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("PWA manifest", () => {
  it("declares name, standalone display, and theme color", () => {
    const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(m.name).toBe("Buckets");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#0E0F13");
  });
});
