# MyBuckets — Dashboard Usability Fixes (Design)

**Date:** 2026-07-14
**Status:** Approved for planning

## Goal

Make the dashboard read correctly and feel like a real banking app: a meaningful
hero number, tappable transactions with a clear reclassify flow, a bounded
transaction list, tappable buckets, and no dead €0.00 for fresh users.

## Decisions (locked)

- **Default buckets are created server-side on first bank connection** (inside
  `exchangePublicToken`, before the first sync) — not on client login. This
  guarantees the first income can split. Delete-safety: seed only when the user
  currently has zero buckets (an empty-check; reconnecting after deleting all
  buckets re-seeding is an accepted rare edge, not worth a marker).
- **A dev-only "Simulate payment"** dialog writes a real spend transaction and
  draws down a chosen bucket — dev-gated (`NODE_ENV === "development"`), never
  ships to production, mirroring the existing "Simulate income" button.

## Root Cause Context

Three of the five reported symptoms share one cause: **a user with zero buckets**.
When `buckets.length === 0`:
- income cannot split (`applyIncomeAdmin` skips "no buckets") → every bucket
  `remaining` stays 0 → hero shows €0.00 despite synced spends;
- spends cannot be classified → the per-transaction `<select>` renders with **no
  options** → "the dropdown does nothing";
- the Buckets tab has nothing to drill into.

Auto-seeding the default buckets on first login fixes the €0.00 hero, the empty
dropdown, and empty classification together.

## Scope

**IN:**
1. Auto-create default buckets **server-side on first bank connection** (inside
   `exchangePublicToken`, before the first sync) when the user has none.
2. Hero shows **total remaining across all buckets**, relabeled "Safe to spend".
3. Tap-to-reclassify: transaction rows are tappable → a transaction detail view
   with a "Move to bucket" picker (replaces the inline `<select>`).
4. "Load more" pagination in the transaction list (20 at a time, client-side slice).
5. Tappable bucket rows on the Buckets tab → existing `/dashboard/bucket/[id]`.
6. **Dev-only "Simulate payment"** dialog (pick bucket + amount) that writes a
   real spend transaction and draws down the chosen bucket. Dev-gated.

**OUT (YAGNI):** richer bucket analytics, infinite scroll, forced-onboarding
redirect, observability, any money-logic change.

## Global Constraints

- Money is integer cents everywhere; display via `formatEuros`. No business-logic
  or split/balance math changes — this is display + navigation + one seed write.
- Dark design tokens only (`var(--color-*)`, `var(--grad-*)`); no hardcoded hex,
  no emojis, inline SVG only.
- TypeScript strict; no `any`. `"use client"` only where hooks/interactivity require it.
- Tests use stable module-level mock objects (never a fresh object per render —
  the established OOM guard).
- GIT: local commits only. Never push, never add a remote.
- Firestore access stays within existing per-user rules (`users/{uid}/**` is
  owner read/write). No rules change.

## Components

Each component is independently testable and has one responsibility.

### 1. Auto-seed default buckets — `lib/data/useEnsureBuckets.ts`

- **What:** On first authenticated render where the user's buckets collection is
  empty, write the 5 default buckets once.
- **Defaults:** reuse the existing `DEFAULT_BUCKETS` set
  (Rent 35 / Savings 30 / Food 15 / Nights out 10 / Gym 10, all `type: "virtual"`,
  `remaining: 0`, `allocated: 0`). Move it to a shared module
  (`lib/data/defaultBuckets.ts`) so both the Buckets page and the seeder import it
  (DRY — currently only in `app/(app)/buckets/page.tsx`).
- **Idempotency + delete-safety:** seed only when buckets are empty AND a one-shot
  marker `users/{uid}/meta/app.seededBuckets` is not set. Set the marker in the
  same write. This prevents re-seeding for a user who deliberately deleted buckets
  down to zero.
- **How used:** call the hook in the app-group layout (or `AuthProvider`) so it
  runs once per session after auth resolves. The hook awaits the current buckets
  snapshot before deciding (no seed while `loading`).
- **Depends on:** `getDb`, `useAuth`, the shared `DEFAULT_BUCKETS`, `bucketsCol`.

### 2. Hero = total remaining — `components/buckets/SafeToSpendHero.tsx` + `dashboard/page.tsx`

- **What:** Keep `safeToSpend = buckets.reduce((s,b)=>s+b.remaining,0)` (already
  computed in `dashboard/page.tsx`). Relabel the hero from "Safe to spend today"
  to **"Safe to spend"** so the number reads as "total left across your envelopes."
