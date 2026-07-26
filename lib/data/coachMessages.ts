"use client";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { coachMessagesCol } from "@/lib/model/paths";

// Mark a coach message as applied. Best-effort — the money has already moved
// server-side via applyRebalance by the time this runs; the appliedAt marker
// is purely UX so the "Applied" strip persists on reload.
export async function updateCoachMessageApplied(uid: string, cid: string, msgId: string): Promise<void> {
  await updateDoc(doc(getDb(), `${coachMessagesCol(uid, cid)}/${msgId}`), {
    appliedAt: Timestamp.now(),
  });
}
