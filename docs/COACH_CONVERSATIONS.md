# Coach conversations — reset, history, delete

Before this, `coachMessages` was one flat, ever-growing stream per user: no way to
start fresh, browse past chats, or clear history.

## Model

Nested subcollection (chosen over a `conversationId` field to avoid a composite index):

```
users/{uid}/conversations/{cid}              # summary: { title, createdAt, lastMessageAt }
users/{uid}/conversations/{cid}/messages/{mid}   # unchanged message shape
```

- Messages sort by `orderBy(createdAt)` **within one conversation** → single-field,
  served by Firestore's automatic index. No `firestore.indexes.json` needed.
- Firestore rules unchanged: the existing `match /users/{uid}/{sub=**}` wildcard already
  covers the nesting, owner-only.

## Behavior

- **New / reset** — `newConversation()` mints a fresh `cid` in `localStorage`
  (`coach:activeConversation:{uid}`). Nothing is written until the first message, so
  empty threads never appear. A reload resumes the same thread.
- **Browse** — `useCoachConversations()` streams summary docs `orderBy(lastMessageAt, desc)`.
  The summary doc is born on first message (title = first 60 chars) and its
  `lastMessageAt` bumps every turn.
- **Delete** — `deleteCoachConversation(uid, cid)` batch-deletes that conversation's
  messages + its summary doc, scoped by construction to `conversations/{cid}`. It
  **never** touches `coachMemories` (goals) or `coachActions` (rebalance idempotency),
  which live in separate collections — money safety and stated goals survive any reset.

## Files

- `lib/model/paths.ts` — `coachConversationsCol`, `coachMessagesCol(uid, cid)`
- `lib/data/coachConversations.ts` — list hook + scoped delete (new)
- `lib/coach/useCoach.ts` — active-cid state, scoped snapshot/writes, summary upsert,
  `newConversation` / `openConversation`
- `lib/data/coachMessages.ts` — `updateCoachMessageApplied(uid, cid, msgId)`
- `app/(app)/coach/page.tsx` — header "New" + "History" controls, history panel

## Ceiling

`deleteCoachConversation` uses a single write batch (Firestore's 500-op cap). Fine for
normal chats; chunk the batch if a single conversation ever exceeds ~500 messages.

## Verification status

Static checks pass: `tsc` clean, 152/152 tests green. Browser runtime verification was
**blocked** — the dev server's HMR websocket was failing and reloading the page mid-auth,
so `/coach` never got past its loading gate. The reset/history/delete flows have not yet
been eyeballed in a running browser.
