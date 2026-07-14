import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { PlaidAdapter } from "../../lib/bank/plaidAdapter";
import {
  listConnections,
  saveCursor,
  writeTransactions,
  applyIncomeAdmin,
  getCategoryRules,
  applySpendCategorization,
  setBankMeta,
  type NormalizedTxn,
} from "./store";
import { chooseBucket } from "../../lib/categorize/rules";
import { categorizeWithGemini } from "./categorizer";
import { getFirestore } from "firebase-admin/firestore";

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

  // Load category rules and bucket IDs once per run
  const rules = await getCategoryRules(uid);
  const db = getFirestore();
  const bucketsSnap = await db.collection(`users/${uid}/buckets`).get();
  const bucketIds = bucketsSnap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.id);
  const bucketDocs = bucketsSnap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
    id: d.id,
    name: d.get("name") as string,
  }));

  // Categorization counters
  let ruleHits = 0;
  let geminiHits = 0;
  let noMatch = 0;

  // Process each newly-created transaction
  for (const txn of created) {
    if (txn.isIncome) {
      // Income: auto-split only (existing path)
      await applyIncomeAdmin(uid, txn.amount, txn.providerTxnId);
    } else {
      // Spends: categorize via rules → Gemini. Categorization is advisory: a failure
      // here must never abort the sync (income already split, txns already written).
      // Leave the txn uncategorized (bucketId null) and continue.
      try {
        const decision = chooseBucket(txn.description, rules, bucketIds);

        let bucketId: string | null = null;
        if ("bucketId" in decision) {
          bucketId = decision.bucketId;
          ruleHits++;
        } else {
          // Fallback to Gemini (already best-effort internally)
          const geminiResult = await categorizeWithGemini(txn.description, bucketDocs);
          bucketId = geminiResult.bucketId;
          if (bucketId) {
            geminiHits++;
          } else {
            noMatch++;
          }
        }

        // Apply categorization if we have a bucket
        if (bucketId) {
          const magnitude = Math.abs(txn.amount);
          await applySpendCategorization(uid, txn.providerTxnId, bucketId, magnitude);
        }
      } catch (err) {
        noMatch++;
        console.warn(`syncOneUser(${uid}): categorization skipped for ${txn.providerTxnId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(
    `syncOneUser(${uid}): categorization summary - ruleHits: ${ruleHits}, geminiHits: ${geminiHits}, noMatch: ${noMatch}`
  );

  // Record last-synced for the client-visible status line (best-effort).
  await setBankMeta(uid, { lastSyncedAt: new Date().toISOString() });

  return { added: created.length };
}
