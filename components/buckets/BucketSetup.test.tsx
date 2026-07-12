import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BucketSetup } from "@/components/buckets/BucketSetup";
import type { Bucket } from "@/lib/model/types";

const initial: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

describe("BucketSetup", () => {
  it("shows a live total and enables save at 100%", () => {
    render(<BucketSetup initial={initial} onSave={vi.fn()} />);
    expect(screen.getByTestId("total-percent")).toHaveTextContent("100");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
  it("disables save when total is not 100%", () => {
    render(<BucketSetup initial={[{ ...initial[0], percent: 50 }]} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
  it("calls onSave with the edited buckets", () => {
    const onSave = vi.fn();
    render(<BucketSetup initial={initial} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });
});
