# MyBuckets — Coach v3: Streaming, Transaction-Aware, Applied Confirmations (Design)

**Date:** 2026-07-15
**Status:** Approved for planning

## Goal

Three focused Coach upgrades in one plan:

1. **Streaming replies** — the coach's message appears chunk-by-chunk, not after
   a blocking round-trip; the "not streaming" complaint goes away.
2. **Real transaction context** — the coach sees the last ~30 raw transactions
   (with a derived `isPreAnchor` flag), so it can answer "what's my transaction
   history?" honestly and give advice grounded in spending patterns instead of
   hallucinating a refusal.
3. **Applied confirmations** — when the coach's suggestion is applied, the user
   gets an immediate, visible acknowledgement: inline replacement of the
   suggestion card *and* a short toast.

## Decisions (locked with user)

1. **Streaming render:** client-only accumulation into a placeholder bubble;
   Firestore persists ONE final coach doc when the stream ends (not per-chunk).
2. **JSON delivery:** text-first + `---META---\n{...}` footer. Gemini streams
   free-text `reply` first; suggestion/memory arrive as a JSON blob after the
   delimiter, parsed only when the stream completes. No `responseSchema`
   (incompatible with streaming); the delimiter is the contract.
3. **Transaction context:** last 30 current-month transactions with a per-txn
   `isPreAnchor` derived from `bookedAt < users/{uid}/meta/bank.anchoredAt`.
   All are sent to Gemini; a system-prompt line teaches the coach that
   pre-anchor entries are historical/informational — they don't draw current
   buckets, and rebalance suggestions must be based on current bucket state.
4. **Apply confirmation:** inline replacement of the SuggestionCard with a
   persistent "Applied: Fun → Savings, €40 · just now" strip AND a 2.5s toast.

## Scope

**IN:**
1. `coachReply` becomes a streaming callable (Firebase Functions v2 async-generator
   `onCall`) using Gemini `generateContentStream`.
2. Client `useCoach.send()` consumes the stream via `httpsCallable(...).stream()`,
   renders accumulating text into a placeholder bubble, then writes ONE final doc.
3. Pure parser `parseCoachReplyStream(fullText) → { reply, suggestion?, memory? }`
   handling `---META---` delimiter (missing delimiter, malformed footer → best-effort).
4. `coach.ts` fetches up to 30 current-month transactions; reads `anchoredAt`;
   derives `isPreAnchor` per txn; passes to `buildCoachContext`.
5. Prompt: new transactions section with a `pre-anchor is informational` note.
6. Applied-confirmation UI: inline strip (persisted alongside the message via a
   client-side `appliedAt` field on the coach message doc) + short toast.

**DEFERRED (documented, NOT built):**
- `adjust_percent`-type structured suggestions ("raise Fun to 15%") — needs a
  new suggestion schema variant; called out as the next natural follow-up.
- Server-persisted streaming chunks (multi-device live streaming) — not needed
  for MVP; the single-final-doc contract also matches the AI→money gate.
- Rate-limit-aware queuing / retry on Gemini 429 during streaming — best-effort
  error path suffices; the user retries via the existing Retry button.

## Global Constraints

- Money is integer cents. The rebalance money path is UNCHANGED — three-layer
  defense stays (`validateSuggestion` at reply → `applyCoachSuggestion` →
  `applyRebalance` idempotent in-tx re-validate). Streaming changes reply
  *delivery*, never validation: the suggestion is validated ONLY after the full
  stream lands and the JSON footer parses.
- `functions/` is a SEPARATE CJS package (`firebase-functions ^6.2.0`, v2 SDK,
  streaming callables supported). No client `@/lib/*` import in functions
  runtime source. Vitest files under the ESM root only.
- Gemini key server-side only; best-effort — a stream failure surfaces a
  friendly error and never crashes; memory/suggestion writes best-effort.
- Coach messages persistence contract unchanged: append-only in
  `users/{uid}/coachMessages/{autoId}` with existing schema
  (`{ role, text, suggestion?, suggestionId?, createdAt }`) PLUS optional
  `appliedAt?: Timestamp` set client-side after a successful `apply()`.
  Owner-scoped via existing `users/{uid}/{sub=**}` rule — NO rules change.
- No `undefined` in Firestore writes (the earlier bug class): conditional
  fields, no `as CoachMessageDoc` cast that would silence undefineds.
- Dark tokens only (`var(--color-*)`, `var(--grad-brand)`). NEVER `--color-surface-*`
  (undefined; the prior invisible-bubble bug). No emojis in shipped UI; inline
  SVGs (`Sparkle`, `SendIcon`) already exist. No `any`. `"use client"` only where needed.
- Tests use stable module-level mock objects (fresh-per-call → OOM guard).
- GIT: local commits only, never push.

## Components

### 1. Streaming callable — `functions/src/coach.ts` (rewrite of `coachReply`)
- Signature: `export const coachReply = onCall(async function*(request) { ... })`.
  The async-generator body yields text chunks; the Firebase Web SDK's
  `httpsCallable(...).stream(input)` returns an async iterable of those chunks
  plus a final `data` result. In our design the yielded chunks ARE the reply;
  the final `data` returned by `return { fullText }` carries the raw stream
  text as a fallback (also used by non-streaming clients / tests).
