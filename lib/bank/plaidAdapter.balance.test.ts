import { describe, it, expect, vi } from "vitest";
import { PlaidAdapter } from "@/lib/bank/plaidAdapter";

function clientWith(accounts: { type: string; balances: { current: number | null } }[]) {
  return {
    linkTokenCreate: vi.fn(),
    itemPublicTokenExchange: vi.fn(),
    transactionsSync: vi.fn(),
    accountsBalanceGet: vi.fn().mockResolvedValue({ data: { accounts } }),
  };
}

describe("PlaidAdapter.getBalance", () => {
  it("sums depository account current balances into cents", async () => {
    const a = new PlaidAdapter(clientWith([
      { type: "depository", balances: { current: 1000.5 } },
      { type: "depository", balances: { current: 250.25 } },
    ]));
    expect(await a.getBalance("tok")).toBe(125075); // (1000.50 + 250.25) * 100
  });
  it("ignores non-depository accounts (e.g. credit) and null balances", async () => {
    const a = new PlaidAdapter(clientWith([
      { type: "depository", balances: { current: 500 } },
      { type: "credit", balances: { current: 9999 } },
      { type: "depository", balances: { current: null } },
    ]));
    expect(await a.getBalance("tok")).toBe(50000);
  });
});
