import { render, screen, fireEvent } from "@testing-library/react";
import { vi, it, expect, describe } from "vitest";
import { UpgradeCard } from "./UpgradeCard";

describe("UpgradeCard", () => {
  it("shows the premium value prop and fires onUpgrade", () => {
    const onUpgrade = vi.fn();
    render(<UpgradeCard onUpgrade={onUpgrade} />);
    expect(screen.getByText(/AI Coach/i)).toBeInTheDocument();
    expect(screen.getByText(/15 buckets/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upgrade/i }));
    expect(onUpgrade).toHaveBeenCalled();
  });
});
