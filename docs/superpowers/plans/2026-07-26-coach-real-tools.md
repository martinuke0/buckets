# Coach Real Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the coach three deterministic analysis tools (recurring charges, month simulation, balance drift) via native Gemini function calling, so the model computes real numbers instead of narrating guesses.

**Architecture:** `coachReply` runs two phases. Phase 1 is a tools-enabled `generateContent` loop (max 3 rounds) where the model requests tools, we run pure functions and feed results back. Phase 2 is the existing single `generateContent` with `responseSchema`, producing the unchanged `{ reply, suggestion?, memory? }` contract. Rebalance stays a phase-2 schema field, not a tool.

**Tech Stack:** TypeScript, `@google/genai` (v2.11), Firebase Cloud Functions v2, Vitest (root config, `@` → repo root; covers `functions/src`).

## Global Constraints

- Money is integer cents everywhere (`Cents = number`, `lib/model/money.ts`). Never floats.
- Tools are **pure** and live in `lib/coach/tools/` (client-side lib), so they unit-test without the functions emulator — same home as `engine.ts` / `rules.ts`.
- No new dependencies. No tool registry/framework — dispatch is a `switch` over 3 names.
- Rebalance is NEVER a declared tool. It remains the phase-2 `responseSchema` field gated by `validateSuggestion`. Do not touch the apply/money path.
- Client contract (`CoachReply` = `{ reply, suggestion?, memory? }`) is unchanged. No client edits.
- Phase 2 always runs, even if phase 1 throws — degrades to today's single-call behavior.
- A tool that throws returns `{ error: string }` as its `functionResponse`; the callable never crashes.
- Loop hard cap: 3 tool rounds.
- Test style: Vitest `import { describe, it, expect } from "vitest"`, `@`-aliased imports.

---

### Task 1: `find_recurring_charges` pure tool

**Files:**
- Create: `lib/coach/tools/recurring.ts`
- Test: `lib/coach/tools/recurring.test.ts`

**Interfaces:**
- Consumes: `normalizeMerchant` from `@/lib/categorize/rules`.
- Produces: `export interface RecurringCharge { merchant: string; amount: number; count: number }` and `export function findRecurringCharges(txns: { description: string; amount: number; bookedAt: string; isIncome: boolean }[]): RecurringCharge[]`.

Detection rule (pin the loose spec): group non-income txns by `normalizeMerchant(description)`. A merchant is recurring when it has **≥2** charges whose consecutive `bookedAt` gaps are all within **25–35 days**. `amount` = the absolute value of the most recent charge (integer cents); `count` = number of charges in the group. Sorted by `count` desc, then `merchant` asc.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { findRecurringCharges } from "@/lib/coach/tools/recurring";

