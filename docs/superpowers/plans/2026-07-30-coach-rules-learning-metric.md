# Rules Learning + Skip-LLM Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a category rule whenever Gemini places a spend (so that merchant is free next sync), and compute + persist a per-sync skip-LLM percentage.

**Architecture:** Both changes live in `functions/src/syncCore.ts`'s existing categorization flow. Rule-learning hooks the point where `geminiHits++` fires (best-effort `saveCategoryRule`). The metric is a pure function `computeSkipLLMPct(ruleHits, geminiHits, noMatch)` whose result is passed into the existing end-of-sync `setBankMeta(...)`. `saveCategoryRule`, the counters, and `setBankMeta` already exist — this is wiring + one pure function + tests.

**Tech Stack:** TypeScript, Firebase Cloud Functions v2, Vitest (root config, `@` → repo root; covers `functions/src`).

## Global Constraints

- Functions→lib imports use RELATIVE paths (`../../lib/...`), never the `@/` alias — `@/` has no runtime resolver in the functions build and crashes the Cloud Function on load. `syncCore.ts` already imports `chooseBucket` from `../../lib/categorize/rules`; add new lib imports there.
- Metric denominator INCLUDES noMatch: `skipLLMPct = round(ruleHits / (ruleHits + geminiHits + noMatch) * 100)`. Returns `null` when total spends is 0.
- `skipLLMPct` is persisted to `users/{uid}/meta/bank` via `setBankMeta`, and OMITTED (not written) when null — `setBankMeta` uses `.set(fields, {merge:true})`, so omitting preserves any prior value (no meaningless-0 overwrite).
- Rule learning is best-effort: wrapped in try/catch so a write failure never aborts the sync (income already split, txns already written). Learn from Gemini hits ONLY — do not touch `recategorize.ts` or the apply/money path.
- `recordOnly` syncs return early before categorization — do NOT add learning/metric there.
- Rule key is `normalizeMerchant(txn.description)`; `saveCategoryRule` does `.set()` keyed by merchant, so repeats overwrite identically (free dedup).
- Test style: Vitest, `import { describe, it, expect } from "vitest"`, `@`-aliased imports for lib tests; functions tests mirror `functions/src/coach.test.ts` mock style.

---

### Task 1: Pure `computeSkipLLMPct`

