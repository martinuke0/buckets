"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { getFunctions } from "firebase/functions";
import { getFirebaseApp, getDb } from "@/lib/firebase/client";
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { coachMessagesCol } from "@/lib/model/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { CoachSuggestion, CoachReply } from "./suggestion";

interface CoachMessage {
  role: "user" | "coach";
  text: string;
  suggestion?: CoachSuggestion;
  suggestionId?: string;
}

interface CoachReplyRequest {
  message: string;
  history?: Array<{ role: "user" | "coach"; text: string }>;
}

interface ApplyCoachSuggestionRequest {
  suggestion: CoachSuggestion;
  suggestionId: string;
}

interface CoachMessageDoc {
  role: "user" | "coach";
  text: string;
  suggestion?: CoachSuggestion;
  suggestionId?: string;
  // Client-only writer/reader: Firestore Timestamp is intentional (ordered by
  // orderBy("createdAt")). Do NOT append coachMessages server-side with an ISO
  // string — mixed Timestamp/string types sort in separate groups and break order.
  createdAt: Timestamp;
}

let emulatorConnected = false;

function getCoachFunctions() {
  const functions = getFunctions(getFirebaseApp());
  if (process.env.NODE_ENV === "development" && !emulatorConnected) {
    try {
      const { connectFunctionsEmulator } = require("firebase/functions");
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      emulatorConnected = true;
    } catch {
      // Already connected
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

  // Stream messages from Firestore
  useEffect(() => {
    if (!user) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(getDb(), coachMessagesCol(user.uid)),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => {
        const data = d.data() as CoachMessageDoc;
        return {
          role: data.role,
          text: data.text,
          suggestion: data.suggestion,
          suggestionId: data.suggestionId,
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

      // Write user message to Firestore
      await addDoc(collection(getDb(), coachMessagesCol(user.uid)), {
        role: "user",
        text,
        createdAt: Timestamp.now(),
      } as CoachMessageDoc);

      // Build history for context (last 5 messages)
      const history = messagesRef.current.slice(-5).map((m) => ({ role: m.role, text: m.text }));

      // Call coachReply
      const functions = getCoachFunctions();
      const coachReplyFn = httpsCallable<CoachReplyRequest, CoachReply>(functions, "coachReply");
      const result = await coachReplyFn({ message: text, history });

      // Generate suggestionId once if suggestion is present
      const suggestionId = result.data.suggestion ? crypto.randomUUID() : undefined;

      // Write coach message to Firestore
      await addDoc(collection(getDb(), coachMessagesCol(user.uid)), {
        role: "coach",
        text: result.data.reply,
        suggestion: result.data.suggestion,
        suggestionId,
        createdAt: Timestamp.now(),
      } as CoachMessageDoc);
    } catch (err) {
      console.error("Coach reply error:", err);
      setError("Failed to get coach response. Please try again.");
    }
  }, [user]);

  const apply = useCallback(async (suggestion: CoachSuggestion, suggestionId: string) => {
    try {
      setApplying(true);
      setError(null);

      const functions = getCoachFunctions();
      const applyFn = httpsCallable<ApplyCoachSuggestionRequest, { ok: boolean }>(
        functions,
        "applyCoachSuggestion"
      );
      await applyFn({ suggestion, suggestionId });
    } catch (err) {
      console.error("Apply suggestion error:", err);
      setError("Failed to apply suggestion. Please try again.");
      throw err;
    } finally {
      setApplying(false);
    }
  }, []);

  return {
    messages,
    send,
    apply,
    applying,
    error,
  };
}
