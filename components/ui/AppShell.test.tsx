import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/ui/AppShell";

describe("AppShell", () => {
  it("renders brand and children", () => {
    render(<AppShell><div>content</div></AppShell>);
    // Both Logo and Wordmark expose `aria-label="Buckets"` — either satisfies "brand present".
    expect(screen.getAllByRole("img", { name: "Buckets" }).length).toBeGreaterThan(0);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
