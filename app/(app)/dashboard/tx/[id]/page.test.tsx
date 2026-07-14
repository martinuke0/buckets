import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const recategorize = vi.fn().mockResolvedValue(undefined);
const mockTxns = {
  transactions: [
    { id: "t1", amount: -899, description: "Pet Shop", bookedAt: "2026-07-14", bucketId: null, isIncome: false },
  ],
  loading: false,
};
const mockBuckets = {
  buckets: [
    { id: "food", name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 },
    { id: "fun", name: "Fun", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  ],
  loading: false,
};
const mockAuth = { user: { uid: "u1", email: "e" }, loading: false };

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "t1" }) }));
vi.mock("@/lib/data/useTransactions", () => ({ useTransactions: () => mockTxns }));
vi.mock("@/lib/data/useBuckets", () => ({ useBuckets: () => mockBuckets }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/data/recategorize", () => ({ recategorize: (...a: unknown[]) => recategorize(...a) }));

import TxDetailPage from "@/app/(app)/dashboard/tx/[id]/page";

beforeEach(() => recategorize.mockClear());

it("shows the transaction and a Move to bucket picker for a spend", () => {
  render(<TxDetailPage />);
  expect(screen.getByText("Pet Shop")).toBeInTheDocument();
  expect(screen.getByText("-€8.99")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /food/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /fun/i })).toBeInTheDocument();
});

it("calls recategorize with the chosen bucket", () => {
  render(<TxDetailPage />);
  fireEvent.click(screen.getByRole("button", { name: /food/i }));
  expect(recategorize).toHaveBeenCalledWith("u1", expect.objectContaining({ id: "t1" }), "food", mockBuckets.buckets);
});