describe("findRecurringCharges", () => {
  it("flags a merchant billed ~monthly, most-recent amount, integer cents", () => {
    const txns = [
      { description: "NETFLIX *123", amount: -1599, bookedAt: "2026-05-03", isIncome: false },
      { description: "netflix", amount: -1599, bookedAt: "2026-06-02", isIncome: false },
      { description: "Netflix#77", amount: -1699, bookedAt: "2026-07-02", isIncome: false },
    ];
    expect(findRecurringCharges(txns)).toEqual([{ merchant: "netflix", amount: 1699, count: 3 }]);
  });

  it("ignores one-off charges and income", () => {
    const txns = [
      { description: "CORNER SHOP", amount: -450, bookedAt: "2026-07-01", isIncome: false },
      { description: "ACME PAYROLL", amount: 250000, bookedAt: "2026-07-01", isIncome: true },
    ];
    expect(findRecurringCharges(txns)).toEqual([]);
  });

  it("does not flag two charges only 5 days apart", () => {
    const txns = [
      { description: "GYM", amount: -3000, bookedAt: "2026-07-01", isIncome: false },
      { description: "GYM", amount: -3000, bookedAt: "2026-07-06", isIncome: false },
    ];
    expect(findRecurringCharges(txns)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/coach/tools/recurring.test.ts`
Expected: FAIL — cannot resolve `@/lib/coach/tools/recurring`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { normalizeMerchant } from "@/lib/categorize/rules";

export interface RecurringCharge {
  merchant: string;
  amount: number; // integer cents, absolute value of most recent charge
  count: number;
}

const DAY_MS = 86_400_000;

export function findRecurringCharges(
  txns: { description: string; amount: number; bookedAt: string; isIncome: boolean }[],
): RecurringCharge[] {
  const groups = new Map<string, { description: string; amount: number; bookedAt: string }[]>();
  for (const t of txns) {
    if (t.isIncome) continue;
    const key = normalizeMerchant(t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: RecurringCharge[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.bookedAt < b.bookedAt ? -1 : 1));
    let monthly = true;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (Date.parse(sorted[i].bookedAt) - Date.parse(sorted[i - 1].bookedAt)) / DAY_MS;
      if (gap < 25 || gap > 35) { monthly = false; break; }
    }
    if (!monthly) continue;
    const mostRecent = sorted[sorted.length - 1];
    out.push({ merchant, amount: Math.abs(mostRecent.amount), count: sorted.length });
  }

  return out.sort((a, b) => (b.count - a.count) || (a.merchant < b.merchant ? -1 : 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/coach/tools/recurring.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/coach/tools/recurring.ts lib/coach/tools/recurring.test.ts
git commit -m "feat(coach): find_recurring_charges pure tool"
```

---

### Task 2: `simulate_month` pure tool

**Files:**
- Create: `lib/coach/tools/simulate.ts`
- Test: `lib/coach/tools/simulate.test.ts`

**Interfaces:**
- Consumes: `splitIncome`, `type SplitRule`, `type Allocation` from `@/lib/split/engine`.
- Produces: `export function simulateMonth(income: number, currentRules: SplitRule[], changes: { bucketId: string; percent: number }[]): Allocation[]`.

Behavior: apply each change as an overwrite of that bucket's `percent` in a copy of `currentRules` (a change to an unknown bucketId is appended as a new rule), then call `splitIncome(income, mergedRules)`. `splitIncome` already validates the percents sum to 100 and throws `SplitError` otherwise — let it throw (Task 4's dispatcher catches and returns `{ error }`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { simulateMonth } from "@/lib/coach/tools/simulate";
import { SplitError } from "@/lib/split/engine";

const rules = [
  { bucketId: "fun", percent: 30 },
  { bucketId: "rent", percent: 50 },
  { bucketId: "savings", percent: 20 },
];

describe("simulateMonth", () => {
  it("re-splits income after overwriting one bucket's percent", () => {
    // cut Fun to 10, move the freed 20 into savings -> savings 40
    const result = simulateMonth(200000, rules, [
      { bucketId: "fun", percent: 10 },
      { bucketId: "savings", percent: 40 },
    ]);
    expect(result).toEqual([
      { bucketId: "fun", amount: 20000 },
      { bucketId: "rent", amount: 100000 },
      { bucketId: "savings", amount: 80000 },
    ]);
  });

  it("throws SplitError when changes make percents not sum to 100", () => {
    expect(() => simulateMonth(200000, rules, [{ bucketId: "fun", percent: 10 }])).toThrow(SplitError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/coach/tools/simulate.test.ts`
Expected: FAIL — cannot resolve `@/lib/coach/tools/simulate`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { splitIncome, type SplitRule, type Allocation } from "@/lib/split/engine";

export function simulateMonth(
  income: number,
  currentRules: SplitRule[],
  changes: { bucketId: string; percent: number }[],
): Allocation[] {
  const merged = currentRules.map((r) => ({ ...r }));
  for (const c of changes) {
    const existing = merged.find((r) => r.bucketId === c.bucketId);
    if (existing) existing.percent = c.percent;
    else merged.push({ bucketId: c.bucketId, percent: c.percent });
  }
  return splitIncome(income, merged);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/coach/tools/simulate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/coach/tools/simulate.ts lib/coach/tools/simulate.test.ts
git commit -m "feat(coach): simulate_month pure tool"
```

---

### Task 3: `explain_drift` pure tool

**Files:**
- Create: `lib/coach/tools/drift.ts`
- Test: `lib/coach/tools/drift.test.ts`

**Interfaces:**
- Produces: `export interface DriftResult { drift: number; byBucket: { bucketId: string; remaining: number }[] }` and `export function explainDrift(currentBalance: number, buckets: { id: string; remaining: number }[]): DriftResult`.

Behavior: `drift = currentBalance - Σ remaining` (integer cents, signed). `byBucket` echoes each bucket's remaining for the model to narrate. Pure delta, no rounding beyond integer arithmetic.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { explainDrift } from "@/lib/coach/tools/drift";

describe("explainDrift", () => {
  it("computes signed drift = balance minus sum of remaining", () => {
    const result = explainDrift(100800, [
      { id: "fun", remaining: 30000 },
      { id: "rent", remaining: 50000 },
      { id: "savings", remaining: 20000 },
    ]);
    expect(result).toEqual({
      drift: 800,
      byBucket: [
        { bucketId: "fun", remaining: 30000 },
        { bucketId: "rent", remaining: 50000 },
        { bucketId: "savings", remaining: 20000 },
      ],
    });
  });

  it("returns negative drift when buckets exceed balance", () => {
    expect(explainDrift(0, [{ id: "a", remaining: 500 }]).drift).toBe(-500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/coach/tools/drift.test.ts`
Expected: FAIL — cannot resolve `@/lib/coach/tools/drift`.

- [ ] **Step 3: Write minimal implementation**

```typescript
export interface DriftResult {
  drift: number; // integer cents, signed: currentBalance - sum(remaining)
  byBucket: { bucketId: string; remaining: number }[];
}

export function explainDrift(
  currentBalance: number,
  buckets: { id: string; remaining: number }[],
): DriftResult {
  const sumRemaining = buckets.reduce((t, b) => t + b.remaining, 0);
  return {
    drift: currentBalance - sumRemaining,
    byBucket: buckets.map((b) => ({ bucketId: b.id, remaining: b.remaining })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/coach/tools/drift.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/coach/tools/drift.ts lib/coach/tools/drift.test.ts
git commit -m "feat(coach): explain_drift pure tool"
```

---

### Task 4: Tool dispatcher + Gemini function declarations

**Files:**
- Create: `lib/coach/tools/index.ts`
- Test: `lib/coach/tools/index.test.ts`

**Interfaces:**
- Consumes: `findRecurringCharges` (Task 1), `simulateMonth` (Task 2), `explainDrift` (Task 3); `type SplitRule` from `@/lib/split/engine`; `Type` from `@google/genai`.
- Produces:
  - `export interface CoachToolCtx { txns: { description: string; amount: number; bookedAt: string; isIncome: boolean }[]; currentRules: SplitRule[]; income: number; currentBalance: number; buckets: { id: string; remaining: number }[] }`
  - `export function runCoachTool(name: string, args: Record<string, unknown>, ctx: CoachToolCtx): unknown`
  - `export const coachToolDeclarations` — array of Gemini `FunctionDeclaration` for the 3 tools.

`runCoachTool` is a `switch` over the 3 names. Unknown name → `{ error: "unknown tool: <name>" }`. It does NOT catch throws itself — the caller (Task 5) wraps each call in try/catch to build the `{ error }` functionResponse. `simulate_month` reads `income` from `ctx` and `changes` from `args`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { runCoachTool, coachToolDeclarations, type CoachToolCtx } from "@/lib/coach/tools";

const ctx: CoachToolCtx = {
  txns: [
    { description: "NETFLIX", amount: -1599, bookedAt: "2026-05-03", isIncome: false },
    { description: "NETFLIX", amount: -1599, bookedAt: "2026-06-02", isIncome: false },
  ],
  currentRules: [
    { bucketId: "fun", percent: 30 },
    { bucketId: "rent", percent: 50 },
    { bucketId: "savings", percent: 20 },
  ],
  income: 200000,
  currentBalance: 100800,
  buckets: [
    { id: "fun", remaining: 30000 },
    { id: "rent", remaining: 50000 },
    { id: "savings", remaining: 20000 },
  ],
};

describe("runCoachTool", () => {
  it("routes find_recurring_charges", () => {
    expect(runCoachTool("find_recurring_charges", {}, ctx)).toEqual([
      { merchant: "netflix", amount: 1599, count: 2 },
    ]);
  });

  it("routes simulate_month using ctx income + args changes", () => {
    const result = runCoachTool("simulate_month", {
      changes: [{ bucketId: "fun", percent: 10 }, { bucketId: "savings", percent: 40 }],
    }, ctx);
    expect(result).toEqual([
      { bucketId: "fun", amount: 20000 },
      { bucketId: "rent", amount: 100000 },
      { bucketId: "savings", amount: 80000 },
    ]);
  });

  it("routes explain_drift", () => {
    expect((runCoachTool("explain_drift", {}, ctx) as { drift: number }).drift).toBe(800);
  });

  it("returns an error object for an unknown tool", () => {
    expect(runCoachTool("nope", {}, ctx)).toEqual({ error: "unknown tool: nope" });
  });

  it("declares exactly the 3 tools by name", () => {
    expect(coachToolDeclarations.map((d) => d.name).sort()).toEqual(
      ["explain_drift", "find_recurring_charges", "simulate_month"],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/coach/tools/index.test.ts`
Expected: FAIL — cannot resolve `@/lib/coach/tools`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Type, type FunctionDeclaration } from "@google/genai";
import type { SplitRule } from "@/lib/split/engine";
import { findRecurringCharges } from "./recurring";
import { simulateMonth } from "./simulate";
import { explainDrift } from "./drift";

export interface CoachToolCtx {
  txns: { description: string; amount: number; bookedAt: string; isIncome: boolean }[];
  currentRules: SplitRule[];
  income: number;
  currentBalance: number;
  buckets: { id: string; remaining: number }[];
}

export function runCoachTool(name: string, args: Record<string, unknown>, ctx: CoachToolCtx): unknown {
  switch (name) {
    case "find_recurring_charges":
      return findRecurringCharges(ctx.txns);
    case "simulate_month":
      return simulateMonth(
        ctx.income,
        ctx.currentRules,
        (args.changes as { bucketId: string; percent: number }[]) ?? [],
      );
    case "explain_drift":
      return explainDrift(ctx.currentBalance, ctx.buckets);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

export const coachToolDeclarations: FunctionDeclaration[] = [
  {
    name: "find_recurring_charges",
    description: "List merchants charging the user on a roughly monthly cadence, with the most recent amount (integer cents) and how many times seen. Takes no arguments.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "simulate_month",
    description: "Recompute how this month's income would split across buckets if the given bucket percentages changed. Percentages across all buckets must still total 100.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        changes: {
          type: Type.ARRAY,
          description: "Bucket percentage overrides to apply before splitting.",
          items: {
            type: Type.OBJECT,
            properties: {
              bucketId: { type: Type.STRING },
              percent: { type: Type.NUMBER },
            },
            required: ["bucketId", "percent"],
          },
        },
      },
      required: ["changes"],
    },
  },
  {
    name: "explain_drift",
    description: "Compute the drift between the account's current balance and the sum of all bucket remaining amounts (integer cents, signed). Takes no arguments.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/coach/tools/index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/coach/tools/index.ts lib/coach/tools/index.test.ts
git commit -m "feat(coach): tool dispatcher + gemini function declarations"
```

---

### Task 5: Wire two-phase function calling into `coachReply`

**Files:**
- Modify: `functions/src/coach.ts` (the `generateContent` block, lines ~112-164)
- Create: `functions/src/coach.test.ts`

**Interfaces:**
- Consumes: `runCoachTool`, `coachToolDeclarations`, `type CoachToolCtx` from `../../lib/coach/tools`; existing `parseStructuredReply`, `validateSuggestion`, `writeCoachMemory`, `logEvent`, `buildCoachContext`.
- Produces: no new exports — `coachReply` return shape (`CoachReply`) is unchanged.

Context assembly for `CoachToolCtx` uses data already fetched in `coachReply`:
- `txns`: map `rawTxns` → `{ description, amount, bookedAt, isIncome }`.
- `buckets`: `buckets.map((b) => ({ id: b.id, remaining: b.remaining }))`.
- `currentRules`: derive from buckets' `allocated` — `income` for the sim is the current month's total allocated (`Σ allocated`), and each rule's `percent = allocated / totalAllocated * 100`. If `totalAllocated` is 0, pass `currentRules = []` and `income = 0` (simulate will throw `SplitError`, caught → `{ error }`).
- `currentBalance`: read `meta/bank.currentBalance` (the `metaSnap` is already fetched at coach.ts:83; add `?? 0`).

Two-phase replacement for the current single `generateContent` call:

**Phase 1:** build `contents` starting from `[{ role: "user", parts: [{ text: fullPrompt }] }]`. Call with `config: { tools: [{ functionDeclarations: coachToolDeclarations }] }`. Loop up to 3 times: if `res.functionCalls?.length`, append the model's candidate content, run each call (try/catch → `{ error }`), append a `functionResponse` part per call, re-call. Else break.

**Phase 2:** the existing `generateContent` with `responseSchema` — but seed its `contents` with the accumulated tool exchange so the model narrates real numbers. Everything after `parseStructuredReply(res.text)` is unchanged.

- [ ] **Step 1: Write the failing test** (mock genai; assert a tool round-trips)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", async (orig) => {
  const actual = await orig<typeof import("@google/genai")>();
  return { ...actual, GoogleGenAI: vi.fn(() => ({ models: { generateContent } })) };
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

import { coachReply } from "./coach";

// helper to invoke the onCall handler with a fake CallableRequest
function call(data: unknown) {
  const handler = (coachReply as unknown as { run: (r: unknown) => Promise<unknown> }).run
    ?? (coachReply as unknown as (r: unknown) => Promise<unknown>);
  return (handler as (r: unknown) => Promise<unknown>)({ auth: { uid: "u1" }, data });
}

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

    const result = (await call({ message: "why don't my buckets add up?", history: [] })) as { reply: string };
    expect(result.reply).toContain("€8");
    // three generateContent calls: 1 tool round + 1 no-op check + 1 final
    expect(generateContent).toHaveBeenCalledTimes(3);
    // phase 1 call passed tool declarations
    expect(generateContent.mock.calls[0][0].config.tools).toBeTruthy();
    // phase 2 call passed responseSchema
    expect(generateContent.mock.calls[2][0].config.responseSchema).toBeTruthy();
  });
});
```

> Note: if `onCall` wrapping makes the handler hard to invoke directly, refactor the handler body into an exported `async function handleCoachReply(uid: string, data: CoachReplyRequest): Promise<CoachReply>` and have `onCall` call it; test `handleCoachReply` directly. Prefer this refactor — it is cleaner than reaching into the wrapper.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run functions/src/coach.test.ts`
Expected: FAIL — either the handler isn't callable yet, or `generateContent` called once (single-phase) not three times.

- [ ] **Step 3: Implement the two-phase loop**

In `functions/src/coach.ts`, add imports at top:

```typescript
import { runCoachTool, coachToolDeclarations, type CoachToolCtx } from "../../lib/coach/tools";
```

Replace the single `generateContent` block (from `const ai = new GoogleGenAI(...)` through `const parsed = parseStructuredReply(res.text);`) with:

```typescript
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

// Build tool context from data already fetched above.
const totalAllocated = buckets.reduce((t, b) => t + b.allocated, 0);
const toolCtx: CoachToolCtx = {
  txns: rawTxns.map((t) => ({ description: t.description, amount: t.amount, bookedAt: t.bookedAt, isIncome: t.isIncome })),
  currentRules: totalAllocated > 0
    ? buckets.map((b) => ({ bucketId: b.id, percent: (b.allocated / totalAllocated) * 100 }))
    : [],
  income: totalAllocated,
  currentBalance: (metaSnap.exists ? (metaSnap.get("currentBalance") as number | undefined) : undefined) ?? 0,
  buckets: buckets.map((b) => ({ id: b.id, remaining: b.remaining })),
};

// Phase 1 — analysis loop. Tools inform the model; no responseSchema (Gemini
// rejects tools + forced JSON together). Hard cap: 3 rounds.
const contents: { role: string; parts: unknown[] }[] = [
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
    contents.push(res1.candidates![0].content as { role: string; parts: unknown[] });
    for (const c of calls) {
      let response: unknown;
      try { response = runCoachTool(c.name!, (c.args ?? {}) as Record<string, unknown>, toolCtx); }
      catch (err) { response = { error: err instanceof Error ? err.message : String(err) }; }
      contents.push({ role: "user", parts: [{ functionResponse: { name: c.name, response: { result: response } } }] });
    }
  }
} catch (err) {
  console.warn("coachReply: tool phase failed, continuing to final answer:", err instanceof Error ? err.message : err);
}

// Phase 2 — structured answer. Existing responseSchema; contents now carry any
// tool results so the model narrates real numbers.
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
      },
      required: ["reply"],
    },
  },
});

const parsed = parseStructuredReply(res.text);
```

If Step 1's note applies, also extract the handler body into `export async function handleCoachReply(uid, data)` and have `onCall` delegate to it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run functions/src/coach.test.ts`
Expected: PASS. Then `pnpm exec tsc --noEmit` (root) → exit 0.

- [ ] **Step 5: Commit**

```bash
git add functions/src/coach.ts functions/src/coach.test.ts
git commit -m "feat(coach): two-phase function calling in coachReply"
```

---

### Task 6: Full suite + emulator verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm exec vitest run`
Expected: all files pass (152 prior + the new tool/coach tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Rebuild functions + start emulator**

Run: `pnpm --dir functions run serve`
Expected: functions emulator loads `coachReply` without error (watch for the build succeeding — `lib/functions/src/coach.js` regenerated).

- [ ] **Step 4: Drive the coach in the emulator UI**

Sign in (premium account with buckets), open `/coach`, ask: **"What if I cut Fun to 10%?"**
Expected: reply contains a computed per-bucket allocation table (from `simulate_month`), not a hand-waved paragraph. Then ask **"Why don't my buckets add up to my balance?"** → reply cites the drift number.

- [ ] **Step 5: No commit** (verification task; code already committed in Tasks 1-5).

---

## Notes for the implementer

- `pnpm exec vitest run <path>` runs a single file; `pnpm exec vitest run` runs all. The root `vitest.config.ts` aliases `@` → repo root and excludes `functions/lib/**`, so `@/lib/coach/tools/...` resolves and `functions/src/*.test.ts` is collected.
- The functions emulator runs **compiled** `functions/lib/`, so `pnpm --dir functions run build` (or `serve`, which builds first) must run before the emulator reflects `coach.ts` changes. This is exactly the stale-build class of bug that produced the original `text: undefined` error.
- Do not edit `lib/coach/suggestion.ts`, the apply path, or the client — the contract is unchanged by design.
