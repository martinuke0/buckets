import {
  collection, doc, getDocs, writeBatch, runTransaction, increment, deleteDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol, txCol, allocationsCol } from "@/lib/model/paths";
import type { Bucket, Allocation } from "@/lib/model/types";
import type { Cents } from "@/lib/model/money";
import { splitIncome, type SplitRule } from "@/lib/split/engine";
import { deleteBucket } from "@/lib/buckets/edit";

export function deriveRules(buckets: Bucket[]): SplitRule[] {
  return buckets.map((b) => ({ bucketId: b.id, percent: b.percent }));
}

export async function listBuckets(uid: string): Promise<Bucket[]> {
  const snap = await getDocs(collection(getDb(), bucketsCol(uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bucket, "id">) }));
}

export async function saveBuckets(uid: string, buckets: Bucket[]): Promise<void> {
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
  const buckets = await listBuckets(uid);

  // Compute the target bucket set using the pure deleteBucket function
  const updatedBuckets = deleteBucket(buckets, bucketId);

  // Find the deleted bucket and the recipient bucket
  const deletedBucket = buckets.find((b) => b.id === bucketId);
  if (!deletedBucket) {
    // Idempotent: if the bucket is already gone, no-op
    return;
  }

  // Find the recipient bucket (the one that received the folded values)
  const savingsCandidate = buckets.find(
    (b) => b.id !== bucketId && b.name.toLowerCase() === "savings"
  );
  const recipientBucket = savingsCandidate || buckets.find((b) => b.id !== bucketId);

  if (!recipientBucket) {
    throw new Error("No recipient bucket found");
  }

  // Get the updated recipient from the computed set
  const updatedRecipient = updatedBuckets.find((b) => b.id === recipientBucket.id);
  if (!updatedRecipient) {
    throw new Error("Recipient bucket not found in updated set");
  }

  const db = getDb();
  await runTransaction(db, async (tx) => {
    // Read-before-write: read both affected documents first
    const deletedRef = doc(db, bucketsCol(uid), bucketId);
    const recipientRef = doc(db, bucketsCol(uid), recipientBucket.id);

    const deletedSnap = await tx.get(deletedRef);
    const recipientSnap = await tx.get(recipientRef);

    // Idempotent: if the bucket doc no longer exists, no-op
    if (!deletedSnap.exists()) {
      return;
    }

    if (!recipientSnap.exists()) {
      throw new Error("Recipient bucket document does not exist");
    }

    // Delete the bucket document
    tx.delete(deletedRef);

    // Update the recipient bucket with the folded values
    tx.update(recipientRef, {
      percent: updatedRecipient.percent,
      remaining: updatedRecipient.remaining,
      allocated: updatedRecipient.allocated,
    });
  });
}
