import { doc, runTransaction, increment, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol, txCol } from "@/lib/model/paths";
import type { Transaction, Bucket } from "@/lib/model/types";
import { normalizeMerchant } from "@/lib/categorize/rules";

export async function recategorize(
  uid: string,
  txn: Transaction,
  newBucketId: string,
  buckets: Bucket[],
): Promise<void> {
  if (txn.bucketId === newBucketId) {
    return;
  }

  const db = getDb();
  const magnitude = Math.abs(txn.amount);

  await runTransaction(db, async (tx) => {
    // Read-before-write: check if old bucket exists (if we need to credit it back)
    if (txn.bucketId) {
      const oldBucketExists = buckets.some((b) => b.id === txn.bucketId);
      if (oldBucketExists) {
        const oldBucketRef = doc(db, bucketsCol(uid), txn.bucketId);
        // Read to satisfy Firestore read-before-write requirement
        await tx.get(oldBucketRef);
        // Credit back to old bucket
        tx.update(oldBucketRef, { remaining: increment(magnitude) });
      }
    }

    // Debit from new bucket
    const newBucketRef = doc(db, bucketsCol(uid), newBucketId);
    // Read to satisfy Firestore read-before-write requirement
    await tx.get(newBucketRef);
    tx.update(newBucketRef, { remaining: increment(-magnitude) });

    // Update transaction's bucketId
    const txnRef = doc(db, txCol(uid), txn.id);
    tx.update(txnRef, { bucketId: newBucketId });

    // Write merchant rule for future syncs
    const merchant = normalizeMerchant(txn.description);
    const ruleRef = doc(db, `categoryRules/${uid}/rules/${merchant}`);
    tx.set(ruleRef, { bucketId: newBucketId });
  });
}
