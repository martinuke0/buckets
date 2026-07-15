import { onCall, HttpsError, type CallableResponse } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import { buildCoachContext, type CoachTxn } from "./coachContext";
import { buildSpendSummary } from "./spendSummary";
import { validateSuggestion, type CoachSuggestion } from "../../lib/coach/suggestion";
import { applyRebalance, listCoachMemories, writeCoachMemory } from "./store";
import { logEvent } from "./logging";
import { parseCoachReplyStream } from "../../lib/coach/parseReply";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

interface CoachReplyRequest {
  message: string;
  history?: Array<{ role: "user" | "coach"; text: string }>;
}

/**
 * Callable function: Get AI coach reply with optional rebalance suggestion.
 * Streams text chunks to client, returns { fullText: string } with final validated response.
 *
 * Suggestions are validated server-side; invalid suggestions are dropped.
 */
export const coachReply = onCall<CoachReplyRequest, Promise<{ fullText: string }>, string>(
  async (request, response) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const uid = request.auth.uid;
    const { message, history } = request.data;
    logEvent("coachReply", { uid, outcome: "start" });

    try {
      const db = getFirestore();

      // Buckets (existing).
      const bucketsSnap = await db.collection(`users/${uid}/buckets`).get();
      if (bucketsSnap.empty) {
        throw new HttpsError("failed-precondition", "User has no buckets configured");
      }
      const buckets = bucketsSnap.docs.map((d) => ({
        id: d.id,
        name: d.get("name") as string,
        remaining: d.get("remaining") as number,
        allocated: d.get("allocated") as number,
      }));

      // Current-month transactions (existing broadened) + anchor timestamp for isPreAnchor.
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD, grounds the coach in real time
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);
      const txnsSnap = await db
        .collection(`users/${uid}/transactions`)
        .where("bookedAt", ">=", monthStart)
        .get();
      const rawTxns = txnsSnap.docs.map((d) => ({
        description: d.get("description") as string,
        amount: d.get("amount") as number,
        bookedAt: d.get("bookedAt") as string,
        bucketId: (d.get("bucketId") as string | null) ?? null,
        isIncome: (d.get("isIncome") as boolean) ?? false,
      }));

      const metaSnap = await db.doc(`users/${uid}/meta/bank`).get();
      const anchoredAt = (metaSnap.exists ? (metaSnap.get("anchoredAt") as string | undefined) : undefined) ?? undefined;

      // Derive pre-anchor per-txn + take the most recent 30 by bookedAt desc.
      const contextTxns: CoachTxn[] = rawTxns
        .map((t) => ({ ...t, isPreAnchor: anchoredAt ? t.bookedAt < anchoredAt : false }))
        .sort((a, b) => (a.bookedAt < b.bookedAt ? 1 : -1))
        .slice(0, 30);

      const memories = await listCoachMemories(uid);
      const summary = buildSpendSummary(
        buckets.map((b) => ({ id: b.id, name: b.name, allocated: b.allocated, remaining: b.remaining })),
        rawTxns,
        now,
      );
      const { prompt, bucketIds } = buildCoachContext(summary, memories, contextTxns, today);

      // Include the last few conversation turns so the coach has short-term memory
      // across the same session. The client caps history at ~5 (useCoach.ts).
      const historyBlock = history && history.length > 0
        ? `\n\nRecent conversation (oldest first):\n${history
            .map((h) => `${h.role === "user" ? "User" : "Coach"}: ${h.text}`)
            .join("\n")}`
        : "";
      const fullPrompt = `${prompt}${historyBlock}\n\nUser: ${message}\n\nCoach:`;

      // Streaming Gemini call.
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const stream = await ai.models.generateContentStream({
        model: MODEL,
        contents: fullPrompt,
      });

      let fullText = "";
      const canStream = typeof (response as CallableResponse<string> | undefined)?.sendChunk === "function";
      for await (const chunk of stream) {
        const t = typeof chunk.text === "string" ? chunk.text : "";
        if (!t) continue;
        fullText += t;
        if (canStream) {
          // sendChunk returns a Promise; on client abort it can reject asynchronously.
          // Swallow both sync throws and async rejections so the loop keeps accumulating
          // fullText for server-side validation regardless of the client's presence.
          try {
            const maybePromise = (response as CallableResponse<string>).sendChunk(t) as unknown;
            if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
              (maybePromise as Promise<unknown>).catch(() => { /* client aborted */ });
            }
          } catch { /* client aborted (sync throw) */ }
        }
      }

      // Parse the FINAL text (delimiter + JSON footer contract).
      const parsed = parseCoachReplyStream(fullText);

      // Validate suggestion shape server-side against real buckets (existing gate).
      let validSuggestion: CoachSuggestion | undefined;
      const rawSuggestion = parsed.suggestion as Partial<CoachSuggestion> | undefined;
      if (rawSuggestion && typeof rawSuggestion === "object") {
        // Only accept if the model used a known bucket ID for both endpoints.
        if (
          rawSuggestion.type === "rebalance" &&
          typeof rawSuggestion.fromBucketId === "string" &&
          typeof rawSuggestion.toBucketId === "string" &&
          bucketIds.includes(rawSuggestion.fromBucketId) &&
          bucketIds.includes(rawSuggestion.toBucketId) &&
          typeof rawSuggestion.amount === "number"
        ) {
          const candidate = rawSuggestion as CoachSuggestion;
          const check = validateSuggestion(candidate, buckets.map((b) => ({ id: b.id, remaining: b.remaining })));
          if (check.ok) validSuggestion = candidate;
          else console.warn(`coachReply: dropping invalid suggestion for user ${uid}: ${check.reason}`);
        }
      }

      // Best-effort memory persist (existing rule).
      if (typeof parsed.memory === "string" && parsed.memory.trim()) {
        try { await writeCoachMemory(uid, parsed.memory); }
        catch (err) { console.warn(`coachReply: writeCoachMemory skipped:`, err instanceof Error ? err.message : err); }
      }

      logEvent("coachReply", { uid, outcome: "ok", hasSuggestion: Boolean(validSuggestion), hasMemory: Boolean(parsed.memory) });

      // Re-serialize the final text so the client's parse yields the SAME shape the
      // server validated: reply + (only if valid) suggestion + memory.
      const replyOnly = parsed.reply;
      const meta: Record<string, unknown> = {};
      if (validSuggestion) meta.suggestion = validSuggestion;
      if (typeof parsed.memory === "string" && parsed.memory.trim()) meta.memory = parsed.memory;
      const finalText = Object.keys(meta).length > 0
        ? `${replyOnly}\n---META---\n${JSON.stringify(meta)}`
        : replyOnly;

      return { fullText: finalText };
    } catch (err) {
      logEvent("coachReply", { uid, outcome: "error", error: err });
      throw err;
    }
  },
);

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
