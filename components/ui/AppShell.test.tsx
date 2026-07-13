import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/ui/AppShell";

describe("AppShell", () => {
  it("renders brand and children", () => {
    render(<AppShell><div>content</div></AppShell>);
    expect(screen.getByText("MyBuckets")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
