import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { PlaidAdapter } from "../../lib/bank/plaidAdapter";
import {
  listConnections,
  saveCursor,
  writeTransactions,
  writePendingIncome,
  getCategoryRules,
  applySpendCategorization,
  setBankMeta,
  type NormalizedTxn,
} from "./store";
import { chooseBucket } from "../../lib/categorize/rules";
import { categorizeBatchWithGemini } from "./categorizer";
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
 * @param opts.recordOnly - first-connect catch-up: write transaction rows for
 *   history but do NOT classify spends or prompt on income. These pre-anchor
 *   transactions are already reflected in the real balance the anchor sets, so
 *   classifying them would draw down buckets that the anchor then replaces AND
 *   leave historical txns misleadingly attached to buckets. Classification
 *   happens only on later syncs — i.e. only after the first bucket fill (anchor).
 * @returns { added: number } - count of newly-created transactions
 */
export async function syncOneUser(uid: string, opts?: { recordOnly?: boolean }): Promise<{ added: number }> {
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

  // recordOnly (first-connect catch-up): transaction rows are already written above.
  // Do NOT classify spends or prompt on income — these pre-anchor transactions are
  // baked into the real balance the anchor is about to set. Classify/prompt only on
  // later syncs, i.e. only after the first bucket fill.
  if (opts?.recordOnly) {
    console.log(`syncOneUser(${uid}): recordOnly — wrote ${created.length} txns, no classification`);
    await setBankMeta(uid, { lastSyncedAt: new Date().toISOString() });
    return { added: created.length };
  }

  // 1) Income is NOT auto-split — record pending so the user confirms the split.
  for (const txn of created) {
    if (txn.isIncome) {
      await writePendingIncome(uid, {
        incomeTxId: txn.providerTxnId,
        amount: txn.amount,
        description: txn.description,
        bookedAt: txn.bookedAt,
      });
    }
  }

  // 2) Spends: try the cheap deterministic rules per-spend (free, offline). Anything
  //    the rules can't place is collected and sent to Gemini in ONE bulk request —
  //    per-transaction calls blow through the free-tier rate limit on a real sync.
  const spends = created.filter((t) => !t.isIncome);
  const ruleBucketByTxn = new Map<string, string>(); // providerTxnId -> bucketId (rule hits)
  const needsAI: typeof spends = [];

  for (const txn of spends) {
    const decision = chooseBucket(txn.description, rules, bucketIds);
    if ("bucketId" in decision) {
      ruleBucketByTxn.set(txn.providerTxnId, decision.bucketId);
      ruleHits++;
    } else {
      needsAI.push(txn);
    }
  }

  // One bulk Gemini call for all rule-misses (best-effort: all-null on failure).
  const aiBuckets =
    needsAI.length > 0
      ? await categorizeBatchWithGemini(needsAI.map((t) => t.description), bucketDocs)
      : [];

  // 3) Apply every resolved categorization. A single apply failure must not abort
  //    the rest (income already split, txns already written).
  for (const txn of spends) {
    let bucketId = ruleBucketByTxn.get(txn.providerTxnId) ?? null;
    if (bucketId === null) {
      const aiIdx = needsAI.indexOf(txn);
      bucketId = aiIdx >= 0 ? aiBuckets[aiIdx] ?? null : null;
      if (bucketId) geminiHits++;
      else noMatch++;
    }
    if (!bucketId) continue;
    try {
      await applySpendCategorization(uid, txn.providerTxnId, bucketId, Math.abs(txn.amount));
    } catch (err) {
      console.warn(`syncOneUser(${uid}): apply skipped for ${txn.providerTxnId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `syncOneUser(${uid}): categorization summary - ruleHits: ${ruleHits}, geminiHits: ${geminiHits}, noMatch: ${noMatch} (bulk AI calls: ${needsAI.length > 0 ? 1 : 0})`
  );

  // Refresh the real balance for the drift indicator (best-effort; never re-anchor here).
  let currentBalance: number | undefined;
  try {
    const conns = connections; // already fetched at top
    if (conns.length > 0) currentBalance = await adapter.getBalance(conns[0].accessToken);
  } catch (err) {
    console.warn(`syncOneUser(${uid}): balance refresh skipped:`, err instanceof Error ? err.message : err);
  }
  await setBankMeta(uid, { lastSyncedAt: new Date().toISOString(), ...(currentBalance !== undefined ? { currentBalance } : {}) });

  return { added: created.length };
}
