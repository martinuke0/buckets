# MyBuckets — Real-Balance Money Model + Prompt-on-Income (Design)

**Date:** 2026-07-14
**Status:** Draft for user review

## Goal

Anchor bucket balances to the user's REAL current bank balance (from the
aggregator), so the sum of buckets equals actual money — never a made-up
running total that can spiral negative. On first connection, partition the
real balance across buckets by their percentages. When new income arrives,
PROMPT the user to confirm the split (confirm-first) instead of silently
auto-applying.

## Decisions (locked with user)

1. **Balance model = partition the real bank balance.** `sum(bucket.remaining)`
   tracks the real account balance, not `income − spends`.
2. **First connection:** take the real current balance once and split it across
   buckets by their % as the starting allocation. User can adjust after.
3. **New income (+):** confirm-first — surface a prompt ("You received €X — here's
   the suggested split · Adjust / Confirm"). Nothing moves until confirmed.

## The Core Invariant (and the tension it resolves)

**Today (event-sourced envelope):** `remaining[b] = Σ income-splits[b] − Σ spends[b]`;
`allocated` only ever grows. Sandbox data (mostly spends, little income) drives
this negative.

**New (real-balance anchored):** the bank balance is the ground truth. Buckets are
a *partition* of it:

```
Σ bucket.remaining  ==  lastKnownBankBalance          (the anchor invariant)
```

Money enters/leaves buckets through exactly three controlled events, each of which
keeps the invariant true:

- **Anchor (first connect / re-anchor):** set `Σ remaining = realBalance` by
  splitting the real balance across buckets by %. This is a *replace*, not an add.
- **Confirmed income:** user received €X and confirmed a split → add the split
  amounts to buckets (`Σ remaining += X`), matching the balance rising by €X.
- **Categorized spend:** a spend of €Y drawn from bucket b → `remaining[b] −= Y`
  (`Σ remaining −= Y`), matching the balance falling by €Y.

**Why this avoids the double-count the investigator flagged:** we do NOT both
re-partition the whole balance *and* replay transactions. After the initial
anchor, income and spends are the ONLY movers. We re-anchor only on an explicit
user action (or first connect), never automatically on every sync — automatic
re-partitioning is exactly what would double-count against the spend draw-downs.

**Drift:** real bank balance and `Σ remaining` can diverge (bank fees, transfers
we didn't categorize, rounding, transactions synced but left uncategorized). We
SURFACE drift rather than silently reconciling: the dashboard shows the real
balance and, when it differs from `Σ remaining` beyond a cent tolerance, a small
"Re-sync buckets to balance" affordance that re-anchors on demand. Silent
continuous reconciliation is explicitly OUT (it would corrupt intentional
per-bucket balances).

## Scope

**IN:**
1. `getBalance()` on the `BankProvider` interface + `PlaidAdapter` (Plaid
   `accountsBalanceGet`), behind the existing provider abstraction.
2. Fetch + store the real balance on connect and on each sync
   (`users/{uid}/meta/bank.currentBalance`, integer cents, client-readable).
3. **Anchor on first connection:** after seeding buckets, split the real balance
   across them by % as the starting allocation (replace, sets `remaining` +
   `allocated`).
4. **Prompt-on-income:** synced income no longer auto-splits. It writes a
   `users/{uid}/pendingIncome/{id}` record; the dashboard surfaces a confirm-first
   prompt (reusing the existing split-preview UI); on Confirm it applies the split
   (idempotent), on Adjust the user tweaks first.
5. Dashboard shows the **real account balance** as the headline reconciliation
   figure; "Safe to spend" stays `Σ remaining` (now equal to the balance after an
   anchor). A drift indicator + "Re-sync buckets to balance" (re-anchor) when they
   diverge.

**DEFERRED (documented, NOT built):**
- Automatic drift reconciliation / smart re-allocation.
- Multi-account aggregation (sum balances across items) — MVP uses the primary
  connected item's balance; multiple items sum naively with a documented caveat.
- Per-user "auto-split vs prompt" setting (we ship prompt-first only; the dead
  `autoApplySplit` flag stays dead until a settings toggle is built).
- x402 / crypto buckets (unchanged, still deferred).

## Global Constraints

- Money is integer cents everywhere. All bucket-balance mutations happen in
  Firestore transactions with read-before-write and idempotency markers, matching
  existing `applyIncomeAdmin`/`applySpendCategorization` patterns.
- **Conservation:** every event preserves `Σ remaining == lastKnownBankBalance`
  (± the surfaced drift). splitIncome (largest-remainder) already conserves cents.
- Secrets/tokens server-side only; `bankConnections/**` stays deny-all. Balance
  stored in `users/{uid}/meta/bank` is non-sensitive (a number), owner-readable.
- `functions/` stays CJS; no client `@/lib/*` import in functions runtime source.
- Dark tokens, no emojis, no `any`. Tests use stable module-level mocks.
- GIT: local commits only, never push.
- "AI advises, code disposes": Gemini categorization stays best-effort and must
  never block a balance mutation.

## Components

### 1. Provider balance capability — `lib/bank/provider.ts`, `lib/bank/plaidAdapter.ts`
- Add to `BankProvider`: `getBalance(accessToken: string): Promise<Cents>` — the
  aggregated current balance across the item's accounts, integer cents, our sign
  (positive = money you have).
- `PlaidAdapter.getBalance` calls `accountsBalanceGet`, sums `balances.current`
  across depository accounts, converts to cents via `toCents`. Add `accountsBalanceGet`
  to the `PlaidClientLike` interface (keeps SDK decoupled).
- Best-effort: on failure return `null`-equivalent handling at the caller (a
  balance fetch failure must not crash connect/sync — it just skips the anchor/
  drift update for that run).

### 2. Store balance + anchor — `functions/src/store.ts`, `functions/src/syncCore.ts`, `functions/src/bank.ts`
- `setBankMeta` extended to persist `currentBalance?: Cents` (alongside
  connectedAt/lastSyncedAt).
- `anchorBucketsToBalance(uid, balanceCents)` (admin, transactional): read buckets +
  their percents (must sum 100), `splitIncome(balanceCents, rules)`, then SET each
  bucket `remaining` and `allocated` to its share (replace — not increment).
  Idempotency: an anchor marker so first-connect anchors exactly once per connection.
- In `exchangePublicToken`: after `seedDefaultBucketsIfEmpty`, fetch `getBalance`,
  `setBankMeta({currentBalance})`, and `anchorBucketsToBalance` — BEFORE the first
  sync. (First sync then draws down spends from the anchored buckets.)
- In `syncOneUser`: fetch `getBalance` and update `currentBalance` each run (for the
  drift indicator). Do NOT re-anchor automatically.

### 3. Prompt-on-income — `functions/src/store.ts` + `functions/src/syncCore.ts` (server), `lib/data/pendingIncome.ts` + dashboard (client)
- Server: in `syncOneUser`, income transactions no longer call `applyIncomeAdmin`.
  Instead `writePendingIncome(uid, {incomeTxId, amount, description, bookedAt})` to
  `users/{uid}/pendingIncome/{incomeTxId}` (idempotent by that id).
- Client: `usePendingIncome()` hook streams unresolved pending-income docs. The
  dashboard shows a prompt banner per pending item: amount + a split preview
  (reuse `SplitList`) + **Adjust / Confirm**.
- `confirmPendingIncome(uid, pendingId)` (client transaction): apply `splitIncome`
  to buckets (increment remaining+allocated), mark the pending doc resolved — reuse
  the existing `applyIncome` money path; add the resolve + idempotency guard.
  "Adjust" opens the existing income dialog pre-filled to tweak percentages for
  this one split before confirming.

### 4. Dashboard balance + drift — `app/(app)/dashboard/page.tsx`, `lib/data/useBankStatus.ts`
- `useBankStatus` already reads `users/{uid}/meta/bank`; extend its type with
  `currentBalance?`.
- Headline: show real **Account balance** = `currentBalance`. Keep "Safe to spend"
  = `Σ remaining`. When `|currentBalance − Σ remaining| > 0`, show a subtle drift
  line + "Re-sync buckets to balance" button → calls a re-anchor (client or a
  callable) that re-runs `anchorBucketsToBalance` with the latest balance.

## Data Flow

```
First connect:
  exchange → seed buckets → getBalance → meta.currentBalance
           → anchorBucketsToBalance (Σ remaining = balance, by %) → first sync (draws spends)

Sync (later):
  syncTransactions → write txns → spends: categorize + draw down bucket
                   → income: write pendingIncome (NO auto-split)
                   → getBalance → update meta.currentBalance (drift only, no re-anchor)

New income prompt (client):
  usePendingIncome → banner "You received €X" → [Adjust] tweak % / [Confirm]
                   → confirmPendingIncome → splitIncome → buckets += split → resolve

Dashboard:
  Account balance = meta.currentBalance
  Safe to spend   = Σ bucket.remaining
  drift = balance − Σ remaining → "Re-sync buckets to balance" (re-anchor)
```

## Error Handling
- Balance fetch failure: skip anchor/drift update this run; log; never crash
  connect/sync. Buckets keep their last state.
- Anchor when percents don't sum to 100: skip (log), same guard as applyIncomeAdmin.
- confirmPendingIncome on an already-resolved doc: no-op (idempotency guard).
- Re-anchor is destructive to per-bucket remaining (it replaces) — require an
  explicit user click; never automatic.

## Testing
- `splitIncome` reused (already tested) for both anchor and income-confirm.
- Pure/unit: `anchorBucketsToBalance` sets Σ remaining = balance by % (conserves
  cents); pendingIncome write is idempotent; confirmPendingIncome applies once and
  resolves; drift computation.
- Provider: `PlaidAdapter.getBalance` sums accounts → cents (mocked client).
- Client: usePendingIncome streams unresolved; confirm calls the money path with
  right args; dashboard shows balance + drift affordance.
- Money-adjacent code gets adversarial review (conservation, idempotency,
  read-before-write) — same bar as prior money tasks.

## Verification (emulator, fresh user)
1. Connect bank → buckets seed → **Σ remaining equals the real balance**, split by %
   (no negative spiral from the anchor).
2. Sync brings spends → buckets draw down; income does NOT auto-apply — a "You
   received €X" prompt appears.
3. Confirm the prompt → buckets rise by the split; Σ remaining rises by €X.
4. Dashboard shows the real Account balance; when it differs from Σ remaining, the
   drift line + "Re-sync buckets to balance" appears and re-anchors on click.
5. Re-syncing an already-connected bank does not double-count; balances stay sane.
