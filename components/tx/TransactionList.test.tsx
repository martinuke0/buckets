import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionList } from "@/components/tx/TransactionList";
import type { Transaction } from "@/lib/model/types";

const txns: Transaction[] = [
  { id: "t1", amount: 200000, description: "ACME PAYROLL", bookedAt: "2026-07-01", bucketId: null, isIncome: true },
  { id: "t2", amount: -1234, description: "Coffee", bookedAt: "2026-07-10", bucketId: null, isIncome: false },
];

describe("TransactionList", () => {
  it("renders each transaction with description and formatted amount", () => {
    render(<TransactionList transactions={txns} />);
    expect(screen.getByText("ACME PAYROLL")).toBeInTheDocument();
    expect(screen.getByText("€2,000.00")).toBeInTheDocument();
    expect(screen.getByText("-€12.34")).toBeInTheDocument();
  });
  it("shows an empty state when there are no transactions", () => {
    render(<TransactionList transactions={[]} />);
    expect(screen.getByText(/connect a bank/i)).toBeInTheDocument();
  });
  it("renders a bucket selector per spend and calls onRecategorize on change", () => {
    const onRecategorize = vi.fn();
    const buckets = [
      { id: "food", name: "Food", colorIndex: 0, percent: 100, type: "virtual" as const, remaining: 0, allocated: 0 },
      { id: "fun", name: "Fun", colorIndex: 1, percent: 0, type: "virtual" as const, remaining: 0, allocated: 0 },
    ];
    render(<TransactionList transactions={[{ id: "t2", amount: -1234, description: "Coffee", bookedAt: "2026-07-10", bucketId: "food", isIncome: false }]}
      buckets={buckets} onRecategorize={onRecategorize} />);
    fireEvent.change(screen.getByTestId("recat-t2"), { target: { value: "fun" } });
    expect(onRecategorize).toHaveBeenCalledWith("t2", "fun");
  });
});
