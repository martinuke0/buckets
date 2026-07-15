"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { coachMemoriesCol } from "@/lib/model/paths";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface CoachMemory {
  id: string;
  text: string;
}

export function useCoachMemories(): { memories: CoachMemory[]; loading: boolean } {
  const { user } = useAuth();
  const [memories, setMemories] = useState<CoachMemory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMemories([]);
      setLoading(false);
      return;
    }

    const q = collection(getDb(), coachMemoriesCol(user.uid));
    return onSnapshot(q, (snap) => {
      setMemories(snap.docs.map((d) => ({ id: d.id, text: d.data().text as string })));
      setLoading(false);
    });
  }, [user]);

  return { memories, loading };
}

export async function deleteCoachMemory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), `${coachMemoriesCol(uid)}/${id}`));
}
