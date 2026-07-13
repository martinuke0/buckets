import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BucketMenu } from "@/components/buckets/BucketMenu";
import type { Bucket } from "@/lib/model/types";

const bucket: Bucket = { id: "food", name: "Food", colorIndex: 2, percent: 15, type: "virtual", remaining: 0, allocated: 0 };

describe("BucketMenu", () => {
  it("fires onDelete", () => {
    const onDelete = vi.fn();
    render(<BucketMenu bucket={bucket} onRename={vi.fn()} onRecolor={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    // confirm step:
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onDelete).toHaveBeenCalled();
  });
  it("recolor calls onRecolor with a palette index", () => {
    const onRecolor = vi.fn();
    render(<BucketMenu bucket={bucket} onRename={vi.fn()} onRecolor={onRecolor} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /recolor/i }));
    fireEvent.click(screen.getByTestId("color-1"));
    expect(onRecolor).toHaveBeenCalledWith(1);
  });
});
