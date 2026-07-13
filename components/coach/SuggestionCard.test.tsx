import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestionCard } from "@/components/coach/SuggestionCard";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "save", name: "Savings", colorIndex: 0, percent: 30, type: "virtual", remaining: 50000, allocated: 60000 },
  { id: "fun", name: "Nights out", colorIndex: 1, percent: 10, type: "virtual", remaining: 1500, allocated: 20000 },
];

describe("SuggestionCard", () => {
  it("renders a human-readable rebalance and fires Apply", () => {
    const onApply = vi.fn();
    render(<SuggestionCard suggestion={{ type: "rebalance", fromBucketId: "save", toBucketId: "fun", amount: 5000 }}
      buckets={buckets} onApply={onApply} onDismiss={vi.fn()} />);
    expect(screen.getByText(/Savings/)).toBeInTheDocument();
    expect(screen.getByText(/Nights out/)).toBeInTheDocument();
    expect(screen.getByText(/€50\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalled();
  });
});
