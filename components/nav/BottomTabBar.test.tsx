import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("BottomTabBar", () => {
  it("renders all four tabs", () => {
    render(<BottomTabBar />);
    for (const label of ["Dashboard", "Buckets", "Coach", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
  it("marks the active tab via aria-current", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("aria-current", "page");
  });
});
