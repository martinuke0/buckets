import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { splitIncome, type SplitRule } from "../../lib/split/engine";
import type { CategoryRule } from "../../lib/categorize/rules";

// NormalizedTxn type copied from lib/bank/provider to avoid fragile cross-package import
export interface NormalizedTxn {
  providerTxnId: string;
  amount: number;      // integer cents, positive = money IN (our convention)
  description: string;
  bookedAt: string;    // ISO date (YYYY-MM-DD)
  isIncome: boolean;
}

export async function saveConnection(
  uid: string,
  itemId: string,
  accessToken: string
): Promise<void> {
  await getFirestore()
    .doc(`bankConnections/${uid}/items/${itemId}`)
    .set({
      accessToken,
      cursor: null,
      createdAt: new Date().toISOString(),
    });
}

export async function listConnections(
  uid: string
): Promise<{ itemId: string; accessToken: string; cursor: string | null }[]> {
  const snap = await getFirestore()
    .collection(`bankConnections/${uid}/items`)
    .get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
    itemId: d.id,
    accessToken: d.get("accessToken") as string,
    cursor: d.get("cursor") as string | null,
  }));
}

// Client-readable bank status marker. bankConnections/** is deny-all to clients
// (holds access tokens), so we mirror non-sensitive status to users/{uid}/meta/bank
// (readable by the owner per firestore.rules). No tokens ever land here.
export async function setBankMeta(
  uid: string,
  fields: { connectedAt?: string; lastSyncedAt?: string }
): Promise<void> {
  await getFirestore()
    .doc(`users/${uid}/meta/bank`)
    .set(fields, { merge: true });
}

export async function saveCursor(
  uid: string,
  itemId: string,
  cursor: string
): Promise<void> {
  await getFirestore()
    .doc(`bankConnections/${uid}/items/${itemId}`)
    .update({ cursor });
}

export async function writeTransactions(
  uid: string,
  txns: NormalizedTxn[]
): Promise<NormalizedTxn[]> {
  const db = getFirestore();

  // Read existing transaction IDs first
  const txRef = db.collection(`users/${uid}/transactions`);
  const existingSnap = await txRef.get();
  const existingIds = new Set(existingSnap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.id));

  // Filter to only new transactions
  const newTxns = txns.filter((t) => !existingIds.has(t.providerTxnId));

  if (newTxns.length === 0) {
    return [];
  }

  // Write new transactions
  const batch = db.batch();
  for (const t of newTxns) {
    const ref = db.doc(`users/${uid}/transactions/${t.providerTxnId}`);
    batch.set(ref, {
      amount: t.amount,
      description: t.description,
      bookedAt: t.bookedAt,
      bucketId: null,
      isIncome: t.isIncome,
    });
  }
  await batch.commit();

  return newTxns;
}

export async function applyIncomeAdmin(
  uid: string,
  income: number,
  incomeTxId: string
): Promise<void> {
  const db = getFirestore();

  // Use a deterministic marker doc for idempotency
  const markerRef = db.doc(`users/${uid}/incomeSplits/${incomeTxId}`);

  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    // Check if this income has already been split (idempotency gate)
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) {
      console.log(`applyIncomeAdmin: income ${incomeTxId} already split, skipping`);
      return;
    }

    // Read user's buckets inside the transaction
    const bucketsSnap = await db.collection(`users/${uid}/buckets`).get();

    if (bucketsSnap.empty) {
      console.log(`applyIncomeAdmin: user ${uid} has no buckets, skipping`);
      return;
    }

    const rules: SplitRule[] = bucketsSnap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
      bucketId: d.id,
      percent: d.get("percent") as number,
    }));

    // Validate percents sum to 100
    const total = rules.reduce((sum, r) => sum + r.percent, 0);
    if (Math.abs(total - 100) >= 0.001) {
      console.log(
        `applyIncomeAdmin: user ${uid} bucket percents sum to ${total}, not 100; skipping`
      );
      return;
    }

    // Split the income using the shared engine
    let splits;
    try {
      splits = splitIncome(income, rules);
    } catch (err) {
      console.error(`applyIncomeAdmin: splitIncome failed for user ${uid}:`, err);
      return;
    }

    // Write marker doc (prevent double-split)
    tx.set(markerRef, {
      createdAt: new Date().toISOString(),
    });

    // Write allocations and increment buckets
    for (const s of splits) {
      const allocRef = db.collection(`users/${uid}/allocations`).doc();
      tx.set(allocRef, {
        bucketId: s.bucketId,
        amount: s.amount,
        incomeTxId,
        createdAt: new Date().toISOString(),
      });

      const bucketRef = db.doc(`users/${uid}/buckets/${s.bucketId}`);
      tx.update(bucketRef, {
        remaining: FieldValue.increment(s.amount),
        allocated: FieldValue.increment(s.amount),
      });
    }
  });
}

