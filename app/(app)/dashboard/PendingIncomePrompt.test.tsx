import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const confirmPendingIncome = vi.fn().mockResolvedValue(undefined);
const mockAuth = { user: { uid: "u1", email: "e" }, loading: false };
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/data/buckets", () => ({
  confirmPendingIncome: (...a: unknown[]) => confirmPendingIncome(...a),
  deriveRules: (bs: { id: string; percent: number }[]) => bs.map((b) => ({ bucketId: b.id, percent: b.percent })),
}));

import { PendingIncomePrompt } from "@/app/(app)/dashboard/PendingIncomePrompt";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "bills", name: "Bills", colorIndex: 0, percent: 40, type: "virtual" as const, remaining: 0, allocated: 0 },
  { id: "savings", name: "Savings", colorIndex: 1, percent: 60, type: "virtual" as const, remaining: 0, allocated: 0 },
];
const pending = [{ id: "inc1", amount: 100000, description: "ACME PAY", bookedAt: "2026-07-14", resolved: false }];

beforeEach(() => confirmPendingIncome.mockClear());

it("shows the received amount and a Confirm that applies the split", () => {
  render(<PendingIncomePrompt pending={pending} buckets={buckets} />);
  expect(screen.getByText(/received/i)).toBeInTheDocument();
  expect(screen.getByText(/€1,000\.00/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
  expect(confirmPendingIncome).toHaveBeenCalledWith("u1", "inc1", [
    { bucketId: "bills", percent: 40 },
    { bucketId: "savings", percent: 60 },
  ]);
});