- Body: auth-gate → load buckets + memories + `anchoredAt` + up to 30 current-month
  transactions → build the prompt (via `buildCoachContext`, updated in Component 3)
  → call `ai.models.generateContentStream(...)` and forward each chunk's text via
  `yield chunk.text`.
- After stream completes on the server: parse full accumulated text via
  `parseCoachReplyStream` (Component 2), run `validateSuggestion` on the parsed
  suggestion (drop if invalid — existing behaviour), persist an extracted memory
  best-effort (existing behaviour), then `return { fullText }`.
- `logEvent` instrumentation unchanged (`start`/`ok`/`error` with coarse meta:
  `{ hasSuggestion, hasMemory }` on ok). No PII in logs.

### 2. Pure delimiter parser — `lib/coach/parseReply.ts` (new) + test
- `parseCoachReplyStream(fullText: string): { reply: string; suggestion?: unknown; memory?: unknown }`.
- Split on the first occurrence of `\n---META---\n` (or `\n---META---` at EOF,
  or a variant with different whitespace — normalize by regex). Everything
  before → `reply` (trimmed of trailing whitespace). Everything after → tried
  as `JSON.parse` best-effort. On JSON failure: return `{ reply: fullText, ... }`
  with no suggestion/memory. On no delimiter: whole thing is `reply`, no meta.
- Validation of the *shape* of `suggestion` (rebalance keys, integer amount,
  known bucket IDs) is NOT this function's job — that's `validateSuggestion`
  which runs after this parser. This function only splits and JSON-parses.
- Pure; unit-tested exhaustively (missing delimiter, malformed footer, footer
  with extra text after JSON, unicode in reply, big multi-line reply, etc.).

### 3. Transaction-aware context — `functions/src/coachContext.ts` + `spendSummary.ts` unchanged
- `coach.ts` now fetches: `bucketsSnap` (existing), `txnsSnap` (current-month —
  existing but now KEEP the raw list), `memories` (existing), and
  `metaSnap = getDoc('users/{uid}/meta/bank')` to read `anchoredAt: string | undefined`.
- Build `contextTxns = txns.map(t => ({ description, amount, bookedAt, bucketId,
  isIncome, isPreAnchor: anchoredAt ? t.bookedAt < anchoredAt : false }))`,
  then take the most recent 30 (sorted `bookedAt` desc). Integer cents preserved.
- Extend `buildCoachContext(summary, memories, contextTxns)` — add an optional
  parameter (default `[]`) so existing tests pass. When non-empty, emit a
  section:
  > *Recent transactions (most recent 30, `pre` = pre-anchor / historical):*
  > `- 2026-07-10 · Nightclub · -€80.00 · Fun` (post-anchor)
  > `- 2026-07-05 · Groceries · -€12.00 · Food · pre`
  and append the guidance line:
  > *"Pre-anchor entries are historical — informational for spending patterns
  > and advice, but they do NOT draw current buckets. Rebalance suggestions
  > must be based on the bucket state above."*
- The `pre` tag makes it grep-able for the model without needing a schema field
  the model has to invent.

### 4. Client streaming consumer — `lib/coach/useCoach.ts` (partial rewrite)
- `send(text)` no longer awaits the full `httpsCallable(...)` promise. It:
  1. `logAction("coach_send")`, `addDoc` the user message (unchanged).
  2. Call `httpsCallable(functions, "coachReply").stream({message, history})`.
     For each `chunk` from `stream.stream` (async iterable), append to a local
     `streamingText` state exposed by the hook.
  3. Await `stream.data` to get the full text server-parsed already (fallback).
  4. Parse locally with `parseCoachReplyStream` to derive `{reply, suggestion?, memory?}`
     from what accumulated — belt-and-braces vs. the server value. Prefer the
     server's `fullText` if present.
  5. Write ONE coach message doc with `{role, text: reply, suggestion?, suggestionId?, createdAt}`.
     Suggestion/suggestionId ONLY included when suggestion exists (no undefineds).
  6. Clear `streamingText` (the placeholder bubble disappears; the persisted
     message appears in its place via the onSnapshot listener).
- New hook output: `streamingText: string | null` (null when not streaming, else
  the accumulating text). `sending` remains true throughout.
- Errors: any stream/parse failure → `setError(...)`, clear `streamingText`,
  DO NOT persist a partial message. User can Retry via the composer.

### 5. Applied-confirmation UI — `components/coach/SuggestionCard.tsx` + a new toast
- The persisted coach message doc gains an optional `appliedAt?: Timestamp` set
  by `useCoach.apply()` **after** the `applyCoachSuggestion` callable resolves
  (best-effort: money already moved server-side; the client mark is UX only).
- `SuggestionCard` accepts `appliedAt?: string`. When present: render a compact
  "Applied · {from} → {to} · {formatEuros(amount)} · {timeAgo(appliedAt)}"
  strip with a green success dot — replaces the Apply/Not now controls in place.
  Persistent (shows up on reload; you can scroll back).
