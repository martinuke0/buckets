import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import { buildCoachContext } from "./coachContext";
import { buildSpendSummary } from "./spendSummary";
import { validateSuggestion, type CoachReply, type CoachSuggestion } from "../../lib/coach/suggestion";
import { applyRebalance, listCoachMemories, writeCoachMemory } from "./store";
import { logEvent } from "./logging";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

interface CoachReplyRequest {
  message: string;
  history?: Array<{ role: "user" | "coach"; text: string }>;
}

/**
 * Callable function: Get AI coach reply with optional rebalance suggestion.
 * Returns { reply: string, suggestion?: CoachSuggestion }.
 *
 * Suggestions are validated server-side; invalid suggestions are dropped.
 */
export const coachReply = onCall<CoachReplyRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const uid = request.auth.uid;
  logEvent("coachReply", { uid, outcome: "start" });

  try {
    const { message } = request.data;

    // Read user's buckets
    const db = getFirestore();
    const bucketsSnap = await db.collection(`users/${uid}/buckets`).get();

    if (bucketsSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "User has no buckets configured"
      );
    }

    const buckets = bucketsSnap.docs.map((d) => ({
      id: d.id,
      name: d.get("name") as string,
      remaining: d.get("remaining") as number,
      allocated: d.get("allocated") as number,
    }));

    // Current-month transactions for the spend summary (spends + income; summary filters).
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const txnsSnap = await db
      .collection(`users/${uid}/transactions`)
      .where("bookedAt", ">=", monthStart)
      .get();
    const txns = txnsSnap.docs.map((d) => ({
      description: d.get("description") as string,
      amount: d.get("amount") as number,
      bookedAt: d.get("bookedAt") as string,
      bucketId: (d.get("bucketId") as string | null) ?? null,
      isIncome: (d.get("isIncome") as boolean) ?? false,
    }));

    const memories = await listCoachMemories(uid);
    const summary = buildSpendSummary(
      buckets.map((b) => ({ id: b.id, name: b.name, allocated: b.allocated, remaining: b.remaining })),
      txns,
      now,
    );
    const { prompt, bucketIds } = buildCoachContext(summary, memories);

    // Construct the full prompt with user message
    const fullPrompt = `${prompt}\n\nUser: ${message}\n\nCoach:`;

    // Call Gemini with structured output
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

    const res = await ai.models.generateContent({
      model: MODEL,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            suggestion: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                type: { type: Type.STRING, enum: ["rebalance"] },
                fromBucketId: { type: Type.STRING, enum: bucketIds },
                toBucketId: { type: Type.STRING, enum: bucketIds },
                amount: { type: Type.NUMBER },
              },
              required: ["type", "fromBucketId", "toBucketId", "amount"],
            },
            memory: { type: Type.STRING, nullable: true },
          },
          required: ["reply"],
        },
      },
    });

    // Parse response
    let parsed: CoachReply;
    try {
      parsed = JSON.parse(res.text ?? "{}");
    } catch {
      throw new HttpsError("internal", "Failed to parse AI response");
    }

    // Persist memory if present (best-effort, before suggestion validation)
    if (typeof parsed.memory === "string" && parsed.memory.trim()) {
      try {
        await writeCoachMemory(uid, parsed.memory);
      } catch (err) {
        console.warn(`coachReply: writeCoachMemory skipped:`, err instanceof Error ? err.message : err);
      }
    }

    // Validate suggestion if present
    if (parsed.suggestion) {
      const validation = validateSuggestion(
        parsed.suggestion,
        buckets.map((b) => ({ id: b.id, remaining: b.remaining }))
      );

      if (!validation.ok) {
        // Drop invalid suggestion - return reply only (memory already persisted)
        console.warn(
          `coachReply: dropping invalid suggestion for user ${uid}: ${validation.reason}`
        );
        logEvent("coachReply", { uid, outcome: "ok", hasSuggestion: false, hasMemory: Boolean(parsed.memory) });
        return { reply: parsed.reply };
      }
    }

    logEvent("coachReply", { uid, outcome: "ok", hasSuggestion: Boolean(parsed.suggestion), hasMemory: Boolean(parsed.memory) });
    return parsed;
  } catch (err) {
    logEvent("coachReply", { uid, outcome: "error", error: err });
    throw err;
  }
});

interface ApplyCoachSuggestionRequest {
  suggestion: CoachSuggestion;
  suggestionId: string;
}

/**
 * Callable function: Apply a coach suggestion.
 * Validates the suggestion against fresh bucket state, then moves funds.
 * Idempotent via suggestionId (client generates a stable id per suggestion).
 */
export const applyCoachSuggestion = onCall<ApplyCoachSuggestionRequest>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;
    logEvent("applyCoachSuggestion", { uid, outcome: "start" });

    const { suggestion, suggestionId } = request.data;

    if (!suggestion || !suggestionId) {
      throw new HttpsError(
        "invalid-argument",
        "Missing suggestion or suggestionId"
      );
    }

    try {
      // Read user's buckets for validation
      const db = getFirestore();
      const bucketsSnap = await db.collection(`users/${uid}/buckets`).get();

      if (bucketsSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          "User has no buckets configured"
        );
      }

      const buckets = bucketsSnap.docs.map((d) => ({
        id: d.id,
        remaining: d.get("remaining") as number,
      }));

      // Validate suggestion against fresh bucket state
      const validation = validateSuggestion(suggestion, buckets);

      if (!validation.ok) {
        throw new HttpsError(
          "failed-precondition",
          `Invalid suggestion: ${validation.reason}`
        );
      }

      // Apply the rebalance (transaction with idempotency + re-validation inside)
      try {
        await applyRebalance(
          uid,
          suggestion.fromBucketId,
          suggestion.toBucketId,
          suggestion.amount,
          suggestionId
        );
      } catch (err) {
        throw new HttpsError(
          "failed-precondition",
          `Failed to apply rebalance: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      logEvent("applyCoachSuggestion", { uid, outcome: "ok" });
      return { ok: true };
    } catch (err) {
      logEvent("applyCoachSuggestion", { uid, outcome: "error", error: err });
      throw err;
    }
  }
);
