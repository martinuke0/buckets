"use client";
import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { getFunctions } from "firebase/functions";
import { getFirebaseApp } from "@/lib/firebase/client";
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
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (text: string) => {
    try {
      setError(null);

      // Add user message
      const userMessage: CoachMessage = { role: "user", text };
      setMessages((prev) => [...prev, userMessage]);

      // Build history for context (last 5 messages)
      const history = messages.slice(-5).map((m) => ({ role: m.role, text: m.text }));

      // Call coachReply
      const functions = getCoachFunctions();
      const coachReplyFn = httpsCallable<CoachReplyRequest, CoachReply>(functions, "coachReply");
      const result = await coachReplyFn({ message: text, history });

      // Add coach reply
      const coachMessage: CoachMessage = {
        role: "coach",
        text: result.data.reply,
        suggestion: result.data.suggestion,
        suggestionId: result.data.suggestion ? crypto.randomUUID() : undefined,
      };
      setMessages((prev) => [...prev, coachMessage]);
    } catch (err) {
      console.error("Coach reply error:", err);
      setError("Failed to get coach response. Please try again.");
    }
  }, [messages]);

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
