import {
  collection, doc, getDocs, writeBatch, runTransaction, increment,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol, txCol, allocationsCol, pendingIncomeCol } from "@/lib/model/paths";
import type { Bucket, Allocation } from "@/lib/model/types";
import type { Cents } from "@/lib/model/money";
import { splitIncome, type SplitRule } from "@/lib/split/engine";
import { deleteBucket } from "@/lib/buckets/edit";
import { balanceShares } from "@/lib/data/anchor";
import { logAction } from "@/lib/observability/breadcrumbs";

export function deriveRules(buckets: Bucket[]): SplitRule[] {
  return buckets.map((b) => ({ bucketId: b.id, percent: b.percent }));
}

export async function listBuckets(uid: string): Promise<Bucket[]> {
  const snap = await getDocs(collection(getDb(), bucketsCol(uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bucket, "id">) }));
}

export async function saveBuckets(uid: string, buckets: Bucket[]): Promise<void> {
  logAction("save_buckets");
  const db = getDb();
  const batch = writeBatch(db);
  for (const b of buckets) {
    const { id, ...rest } = b;
    // If order is not provided, it will be omitted (optional field)
    batch.set(doc(db, bucketsCol(uid), id), rest);
  }
  await batch.commit();
}

export async function applyIncome(uid: string, income: Cents): Promise<Allocation[]> {
  const buckets = await listBuckets(uid);
  const splits = splitIncome(income, deriveRules(buckets));
  const db = getDb();
  const result: Allocation[] = [];

  await runTransaction(db, async (tx) => {
    const incomeRef = doc(collection(db, txCol(uid)));
    tx.set(incomeRef, {
      amount: income, description: "Income", bookedAt: new Date().toISOString(),
      bucketId: null, isIncome: true,
    });
    for (const s of splits) {
      const allocRef = doc(collection(db, allocationsCol(uid)));
      const createdAt = new Date().toISOString();
      tx.set(allocRef, {
        bucketId: s.bucketId, amount: s.amount,
        incomeTxId: incomeRef.id, createdAt,
      });
      result.push({
        id: allocRef.id,
        bucketId: s.bucketId,
        amount: s.amount,
        incomeTxId: incomeRef.id,
        createdAt,
      });
      const bRef = doc(db, bucketsCol(uid), s.bucketId);
      tx.update(bRef, { remaining: increment(s.amount), allocated: increment(s.amount) });
    }
  });

  return result;
}

export async function applySpend(uid: string, bucketId: string, amount: Cents): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const bRef = doc(db, bucketsCol(uid), bucketId);
    tx.update(bRef, { remaining: increment(-amount) });
  });
}

export async function deleteBucketAndRedistribute(uid: string, bucketId: string): Promise<void> {
  // Pre-transaction: get bucket IDs to know which docs to fetch in the transaction
  const bucketIds = (await listBuckets(uid)).map((b) => b.id);

  const db = getDb();
  await runTransaction(db, async (tx) => {
    const deletedRef = doc(db, bucketsCol(uid), bucketId);

    // Step 1: Check if the bucket to delete exists (idempotent)
    const deletedSnap = await tx.get(deletedRef);
    if (!deletedSnap.exists()) {
      return;
    }

    // Step 2: Read all bucket docs transactionally
    const bucketRefs = bucketIds.map((id) => doc(db, bucketsCol(uid), id));
    const bucketSnaps = await Promise.all(bucketRefs.map((ref) => tx.get(ref)));

    // Build current buckets from in-transaction snapshots
    const currentBuckets: Bucket[] = bucketSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...(snap.data() as Omit<Bucket, "id">) }));

    // Step 3: Compute the fold using in-transaction data
    const updatedBuckets = deleteBucket(currentBuckets, bucketId);

    // Step 4: Determine the recipient (same logic as the pure deleteBucket uses)
    const savingsCandidate = currentBuckets.find(
      (b) => b.id !== bucketId && b.name.toLowerCase() === "savings"
    );
    const recipientBucket = savingsCandidate || currentBuckets.find((b) => b.id !== bucketId);

    if (!recipientBucket) {
      throw new Error("No recipient bucket found");
    }

    // Get the updated recipient from the computed set
    const updatedRecipient = updatedBuckets.find((b) => b.id === recipientBucket.id);
    if (!updatedRecipient) {
      throw new Error("Recipient bucket not found in updated set");
    }

    // Step 5: Write phase (all reads complete before any writes)
    const recipientRef = doc(db, bucketsCol(uid), recipientBucket.id);
    tx.delete(deletedRef);
    tx.update(recipientRef, {
      percent: updatedRecipient.percent,
      remaining: updatedRecipient.remaining,
      allocated: updatedRecipient.allocated,
    });
  });
}

export async function confirmPendingIncome(uid: string, pendingId: string, rules: SplitRule[]): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const pendingRef = doc(db, `${pendingIncomeCol(uid)}/${pendingId}`);
    const snap = await tx.get(pendingRef);
    if (!snap.exists() || snap.data()?.resolved === true) return;
    const amount = snap.data()?.amount as number;
    const splits = splitIncome(amount, rules);
    for (const s of splits) {
      const allocRef = doc(collection(db, allocationsCol(uid)));
      tx.set(allocRef, { bucketId: s.bucketId, amount: s.amount, incomeTxId: pendingId, createdAt: new Date().toISOString() });
      tx.update(doc(db, bucketsCol(uid), s.bucketId), { remaining: increment(s.amount), allocated: increment(s.amount) });
    }
    tx.update(pendingRef, { resolved: true });
  });
}

// Re-anchor (drift button): REPLACE bucket balances with the balance partitioned by %.
export async function anchorBucketsToBalance(uid: string, balanceCents: number): Promise<void> {
  // Pre-transaction: get bucket IDs to know which docs to fetch in the transaction
  const bucketIds = (await listBuckets(uid)).map((b) => b.id);

  const db = getDb();
  await runTransaction(db, async (tx) => {
    // Read buckets INSIDE the transaction to avoid concurrent percent/spend changes
    // committing a stale partition (mirroring the server hardening).
    const bucketRefs = bucketIds.map((id) => doc(db, bucketsCol(uid), id));
    const bucketSnaps = await Promise.all(bucketRefs.map((ref) => tx.get(ref)));

    const buckets: Bucket[] = bucketSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...(snap.data() as Omit<Bucket, "id">) }));

    const rules = deriveRules(buckets);
    const shares = balanceShares(balanceCents, rules);
    for (const [bucketId, cents] of shares) {
      tx.update(doc(db, bucketsCol(uid), bucketId), { remaining: cents, allocated: cents });
    }
  });
}
