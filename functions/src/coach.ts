import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI, Type, type Content, type Part } from "@google/genai";
import { buildCoachContext, type CoachTxn } from "./coachContext";
import { buildSpendSummary } from "./spendSummary";
import { validateSuggestion, type CoachSuggestion, type CoachReply } from "../../lib/coach/suggestion";
import { applyRebalance, listCoachMemories, writeCoachMemory } from "./store";
import { logEvent } from "./logging";
import { runCoachTool, coachToolDeclarations, type CoachToolCtx } from "../../lib/coach/tools";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Gemini returns JSON matching our responseSchema. Parse defensively: any malformed
// output (should not happen with a schema, but never crash the call) degrades to an
// empty reply rather than throwing.
function parseStructuredReply(text: string | undefined): CoachReply {
  if (!text) return { reply: "" };
  try {
    const o = JSON.parse(text) as Partial<CoachReply>;
    return {
      reply: typeof o.reply === "string" ? o.reply : "",
      suggestion: o.suggestion,
      memory: typeof o.memory === "string" ? o.memory : undefined,
      citations: Array.isArray(o.citations) ? o.citations : undefined,
    };
  } catch {
    return { reply: "" };
  }
}

interface CoachReplyRequest {
  message: string;
  history?: Array<{ role: "user" | "coach"; text: string }>;
}

/**
 * Callable function: Get AI coach reply with optional rebalance suggestion.
 * Returns a structured { reply, suggestion?, memory? } via Gemini's native responseSchema —
 * no prose wire-protocol to parse. Bucket IDs are enum-constrained to the user's real buckets,
 * so the model cannot emit an unknown bucket; validateSuggestion still gates funds/positivity.
 * Invalid suggestions are dropped.
 */
export const coachReply = onCall<CoachReplyRequest, Promise<CoachReply>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    return handleCoachReply(request.auth.uid, request.data);
  },
);

/**
 * Handler body for coachReply, extracted so it can be unit-tested directly with a
 * plain (uid, data) signature instead of reaching into the onCall wrapper.
 */
