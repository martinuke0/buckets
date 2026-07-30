import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/coach/MessageBubble";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe("MessageBubble citations", () => {
  it("renders a cited label as a link to the transaction, rest as text", () => {
    render(
      <MessageBubble
        role="coach"
        text="You spent €42 at Tesco this week."
        citations={[{ label: "€42 at Tesco", txnId: "tx_abc" }]}
      />
    );
    const link = screen.getByRole("link", { name: "€42 at Tesco" });
    expect(link).toHaveAttribute("href", "/dashboard/tx/tx_abc");
    expect(screen.getByText(/this week\./)).toBeInTheDocument();
  });

  it("renders plain text when a label is not found in the reply", () => {
    render(
      <MessageBubble role="coach" text="No numbers here." citations={[{ label: "€99", txnId: "tx_x" }]} />
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("No numbers here.")).toBeInTheDocument();
  });

  it("renders plain text for a coach message with no citations", () => {
    render(<MessageBubble role="coach" text="Just advice." />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Just advice.")).toBeInTheDocument();
  });
});
