import { GoogleGenAI, Type } from "@google/genai";
import { mapBatchResponse } from "../../lib/categorize/batchResponse";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Categorize MANY transactions in a SINGLE Gemini request. Per-transaction calls
// blow through the free-tier rate limit (5 req/min) on any real sync; one bulk
// request with a structured array response stays well under it. Best-effort:
// any failure (rate limit, network, bad JSON, length mismatch) degrades to all-null
// (uncategorized) — never throws, never blocks the money-critical sync.
// Returns an array aligned to `descriptions` (same length/order); each entry is a
// valid bucketId or null.
export async function categorizeBatchWithGemini(
  descriptions: string[],
  buckets: { id: string; name: string }[],
): Promise<(string | null)[]> {
  if (descriptions.length === 0) return [];
  const ids = buckets.map((b) => b.id);
  const nulls = descriptions.map(() => null as string | null);

  const prompt =
    `Assign each bank transaction to the single best-fitting budget bucket.\n` +
    `Buckets:\n${buckets.map((b) => `- ${b.id}: ${b.name}`).join("\n")}\n\n` +
    `Transactions (by index):\n` +
    descriptions.map((d, i) => `${i}: "${d}"`).join("\n") +
    `\n\nReturn one item per transaction index. If none clearly fit, use bucketId "none".`;

  try {
    const res = await ai().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.NUMBER },
              bucketId: { type: Type.STRING, enum: [...ids, "none"] },
            },
            required: ["index", "bucketId"],
          },
        },
      },
    });

    return mapBatchResponse(res.text, descriptions.length, ids);
  } catch (err) {
    console.warn(
      `categorizeBatchWithGemini: falling back to all-uncategorized (${descriptions.length} txns):`,
      err instanceof Error ? err.message : err,
    );
    return nulls;
  }
}

function ai(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
}
