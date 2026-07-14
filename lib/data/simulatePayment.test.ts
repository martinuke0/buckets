import { describe, it, expect, vi, beforeEach } from "vitest";

const txSet = vi.fn();
const txUpdate = vi.fn();
const runTransaction = vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
  await fn({ set: txSet, update: txUpdate });
});
vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => ({ __col: a }),
  doc: (...a: unknown[]) => ({ __doc: a }),
  runTransaction: (...a: [unknown, (tx: unknown) => Promise<void>]) => runTransaction(...a),
  increment: (n: number) => ({ __inc: n }),
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));

import { simulatePayment } from "@/lib/data/simulatePayment";

beforeEach(() => { txSet.mockClear(); txUpdate.mockClear(); });

it("writes a negative spend txn and draws down the bucket", async () => {
  await simulatePayment("u1", "food", 899, "Test spend");
  // txn set with negative amount + chosen bucket
  const setArg = txSet.mock.calls[0][1];
  expect(setArg.amount).toBe(-899);
  expect(setArg.bucketId).toBe("food");
  expect(setArg.isIncome).toBe(false);
  // bucket remaining decremented by magnitude
  expect(txUpdate).toHaveBeenCalledWith(expect.anything(), { remaining: { __inc: -899 } });
});
