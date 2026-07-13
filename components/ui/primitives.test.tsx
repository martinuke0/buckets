import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, SectionLabel, TrustBadge } from "@/components/ui/primitives";

describe("primitives", () => {
  it("Card renders its children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
  it("SectionLabel renders label text", () => {
    render(<SectionLabel>Bank connection</SectionLabel>);
    expect(screen.getByText("Bank connection")).toBeInTheDocument();
  });
  it("TrustBadge renders its message", () => {
    render(<TrustBadge tone="secure">Read-only access</TrustBadge>);
    expect(screen.getByText("Read-only access")).toBeInTheDocument();
  });
});
