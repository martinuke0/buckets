import { toCents } from "@/lib/model/money";
import type { BankProvider, NormalizedTxn } from "@/lib/bank/provider";

export interface PlaidLikeTxn {
  transaction_id: string;
  amount: number;                 // Plaid: major units, POSITIVE = money OUT
  name: string;
  date: string;                   // YYYY-MM-DD
  iso_currency_code: string | null;
}

// Plaid sign convention is the inverse of ours. Invert here so the rest of the
// app uses one convention: positive = money in.
export function mapPlaidTxn(p: PlaidLikeTxn): NormalizedTxn {
  const amount = -toCents(p.amount); // invert sign; toCents rounds to integer cents
  return {
    providerTxnId: p.transaction_id,
    amount,
    description: p.name,
    bookedAt: p.date,
    isIncome: amount > 0,
  };
}

// Minimal shape of the Plaid client methods we use (keeps us decoupled from the SDK's types).
interface PlaidClientLike {
  linkTokenCreate(req: unknown): Promise<{ data: { link_token: string } }>;
  itemPublicTokenExchange(req: { public_token: string }): Promise<{ data: { access_token: string; item_id: string } }>;
  transactionsSync(req: { access_token: string; cursor?: string }): Promise<{
    data: { added: PlaidLikeTxn[]; next_cursor: string; has_more: boolean };
  }>;
}

export class PlaidAdapter implements BankProvider {
  constructor(private client: PlaidClientLike) {}

  async createLinkToken(uid: string): Promise<string> {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: uid },
      client_name: "MyBuckets",
      products: ["transactions"],
      country_codes: ["GB", "IE", "ES", "FR", "DE", "NL"],
      language: "en",
    });
    return res.data.link_token;
  }

  async exchangePublicToken(publicToken: string) {
    const res = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: res.data.access_token, itemId: res.data.item_id };
  }

  async syncTransactions(accessToken: string, cursor: string | null) {
    const res = await this.client.transactionsSync({
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
    });
    return {
      added: res.data.added.map(mapPlaidTxn),
      nextCursor: res.data.next_cursor,
      hasMore: res.data.has_more,
    };
  }
}
