"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { httpsCallable, getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp, getDb } from "@/lib/firebase/client";
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { coachMessagesCol } from "@/lib/model/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { CoachSuggestion, CoachReply } from "./suggestion";
import { updateCoachMessageApplied } from "@/lib/data/coachMessages";
import { logAction } from "@/lib/observability/breadcrumbs";

export interface CoachMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  suggestion?: CoachSuggestion;
  suggestionId?: string;
  appliedAt?: string; // ISO — from Timestamp.toDate().toISOString() on read
}

interface CoachReplyRequest {
  message: string;
  history?: Array<{ role: "user" | "coach"; text: string }>;
}


let emulatorConnected = false;

function getCoachFunctions() {
  const functions = getFunctions(getFirebaseApp());
  if (process.env.NODE_ENV === "development" && !emulatorConnected) {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      emulatorConnected = true;
    } catch {
      /* already connected */
    }
  }
  return functions;
}

export function useCoach() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const messagesRef = useRef<CoachMessage[]>([]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [justApplied, setJustApplied] = useState<{ suggestionId: string; from: string; to: string; amount: number } | null>(null);

  // Stream persisted messages from Firestore.
  useEffect(() => {
    if (!user) {
      setMessages([]);
      messagesRef.current = [];
      return;
    }
    const q = query(collection(getDb(), coachMessagesCol(user.uid)), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const msgs: CoachMessage[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const appliedAtRaw = data.appliedAt as { toDate?: () => Date } | undefined;
        return {
          id: d.id,
          role: data.role as CoachMessage["role"],
          text: data.text as string,
          suggestion: data.suggestion as CoachSuggestion | undefined,
          suggestionId: data.suggestionId as string | undefined,
          appliedAt: appliedAtRaw?.toDate ? appliedAtRaw.toDate().toISOString() : undefined,
        };
      });
      setMessages(msgs);
      messagesRef.current = msgs;
    });
  }, [user]);

  const send = useCallback(async (text: string) => {
    if (!user) return;
    try {
      setError(null);
      setStreamingText(""); // placeholder bubble becomes visible immediately
      logAction("coach_send");

      await addDoc(collection(getDb(), coachMessagesCol(user.uid)), {
        role: "user",
        text,
        createdAt: Timestamp.now(),
      });

      const history = messagesRef.current.slice(-5).map((m) => ({ role: m.role, text: m.text }));

      const fn = getCoachFunctions();
      const callable = httpsCallable<CoachReplyRequest, CoachReply>(fn, "coachReply");
      const { data } = await callable({ message: text, history });

      // Firestore rejects `undefined`. Only include suggestion + suggestionId when present.
      const doc: Record<string, unknown> = {
        role: "coach",
        text: data.reply,
        createdAt: Timestamp.now(),
      };
      if (data.suggestion && typeof data.suggestion === "object") {
        doc.suggestion = data.suggestion;
        doc.suggestionId = crypto.randomUUID();
      }
      await addDoc(collection(getDb(), coachMessagesCol(user.uid)), doc);
    } catch (err) {
      console.error("Coach reply error:", err);
      setError("Failed to get coach response. Please try again.");
    } finally {
      setStreamingText(null); // placeholder disappears; the persisted message renders via onSnapshot
    }
  }, [user]);

  const apply = useCallback(async (suggestion: CoachSuggestion, suggestionId: string, coachMsgId: string) => {
    if (!user) return;
    try {
      setApplying(true);
      setError(null);
      logAction("apply_suggestion");

      const fn = getCoachFunctions();
      const applyFn = httpsCallable<{ suggestion: CoachSuggestion; suggestionId: string }, { ok: boolean }>(fn, "applyCoachSuggestion");
      await applyFn({ suggestion, suggestionId });

      // Best-effort UX marker; do NOT throw on failure — money already moved.
      try { await updateCoachMessageApplied(user.uid, coachMsgId); }
      catch (err) { console.warn("updateCoachMessageApplied skipped:", err instanceof Error ? err.message : err); }

      setJustApplied({
        suggestionId,
        from: suggestion.fromBucketId,
        to: suggestion.toBucketId,
        amount: suggestion.amount,
      });
    } catch (err) {
      console.error("Apply suggestion error:", err);
      setError("Failed to apply suggestion. Please try again.");
      throw err;
    } finally {
      setApplying(false);
    }
  }, [user]);

  const dismissJustApplied = useCallback(() => setJustApplied(null), []);

  return { messages, send, apply, applying, error, streamingText, justApplied, dismissJustApplied };
}
