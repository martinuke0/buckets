# MyBuckets — Coach v2: Persistence, Spending Context, Goal Memories (Design)

**Date:** 2026-07-15
**Status:** Approved for planning

## Goal

Make the AI Coach genuinely useful and durable: persist the conversation, feed it
a real per-bucket spending summary (not just the last 5 transactions), and let it
remember the user's stated goals across sessions — with a polished chat UI where a
rebalance suggestion is a small pill tucked under the coach's reply.

## Decisions (locked with user)

1. **Persistence:** full chat history in Firestore (survives reload, syncs devices).
2. **Spending context:** a computed **per-bucket spend summary** (spent vs allocated,
   % used, days left this month, a few notable txns) — not raw transaction dumps.
3. **Goals = free-text "memories":** the user states goals in plain language; the
   coach extracts + stores them and recalls them every conversation. User can view
   and delete them.
4. **UI:** the "advisor feed / branded chat" direction (D) with the rebalance action
   as a **small gradient pill tucked under the coach's reply** + a quiet "Not now"
   (design iii). Proactive unprompted insight feed is OUT of scope (fast-follow).

## Scope

**IN:**
1. Persist chat to `users/{uid}/coachMessages`; `useCoach` streams via onSnapshot;
   messages append-only.
2. Rewrite `coachContext` to produce a per-bucket month spend summary.
3. `users/{uid}/coachMemories` (free-text goals); `coachReply` loads them into the
   prompt and can emit an extracted `memory` string (code writes it — AI proposes,
   code disposes). A memories list UI to view/delete.
4. Chat UI: branded header, persisted bubbles, small Apply pill under the reply +
   "Not now", empty state showing remembered goals.

**DEFERRED (documented, NOT built):**
- Proactive unprompted insight feed (scheduled bucket analysis surfacing cards).
- Structured per-bucket savings targets with dates (we ship free-text goals only).
- Multi-currency / cross-account (unchanged).

## Global Constraints

- Money is integer cents. The rebalance money path is UNCHANGED — keep the existing
  three-layer defense (validateSuggestion at reply → at apply → in-tx re-validate in
  applyRebalance; conserving + idempotent). Goals/memories are text only and touch
  NO money path.
- New collections `users/{uid}/coachMessages` and `users/{uid}/coachMemories` are
  covered by the existing `match /users/{uid}/{sub=**}` owner rule — NO firestore.rules
  change (verify in the plan).
- `functions/` is a separate CJS package: no client `@/lib/*` import in functions
  runtime source (test files under the ESM root only).
- Gemini key server-side only; categorization/coach stay best-effort — a Gemini
  failure must never move money and must surface a friendly error, not a crash.
- Dark design tokens only (`var(--color-base|card|border|text|muted|success|danger)`,
  `var(--grad-brand)`). NO `--color-surface-*` (those are undefined — the bug we just
  fixed). No emojis in shipped UI. No `any`. `"use client"` only where needed.
- Tests use stable module-level mocks (OOM guard). GIT: local commits only, never push.

## Components

### 1. Persisted chat — `lib/data/coachMessages.ts` + `lib/coach/useCoach.ts`
- New collection `users/{uid}/coachMessages/{autoId}`:
  `{ role: "user" | "coach", text: string, suggestion?: CoachSuggestion, suggestionId?: string, createdAt: string }`.
- `useCoach` no longer holds messages in `useState`; it streams the collection
  ordered by `createdAt` via `onSnapshot`. `send()` writes the user message doc,
  calls `coachReply`, then writes the coach reply doc (with any suggestion +
  suggestionId). `apply()` unchanged (calls `applyCoachSuggestion`). Dismiss state
  can stay client-local (a dismissed suggestion just hides its pill).
- Append-only; no edits/deletes of messages in v1.

### 2. Per-bucket spend summary — `functions/src/coachContext.ts` (rewrite) + pure helper
- Extract a pure `buildSpendSummary(buckets, transactions, now)` (in the functions
  package, or a shared lib module unit-tested from the ESM root) that computes, per
  bucket, for the current month: `spent` (sum of |amount| of spends categorized to
  it), `allocated`, `pctUsed`, and picks up to ~2 notable (largest) transactions;
  plus `daysLeftInMonth`. Integer cents throughout.
