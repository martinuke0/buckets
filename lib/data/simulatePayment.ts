import { collection, doc, runTransaction, increment } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol, txCol } from "@/lib/model/paths";

// Dev/testing helper: write a real spend transaction against a chosen bucket and
// draw its remaining down, exactly like a synced spend. Surfaced only behind a
// dev-gated button; not used in production.
export async function simulatePayment(
  uid: string,
  bucketId: string,
  cents: number,
  description: string,
): Promise<void> {
  const db = getDb();
  const magnitude = Math.abs(Math.round(cents));
  await runTransaction(db, async (tx) => {
    const txnRef = doc(collection(db, txCol(uid)));
    tx.set(txnRef, {
      amount: -magnitude,
      description,
      bookedAt: new Date().toISOString().slice(0, 10),
      bucketId,
      isIncome: false,
    });
    const bRef = doc(db, bucketsCol(uid), bucketId);
    tx.update(bRef, { remaining: increment(-magnitude) });
  });
}
