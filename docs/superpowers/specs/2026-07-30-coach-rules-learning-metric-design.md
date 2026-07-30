# Rules-first categorization learning + skip-LLM metric

**Roadmap:** `docs/COACH_ROADMAP.md` Item 6. The two-tier categorizer already exists
(`syncCore.ts`: cheap deterministic rules → bulk Gemini for misses). This feature
closes the loop so the LLM is called less over time, and surfaces a metric proving it.

## Two changes

1. **Learn from Gemini.** When Gemini places a rule-miss spend into a bucket, persist
   it as a category rule (`{ merchant: normalizeMerchant(description), bucketId }`).
   Next sync, that merchant is a free deterministic rule-hit — no LLM call.
2. **Skip-LLM metric.** Each sync computes and persists
   `skipLLMPct = round(ruleHits / (ruleHits + geminiHits + noMatch) * 100)` — the
   share of this sync's spends placed WITHOUT an LLM call — logged and stored on
   `users/{uid}/meta/bank`.

Most infrastructure already exists: `saveCategoryRule(uid, merchant, bucketId)`
(store.ts:204), the `ruleHits`/`geminiHits`/`noMatch` counters (syncCore.ts), and
`setBankMeta` (store.ts:62). This is wiring + one pure function + tests.

## Learning — where and how

In `syncCore.ts`'s apply loop, at the point a Gemini result places a spend (where
`geminiHits++` fires), also write the rule, best-effort so a write failure never
aborts the sync (income already split, txns already written):

```typescript
if (bucketId) {
  geminiHits++;
  try { await saveCategoryRule(uid, normalizeMerchant(txn.description), bucketId); }
  catch (err) { console.warn(`syncOneUser(${uid}): rule learn skipped for ${txn.providerTxnId}:`, err instanceof Error ? err.message : err); }
}
```

Dedup is free: `saveCategoryRule` does `.set()` on a doc keyed by the normalized
merchant, so repeated Gemini hits for the same merchant overwrite identically.

**Decision (A):** learn from Gemini hits only. User-correction-updates-rule (via the
existing `recategorize.ts`) is a clean follow-up, out of scope here.

## Metric — compute and persist

Extract the arithmetic as a pure, unit-testable function in `lib/categorize/rules.ts`:

```typescript
export function computeSkipLLMPct(ruleHits: number, geminiHits: number, noMatch: number): number | null {
  const total = ruleHits + geminiHits + noMatch;
  if (total <= 0) return null;
  return Math.round((ruleHits / total) * 100);
}
```

**Denominator includes `noMatch`** (spends Gemini also couldn't place): the metric is
the honest "share of all spends placed by a free rule," not inflated by dropping the
unplaceable ones.

In `syncCore.ts`, after the apply loop, compute `skipLLMPct` and include it in the
existing end-of-sync `setBankMeta(...)` call alongside `lastSyncedAt`/`currentBalance`,
only when non-null:

```typescript
const skipLLMPct = computeSkipLLMPct(ruleHits, geminiHits, noMatch);
await setBankMeta(uid, {
  lastSyncedAt: new Date().toISOString(),
  ...(currentBalance !== undefined ? { currentBalance } : {}),
  ...(skipLLMPct !== null ? { skipLLMPct } : {}),
});
```

`setBankMeta` uses `.set(fields, { merge: true })`, so omitting `skipLLMPct` on a
zero-spend sync leaves any prior value intact (no meaningless-0 overwrite).

Add `skipLLMPct?: number` to `setBankMeta`'s field-type in store.ts.

## Edge cases

- **recordOnly syncs** return early BEFORE categorization (existing `if (opts?.recordOnly)`
  guard) — untouched, no rule learning, no metric. Correct: nothing was categorized.
- **Zero-spend sync** → `total === 0` → `computeSkipLLMPct` returns null → field omitted.
- **Gemini failure** → `categorizeBatchWithGemini` already degrades to all-null → those
  spends fall to `noMatch`, no rule written for them (no bucketId), metric reflects reality.

## Files

- `lib/categorize/rules.ts` — add pure `computeSkipLLMPct`.
- `lib/categorize/rules.test.ts` — cases: 100% rules → 100; mix → rounded %; zero spends → null; all-noMatch → 0.
- `functions/src/store.ts` — add `skipLLMPct?: number` to `setBankMeta`'s field type.
- `functions/src/syncCore.ts` — import `saveCategoryRule`, `normalizeMerchant`, `computeSkipLLMPct`;
  write rule on Gemini hit; compute + pass `skipLLMPct` in the final `setBankMeta`.
- `functions/src/syncCore.test.ts` — NEW. Mock the store + categorizer deps; assert
  `saveCategoryRule` is called with the normalized merchant + bucket after a Gemini
  placement, and `setBankMeta` receives the expected `skipLLMPct`. (First test for
  syncCore — scope it to the new behavior, not a full retrofit.)

Functions→lib imports use RELATIVE paths (`../../lib/...`), never `@/` — the `@/`
alias has no runtime resolver in the functions build and crashes the Cloud Function
on load. (`syncCore.ts` already imports `chooseBucket` from `../../lib/categorize/rules`
this way — add the new imports to that line.)

## Verification

Emulator: sync with a rule-miss spend → confirm (a) a `categoryRules/<uid>/rules/<merchant>`
doc is created with the Gemini-chosen bucket, and (b) `users/<uid>/meta/bank.skipLLMPct`
is written. Second sync of the same merchant → it's now a rule hit (geminiHits drops,
ruleHits + skipLLMPct rise). If a live Gemini call is rate-limited, the wiring is
covered by the mocked `syncCore.test.ts`; note in the report which was exercised.

## Deliberately skipped

- Confidence thresholds on learned rules (roadmap: skip — merchant→bucket is deterministic).
- User-correction-updates-rule (decision A — follow-up).
- Any UI for the metric (persisted for a future screen; not built now).

## Sell

"Gets cheaper and more accurate every month."
