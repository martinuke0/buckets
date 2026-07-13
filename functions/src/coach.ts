import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import { buildCoachContext } from "./coachContext";
import { validateSuggestion, type CoachReply } from "../../lib/coach/suggestion";

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

  // Read a few recent transactions
  const txnsSnap = await db
    .collection(`users/${uid}/transactions`)
    .orderBy("bookedAt", "desc")
    .limit(5)
    .get();

  const recentTxns = txnsSnap.docs.map((d) => ({
    description: d.get("description") as string,
    amount: d.get("amount") as number,
    bookedAt: d.get("bookedAt") as string,
  }));

  // Build context for Gemini
  const { prompt, bucketIds } = buildCoachContext(buckets, recentTxns);

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

  // Validate suggestion if present
  if (parsed.suggestion) {
    const validation = validateSuggestion(
      parsed.suggestion,
      buckets.map((b) => ({ id: b.id, remaining: b.remaining }))
    );

    if (!validation.ok) {
      // Drop invalid suggestion - return reply only
      console.warn(
        `coachReply: dropping invalid suggestion for user ${uid}: ${validation.reason}`
      );
      return { reply: parsed.reply };
    }
  }

  return parsed;
});
