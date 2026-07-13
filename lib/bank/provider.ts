export interface BankAccount { id: string; name: string; iso: string }

export interface NormalizedTxn {
  providerTxnId: string;
  amount: number;      // integer cents, positive = money IN (our convention)
  description: string;
  bookedAt: string;    // ISO date (YYYY-MM-DD)
  isIncome: boolean;
}

export interface BankProvider {
  createLinkToken(uid: string): Promise<string>;
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  syncTransactions(
    accessToken: string,
    cursor: string | null,
  ): Promise<{ added: NormalizedTxn[]; nextCursor: string; hasMore: boolean }>;
}
