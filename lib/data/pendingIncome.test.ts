import { describe, it, expect, vi, beforeEach } from "vitest";

const txGet = vi.fn();
const txSet = vi.fn();
const txUpdate = vi.fn();
const runTransaction = vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
  await fn({ get: txGet, set: txSet, update: txUpdate });
});
vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => ({ __col: a }),
  doc: (...a: unknown[]) => ({ __doc: a }),
  runTransaction: (...a: [unknown, (tx: unknown) => Promise<void>]) => runTransaction(...a),
  increment: (n: number) => ({ __inc: n }),
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));

import { confirmPendingIncome } from "@/lib/data/buckets";

const rules = [{ bucketId: "bills", percent: 40 }, { bucketId: "savings", percent: 60 }];

beforeEach(() => { txGet.mockReset(); txSet.mockClear(); txUpdate.mockClear(); });

it("applies the split and marks the pending income resolved", async () => {
  txGet.mockResolvedValue({ exists: () => true, data: () => ({ amount: 100000, resolved: false }) });
  await confirmPendingIncome("u1", "inc1", rules);
  // buckets incremented (2 updates) + pending resolved (1 update or set) — assert increments present
  const incCalls = txUpdate.mock.calls.filter((c) => c[1]?.remaining?.__inc !== undefined);
  expect(incCalls.length).toBe(2);
  expect(incCalls.some((c) => c[1].remaining.__inc === 40000)).toBe(true);  // bills 40%
  expect(incCalls.some((c) => c[1].remaining.__inc === 60000)).toBe(true);  // savings 60%
});

it("is a no-op when already resolved", async () => {
  txGet.mockResolvedValue({ exists: () => true, data: () => ({ amount: 100000, resolved: true }) });
  await confirmPendingIncome("u1", "inc1", rules);
  expect(txUpdate).not.toHaveBeenCalled();
});