- Keep the month-pacing bar. (The "payday in Nd" line was removed — it was a
  fabricated estimate assuming payday = end of month.)
- **Depends on:** nothing new; copy + prop framing only.

### 3. Tap-to-reclassify — `app/(app)/dashboard/tx/[id]/page.tsx` (new) + `TransactionList`

- **What:** Remove the inline `<select>` from `TransactionList`. Make each
  transaction row a tappable `Link` to a new transaction detail route
  `/dashboard/tx/[id]`.
- **Detail page:** shows description, `bookedAt`, `formatEuros(amount)`, the
  current bucket name (or "Uncategorized"), and — for spends — a **"Move to
  bucket"** picker (buttons or a labelled select) listing the user's buckets.
  Selecting one calls the existing `recategorize(uid, txn, bucketId, buckets)`
  and returns the user to the dashboard (or stays with a confirmation).
- Reuses `useTransactions` + `useBuckets` to resolve the txn and bucket list by id.
- **Depends on:** existing `recategorize`, `useBuckets`, `useTransactions`,
  `formatEuros`. Mirrors the existing `/dashboard/bucket/[id]` route pattern.

### 4. "Load more" pagination — `components/tx/TransactionList.tsx`

- **What:** Render the first 20 transactions; a **"Load more"** button reveals the
  next 20 (client-side `useState` count, `transactions.slice(0, visible)`).
- The Firestore listener already streams all transactions ordered by `bookedAt`
  desc; this only bounds what is rendered. No new query, no scroll listener.
- Button hidden when `visible >= transactions.length`. Resets are unnecessary
  (list only grows via live sync; showing more is monotonic per session).
- **Depends on:** nothing new.

### 5. Tappable bucket rows — Buckets tab (`components/buckets/BucketSetup.tsx` or `app/(app)/buckets/page.tsx`)

- **What:** Each bucket row on the Buckets tab links to the existing
  `/dashboard/bucket/[id]` detail page (name, remaining, its classified
  transactions). Wrap the row's name/identity area in a `Link`.
- **Constraint:** the Buckets tab also hosts edit controls (rename, recolor,
  delete, the draggable allocation bar). The tap-through must NOT hijack those:
  only the bucket's name/identity region navigates; sliders, inputs, menu, and
  drag handle keep their own handlers (stop propagation where needed).
- **Depends on:** existing `/dashboard/bucket/[id]` page.

## Data Flow

```
First login (auth resolved)
  └─ useEnsureBuckets: buckets empty & not seeded? → write 5 defaults + marker
       └─ income split + spend classification now have targets

Dashboard
  ├─ hero = Σ bucket.remaining  (label "Safe to spend")
  ├─ TransactionList (first 20, "Load more" for +20)
  │    └─ row tap → /dashboard/tx/[id] → "Move to bucket" → recategorize()
  └─ status line (existing) "Bank connected · synced …"

Buckets tab
  └─ bucket name tap → /dashboard/bucket/[id] (existing) → its transactions
```

## Error Handling

- Seed write failure: log + no-op (dashboard still renders; user can create
  buckets manually on the Buckets tab). Never block render on the seed.
- Transaction/bucket id not found on a detail route: render a "Not found — back
  to dashboard" state, not a crash.
- `recategorize` failure: surface a small inline error on the detail page; do not
  navigate away as if it succeeded.

## Testing

- **Seed (unit):** empty + unseeded → writes defaults + marker; empty + already
  seeded → no write; non-empty → no write. (stable mocks)
- **Hero (unit):** sums `remaining` across buckets; label is "Safe to spend".
- **TransactionList (unit):** renders ≤20 rows; "Load more" reveals the next 20;
  button hidden when all shown; no inline `<select>` remains; rows link to
  `/dashboard/tx/[id]`.
- **Tx detail (render smoke):** resolves a txn by id, shows bucket picker for a
  spend, calls `recategorize` on pick.
- **Bucket row (render smoke):** name links to `/dashboard/bucket/[id]`; edit
  controls do not navigate.
- Full suite + `tsc --noEmit` clean; functions untouched.

## Verification (end-to-end, emulator)

1. Fresh dev user → dashboard: 5 buckets auto-seeded; after a sync + income, hero
   shows a non-zero total remaining.
2. Transaction list caps at 20 with a working "Load more".
3. Tap a transaction → detail → "Move to bucket" → its bucket `remaining` updates
   and the txn shows the new bucket.
4. Buckets tab → tap a bucket → its detail page lists the transactions classified
   into it; editing a bucket (rename/slider) does not navigate.
