import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./store", () => {
  // One spend that the rules miss (getCategoryRules → []), so it goes to Gemini.
  const spend = { providerTxnId: "t1", amount: -4200, description: "TESCO STORES 12", bookedAt: "2026-07-15", isIncome: false };

  return {
    listConnections: async () => [{ itemId: "i1", accessToken: "a1", cursor: null }],
    saveCursor: async () => {},
    writeTransactions: async () => [spend],
    writePendingIncome: async () => {},
    getCategoryRules: async () => [],
    applySpendCategorization: vi.fn(async () => {}),
    setBankMeta: vi.fn(async () => {}),
    saveCategoryRule: vi.fn(async () => {}),
  };
});
vi.mock("./categorizer", () => ({
  // rule-miss → Gemini places it into "fun"
  categorizeBatchWithGemini: async () => ["fun"],
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: () => ({ get: async () => ({ docs: [{ id: "fun", get: () => "Fun" }] }) }),
  }),
}));
// Adapter: no NEW txns from Plaid (created comes from writeTransactions mock), balance stub.
vi.mock("../../lib/bank/plaidAdapter", () => ({
  PlaidAdapter: vi.fn(function () {
    return {
      syncTransactions: async () => ({ added: [], nextCursor: "c1", hasMore: false }),
      getBalance: async () => 100000,
    };
  }),
}));
vi.mock("plaid", () => ({
  Configuration: vi.fn(), PlaidApi: vi.fn(), PlaidEnvironments: { sandbox: "https://sandbox" },
}));
// rules.ts is NOT mocked — computeSkipLLMPct + normalizeMerchant run for real.

import { syncOneUser } from "./syncCore";
import * as store from "./store";

describe("syncOneUser rule learning + metric", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLAID_CLIENT_ID = "x"; process.env.PLAID_SECRET = "y";
  });

  it("learns a rule from a Gemini placement and persists skipLLMPct", async () => {
    await syncOneUser("u1");
    // rule learned with NORMALIZED merchant ("tesco stores", digits/suffix stripped) + gemini bucket
    expect(store.saveCategoryRule).toHaveBeenCalledWith("u1", "tesco stores", "fun");
    // one spend, placed by Gemini → ruleHits 0 of 1 → skipLLMPct 0
    expect(store.setBankMeta).toHaveBeenCalled();
    const calls = vi.mocked(store.setBankMeta).mock.calls as unknown as Array<[string, { skipLLMPct?: number }]>;
    const metaCall = calls[calls.length - 1][1];
    expect(metaCall.skipLLMPct).toBe(0);
  });
});
