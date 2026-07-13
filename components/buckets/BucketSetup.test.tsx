import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BucketSetup } from "@/components/buckets/BucketSetup";
import type { Bucket } from "@/lib/model/types";

const initial: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

const fiveBuckets: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 35, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Savings", colorIndex: 1, percent: 30, type: "virtual", remaining: 0, allocated: 0 },
  { id: "c", name: "Food", colorIndex: 2, percent: 15, type: "virtual", remaining: 0, allocated: 0 },
  { id: "d", name: "Nights out", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  { id: "e", name: "Gym", colorIndex: 4, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
];

describe("BucketSetup", () => {
  it("shows a live total and enables save at 100%", () => {
    render(<BucketSetup initial={initial} premium={false} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId("total-percent")).toHaveTextContent("100");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
  it("disables save when total is not 100%", () => {
    render(<BucketSetup initial={[{ ...initial[0], percent: 50 }]} premium={false} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
  it("calls onSave with the edited buckets", () => {
    const onSave = vi.fn();
    render(<BucketSetup initial={initial} premium={false} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({ id: "b" }),
    ]));
  });
  it("shows the upsell card when at cap (5 buckets, free)", () => {
    render(<BucketSetup initial={fiveBuckets} premium={false} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/need more buckets/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add bucket/i })).not.toBeInTheDocument();
  });
  it("does not show the upsell when under cap", () => {
    render(<BucketSetup initial={initial} premium={false} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText(/need more buckets/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add bucket/i })).toBeInTheDocument();
  });
  it("does not show the upsell when at 5 buckets with premium", () => {
    render(<BucketSetup initial={fiveBuckets} premium={true} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText(/need more buckets/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add bucket/i })).toBeInTheDocument();
  });
});
