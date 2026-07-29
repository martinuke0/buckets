import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", async (orig) => {
  const actual = await orig<typeof import("@google/genai")>();
  return { ...actual, GoogleGenAI: vi.fn(function () { return { models: { generateContent } }; }) };
});

const bucketDocs = [
  { id: "fun", get: (k: string) => ({ name: "Fun", remaining: 30000, allocated: 60000 } as Record<string, unknown>)[k] },
  { id: "rent", get: (k: string) => ({ name: "Rent", remaining: 50000, allocated: 100000 } as Record<string, unknown>)[k] },
];
const db = {
  collection: (path: string) => ({
    get: async () => (path.endsWith("/buckets") ? { empty: false, docs: bucketDocs } : { docs: [] }),
    where: () => ({ get: async () => ({ docs: [] }) }),
  }),
  doc: () => ({ get: async () => ({ exists: true, get: (k: string) => (k === "currentBalance" ? 80800 : undefined) }) }),
};
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => db }));
vi.mock("../../lib/coach/suggestion", async (orig) => await orig());
vi.mock("./store", () => ({ listCoachMemories: async () => [], writeCoachMemory: async () => {}, applyRebalance: async () => {} }));
vi.mock("./logging", () => ({ logEvent: () => {} }));

import { handleCoachReply } from "./coach";

describe("coachReply two-phase tools", () => {
  beforeEach(() => { generateContent.mockReset(); process.env.GEMINI_API_KEY = "x"; });

  it("runs a tool the model requests, then returns the structured reply", async () => {
    generateContent
      // phase 1: model asks for explain_drift
      .mockResolvedValueOnce({
        functionCalls: [{ name: "explain_drift", args: {} }],
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "explain_drift", args: {} } }] } }],
      })
      // phase 1 round 2: no more calls
      .mockResolvedValueOnce({ functionCalls: undefined, candidates: [{ content: { role: "model", parts: [{ text: "" }] } }] })
      // phase 2: structured answer
      .mockResolvedValueOnce({ text: JSON.stringify({ reply: "Your buckets are €8 short of your balance." }) });

    const result = await handleCoachReply("u1", { message: "why don't my buckets add up?", history: [] });
    expect(result.reply).toContain("€8");
    // three generateContent calls: 1 tool round + 1 no-op check + 1 final
    expect(generateContent).toHaveBeenCalledTimes(3);
    // phase 1 call passed tool declarations
    expect(generateContent.mock.calls[0][0].config.tools).toBeTruthy();
    // phase 2 call passed responseSchema
    expect(generateContent.mock.calls[2][0].config.responseSchema).toBeTruthy();
  });
});
