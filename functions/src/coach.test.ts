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

let mockTransactions: Array<{ id: string; get: (k: string) => unknown }> = [];

const db = {
  collection: (path: string) => ({
    get: async () => (path.endsWith("/buckets") ? { empty: false, docs: bucketDocs } : { docs: [] }),
    where: () => ({ get: async () => ({ docs: mockTransactions }) }),
  }),
  doc: () => ({ get: async () => ({ exists: true, get: (k: string) => (k === "currentBalance" ? 80800 : undefined) }) }),
};
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => db }));
vi.mock("../../lib/coach/suggestion", async (orig) => await orig());
vi.mock("./store", () => ({ listCoachMemories: async () => [], writeCoachMemory: async () => {}, applyRebalance: async () => {} }));
vi.mock("./logging", () => ({ logEvent: () => {} }));

import { handleCoachReply } from "./coach";

describe("coachReply two-phase tools", () => {
  beforeEach(() => {
    generateContent.mockReset();
    mockTransactions = [];
    process.env.GEMINI_API_KEY = "x";
  });

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

    // Assert tool result actually reached phase 2
    const phase2Contents = generateContent.mock.calls[2][0].contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    const fnResponseParts = phase2Contents.flatMap((c) => c.parts).filter((p) => "functionResponse" in p);
    expect(fnResponseParts.length).toBeGreaterThan(0);
    // Verify the exact structure: functionResponse.response.result contains the drift value
    const driftResponse = fnResponseParts.find((p) => {
      const fr = p.functionResponse as Record<string, unknown>;
      return fr?.name === "explain_drift";
    });
    expect(driftResponse).toBeDefined();
    const driftResult = ((driftResponse?.functionResponse as Record<string, unknown>)?.response as Record<string, unknown>)?.result as Record<string, unknown>;
    // The drift tool result (balance 80800 - remaining 80000 = 800 cents) must have reached phase 2
    expect(driftResult.drift).toBe(800);
    expect(driftResult.byBucket).toBeDefined();
  });

  it("provides 90-day transaction window to recurring detector, not just current month", async () => {
    // Two Netflix charges, 30 days apart (enough for recurring detection)
    const now = new Date("2024-07-15T12:00:00Z");
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
    mockTransactions = [
      {
        id: "tx1",
        get: (k: string) => ({
          description: "NETFLIX.COM",
          amount: -1499,
          bookedAt: monthAgo.toISOString().slice(0, 10),
          isIncome: false,
        } as Record<string, unknown>)[k],
      },
      {
        id: "tx2",
        get: (k: string) => ({
          description: "NETFLIX.COM",
          amount: -1499,
          bookedAt: now.toISOString().slice(0, 10),
          isIncome: false,
        } as Record<string, unknown>)[k],
      },
    ];

    generateContent
      // phase 1: model asks for find_recurring_charges
      .mockResolvedValueOnce({
        functionCalls: [{ name: "find_recurring_charges", args: {} }],
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "find_recurring_charges", args: {} } }] } }],
      })
      // phase 1 round 2: no more calls
      .mockResolvedValueOnce({ functionCalls: undefined, candidates: [{ content: { role: "model", parts: [{ text: "" }] } }] })
      // phase 2: structured answer
      .mockResolvedValueOnce({ text: JSON.stringify({ reply: "You have recurring charges." }) });

    const result = await handleCoachReply("u1", { message: "what subscriptions do I have?", history: [] });
    expect(result.reply).toContain("recurring");
    expect(generateContent).toHaveBeenCalledTimes(3);

    // Verify find_recurring_charges received multi-month data and detected the recurring pattern
    const phase2Contents = generateContent.mock.calls[2][0].contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    const fnResponseParts = phase2Contents.flatMap((c) => c.parts).filter((p) => "functionResponse" in p);
    const recurringResponse = fnResponseParts.find((p) => {
      const fr = p.functionResponse as Record<string, unknown>;
      return fr?.name === "find_recurring_charges";
    });
    expect(recurringResponse).toBeDefined();
    const recurringResult = ((recurringResponse?.functionResponse as Record<string, unknown>)?.response as Record<string, unknown>)?.result as Array<Record<string, unknown>>;
    // Must have detected netflix as a recurring charge (count ≥ 2)
    expect(recurringResult).toBeDefined();
    expect(recurringResult.length).toBeGreaterThan(0);
    const netflix = recurringResult.find((r) => (r.merchant as string).toLowerCase().includes("netflix"));
    expect(netflix).toBeDefined();
    expect(netflix?.count).toBeGreaterThanOrEqual(2);
  });
});
