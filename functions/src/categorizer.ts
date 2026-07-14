import { GoogleGenAI, Type } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function categorizeWithGemini(
  description: string,
  buckets: { id: string; name: string }[],
): Promise<{ bucketId: string | null; confidence: number }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const ids = buckets.map((b) => b.id);
  const prompt =
    `Assign this bank transaction to the single best-fitting budget bucket.\n` +
    `Transaction: "${description}"\n` +
    `Buckets:\n${buckets.map((b) => `- ${b.id}: ${b.name}`).join("\n")}\n` +
    `If none clearly fit, return bucketId "none".`;

  // Best-effort: categorization is advisory. Any Gemini failure (rate limit 429,
  // network, bad JSON) must degrade to "uncategorized" — never throw, or it would
  // crash the money-critical sync/connect flow. AI advises, code disposes.
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bucketId: { type: Type.STRING, enum: [...ids, "none"] },
            confidence: { type: Type.NUMBER },
          },
          required: ["bucketId", "confidence"],
        },
      },
    });

    const parsed = JSON.parse(res.text ?? "{}");
    const bucketId = ids.includes(parsed.bucketId) ? parsed.bucketId : null;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    return { bucketId, confidence };
  } catch (err) {
    console.warn(`categorizeWithGemini: falling back to uncategorized:`, err instanceof Error ? err.message : err);
    return { bucketId: null, confidence: 0 };
  }
}
