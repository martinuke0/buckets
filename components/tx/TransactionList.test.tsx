import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionList } from "@/components/tx/TransactionList";
import type { Transaction } from "@/lib/model/types";

function makeTxns(n: number): Transaction[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, amount: -1000, description: `Merchant ${i}`,
    bookedAt: "2026-07-14", bucketId: null, isIncome: false,
  }));
}

describe("TransactionList", () => {
  it("shows empty state when there are no transactions", () => {
    render(<TransactionList transactions={[]} />);
    expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument();
  });
  it("renders at most 20 rows, then reveals more with Load more", () => {
    render(<TransactionList transactions={makeTxns(25)} />);
    expect(screen.getByText("Merchant 0")).toBeInTheDocument();
    expect(screen.getByText("Merchant 19")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 20")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(screen.getByText("Merchant 20")).toBeInTheDocument();
    expect(screen.getByText("Merchant 24")).toBeInTheDocument();
  });
  it("hides Load more when all are shown", () => {
    render(<TransactionList transactions={makeTxns(5)} />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
  it("links each row to its transaction detail page", () => {
    render(<TransactionList transactions={makeTxns(1)} />);
    expect(screen.getByRole("link", { name: /merchant 0/i })).toHaveAttribute("href", "/dashboard/tx/t0");
  });
});
