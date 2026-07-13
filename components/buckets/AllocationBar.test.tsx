import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AllocationBar } from "@/components/buckets/AllocationBar";
import type { Bucket } from "@/lib/model/types";

const mk = (id: string, p: number): Bucket => ({ id, name: id, colorIndex: 0, percent: p, type: "virtual", remaining: 0, allocated: 0 });
const buckets = [mk("a", 60), mk("b", 40)];

describe("AllocationBar", () => {
  it("renders a segment per bucket", () => {
    render(<AllocationBar buckets={buckets} onChange={vi.fn()} />);
    expect(screen.getByTestId("seg-a")).toBeInTheDocument();
    expect(screen.getByTestId("seg-b")).toBeInTheDocument();
  });
  it("arrow-key on a divider re-splits and calls onChange", () => {
    const onChange = vi.fn();
    render(<AllocationBar buckets={buckets} onChange={onChange} />);
    fireEvent.keyDown(screen.getByTestId("divider-0"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a", percent: 61 }),
      expect.objectContaining({ id: "b", percent: 39 }),
    ]);
  });
});
