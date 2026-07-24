# Coach roadmap — from prose-generator to deterministic-engine-with-a-voice

**Through-line:** the engine is a 9, the AI layer is a 4 *because it generates prose we
then have to police*. Every item below moves work **out of the LLM and into deterministic
code**, then uses the LLM only to *decide* and *narrate*. That is also the sell: "the coach
shows you numbers your own engine computed," not "a chatbot's opinion."

Ordering principle: **foundation → trust → cost → retention → automation**, with
money-moving risk ramping up only after trust infrastructure exists.

Every phase ships something demo-able and ends on a green `pnpm test` + emulator check
before commit.

---

## Order

1. Item 2 — Real tools + structured output (deletes `---META---`)
2. Item 4 — Cited numbers
3. Item 6 — Rules-first categorization + skip-LLM metric
4. Item 3 — Proactive, event-driven nudges
5. Item 5 — Confidence-gated auto-apply (last; only one that moves money without a tap)

Risk climbs strictly as we go. Each phase rides on the previous.

---

## Item 2 — Real tools + structured output *(FIRST)*

**Files:** `functions/src/coach.ts`, `lib/coach/parseReply.ts` (delete), new
`lib/coach/tools/*.ts` (pure), `functions/src/coachContext.ts`, `components/coach/*`.

The `@google/genai` SDK (already used in `categorizer.ts`) supports native function
calling. Declare 3 tools, all thin wrappers on code that already exists:

- `find_recurring_charges()` — pure: group txns by `normalizeMerchant` (`rules.ts`), flag ~monthly cadence.
- `simulate_month(changes)` — pure: reuse `splitIncome` (`engine.ts`) + apply hypothetical bucket edits.
- `explain_drift()` — pure delta of `meta/bank.currentBalance` vs sum of bucket `remaining`; LLM narrates only.
- Fold the existing `rebalance` suggestion in as a 4th tool → model *requests* it, `validateSuggestion` still gates. This deletes the string protocol.

**Skip:** a tool framework/registry — it's a `switch` over 4 names. No new dep.
`parseReply.ts` + its test get deleted, not migrated.

**Verify:** `pnpm test`, then emulator — ask "what if I cut Fun to 10%?" → computed table, not a paragraph.

**Sell:** "The coach runs your budget engine and shows the result."

---

## Item 4 — Cited numbers

**Files:** `functions/src/coach.ts` (schema), `functions/src/coachContext.ts`, `components/coach/MessageBubble.tsx`.

Once responses are structured (item 2), add `citations: [{txnIds?, bucketId?, label}]`.
Render each claim's citation as a tap-through chip. Numbers come from item 2's tools, so
they're already real.

**Skip:** a citation verification pass at first — add only if free-text claims slip through.

**Verify:** emulator — every coach number has a tappable chip resolving to real txns.

**Sell:** "Tap any number to see the transactions behind it."

---

## Item 6 — Rules-first categorization + skip-LLM metric

**Files:** `functions/src/syncCore.ts`, `lib/categorize/rules.ts`, `functions/src/store.ts`.

We already do rules→bulk-AI. Gap: AI hits don't *become* rules. After a Gemini
categorization, write a `categoryRule {merchant: normalized, bucketId}` so next month that
merchant is free. Add one metric to the sync log: `% spends placed without an LLM call`.

**Skip:** confidence thresholds on learned rules — merchant→bucket is deterministic;
learn on first sight, let the user correct via `recategorize.ts`.

**Verify:** `rules.test.ts` — after learning, `chooseBucket` returns bucket without `needsAI`. Second emulator sync of same merchant → 0 AI calls.

**Sell:** "Gets cheaper and more accurate every month."

---

## Item 3 — Proactive, event-driven nudges

**Files:** extend `scheduledSync`, reuse `spendSummary.ts`, one notification path.

After each `scheduledSync`, run pure trigger checks on state we already write:
"paycheck landed" (pending income exists), "80% through a bucket with N days left"
(`buildSpendSummary` has pace). On trigger → one notification carrying one cited,
pre-computed suggested action (item 2's tools). A tap-to-apply card, not a chat prompt.

**Skip:** a rules engine for triggers — 2–3 `if` checks over the summary. No new scheduler.

**Verify:** emulator — simulate an 80%-spent bucket, run scheduled fn, assert one nudge with a valid suggestion.

**Sell:** "It tells you *before* you overspend." The retention moment.

---

## Item 5 — Confidence-gated auto-apply *(LAST — moves money)*

**Files:** `functions/src/coach.ts` (`applyCoachSuggestion`), a user setting, `components/`.

Opt-in setting. Auto-apply only when all hold: low-risk type (e.g. rounding-drift sweep
≤ threshold), passes both existing guards, structurally high confidence (amount ≤ drift,
single bucket). Everything else still needs the tap.

**Skip:** ML confidence scoring — "low-risk" is a deterministic predicate.

**Verify:** unit-test the predicate (safe case auto-applies; €50 Fun→Rent does not).
Emulator: opt-in, €8 drift sweep applied without tap; real rebalance still prompts.

**Sell:** "Small stuff handles itself; big stuff always asks."
