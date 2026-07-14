import { describe, it, expect } from "vitest";
import { mapPlaidTxn, PlaidAdapter } from "@/lib/bank/plaidAdapter";

describe("mapPlaidTxn", () => {
  it("inverts Plaid's sign: a positive Plaid amount (outflow) becomes negative cents", () => {
    const t = mapPlaidTxn({ transaction_id: "t1", amount: 12.34, name: "Coffee", date: "2026-07-10", iso_currency_code: "EUR" });
    expect(t.amount).toBe(-1234);
    expect(t.isIncome).toBe(false);
    expect(t.providerTxnId).toBe("t1");
    expect(t.description).toBe("Coffee");
    expect(t.bookedAt).toBe("2026-07-10");
  });
  it("maps a Plaid inflow (negative amount, e.g. salary) to positive cents + isIncome", () => {
    const t = mapPlaidTxn({ transaction_id: "t2", amount: -2000, name: "ACME PAYROLL", date: "2026-07-01", iso_currency_code: "EUR" });
    expect(t.amount).toBe(200000);
    expect(t.isIncome).toBe(true);
  });
  it("rounds fractional cents correctly", () => {
    const t = mapPlaidTxn({ transaction_id: "t3", amount: 0.1, name: "x", date: "2026-07-10", iso_currency_code: "EUR" });
    expect(t.amount).toBe(-10);
  });
});

describe("PlaidAdapter.syncTransactions", () => {
  it("maps added txns and passes through cursor + hasMore", async () => {
    const client = {
      linkTokenCreate: async () => ({ data: { link_token: "lt" } }),
      itemPublicTokenExchange: async () => ({ data: { access_token: "at", item_id: "it" } }),
      transactionsSync: async () => ({ data: {
        added: [{ transaction_id: "t1", amount: 5, name: "Shop", date: "2026-07-10", iso_currency_code: "EUR" }],
        next_cursor: "c2", has_more: false,
      } }),
      accountsBalanceGet: async () => ({ data: { accounts: [] } }),
    };
    const adapter = new PlaidAdapter(client);
    const out = await adapter.syncTransactions("at", null);
    expect(out.added[0].amount).toBe(-500);
    expect(out.nextCursor).toBe("c2");
    expect(out.hasMore).toBe(false);
  });
});