export async function listConnectedUsers(): Promise<string[]> {
  const db = getFirestore();
  const snap = await db.collection("bankConnections").get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.id);
}

export async function getCategoryRules(uid: string): Promise<CategoryRule[]> {
  const db = getFirestore();
  const snap = await db.collection(`categoryRules/${uid}/rules`).get();
  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
    merchant: d.id,
    bucketId: d.get("bucketId") as string,
  }));
}

export async function saveCategoryRule(
  uid: string,
  merchant: string,
  bucketId: string
): Promise<void> {
  const db = getFirestore();
  await db.doc(`categoryRules/${uid}/rules/${merchant}`).set({ bucketId });
}

export async function applySpendCategorization(
  uid: string,
  txnId: string,
  bucketId: string,
  magnitude: number
): Promise<void> {
  const db = getFirestore();

  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    // Read before write: check if this transaction is already categorized
    const txnRef = db.doc(`users/${uid}/transactions/${txnId}`);
    const txnSnap = await tx.get(txnRef);

    if (!txnSnap.exists) {
      console.log(`applySpendCategorization: txn ${txnId} not found, skipping`);
      return;
    }

    const existingBucketId = txnSnap.get("bucketId");
    const categorizedAt = txnSnap.get("categorizedAt");

    // Idempotency gate: if already categorized to this bucket, no-op
    if (categorizedAt && existingBucketId === bucketId) {
      console.log(
        `applySpendCategorization: txn ${txnId} already categorized to ${bucketId}, skipping`
      );
      return;
    }

    // Set transaction bucketId + categorizedAt marker
    tx.update(txnRef, {
      bucketId,
      categorizedAt: new Date().toISOString(),
    });

    // Decrement bucket remaining (magnitude is positive, spend draws down)
    const bucketRef = db.doc(`users/${uid}/buckets/${bucketId}`);
    tx.update(bucketRef, {
      remaining: FieldValue.increment(-magnitude),
    });
  });
}

export async function applyRebalance(
  uid: string,
  fromId: string,
  toId: string,
  amount: number,
  actionId: string
): Promise<void> {
  const db = getFirestore();

  await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    // Idempotency marker: check if this action has already been applied
    const markerRef = db.doc(`users/${uid}/coachActions/${actionId}`);
    const markerSnap = await tx.get(markerRef);

    if (markerSnap.exists) {
      console.log(`applyRebalance: action ${actionId} already applied, skipping`);
      return;
    }

    // Read both buckets inside the transaction (all reads before writes)
    const fromRef = db.doc(`users/${uid}/buckets/${fromId}`);
    const toRef = db.doc(`users/${uid}/buckets/${toId}`);

    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);

    if (!fromSnap.exists) {
      throw new Error(`Source bucket '${fromId}' not found`);
    }
    if (!toSnap.exists) {
      throw new Error(`Destination bucket '${toId}' not found`);
    }

    // Re-validate at apply time: source bucket must have sufficient remaining balance
    const fromRemaining = fromSnap.get("remaining") as number;
    if (fromRemaining < amount) {
      throw new Error(
        `Insufficient funds: source bucket has ${fromRemaining} cents, need ${amount} cents`
      );
    }

    // All reads complete, now write:
    // 1. Set marker doc (prevent double-apply)
    tx.set(markerRef, {
      createdAt: new Date().toISOString(),
      fromBucketId: fromId,
      toBucketId: toId,
      amount,
    });

    // 2. Move funds: decrement source, increment destination
    tx.update(fromRef, {
      remaining: FieldValue.increment(-amount),
    });

    tx.update(toRef, {
      remaining: FieldValue.increment(amount),
    });
  });
}
