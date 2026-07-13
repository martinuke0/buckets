import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { PlaidAdapter } from "../../lib/bank/plaidAdapter";
import {
  listConnections,
  saveCursor,
  writeTransactions,
  applyIncomeAdmin,
  type NormalizedTxn,
} from "./store";

// Build Plaid client from environment variables
function createPlaidAdapter(): PlaidAdapter {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";

  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  const client = new PlaidApi(configuration);
  return new PlaidAdapter(client);
}

/**
 * Syncs all bank transactions for a single user across all their connected accounts.
 * For each connection:
 * - Fetches new transactions from Plaid (paginated via cursor)
 * - Writes new transactions to Firestore
 * - Auto-splits income transactions into user's buckets
 *
 * @returns { added: number } - count of newly-created transactions
 */
export async function syncOneUser(uid: string): Promise<{ added: number }> {
  const adapter = createPlaidAdapter();
  const connections = await listConnections(uid);

  const allAdded: NormalizedTxn[] = [];

  // Loop through each connected bank account
  for (const conn of connections) {
    let cursor = conn.cursor;
    let hasMore = true;

    // Paginate through all available transactions
    while (hasMore) {
      const result = await adapter.syncTransactions(conn.accessToken, cursor);
      allAdded.push(...result.added);
      cursor = result.nextCursor;
      hasMore = result.hasMore;
    }

    // Save the final cursor position for this connection
    if (cursor) {
      await saveCursor(uid, conn.itemId, cursor);
    }
  }

  // Write all collected transactions, returns only newly-created ones
  const created = await writeTransactions(uid, allAdded);

  // Auto-split each newly-created income transaction into buckets
  for (const txn of created) {
    if (txn.isIncome) {
      await applyIncomeAdmin(uid, txn.amount, txn.providerTxnId);
    }
  }

  return { added: created.length };
}