- `buildCoachContext` formats that into the prompt (e.g. "Fun: €160 spent of €120
  (133%, €40 over), 12 days left. Notable: Nightclub €80."). `coachReply` fetches a
  wider transaction window (e.g. current-month spends) instead of just `limit(5)`.
- `now` is injected (not read inside the pure fn) so it's deterministically testable.

### 3. Goal memories — `functions/src/store.ts` + `coach.ts` + `lib/data/coachMemories.ts` + UI
- New collection `users/{uid}/coachMemories/{autoId}`: `{ text: string, createdAt: string }`.
- `coachReply` structured output gains an optional `memory: string` field. When the
  model extracts a goal from the user's message, code writes it as a memory doc
  (AI proposes the text, code persists it — never the model writing directly).
  Dedupe trivially by exact-text match to avoid repeats.
- Every `coachReply` loads all memories and injects them into the prompt
  ("The user's stated goals/notes: …") so advice is goal-aware across sessions.
- Client: `useCoachMemories()` streams the collection; a small memories list
  (on the Coach screen or Settings) shows each with a delete control
  (`deleteCoachMemory(uid, id)`). Trust + GDPR (EU): the user can always see and
  remove what the coach remembers.

### 4. Chat UI — `app/(app)/coach/page.tsx`, `components/coach/*`
- Branded coach header (gradient ✦), persisted bubbles (user right / coach left),
  real tokens.
- Rebalance suggestion: a **small gradient Apply pill tucked directly under the
  coach's reply**, left-aligned, with a quiet "Not now" text link (design iii).
  No full-width CTA.
- Empty state: coach greeting + a compact list of remembered goals
  ("You told me: saving for a car").
- Rate-limit note: Gemini free tier is 5 req/min — a friendly "one sec, try again"
  on 429, never a raw crash.

## Data Flow

```
send(text):
  write coachMessages{role:user,text}
  → coachReply({message, history})  [server: load buckets + month spend summary + memories → Gemini]
     → returns {reply, suggestion?, memory?}; server drops invalid suggestion; server writes memory doc if present
  → write coachMessages{role:coach, text:reply, suggestion?, suggestionId?}
apply(suggestion):
  applyCoachSuggestion → validate → applyRebalance (idempotent, conserving)  [UNCHANGED]
memories:
  useCoachMemories() streams users/{uid}/coachMemories; delete via deleteCoachMemory
```

## Error Handling
- Gemini failure in coachReply: surface a friendly error message in the chat, no
  crash; no partial money movement (rebalance only happens on explicit Apply).
- Invalid/none suggestion: reply-only (existing behavior).
- Memory write failure: log, continue (advisory; must not fail the reply).
- Empty buckets: existing failed-precondition (coach needs buckets).

## Testing
- Pure `buildSpendSummary` — per-bucket spent/%/days-left, notable-txn pick,
  month boundary (inject `now`); conserves cents.
- Memory extraction: coachReply writes a memory doc when `memory` present, dedupes
  exact repeats, never on absent; memories injected into the prompt.
- Persisted chat: `useCoach` streams + append order; send writes user then coach docs.
- Money path: already covered — no changes; re-assert validateSuggestion/applyRebalance
  untouched.
- UI: suggestion renders as the small pill under the reply (not full-width); empty
  state lists memories.

## Verification (emulator, premium user)
1. Chat survives reload (messages persist from Firestore).
2. Ask about spending → coach cites real per-bucket month figures ("80% through Fun,
   12 days left"), not vague guesses.
3. State a goal ("saving for a car") → it's remembered; a later/new session's advice
   references it; it appears in the memories list and can be deleted.
4. A rebalance suggestion shows as a small pill under the reply; Apply moves funds
   conservingly; an invalid one is dropped.
5. `pnpm test` + root & functions tsc clean; firestore.rules unchanged.
