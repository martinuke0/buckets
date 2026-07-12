import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplitList } from "@/components/buckets/SplitList";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

describe("SplitList", () => {
  it("renders each allocation with its bucket name and amount", () => {
    render(<SplitList buckets={buckets} allocations={[
      { bucketId: "a", amount: 60000 },
      { bucketId: "b", amount: 40000 },
    ]} />);
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("€600.00")).toBeInTheDocument();
    expect(screen.getByText("€400.00")).toBeInTheDocument();
  });
});