**Files:**
- Modify: `lib/categorize/rules.ts` (add function)
- Modify: `lib/categorize/rules.test.ts` (add cases — EXISTS, read first, don't clobber)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function computeSkipLLMPct(ruleHits: number, geminiHits: number, noMatch: number): number | null`.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `lib/categorize/rules.test.ts` (read it first; reuse its top-of-file vitest import, add `computeSkipLLMPct` to the existing `@/lib/categorize/rules` import):

```typescript
describe("computeSkipLLMPct", () => {
  it("returns 100 when every spend was placed by a rule", () => {
    expect(computeSkipLLMPct(8, 0, 0)).toBe(100);
  });
  it("returns the rounded rule share including noMatch in the denominator", () => {
    // 6 / (6+3+1) = 60%
    expect(computeSkipLLMPct(6, 3, 1)).toBe(60);
    // 1 / (1+1+1) = 33.33 -> 33
    expect(computeSkipLLMPct(1, 1, 1)).toBe(33);
  });
  it("returns 0 when no spend was placed by a rule", () => {
    expect(computeSkipLLMPct(0, 2, 3)).toBe(0);
  });
  it("returns null when there were no spends", () => {
    expect(computeSkipLLMPct(0, 0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/categorize/rules.test.ts`
Expected: FAIL — `computeSkipLLMPct` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/categorize/rules.ts`:

```typescript
// Share of a sync's spends placed by a free deterministic rule (no LLM call),
// as a rounded percentage. Denominator includes noMatch (spends nothing placed)
// so the number is honest, not inflated by dropping unplaceable transactions.
// Returns null when there were no spends to categorize.
export function computeSkipLLMPct(ruleHits: number, geminiHits: number, noMatch: number): number | null {
  const total = ruleHits + geminiHits + noMatch;
  if (total <= 0) return null;
  return Math.round((ruleHits / total) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/categorize/rules.test.ts`
Expected: PASS (new + existing). Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/categorize/rules.ts lib/categorize/rules.test.ts
git commit -m "feat(categorize): pure computeSkipLLMPct metric"
```

---

### Task 2: Wire rule-learning + metric into syncCore; add skipLLMPct to setBankMeta

**Files:**
- Modify: `functions/src/store.ts` (setBankMeta field type, line 62-64)
- Modify: `functions/src/syncCore.ts` (imports line 13; apply loop line 146-160; final setBankMeta line 174)
- Test: `functions/src/syncCore.test.ts` (NEW)

**Interfaces:**
- Consumes: `saveCategoryRule` (store.ts:204), `normalizeMerchant` + `computeSkipLLMPct` (lib/categorize/rules), `setBankMeta` (extended).
- Produces: no new exports. `setBankMeta` accepts optional `skipLLMPct?: number`. `syncOneUser` behavior gains rule-learning + metric persistence.

- [ ] **Step 1: Extend setBankMeta field type**

In `functions/src/store.ts`, change the `setBankMeta` signature field type (line 64) from:
```typescript
fields: { connectedAt?: string; lastSyncedAt?: string; currentBalance?: number }
```
to:
```typescript
fields: { connectedAt?: string; lastSyncedAt?: string; currentBalance?: number; skipLLMPct?: number }
```
No body change — it already does `.set(fields, { merge: true })`.

- [ ] **Step 2: Write the failing test**

Create `functions/src/syncCore.test.ts`. Mirror the mock style of `functions/src/coach.test.ts`. The seam: mock `./store` so `writeTransactions` returns the test spends (this controls `created` regardless of Plaid), `getCategoryRules` returns `[]` (forcing all spends to Gemini), and `saveCategoryRule`/`setBankMeta` are spies; mock `./categorizer` so `categorizeBatchWithGemini` returns a chosen bucket; mock `firebase-admin/firestore` for the buckets snapshot; mock the Plaid adapter so construction + `syncTransactions`/`getBalance` don't throw.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveCategoryRule = vi.fn(async () => {});
const setBankMeta = vi.fn(async () => {});
const applySpendCategorization = vi.fn(async () => {});

// One spend that the rules miss (getCategoryRules → []), so it goes to Gemini.
const spend = { providerTxnId: "t1", amount: -4200, description: "TESCO STORES 12", bookedAt: "2026-07-15", isIncome: false };

vi.mock("./store", () => ({
  listConnections: async () => [{ itemId: "i1", accessToken: "a1", cursor: null }],
  saveCursor: async () => {},
  writeTransactions: async () => [spend],
  writePendingIncome: async () => {},
  getCategoryRules: async () => [],
  applySpendCategorization: (...a: unknown[]) => applySpendCategorization(...a),
  setBankMeta: (...a: unknown[]) => setBankMeta(...a),
}));
vi.mock("./categorizer", () => ({
  // rule-miss → Gemini places it into "fun"
  categorizeBatchWithGemini: async () => ["fun"],
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: () => ({ get: async () => ({ docs: [{ id: "fun", get: () => "Fun" }] }) }),
  }),
}));
// Adapter: no NEW txns from Plaid (created comes from writeTransactions mock), balance stub.
vi.mock("../../lib/bank/plaidAdapter", () => ({
  PlaidAdapter: vi.fn(function () {
    return {
      syncTransactions: async () => ({ added: [], nextCursor: "c1", hasMore: false }),
      getBalance: async () => 100000,
    };
  }),
}));
vi.mock("plaid", () => ({
  Configuration: vi.fn(), PlaidApi: vi.fn(), PlaidEnvironments: { sandbox: "https://sandbox" },
}));
// rules.ts is NOT mocked — computeSkipLLMPct + normalizeMerchant run for real.

import { syncOneUser } from "./syncCore";

describe("syncOneUser rule learning + metric", () => {
  beforeEach(() => {
    saveCategoryRule.mockClear(); setBankMeta.mockClear(); applySpendCategorization.mockClear();
    process.env.PLAID_CLIENT_ID = "x"; process.env.PLAID_SECRET = "y";
    // If syncCore imports saveCategoryRule from ./store, ensure the mock exposes it:
  });

  it("learns a rule from a Gemini placement and persists skipLLMPct", async () => {
    await syncOneUser("u1");
    // rule learned with NORMALIZED merchant ("tesco stores", digits/suffix stripped) + gemini bucket
    expect(saveCategoryRule).toHaveBeenCalledWith("u1", "tesco stores", "fun");
    // one spend, placed by Gemini → ruleHits 0 of 1 → skipLLMPct 0
    const metaCall = setBankMeta.mock.calls.at(-1)![1] as { skipLLMPct?: number };
    expect(metaCall.skipLLMPct).toBe(0);
  });
});
```

> IMPORTANT: `saveCategoryRule` must be added to BOTH the `./store` mock (above) AND imported by syncCore (Step 3). If the mock omits a function syncCore imports, the import is `undefined` and the call throws. Read the actual `./store` exports syncCore imports and include every one used in the code path in the mock. Adapt the mock to the real module shape — do not leave a broken test.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run functions/src/syncCore.test.ts`
Expected: FAIL — `saveCategoryRule` never called (not wired) and `setBankMeta` has no `skipLLMPct`.

- [ ] **Step 4: Implement in syncCore.ts**

Extend the lib import (line 13) and add the store import:
```typescript
import { chooseBucket, normalizeMerchant, computeSkipLLMPct } from "../../lib/categorize/rules";
```
Add `saveCategoryRule` to the `./store` import block (lines 3-14).

In the apply loop (line 146-160), where `geminiHits++` fires, learn the rule best-effort. Change:
```typescript
      if (bucketId) geminiHits++;
      else noMatch++;
```
to:
```typescript
      if (bucketId) {
        geminiHits++;
        try { await saveCategoryRule(uid, normalizeMerchant(txn.description), bucketId); }
        catch (err) { console.warn(`syncOneUser(${uid}): rule learn skipped for ${txn.providerTxnId}:`, err instanceof Error ? err.message : err); }
      } else {
        noMatch++;
      }
```

Compute the metric and include it in the final `setBankMeta` (line 174). Change:
```typescript
  await setBankMeta(uid, { lastSyncedAt: new Date().toISOString(), ...(currentBalance !== undefined ? { currentBalance } : {}) });
```
to:
```typescript
  const skipLLMPct = computeSkipLLMPct(ruleHits, geminiHits, noMatch);
  await setBankMeta(uid, {
    lastSyncedAt: new Date().toISOString(),
    ...(currentBalance !== undefined ? { currentBalance } : {}),
    ...(skipLLMPct !== null ? { skipLLMPct } : {}),
  });
```

Optionally add `skipLLMPct` to the existing `console.log` summary (line 162-164) for at-a-glance logs — append `, skipLLMPct: ${skipLLMPct}` to the template.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run functions/src/syncCore.test.ts`
Expected: PASS. Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add functions/src/store.ts functions/src/syncCore.ts functions/src/syncCore.test.ts
git commit -m "feat(coach): learn category rules from Gemini + persist skip-LLM metric"
```

---

### Task 3: Full suite + emulator verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `pnpm exec vitest run`
Expected: all pass (prior 179 + new rules/syncCore tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Rebuild functions + confirm load**

Run: `pnpm --dir functions run build`. Confirm no compiled `require("@/` in `functions/lib/functions/src/syncCore.js` (relative-import safety). If the functions emulator is running, confirm it reloads syncTransactions/scheduledSync without a module-load error.

- [ ] **Step 4: Emulator behavior (best-effort — note if Gemini rate-limited)**

The sync path requires a Plaid connection, which the emulator can't easily fake. If a live sync isn't drivable, state that the wiring is covered by the mocked `syncCore.test.ts` and verify at the data layer instead: manually invoke or reason that a `categoryRules/<uid>/rules/<merchant>` doc + `meta/bank.skipLLMPct` would result. If a sync IS drivable: after a sync with a rule-miss, confirm (a) a `categoryRules/<uid>/rules/<normalized-merchant>` doc exists with the Gemini bucket, and (b) `users/<uid>/meta/bank.skipLLMPct` is set. Re-sync the same merchant → it becomes a rule hit (ruleHits up, geminiHits down, skipLLMPct up).

- [ ] **Step 5: No commit** (verification; code committed in Tasks 1-2).

---

## Notes for the implementer

- `pnpm exec vitest run <path>` runs one file; `pnpm exec vitest run` runs all. Root `vitest.config.ts` aliases `@` → repo root and covers `functions/src`.
- The functions emulator runs compiled `functions/lib/` — `pnpm --dir functions run build` before expecting `syncCore.ts` changes to take effect. Functions→lib imports MUST be relative (`../../lib/...`), never `@/`.
- Do not touch the money/apply path semantics, `recategorize.ts`, or the income-split logic. This feature is additive: learn a rule after a Gemini placement, and persist one metric.
- `syncCore.test.ts` is the first test for this file — its mock scaffold is the bulk of the work. Mock every `./store` export that the syncOneUser code path calls; a missing one imports as `undefined` and throws at call time.
