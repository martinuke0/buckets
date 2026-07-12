import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BucketCard } from "@/components/buckets/BucketCard";
import type { Bucket } from "@/lib/model/types";

const bucket: Bucket = { id: "a", name: "Food", colorIndex: 2, percent: 15, type: "virtual", remaining: 18000, allocated: 30000 };

describe("BucketCard", () => {
  it("shows the bucket name and remaining amount", () => {
    render(<BucketCard bucket={bucket} />);
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("€180.00")).toBeInTheDocument();
  });
  it("marks a nearly-empty bucket as low", () => {
    render(<BucketCard bucket={{ ...bucket, remaining: 1000 }} />); // <=10% of 30000
    expect(screen.getByTestId("bucket-a")).toHaveAttribute("data-low", "true");
  });
});
