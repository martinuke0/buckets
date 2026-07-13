# Transaction Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically assign each synced spend transaction to a bucket (rules first, Gemini as fallback), draw that bucket down, and let users recategorize — with corrections learned as merchant→bucket rules.

**Architecture:** During `syncOneUser` (Cloud Functions), each newly-created **spend** transaction is categorized: first by a deterministic **merchant→bucket rule** lookup (`categoryRules/{uid}`), and only if no rule matches by a **Gemini** call (`@google/genai`, structured JSON, constrained to the user's bucket ids). The chosen `bucketId` is written on the transaction and the bucket's `remaining` is decremented (reusing the existing spend/draw-down path, made idempotent per txn). On the client, each transaction row has a **recategorize dropdown**; changing it moves the balance (credit old bucket, debit new) and **saves a merchant→bucket rule** so future transactions from that merchant are categorized deterministically (no Gemini call). The Gemini key lives only in Functions.

**Tech Stack:** `@google/genai` (Gemini Developer API, server-side in Cloud Functions), Firebase Functions/Firestore admin SDK, Next.js 16 client, Vitest.

## Global Constraints

- **Gemini key server-side only:** `GEMINI_API_KEY` in Functions env — never `NEXT_PUBLIC_`, never client bundle. All Gemini calls run in Cloud Functions.
- **Money integer cents.** Categorizing a spend decrements the target bucket's `remaining` by the spend's magnitude; recategorizing moves it (old += magnitude, new -= magnitude). Never double-apply (idempotent per transaction via a marker/flag).
- **Rules before AI:** always check the merchant→bucket rule first; call Gemini only on a miss. Deterministic, cheaper, and honors user corrections. Log when the rule path vs the Gemini path is taken (no silent fallback).
- **Gemini output constrained:** structured JSON (`responseMimeType: "application/json"` + `responseSchema`) whose `bucketId` is an `enum` of the user's actual bucket ids, plus a `confidence`. Never let it invent a bucket id; if the returned id isn't in the set, leave the txn uncategorized (don't guess).
- **Only spends get categorized:** income (`isIncome === true`) is handled by the auto-split path already — skip it here.
- **Reuse existing code:** `Bucket`/`Transaction` types + path helpers (`@/lib/model/*`); the Functions store (`applySpend`-style draw-down) from the bank-sync feature; `pickDotColor`/`formatEuros` on the client. The pure categorizer decision logic is testable without network.
- **Model configurable:** default `gemini-2.5-flash` via `GEMINI_MODEL` env (cheap/fast classification); don't hardcode.

---

## Scope

**IN:** merchant→bucket rule store; a pure `chooseBucket` decision helper (rule-hit vs needs-AI); a Gemini categorizer (Functions) with constrained structured output; integration into `syncOneUser` (categorize + draw down new spends, idempotent); client recategorize dropdown that moves balances and writes a rule.

**DEFERRED (documented, NOT built):**
- Bulk "recategorize all uncategorized" action.
- Confidence-threshold UX (e.g. flag low-confidence for review) — store `confidence` now, surface later.
- Multi-bucket / split-across-buckets for one transaction.
- Embeddings/similarity matching for merchants (exact normalized-name match only for MVP).

---

## File Structure

- `lib/categorize/rules.ts` — pure: `normalizeMerchant(name)`, `chooseBucket(txn, rules, bucketIds)` → `{ bucketId } | { needsAI: true }`. Testable, no network.
- `lib/categorize/rules.test.ts` — tests for normalize + chooseBucket.
- `functions/src/categorizer.ts` — `categorizeWithGemini(description, buckets)` → `{ bucketId | null, confidence }` (Gemini call; bucketId constrained to the given ids).
- `functions/src/store.ts` (modify) — add `getCategoryRules(uid)`, `saveCategoryRule(uid, merchant, bucketId)`, and `applySpendCategorization(uid, txnId, bucketId, amountMagnitude)` (idempotent draw-down + set txn.bucketId).
- `functions/src/syncCore.ts` (modify) — after writing new spends, categorize each (rules→Gemini) and apply.
- `lib/data/recategorize.ts` — client: `recategorize(uid, txn, newBucketId)` — moves balances + writes rule (callable or direct, see Task 4).
- `components/tx/TransactionList.tsx` (modify) — add the per-row bucket dropdown.

---

## Task 1: Pure categorization rules (normalize + chooseBucket)

**Files:**
- Create: `lib/categorize/rules.ts`
- Test: `lib/categorize/rules.test.ts`

**Interfaces:**
- Produces:
  - `type CategoryRule = { merchant: string; bucketId: string }` (merchant = normalized).
  - `normalizeMerchant(name: string): string` — lowercased, trimmed, collapse whitespace, strip trailing card-processor noise (e.g. numbers, `*`, common suffixes). Deterministic.
  - `chooseBucket(description: string, rules: CategoryRule[], bucketIds: string[]): { bucketId: string } | { needsAI: true }` — if a rule's merchant matches `normalizeMerchant(description)` AND its `bucketId` is still in `bucketIds`, return that bucket; else `{ needsAI: true }`.

- [ ] **Step 1: Write the failing test**

`lib/categorize/rules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeMerchant, chooseBucket, type CategoryRule } from "@/lib/categorize/rules";

describe("normalizeMerchant", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeMerchant("  TESCO   STORES  ")).toBe("tesco stores");
  });
  it("strips trailing card-processor noise", () => {
    expect(normalizeMerchant("AMZN Mktp*A1B2C3")).toBe("amzn mktp");
  });
});

describe("chooseBucket", () => {
  const rules: CategoryRule[] = [{ merchant: "tesco stores", bucketId: "food" }];
  const bucketIds = ["food", "fun", "savings"];

  it("returns the rule's bucket on a normalized match", () => {
    expect(chooseBucket("TESCO STORES", rules, bucketIds)).toEqual({ bucketId: "food" });
  });
  it("needs AI when no rule matches", () => {
    expect(chooseBucket("Some New Cafe", rules, bucketIds)).toEqual({ needsAI: true });
  });
  it("needs AI when the matched rule points at a deleted bucket", () => {
    expect(chooseBucket("TESCO STORES", [{ merchant: "tesco stores", bucketId: "gone" }], bucketIds)).toEqual({ needsAI: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/categorize/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/categorize/rules.ts`**

```ts
export type CategoryRule = { merchant: string; bucketId: string };

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[*#].*$/, "")       // drop processor suffix after * or #
    .replace(/[0-9]+/g, "")       // drop digits
    .replace(/\s+/g, " ")
    .trim();
}

export function chooseBucket(
  description: string,
  rules: CategoryRule[],
  bucketIds: string[],
): { bucketId: string } | { needsAI: true } {
  const key = normalizeMerchant(description);
  const rule = rules.find((r) => r.merchant === key);
  if (rule && bucketIds.includes(rule.bucketId)) return { bucketId: rule.bucketId };
  return { needsAI: true };
}
```
(If the `AMZN Mktp*A1B2C3` → `amzn mktp` test fails on the digit/suffix order, adjust the regexes so the expected output matches — the intent is: strip processor noise + digits, collapse spaces. Keep it deterministic.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/categorize/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/categorize/rules.ts lib/categorize/rules.test.ts
git commit -m "feat: pure categorization rules (normalizeMerchant + chooseBucket)"
```

---

## Task 2: Gemini categorizer (Functions)

**Files:**
- Create: `functions/src/categorizer.ts`
- Modify: `functions/package.json` (add `@google/genai`)
- Test: manual/E2E (needs `GEMINI_API_KEY`); logic is thin over the SDK + the already-tested rule constraint.

**Interfaces:**
- Produces: `categorizeWithGemini(description: string, buckets: { id: string; name: string }[]): Promise<{ bucketId: string | null; confidence: number }>` — calls Gemini with a prompt listing the bucket names+ids and the transaction description; structured JSON response constrained so `bucketId` is an `enum` of the given ids (plus allow a sentinel like `"none"`); returns `{ bucketId: null }` if the model returns the sentinel or an id not in the set.

- [ ] **Step 1: Add the dependency**

Run: `cd functions && pnpm add @google/genai && cd ..`

- [ ] **Step 2: Implement `functions/src/categorizer.ts`**

```ts
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

  try {
    const parsed = JSON.parse(res.text ?? "{}");
    const bucketId = ids.includes(parsed.bucketId) ? parsed.bucketId : null;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    return { bucketId, confidence };
  } catch {
    return { bucketId: null, confidence: 0 };
  }
}
```

- [ ] **Step 3: Typecheck functions**

Run: `cd functions && pnpm exec tsc --noEmit` → Expected: no errors. `cd ..`.

- [ ] **Step 4: Commit**

```bash
git add functions
git commit -m "feat: Gemini categorizer (constrained structured output, server-side)"
```

---

## Task 3: Categorize + draw down during sync

**Files:**
- Modify: `functions/src/store.ts`, `functions/src/syncCore.ts`
- Test: manual/E2E (emulator + Gemini key). Logic delegates to tested `chooseBucket` + the categorizer + idempotent store writes.

**Interfaces:**
- Produces (in `store.ts`):
  - `getCategoryRules(uid): Promise<CategoryRule[]>` (from `categoryRules/{uid}/rules`).
  - `saveCategoryRule(uid, merchant, bucketId): Promise<void>` (doc id = merchant).
  - `applySpendCategorization(uid, txnId, bucketId, magnitude): Promise<void>` — idempotent: in a transaction, if the txn already has this `bucketId` **and** a `categorizedAt` marker, no-op; else set `txn.bucketId` + `categorizedAt` and `increment(bucket.remaining, -magnitude)`. (magnitude = `Math.abs(txn.amount)`.)
- Integration in `syncCore.ts`: after `writeTransactions` returns `created`, for each **spend** (`!isIncome`): `chooseBucket(desc, rules, bucketIds)` → if `{bucketId}` use it; else `categorizeWithGemini` → if non-null bucketId, use it; then `applySpendCategorization`. Log rule-hit vs gemini-hit vs no-match counts.

- [ ] **Step 1: Implement the store additions** (rules getters/setter + idempotent `applySpendCategorization` using `runTransaction` + `FieldValue.increment`).

- [ ] **Step 2: Wire into `syncOneUser`** — load `getCategoryRules(uid)` + bucket ids once per run; categorize each new spend via rules→Gemini; apply; accumulate counts into the log line. Income still goes only through the auto-split path (skip categorization for `isIncome`).

- [ ] **Step 3: Typecheck**

Run: `cd functions && pnpm exec tsc --noEmit` && `cd .. && pnpm exec tsc --noEmit` → both clean.

- [ ] **Step 4: Commit**

```bash
git add functions
git commit -m "feat: categorize + draw down new spends during sync (rules→Gemini, idempotent)"
```

---

## Task 4: Client recategorize dropdown + rule learning

**Files:**
- Modify: `components/tx/TransactionList.tsx`
- Create: `lib/data/recategorize.ts`
- Test: `components/tx/TransactionList.test.tsx` (extend)

**Interfaces:**
- Consumes: `Bucket`/`Transaction`, `pickDotColor`, `formatEuros`, the data layer.
- Produces:
  - `recategorize(uid, txn: Transaction, newBucketId: string, buckets: Bucket[]): Promise<void>` — in a Firestore transaction: if `txn.bucketId === newBucketId` no-op; else credit old bucket (`+magnitude` to its `remaining`, if any) and debit new (`-magnitude`), set `txn.bucketId = newBucketId`, and **write a merchant→bucket rule** (`saveCategoryRule`-equivalent on the client path or via a small callable) so future syncs use it. magnitude = `Math.abs(txn.amount)`.
  - `<TransactionList>` gains, per spend row, a `<select>` of the user's buckets (value = current `bucketId`), calling `recategorize` on change. Presentational list stays otherwise the same; pass `buckets` + an `onRecategorize` handler as props so the component stays testable/pure-ish.

- [ ] **Step 1: Write the failing test (dropdown renders + fires handler)**

Extend `components/tx/TransactionList.test.tsx`:
```tsx
import { fireEvent } from "@testing-library/react";
// ...existing imports + txns...
it("renders a bucket selector per spend and calls onRecategorize on change", () => {
  const onRecategorize = vi.fn();
  const buckets = [
    { id: "food", name: "Food", colorIndex: 0, percent: 100, type: "virtual" as const, remaining: 0, allocated: 0 },
    { id: "fun", name: "Fun", colorIndex: 1, percent: 0, type: "virtual" as const, remaining: 0, allocated: 0 },
  ];
  render(<TransactionList transactions={[{ id: "t2", amount: -1234, description: "Coffee", bookedAt: "2026-07-10", bucketId: "food", isIncome: false }]}
    buckets={buckets} onRecategorize={onRecategorize} />);
  fireEvent.change(screen.getByTestId("recat-t2"), { target: { value: "fun" } });
  expect(onRecategorize).toHaveBeenCalledWith("t2", "fun");
});
```
(Make `buckets`/`onRecategorize` optional props so the existing empty-state + basic-render tests still pass without them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/tx/TransactionList.test.tsx`
Expected: FAIL — `TransactionList` doesn't accept the new props / no selector.

- [ ] **Step 3: Implement** — add optional `buckets?: Bucket[]` and `onRecategorize?: (txnId: string, bucketId: string) => void` props; when provided, render a `<select data-testid={`recat-${t.id}`}>` per spend (income rows show no selector); `onChange` calls `onRecategorize(t.id, value)`. Then implement `lib/data/recategorize.ts` (the transaction that moves balances + writes the rule) and wire the dashboard to pass `buckets` + an `onRecategorize` that calls it with `uid`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test components/tx/TransactionList.test.tsx`
Expected: PASS (new + existing).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add components/tx/TransactionList.tsx components/tx/TransactionList.test.tsx lib/data/recategorize.ts "app/(app)/dashboard/page.tsx"
git commit -m "feat: recategorize dropdown + merchant rule learning"
```

---

## Self-Review

- **Spec coverage:** Gemini categorization (spec's Categorizer) — server-side during sync (Tasks 2–3), rules-first to save calls + honor corrections (Tasks 1,3,4), draw-down for live bucket awareness (Task 3), user corrections that persist as rules (Task 4). ✅
- **Security:** Gemini key only in Functions; constrained enum output so the model can't invent bucket ids; unknown id → uncategorized, never a wrong guess.
- **Idempotency:** `applySpendCategorization` gated by a `categorizedAt` marker so re-sync/concurrent runs don't double-debit (mirrors the income-split fix from bank-sync).
- **Reuse:** pure `chooseBucket` tested without network; draw-down uses the same increment/transaction pattern as the rest of the money code.
- **Type consistency:** `CategoryRule` defined once in `lib/categorize/rules.ts`; `Bucket`/`Transaction` from foundation; `TransactionList` new props are optional (existing tests unaffected).
- **Placeholders:** Tasks 1 + 4 test/component carry full code; Tasks 2–3 give exact signatures + integration contract (Gemini + Functions glue verified E2E, not mocked into false confidence).

## Verification (whole plan)

1. `pnpm test && pnpm exec tsc --noEmit` — pure rules + TransactionList tests pass; no type errors.
2. `cd functions && pnpm exec tsc --noEmit` — clean.
3. **E2E (needs Gemini key + emulator/deploy + a bank connection):** set `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) in Functions config; sync sandbox transactions → new spends get a `bucketId` and the matching bucket's `remaining` drops by the spend amount; income is untouched by categorization (only split). Re-sync adds no further draw-down (idempotent).
4. **Rules path:** recategorize a transaction in the UI → its balance moves (old bucket credited, new debited) and a `categoryRules` entry is written → a later transaction from the same merchant is categorized WITHOUT a Gemini call (check the function log for rule-hit).
5. **Constrained output:** confirm a nonsense/ambiguous description yields `bucketId: null` (uncategorized), never an invented id.
6. **Key safety:** grep client bundle for `GEMINI_API_KEY` / the key value — absent.
