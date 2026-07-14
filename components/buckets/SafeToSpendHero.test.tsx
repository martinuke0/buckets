import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeToSpendHero } from "@/components/buckets/SafeToSpendHero";

describe("SafeToSpendHero", () => {
  it("renders the total-remaining label (not 'today') and no payday line", () => {
    render(<SafeToSpendHero safeToSpend={12345} onTrack monthProgress={0.5} />);
    expect(screen.getByText(/safe to spend/i)).toBeInTheDocument();
    expect(screen.queryByText(/today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payday/i)).not.toBeInTheDocument();
  });
  it("shows the formatted euro amount passed in", () => {
    render(<SafeToSpendHero safeToSpend={12345} onTrack={false} monthProgress={0.2} />);
    expect(screen.getByText("€123.45")).toBeInTheDocument();
  });
});
