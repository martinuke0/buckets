"use client";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { coachConversationsCol, coachMessagesCol } from "@/lib/model/paths";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface CoachConversation {
  id: string;
  title: string;
  lastMessageAt?: string; // ISO — from Timestamp.toDate().toISOString() on read
}

// Live list of the user's conversations, newest activity first. Single-field
// orderBy(lastMessageAt) → served by Firestore's automatic index, no config.
export function useCoachConversations(): { conversations: CoachConversation[]; loading: boolean } {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    const q = query(collection(getDb(), coachConversationsCol(user.uid)), orderBy("lastMessageAt", "desc"));
    return onSnapshot(q, (snap) => {
      setConversations(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = data.lastMessageAt as { toDate?: () => Date } | undefined;
          return {
            id: d.id,
            title: (data.title as string) || "Untitled chat",
            lastMessageAt: ts?.toDate ? ts.toDate().toISOString() : undefined,
          };
        }),
      );
      setLoading(false);
    });
  }, [user]);

  return { conversations, loading };
}

// Delete one conversation and its messages ONLY. Scoped by construction to
// users/{uid}/conversations/{cid} — never touches coachMemories (goals) or
// coachActions (rebalance idempotency), which live in separate collections.
export async function deleteCoachConversation(uid: string, cid: string): Promise<void> {
  const db = getDb();
  const msgsSnap = await getDocs(collection(db, coachMessagesCol(uid, cid)));
  // ponytail: single batch, fine up to 500 msgs/conversation; chunk if that ceiling is ever hit.
  const batch = writeBatch(db);
  msgsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, `${coachConversationsCol(uid)}/${cid}`));
  await batch.commit();
}
