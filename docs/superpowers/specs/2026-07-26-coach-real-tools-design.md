# Coach real tools — two-phase function calling

**Roadmap:** `docs/COACH_ROADMAP.md` Item 2 (FIRST). The structured-output half
(`responseSchema`, delete `parseReply.ts`) already landed on `feat/coach-tools` in
commit `e7b194d`. This spec covers the remaining half: **real tools via native
function calling**.

**Through-line:** move analysis work out of the LLM's prose and into deterministic
code. The model *decides which* numbers to compute and *narrates* them; the numbers
themselves come from functions that already power the app (`splitIncome`,
`normalizeMerchant`).

## Architecture — two phases inside `coachReply`

Gemini rejects `tools` and forced-JSON `responseSchema` in the same call, so the
callable runs two phases:

**Phase 1 — analysis loop.** `generateContent` with `config.tools =
[{ functionDeclarations }]` (the 3 analysis tools) and the existing context prompt,
**no** `responseSchema`. While the model emits `functionCall` parts:
1. dispatch each via `runCoachTool(name, args, ctx)` — a `switch` over the tool names
2. append the result as a `functionResponse` part to the running `contents`
3. re-call with the accumulated history

**Hard cap: 3 rounds.** After the 3rd, break to phase 2 regardless of what the model
wants. The tools are single-shot reads; more rounds have no legitimate use and only
add cost/latency.

**Phase 2 — structured answer.** One `generateContent` with the **existing**
`responseSchema` (`{ reply, suggestion?, memory? }`, unchanged), given the accumulated
tool results as extra context. `parseStructuredReply` + `validateSuggestion` are
untouched.

Cost: worst case ~4 Gemini calls/turn (3 tool rounds + final), typical ~2.

**Client contract is unchanged** — `CoachReply` shape identical, zero client edits.

## Tools — pure, in `lib/coach/tools/`

Client-side lib (not `functions/src`) so they unit-test without the functions emulator,
matching where `engine.ts` / `rules.ts` already live. Each wraps existing code:

| Tool | Signature | Wraps | Returns |
|---|---|---|---|
| `find_recurring_charges` | `(txns) → { merchant, amount, count }[]` | `normalizeMerchant` — group by merchant, flag ≥2 hits at ~monthly cadence | recurring list |
| `simulate_month` | `(income, currentRules, changes) → Allocation[]` | `splitIncome` with hypothetical percent edits | per-bucket allocation table |
| `explain_drift` | `(currentBalance, buckets) → { drift, byBucket }` | pure delta `balance − Σ remaining` | drift number + per-bucket |

- `lib/coach/tools/index.ts` — exports `runCoachTool(name, args, ctx)` (the `switch`)
  and the `functionDeclarations` array (Gemini `Type` schema per tool).
- `ctx` carries the txns / buckets / currentBalance already fetched at the top of
  `coachReply`, so tools never re-read Firestore.
- **No tool registry / framework** — a `switch` over 3 names (roadmap: YAGNI).

### Rebalance is NOT a declared tool

Per design decision: the rebalance stays the **phase-2 `responseSchema` field**,
gated by `validateSuggestion` exactly as today. It is never declared to the model as a
function. The analysis tools *inform* a rebalance the model then proposes via the
schema. This keeps the working money path untouched.

## Error handling

- A tool that throws returns `{ error: msg }` as its `functionResponse` — the model
  narrates the failure; the callable never crashes.
- Loop cap = 3 rounds.
- Phase 2 always runs, even if phase 1 errors out — degrades to today's single-call
  behavior (a coach reply with no tool-computed numbers).

## Files

**New:**
- `lib/coach/tools/recurring.ts` · `simulate.ts` · `drift.ts` — pure functions
- `lib/coach/tools/index.ts` — `runCoachTool` + `functionDeclarations`
- `lib/coach/tools/recurring.test.ts` · `simulate.test.ts` · `drift.test.ts` — one
  assert-based test each

**Changed:**
- `functions/src/coach.ts` — wrap the existing call in phase-1 loop + phase-2 call;
  `parseStructuredReply`, `validateSuggestion`, memory-write, `logEvent` all stay
- `functions/src/coach.test.ts` — assert a tool round-trips into the final answer
  (mock Gemini to emit a `functionCall`; assert the tool ran and phase 2 produced the
  structured reply)

## Verification

- `pnpm test` green.
- Emulator: ask *"what if I cut Fun to 10%?"* → model calls `simulate_month`, reply
  contains the computed allocation table, not a hand-waved paragraph.

## Deliberately skipped

- Tool registry / framework (it's a 3-way `switch`)
- Streaming tool progress to the UI
- Citations — that's Item 4, rides on this

## Sell

"The coach runs your budget engine and shows the result."
