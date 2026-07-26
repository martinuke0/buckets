"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { httpsCallable, getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp, getDb } from "@/lib/firebase/client";
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp, doc, setDoc } from "firebase/firestore";
import { coachMessagesCol, coachConversationsCol } from "@/lib/model/paths";
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

// The active conversation id is remembered per-user in localStorage so a reload
// resumes the same thread. "New conversation" just mints a fresh id — nothing is
// written to Firestore until the first message, so empty threads never appear.
const activeKey = (uid: string) => `coach:activeConversation:${uid}`;

function loadActiveConversationId(uid: string): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = window.localStorage.getItem(activeKey(uid));
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  window.localStorage.setItem(activeKey(uid), fresh);
  return fresh;
}

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
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Resolve the active conversation once we have a user (localStorage-backed).
  useEffect(() => {
    setConversationId(user ? loadActiveConversationId(user.uid) : null);
  }, [user]);

  // Switch to a fresh conversation, or open an existing one from history.
  const newConversation = useCallback(() => {
    if (!user) return;
    const id = crypto.randomUUID();
    window.localStorage.setItem(activeKey(user.uid), id);
    setConversationId(id);
  }, [user]);

  const openConversation = useCallback((id: string) => {
    if (!user) return;
    window.localStorage.setItem(activeKey(user.uid), id);
    setConversationId(id);
  }, [user]);

  // Stream persisted messages for the active conversation. Scoped to one
  // conversation's messages subcollection → orderBy(createdAt) alone, no index.
  useEffect(() => {
    if (!user || !conversationId) {
      setMessages([]);
      messagesRef.current = [];
      return;
    }
    const q = query(collection(getDb(), coachMessagesCol(user.uid, conversationId)), orderBy("createdAt", "asc"));
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
  }, [user, conversationId]);

  const send = useCallback(async (text: string) => {
    if (!user || !conversationId) return;
    try {
      setError(null);
      setStreamingText(""); // placeholder bubble becomes visible immediately
      logAction("coach_send");

      // Upsert the conversation summary doc (born on first message; title from
      // the opening message, refreshed lastMessageAt every turn for sort order).
      const isFirst = messagesRef.current.length === 0;
      await setDoc(
        doc(getDb(), `${coachConversationsCol(user.uid)}/${conversationId}`),
        {
          lastMessageAt: Timestamp.now(),
          ...(isFirst ? { title: text.slice(0, 60), createdAt: Timestamp.now() } : {}),
        },
        { merge: true },
      );

      await addDoc(collection(getDb(), coachMessagesCol(user.uid, conversationId)), {
        role: "user",
        text,
        createdAt: Timestamp.now(),
      });

      const history = messagesRef.current.slice(-5).map((m) => ({ role: m.role, text: m.text }));

      const fn = getCoachFunctions();
      const callable = httpsCallable<CoachReplyRequest, CoachReply>(fn, "coachReply");
      const { data } = await callable({ message: text, history });

      // Firestore rejects `undefined`. Only include suggestion + suggestionId when present.
      const coachDoc: Record<string, unknown> = {
        role: "coach",
        text: data.reply,
        createdAt: Timestamp.now(),
      };
      if (data.suggestion && typeof data.suggestion === "object") {
        coachDoc.suggestion = data.suggestion;
        coachDoc.suggestionId = crypto.randomUUID();
      }
      await addDoc(collection(getDb(), coachMessagesCol(user.uid, conversationId)), coachDoc);
    } catch (err) {
      console.error("Coach reply error:", err);
      setError("Failed to get coach response. Please try again.");
    } finally {
      setStreamingText(null); // placeholder disappears; the persisted message renders via onSnapshot
    }
  }, [user, conversationId]);

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
      if (conversationId) {
        try { await updateCoachMessageApplied(user.uid, conversationId, coachMsgId); }
        catch (err) { console.warn("updateCoachMessageApplied skipped:", err instanceof Error ? err.message : err); }
      }

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
  }, [user, conversationId]);

  const dismissJustApplied = useCallback(() => setJustApplied(null), []);

  return { messages, send, apply, applying, error, streamingText, justApplied, dismissJustApplied, conversationId, newConversation, openConversation };
}
