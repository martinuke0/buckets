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

  it("chips multiple distinct citations in one reply", () => {
    render(
      <MessageBubble
        role="coach"
        text="Fun spent €42, Rent spent €900."
        citations={[
          { label: "€42", txnId: "tx_fun" },
          { label: "€900", txnId: "tx_rent" },
        ]}
      />
    );
    expect(screen.getByRole("link", { name: "€42" })).toHaveAttribute("href", "/dashboard/tx/tx_fun");
    expect(screen.getByRole("link", { name: "€900" })).toHaveAttribute("href", "/dashboard/tx/tx_rent");
  });

  it("chips only the first occurrence when a label appears twice", () => {
    render(
      <MessageBubble
        role="coach"
        text="€42 here and €42 there."
        citations={[{ label: "€42", txnId: "tx_a" }]}
      />
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/tx/tx_a");
    // the second "€42" remains as plain text — the full sentence tail is present
    expect(screen.getByText(/there\./)).toBeInTheDocument();
  });

  it("does not double-render when one label overlaps another at the same start", () => {
    render(
      <MessageBubble
        role="coach"
        text="You spent €42 at Tesco."
        citations={[
          { label: "€42 at Tesco", txnId: "tx_long" },
          { label: "€42", txnId: "tx_short" },
        ]}
      />
    );
    // exactly one chip renders (the overlap guard drops the second); no corrupted/duplicated text
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    // the longer label wins; text reads correctly end-to-end
    expect(screen.getByText(/You spent/)).toBeInTheDocument();
    expect(screen.getByText(/\./)).toBeInTheDocument();
    // verify the chip contains the longer label (it won the overlap)
    expect(links[0]).toHaveTextContent("€42 at Tesco");
  });
});
