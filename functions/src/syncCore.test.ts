import { describe, it, expect, vi, beforeEach } from "vitest";

// One spend that the rules miss (getCategoryRules → []), so it goes to Gemini.
const spend = { providerTxnId: "t1", amount: -4200, description: "TESCO STORES 12", bookedAt: "2026-07-15", isIncome: false };

vi.mock("./store", () => {
  const mockGetCategoryRules = vi.fn(async () => []);
  const mockApplySpendCategorization = vi.fn(async () => {});
  const mockSetBankMeta = vi.fn(async () => {});
  const mockSaveCategoryRule = vi.fn(async () => {});

  return {
    listConnections: async () => [{ itemId: "i1", accessToken: "a1", cursor: null }],
    saveCursor: async () => {},
    writeTransactions: async () => [spend],
    writePendingIncome: async () => {},
    getCategoryRules: mockGetCategoryRules,
    applySpendCategorization: mockApplySpendCategorization,
    setBankMeta: mockSetBankMeta,
    saveCategoryRule: mockSaveCategoryRule,
  };
});
vi.mock("./categorizer", () => {
  const mockCategorizeBatchWithGemini = vi.fn(async () => ["fun"]);
  return {
    categorizeBatchWithGemini: mockCategorizeBatchWithGemini,
  };
});
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
import * as categorizer from "./categorizer";

describe("syncOneUser rule learning + metric", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to default behavior
    vi.mocked(store.getCategoryRules).mockResolvedValue([]);
    vi.mocked(categorizer.categorizeBatchWithGemini).mockResolvedValue(["fun"]);
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

  it("skips rule learning for a rule-hit", async () => {
    // Setup: make getCategoryRules return a rule that matches
    vi.mocked(store.getCategoryRules).mockResolvedValueOnce([{ merchant: "tesco stores", bucketId: "fun" }]);

    await syncOneUser("u1");

    // Assert: saveCategoryRule was NOT called (no learning on rule-hit)
    expect(store.saveCategoryRule).not.toHaveBeenCalled();

    // Assert: skipLLMPct is 100 (1 rule hit of 1 spend)
    const calls = vi.mocked(store.setBankMeta).mock.calls as unknown as Array<[string, { skipLLMPct?: number }]>;
    const metaCall = calls[calls.length - 1][1];
    expect(metaCall.skipLLMPct).toBe(100);
  });

  it("skips rule learning for a noMatch", async () => {
    // Setup: Gemini returns null (couldn't place it), no rules available
    vi.mocked(store.getCategoryRules).mockResolvedValueOnce([]);
    vi.mocked(categorizer.categorizeBatchWithGemini).mockResolvedValueOnce([null]);

    await syncOneUser("u1");

    // Assert: saveCategoryRule was NOT called (no learning on noMatch)
    expect(store.saveCategoryRule).not.toHaveBeenCalled();

    // Assert: skipLLMPct is 0 (0 of 1 - neither rule hit nor Gemini hit)
    const calls = vi.mocked(store.setBankMeta).mock.calls as unknown as Array<[string, { skipLLMPct?: number }]>;
    const metaCall = calls[calls.length - 1][1];
    expect(metaCall.skipLLMPct).toBe(0);
  });

  it("continues the sync if rule learning throws", async () => {
    // Setup: Gemini hit (as in first test), but saveCategoryRule throws
    vi.mocked(store.getCategoryRules).mockResolvedValueOnce([]);
    vi.mocked(categorizer.categorizeBatchWithGemini).mockResolvedValueOnce(["fun"]);
    vi.mocked(store.saveCategoryRule).mockRejectedValueOnce(new Error("Firestore timeout"));

    // Act + Assert: should not throw
    await expect(syncOneUser("u1")).resolves.not.toThrow();

    // Assert: applySpendCategorization was still called (sync continued)
    expect(store.applySpendCategorization).toHaveBeenCalled();
  });
});
