import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestionCard } from "@/components/coach/SuggestionCard";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "save", name: "Savings", colorIndex: 0, percent: 30, type: "virtual", remaining: 50000, allocated: 60000 },
  { id: "fun", name: "Nights out", colorIndex: 1, percent: 10, type: "virtual", remaining: 1500, allocated: 20000 },
];

describe("SuggestionCard", () => {
  it("renders small inline Apply pill + Not now link and fires callbacks", () => {
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SuggestionCard
        suggestion={{ type: "rebalance", fromBucketId: "save", toBucketId: "fun", amount: 5000 }}
        buckets={buckets}
        onApply={onApply}
        onDismiss={onDismiss}
      />
    );

    // Assert small inline Apply button exists with readable text
    const applyButton = screen.getByRole("button", { name: /apply/i });
    expect(applyButton).toBeInTheDocument();
    expect(screen.getByText(/Move €50\.00: Savings → Nights out/i)).toBeInTheDocument();

    // Assert Not now dismiss control exists
    const dismissButton = screen.getByRole("button", { name: /dismiss/i });
    expect(dismissButton).toBeInTheDocument();
    expect(screen.getByText(/Not now/i)).toBeInTheDocument();

    // Assert callbacks fire
    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledOnce();

    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders an applied strip when appliedAt is set (no Apply/Dismiss buttons)", () => {
    render(
      <SuggestionCard
        suggestion={{ type: "rebalance", fromBucketId: "save", toBucketId: "fun", amount: 4000 }}
        buckets={buckets}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
        appliedAt={new Date().toISOString()}
      />
    );

    expect(screen.getByText(/Applied/i)).toBeInTheDocument();
    expect(screen.getByText(/Savings/)).toBeInTheDocument();
    expect(screen.getByText(/Nights out/)).toBeInTheDocument();
    expect(screen.getByText(/€40\.00/)).toBeInTheDocument();
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });
});
