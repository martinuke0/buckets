# Coach cited transactions — tap a number, see the transaction

**Roadmap:** `docs/COACH_ROADMAP.md` Item 4. Rides on Item 2 (real tools, now merged):
the numbers the coach cites already come from deterministic tool output / real
Firestore data, so this feature is purely about *linking* a cited number to the
transaction behind it — not verifying the number.

## What the user sees

The coach says *"You spent €42 at Tesco this week."* The phrase **"€42 at Tesco"**
renders as a tappable green chip. Tapping it navigates to that specific
transaction's detail page (`/dashboard/tx/<txnId>`), which already shows the
description (place), date, amount, and bucket ("In Fun" or "Uncategorized").
The browser back button restores the chat — the conversation is persisted in
Firestore (`onSnapshot` on `coachMessages`, active conversation in localStorage),
so no chat state must be saved or rebuilt.

## Why transaction-level (not bucket-level)

An existing route `app/(app)/dashboard/tx/[id]/page.tsx` already renders a single
transaction by id: place, date, amount, and bucket-or-Uncategorized. It works for
any transaction regardless of bucket. So a chip links to `/dashboard/tx/<txnId>` —
no new screen, and it lands on the exact transaction, not a filtered list.

## Data flow

The model currently sees transactions as prose with **no id** (`coachContext.ts:44`),
and `CoachTxn` (`coachContext.ts:3-10`) has no `id` field — so today it cannot cite
a specific transaction. Three linked additions fix that:

1. **Carry the id** — add `id: string` to `CoachTxn`. The transactions already have
   stable Firestore doc ids; `coach.ts` currently maps `rawTxns` without carrying
   `d.id` into the context list — start carrying it.
2. **Show the id in the prompt** — each transaction line in `buildCoachContext`
   gains a leading id token, e.g. `[tx_abc123] 2026-07-15 · TESCO · -€42.00 · Fun`.
3. **Return citations** — the reply schema gains optional
   `citations: [{ label: string; txnId: string }]`, where `label` is the exact
   substring in `reply` to turn into a chip and `txnId` is the transaction it links
   to. The Gemini `responseSchema` constrains `txnId` to an enum of the ids actually
   shown to the model (same technique as the rebalance bucket ids).

`CoachReply` (`lib/coach/suggestion.ts`) gains `citations?: { label: string; txnId: string }[]`.
The two-phase tool loop, rebalance/suggestion path, and money path are untouched.

## Rendering (MessageBubble)

`MessageBubble` currently renders `text` as a plain string. It gains an optional
`citations` prop. When present, split the reply text on each citation's `label`
(first exact-substring match) and render the matched phrase as a
`<Link href="/dashboard/tx/<txnId>">` styled as a green chip; everything else stays
plain text. User bubbles never get citations.

## Safety (cheap guards only)

- **Label not found in the reply text** → skip that citation (no chip, no error;
  the sentence still reads normally).
- **txnId not a real transaction** → drop that citation. The schema enum constrains
  txnId to shown ids; the server also filters citations against the known id set
  before returning, so no chip can produce a dead `/dashboard/tx/<id>` link.
- **No deeper accuracy verification** (per roadmap "skip a citation verification pass
  at first") — numbers already come from real data; a fact-checker is a later step
  only if free-text claims slip through.

## Files

- `functions/src/coachContext.ts` — add `id` to `CoachTxn`; render id token in each txn line.
- `functions/src/coach.ts` — carry `d.id` into context txns; add `citations` to the
  phase-2 `responseSchema` (txnId enum = shown ids); parse + server-filter citations
  against the known id set; include in the returned `CoachReply`.
- `lib/coach/suggestion.ts` — add `citations?` to `CoachReply` type.
- `lib/coach/useCoach.ts` — carry `citations` from the callable result onto the
  persisted coach message and the `CoachMessage` read model.
- `components/coach/MessageBubble.tsx` — optional `citations` prop; render chips.
- `app/(app)/coach/page.tsx` — pass `msg.citations` into `MessageBubble`.

## Verification

Emulator: seed a transaction, ask the coach a question whose answer cites it, confirm
the reply contains a chip whose link is `/dashboard/tx/<real id>` and the target page
shows that transaction. Confirm a reply with no citable number renders as today (no
chips, no regression).

## Deliberately skipped

- Txn-id highlighting within a bucket list (we link straight to the txn page instead).
- Bucket-level citations (transaction-level supersedes it).
- Citation accuracy verification pass (Item 4 roadmap note).
- Multiple/overlapping label matches — first exact match per label only.

## Sell

"Tap any number to see the transaction behind it."