export async function handleCoachReply(uid: string, data: CoachReplyRequest): Promise<CoachReply> {
    const { message, history } = data;
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
        id: d.id,
        description: d.get("description") as string,
        amount: d.get("amount") as number,
        bookedAt: d.get("bookedAt") as string,
        bucketId: (d.get("bucketId") as string | null) ?? null,
        isIncome: (d.get("isIncome") as boolean) ?? false,
      }));

      // Recurring-detection window: 90 days, separate from the month-scoped prompt data.
      // find_recurring_charges needs ≥2 charges from the same merchant 25–35 days apart;
      // a monthly subscription bills once per calendar month, so current-month-only data
      // yields count=1 for every merchant and the tool can never fire.
      const recurringWindowStart = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
      const toolTxnsSnap = await db
        .collection(`users/${uid}/transactions`)
        .where("bookedAt", ">=", recurringWindowStart)
        .get();
      const toolTxns = toolTxnsSnap.docs.map((d) => ({
        description: d.get("description") as string,
        amount: d.get("amount") as number,
        bookedAt: d.get("bookedAt") as string,
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
      const { prompt, bucketIds, txnIds } = buildCoachContext(summary, memories, contextTxns, today);

      // Include the last few conversation turns so the coach has short-term memory
      // across the same session. The client caps history at ~5 (useCoach.ts).
      const historyBlock = history && history.length > 0
        ? `\n\nRecent conversation (oldest first):\n${history
            .map((h) => `${h.role === "user" ? "User" : "Coach"}: ${h.text}`)
            .join("\n")}`
        : "";
      const fullPrompt = `${prompt}${historyBlock}\n\nUser: ${message}\n\nCoach:`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

      // Build tool context from data already fetched above.
      const totalAllocated = buckets.reduce((t, b) => t + b.allocated, 0);
      const toolCtx: CoachToolCtx = {
        txns: toolTxns,
        currentRules: totalAllocated > 0
          ? buckets.map((b) => ({ bucketId: b.id, percent: (b.allocated / totalAllocated) * 100 }))
          : [],
        income: totalAllocated,
        currentBalance: (metaSnap.exists ? (metaSnap.get("currentBalance") as number | undefined) : undefined) ?? 0,
        buckets: buckets.map((b) => ({ id: b.id, remaining: b.remaining })),
      };

      // Phase 1 — analysis loop. Tools inform the model; no responseSchema (Gemini
      // rejects tools + forced JSON together). Hard cap: 3 rounds. Wrapped so a tool
      // failure never blocks the final structured answer.
      const contents: Content[] = [
        { role: "user", parts: [{ text: fullPrompt }] },
      ];
      try {
        for (let round = 0; round < 3; round++) {
          const res1 = await ai.models.generateContent({
            model: MODEL,
            contents,
            config: { tools: [{ functionDeclarations: coachToolDeclarations }] },
          });
          const calls = res1.functionCalls;
          if (!calls || calls.length === 0) break;
          contents.push(res1.candidates![0].content as Content);
          for (const c of calls) {
            let response: unknown;
            try { response = runCoachTool(c.name!, (c.args ?? {}) as Record<string, unknown>, toolCtx); }
            catch (err) { response = { error: err instanceof Error ? err.message : String(err) }; }
            contents.push({ role: "user", parts: [{ functionResponse: { name: c.name, response: { result: response } } } as Part] });
          }
        }
      } catch (err) {
        console.warn("coachReply: tool phase failed, continuing to final answer:", err instanceof Error ? err.message : err);
      }

      // Phase 2 — structured answer. responseSchema forces valid JSON — no prose to parse.
      // Bucket IDs are enum-constrained to the user's real buckets, so the model cannot name
      // an unknown bucket. contents now carry any tool results so the model narrates real numbers.
      contents.push({ role: "user", parts: [{ text: "Now answer the user in the required JSON format." }] });
      const res = await ai.models.generateContent({
        model: MODEL,
        contents,
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
                  amount: { type: Type.INTEGER },
                },
                required: ["type", "fromBucketId", "toBucketId", "amount"],
              },
              memory: { type: Type.STRING, nullable: true },
              citations: {
                type: Type.ARRAY,
                nullable: true,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    txnId: { type: Type.STRING, enum: txnIds },
                  },
                  required: ["label", "txnId"],
                },
              },
            },
            required: ["reply"],
          },
        },
      });

      const parsed = parseStructuredReply(res.text);

      // Validate suggestion server-side against real buckets (funds/positivity — the schema
      // already guarantees shape + known bucket IDs). Drop on failure.
      let validSuggestion: CoachSuggestion | undefined;
      if (parsed.suggestion) {
        const check = validateSuggestion(parsed.suggestion, buckets.map((b) => ({ id: b.id, remaining: b.remaining })));
        if (check.ok) validSuggestion = parsed.suggestion;
        else console.warn(`coachReply: dropping invalid suggestion for user ${uid}: ${check.reason}`);
      }

      // Filter citations: keep only those whose txnId is in the shown set.
      const txnIdSet = new Set(txnIds);
      const citations = (parsed.citations ?? [])
        .filter((c) => c && typeof c.label === "string" && typeof c.txnId === "string" && txnIdSet.has(c.txnId))
        .map((c) => ({ label: c.label, txnId: c.txnId }));

      // Best-effort memory persist (existing rule).
      const memory = parsed.memory?.trim() || undefined;
      if (memory) {
        try { await writeCoachMemory(uid, memory); }
        catch (err) { console.warn(`coachReply: writeCoachMemory skipped:`, err instanceof Error ? err.message : err); }
      }

      logEvent("coachReply", { uid, outcome: "ok", hasSuggestion: Boolean(validSuggestion), hasMemory: Boolean(memory), hasCitations: citations.length > 0 });

      return {
        reply: parsed.reply,
        ...(validSuggestion ? { suggestion: validSuggestion } : {}),
        ...(memory ? { memory } : {}),
        ...(citations.length ? { citations } : {}),
      };
    } catch (err) {
      logEvent("coachReply", { uid, outcome: "error", error: err });
      throw err;
    }
}

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