- `<CoachToast>` (new, in `app/(app)/coach/page.tsx`): a small slide-in at the
  top of the chat area — "€X moved: A → B ✓" for 2.5s. Managed by `useState`
  in the page; `apply` sets it, a `setTimeout` clears it.
- Dismissed vs. applied logic on the page: an `applied` set replaces
  `dismissed` for that suggestion id (both hide the pill; applied additionally
  shows the confirmation strip via `appliedAt`).

## Data Flow

```
User types → send():
  addDoc(user message)
  → httpsCallable("coachReply").stream({message, history})
    server: yield chunks from Gemini generateContentStream
    client: streamingText accumulates → placeholder bubble renders
  server: on stream end → parse text → validate suggestion → persist memory (best-effort)
                                                          → return { fullText }
  client: parseCoachReplyStream(fullText) → {reply, suggestion?, memory?}
        → addDoc(coach message) with reply + (conditionally) suggestion + suggestionId
        → clear streamingText (persisted message renders via onSnapshot)

User clicks Apply on a suggestion:
  applyCoachSuggestion → applyRebalance (unchanged; idempotent, in-tx re-validate)
  on success: updateDoc(coach message, { appliedAt: Timestamp.now() }) + show toast
  SuggestionCard sees appliedAt on the doc → renders "Applied" strip in place
```

## Error Handling

- Gemini stream failure (429, network, model refused): surface a friendly
  error banner in the composer; no partial message persisted; Retry button
  fires the last attempt.
- Malformed `---META---` footer: parser returns `{reply: fullText}` with no
  suggestion/memory — user still sees the reply text. Best-effort.
- `validateSuggestion` fails on the parsed suggestion: existing behaviour —
  drop the suggestion, log a warning, deliver reply-only.
- `apply` failure: existing behaviour (surface error, no partial money move).
- `appliedAt` write failure after money moved: log; the money is applied; the
  UI just won't show the confirmation on reload. Non-critical.
- Ordering guarantee: `applyRebalance` is idempotent via `suggestionId`. If the
  user double-clicks Apply, the second call is a server-side no-op. UI already
  guards via `applying` state.

## Testing

- `parseCoachReplyStream` — pure: no delimiter → all reply; reply + valid JSON
  footer → parsed meta; malformed JSON footer → reply only, no meta; extra
  text after JSON → best-effort parse of first JSON block; unicode reply;
  empty reply; delimiter-only (`---META---\n{}` at start) → empty reply.
- `isPreAnchor` derivation — pure test: `bookedAt < anchoredAt` → true;
  `bookedAt >= anchoredAt` → false; `anchoredAt` missing → all false.
- `buildCoachContext` — includes the transactions section + guidance line
  when txns non-empty; omits when empty; preserves the existing goals/spend
  formatting.
- Client `useCoach.send` — writes user doc, consumes stream (mocked), writes
  ONE coach doc after stream ends with reply+suggestion, `streamingText`
  populates during and clears at end. Stable module-level mocks (OOM guard).
- SuggestionCard `appliedAt` — renders Apply/Not now when absent; renders the
  "Applied" strip when present. New render test.
- Toast — appears on `apply` success, disappears after 2.5s (fake timers).
- Money path: no new tests needed — untouched. Assert in the final gate that
  `validateSuggestion` / `applyRebalance` sources are unchanged.

## Verification (emulator, premium user)

1. Fresh user, no chat history → the branded header, welcome, sample prompts
   render (no regression).
2. Ask "hello" → placeholder coach bubble appears immediately, text streams
   in chunk-by-chunk; on completion the message persists (visible on reload).
3. Ask "what's my transaction history?" → the coach lists recent transactions
   using the raw data it now sees; does NOT say "I don't have access".
4. Ask a rebalance-worthy question (e.g. "move some to savings") → coach
   proposes a suggestion; parse the `---META---` footer client-side, small
   pill renders under the reply.
5. Click Apply → money moves (existing path); the SuggestionCard is replaced
   in-place by the green "Applied: Fun → Savings, €40 · just now" strip; a
   toast slides in and dismisses after 2.5s; reload → strip persists.
6. Ask about pre-anchor spending → coach discusses patterns but does NOT
   propose a rebalance rooted in pre-anchor transactions (prompt guidance).
7. `pnpm test` + root & functions tsc + functions build all clean;
   `firestore.rules` unchanged; grep `color-surface` empty; money path files
   (`store.ts`, `syncCore.ts`, `spendSummary.ts`, `suggestion.ts`) untouched
   in diff.

## Deferred follow-ups (not in this plan)

- **`adjust_percent` suggestion variant:** so the coach can turn advice like
  "raise Fun to 15%" into a one-click action. Needs a new schema case in
  `CoachSuggestion` and a new server apply path. Own spec/plan.
- **Server-persisted streaming chunks:** for live cross-device streaming.
  MVP doesn't need it; the AI→money gate is easier with the single-final-doc
  model.
- **Adaptive rate-limit handling on Gemini stream (backpressure, retry):**
  today the coach surfaces a friendly error and the user retries.
