import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BucketRow } from "@/components/buckets/BucketRow";
import type { Bucket } from "@/lib/model/types";

const bucket: Bucket = { id: "food", name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 };
const noop = () => {};

describe("BucketRow", () => {
  it("links the name to the detail page when href is provided", () => {
    render(<BucketRow bucket={bucket} href="/dashboard/bucket/food" onPercentChange={noop} onRename={noop} onRecolor={noop} onDelete={noop} />);
    expect(screen.getByRole("link", { name: /food/i })).toHaveAttribute("href", "/dashboard/bucket/food");
  });
  it("renders the name as plain text when href is absent", () => {
    render(<BucketRow bucket={bucket} onPercentChange={noop} onRename={noop} onRecolor={noop} onDelete={noop} />);
    expect(screen.queryByRole("link", { name: /food/i })).not.toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });
  it("keeps the percentage input usable (not wrapped in the link)", () => {
    render(<BucketRow bucket={bucket} href="/dashboard/bucket/food" onPercentChange={noop} onRename={noop} onRecolor={noop} onDelete={noop} />);
    expect(screen.getByLabelText(/food percentage/i)).toBeInTheDocument();
  });
});
