import {
  collection, doc, getDocs, writeBatch, runTransaction, increment,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol, txCol, allocationsCol } from "@/lib/model/paths";
import type { Bucket, Allocation } from "@/lib/model/types";
import type { Cents } from "@/lib/model/money";
import { splitIncome, type SplitRule } from "@/lib/split/engine";

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
