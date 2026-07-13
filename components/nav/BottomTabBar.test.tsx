import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("BottomTabBar", () => {
  it("renders all four tabs", () => {
    render(<BottomTabBar />);
    for (const label of ["Home", "Buckets", "Coach", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
  it("marks the active tab via aria-current", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Home").closest("a")).toHaveAttribute("aria-current", "page");
  });
  it("renders a Sync button that calls onSync", () => {
    const onSync = vi.fn();
    render(<BottomTabBar onSync={onSync} />);
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    expect(onSync).toHaveBeenCalled();
  });
});
