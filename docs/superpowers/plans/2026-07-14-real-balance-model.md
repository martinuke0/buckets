# Real-Balance Money Model + Prompt-on-Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor `Σ(bucket.remaining)` to the user's real bank balance (partition it by % on first connect), and make new income confirm-first (prompt, not silent auto-split).

**Architecture:** Add a `getBalance()` capability to the `BankProvider`/`PlaidAdapter` (Plaid `accountsBalanceGet`). On first connection, fetch the real balance and set each bucket's remaining/allocated to its % share (a REPLACE = "anchor"), before the first sync draws spends. Later syncs refresh the stored balance for drift display but never auto-re-anchor. Synced income stops auto-splitting; it writes a `pendingIncome` doc that the dashboard surfaces as a confirm-first prompt. A drift indicator offers an explicit "re-sync buckets to balance" re-anchor.

**Tech Stack:** Firebase Cloud Functions (admin SDK, CJS package), Next.js 16 App Router client, Firestore, Plaid SDK, Vitest.

## Global Constraints

- Money is integer cents everywhere. Every bucket-balance mutation is a Firestore transaction with read-before-write + idempotency, matching existing `applyIncomeAdmin`/`applySpendCategorization`.
- **Anchor invariant:** after an anchor, `Σ(bucket.remaining) == balanceCents`, partitioned by percent via `splitIncome` (largest-remainder, conserves every cent).
- Buckets are moved ONLY by: anchor (replace), confirmed income (increment), categorized spend (decrement). No automatic re-partitioning on sync (would double-count).
- `functions/` is a SEPARATE CJS package: no client `@/lib/*` import in functions RUNTIME source (only test files, and only if the test lives under the ESM root). Vitest files must NOT live under `functions/src` (they load as CJS and fail).
- Balance stored in `users/{uid}/meta/bank` is a plain number (non-sensitive), owner-readable. Access tokens stay in deny-all `bankConnections/**`.
- Account balance from Plaid is money-you-have = POSITIVE already; do NOT sign-invert it (unlike transactions).
- `pendingIncome` lives at `users/{uid}/pendingIncome/{id}` — covered by the existing `users/{uid}/{sub=**}` owner rule; NO firestore.rules change (verify).
- Dark tokens, no emojis, no `any`. Tests use stable module-level mocks. "AI advises, code disposes": categorization stays best-effort, never blocks balance mutations.
- GIT: local commit ONLY. NEVER push.

---

## File Structure

- `lib/bank/provider.ts` — MODIFY. Add `getBalance(accessToken): Promise<number>` to `BankProvider`.
- `lib/bank/plaidAdapter.ts` — MODIFY. Implement `getBalance` (Plaid `accountsBalanceGet`); add `accountsBalanceGet` to `PlaidClientLike`.
- `functions/src/store.ts` — MODIFY. Extend `setBankMeta` with `currentBalance?`; add `anchorBucketsToBalance` (admin, transactional replace, first-connect marker); add `writePendingIncome`.
- `functions/src/bank.ts` — MODIFY. In `exchangePublicToken`: fetch balance → setBankMeta → anchor (before sync).
- `functions/src/syncCore.ts` — MODIFY. Income → `writePendingIncome` (not auto-split); fetch+store balance each run (no re-anchor).
- `lib/data/buckets.ts` — MODIFY. Add client `anchorBucketsToBalance(uid, balanceCents)` (for the re-anchor button) + `confirmPendingIncome(uid, pendingId)`.
- `lib/data/pendingIncome.ts` — NEW. `usePendingIncome()` hook streaming unresolved pending-income docs.
- `lib/data/useBankStatus.ts` — MODIFY. Add `currentBalance?` to the `BankStatus` type.
- `app/(app)/dashboard/PendingIncomePrompt.tsx` — NEW. The confirm-first banner (amount + SplitList preview + Adjust/Confirm).
- `app/(app)/dashboard/page.tsx` — MODIFY. Show real Account balance + drift line + "Re-sync buckets to balance"; mount the pending-income prompt.

---

## Task 1: Provider `getBalance` + PlaidAdapter

**Files:**
- Modify: `lib/bank/provider.ts`
- Modify: `lib/bank/plaidAdapter.ts`
- Test: `lib/bank/plaidAdapter.balance.test.ts`

**Interfaces:**
- Produces: `BankProvider.getBalance(accessToken: string): Promise<number>` — aggregated current balance in integer cents, positive = money available.
- `PlaidClientLike` gains `accountsBalanceGet(req: { access_token: string }): Promise<{ data: { accounts: { type: string; balances: { current: number | null } }[] } }>`.

- [ ] **Step 1: Write the failing test**

`lib/bank/plaidAdapter.balance.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { PlaidAdapter } from "@/lib/bank/plaidAdapter";

function clientWith(accounts: { type: string; balances: { current: number | null } }[]) {
  return {
    linkTokenCreate: vi.fn(),
    itemPublicTokenExchange: vi.fn(),
    transactionsSync: vi.fn(),
    accountsBalanceGet: vi.fn().mockResolvedValue({ data: { accounts } }),
  };
}

describe("PlaidAdapter.getBalance", () => {
  it("sums depository account current balances into cents", async () => {
    const a = new PlaidAdapter(clientWith([
      { type: "depository", balances: { current: 1000.5 } },
      { type: "depository", balances: { current: 250.25 } },
    ]));
    expect(await a.getBalance("tok")).toBe(125075); // (1000.50 + 250.25) * 100
  });
  it("ignores non-depository accounts (e.g. credit) and null balances", async () => {
    const a = new PlaidAdapter(clientWith([
      { type: "depository", balances: { current: 500 } },
      { type: "credit", balances: { current: 9999 } },
      { type: "depository", balances: { current: null } },
    ]));
    expect(await a.getBalance("tok")).toBe(50000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm test lib/bank/plaidAdapter.balance.test.ts` → FAIL.

- [ ] **Step 3: Modify `lib/bank/provider.ts`** — add to the `BankProvider` interface:
```ts
  getBalance(accessToken: string): Promise<number>;
```

- [ ] **Step 4: Modify `lib/bank/plaidAdapter.ts`** — extend `PlaidClientLike` and implement:
```ts
// add to PlaidClientLike:
  accountsBalanceGet(req: { access_token: string }): Promise<{
    data: { accounts: { type: string; balances: { current: number | null } }[] };
  }>;
```
```ts
// add method to PlaidAdapter (account balance is money-you-have = positive; do NOT invert):
  async getBalance(accessToken: string): Promise<number> {
    const res = await this.client.accountsBalanceGet({ access_token: accessToken });
    const total = res.data.accounts
      .filter((a) => a.type === "depository")
      .reduce((sum, a) => sum + (a.balances.current ?? 0), 0);
    return toCents(total);
  }
```
(`toCents` is already imported at the top of the file.)

- [ ] **Step 5: Run tests to verify pass** — `pnpm test lib/bank/plaidAdapter.balance.test.ts` PASS; `pnpm exec tsc --noEmit` clean; `cd functions && pnpm exec tsc --noEmit` clean (the interface change compiles in functions too).

- [ ] **Step 6: Commit**
```bash
git add lib/bank/provider.ts lib/bank/plaidAdapter.ts lib/bank/plaidAdapter.balance.test.ts
git commit -m "feat(bank): getBalance() on provider + PlaidAdapter (accountsBalanceGet)"
```

---

## Task 2: Store — `anchorBucketsToBalance` + balance meta (ADMIN, MONEY-ADJACENT)

**Files:**
- Modify: `functions/src/store.ts`
- Test: `lib/data/anchor.test.ts` (pure share-computation helper, root ESM tree)

**Interfaces:**
- Produces (store): `anchorBucketsToBalance(uid: string, balanceCents: number, opts?: { onlyIfFirstConnect?: boolean }): Promise<boolean>` — in a transaction: read buckets; if percents don't sum to 100 (±0.001·100), skip and return false; compute shares via `splitIncome(balanceCents, rules)`; SET each bucket's `remaining` AND `allocated` to its share (REPLACE, not increment). When `onlyIfFirstConnect` is true, no-op (return false) if `users/{uid}/meta/bank.anchoredAt` already set; otherwise set `anchoredAt` in the same transaction. Returns true if it anchored.
- Produces (store): extend `setBankMeta(uid, fields)` to also accept `currentBalance?: number`.
- Consumes: `splitIncome` from `../../lib/split/engine` (already used in store.ts).

**Note:** the anchor SET is a replace so `Σ remaining = balanceCents` exactly (splitIncome conserves cents). It must run BEFORE the first sync draws spends (Task 3). `onlyIfFirstConnect` guards against wiping drawn-down balances on reconnect.

- [ ] **Step 1: Write the failing test (pure share helper)** — extract the cent-share computation into a pure function so it's testable without admin SDK. `lib/data/anchor.ts`:
```ts
import { splitIncome, type SplitRule } from "@/lib/split/engine";

// Shares of `balanceCents` per bucket by percent (largest-remainder, conserves cents).
// Returns a map bucketId -> cents. Sum of values === balanceCents when percents sum to 100.
export function balanceShares(balanceCents: number, rules: SplitRule[]): Map<string, number> {
  const allocs = splitIncome(balanceCents, rules);
  return new Map(allocs.map((a) => [a.bucketId, a.amount]));
}
```
`lib/data/anchor.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { balanceShares } from "@/lib/data/anchor";

describe("balanceShares", () => {
  it("partitions the balance by percent, conserving every cent", () => {
    const rules = [
      { bucketId: "bills", percent: 40 },
      { bucketId: "savings", percent: 25 },
      { bucketId: "food", percent: 20 },
      { bucketId: "fun", percent: 10 },
      { bucketId: "others", percent: 5 },
    ];
    const shares = balanceShares(200000, rules); // €2000.00
    expect(shares.get("bills")).toBe(80000);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(200000);
  });
  it("conserves cents on an amount that doesn't divide evenly", () => {
    const rules = [{ bucketId: "a", percent: 33 }, { bucketId: "b", percent: 33 }, { bucketId: "c", percent: 34 }];
    const shares = balanceShares(100, rules); // 1 euro across thirds
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm test lib/data/anchor.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/data/anchor.ts`** (code above).

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Implement in `functions/src/store.ts`** — extend `setBankMeta` signature and add the anchor. `setBankMeta`:
```ts
export async function setBankMeta(
  uid: string,
  fields: { connectedAt?: string; lastSyncedAt?: string; currentBalance?: number },
): Promise<void> {
  await getFirestore().doc(`users/${uid}/meta/bank`).set(fields, { merge: true });
}
```
Add (functions cannot import the client `@/lib/data/anchor`, but it CAN import `../../lib/split/engine` — already does; replicate the tiny share logic inline via splitIncome):
```ts
// Anchor: set Σ(bucket.remaining) to the real balance, partitioned by percent.
// REPLACE semantics (not increment) so the sum equals the balance exactly. Runs
// before the first sync draws spends. onlyIfFirstConnect guards reconnect from
// wiping drawn-down balances.
export async function anchorBucketsToBalance(
  uid: string,
  balanceCents: number,
  opts?: { onlyIfFirstConnect?: boolean },
): Promise<boolean> {
  const db = getFirestore();
  return db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    const metaRef = db.doc(`users/${uid}/meta/bank`);
    if (opts?.onlyIfFirstConnect) {
      const metaSnap = await tx.get(metaRef);
      if (metaSnap.exists && metaSnap.get("anchoredAt")) return false;
    }
    const bucketsSnap = await db.collection(`users/${uid}/buckets`).get();
    if (bucketsSnap.empty) return false;
    const rules: SplitRule[] = bucketsSnap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
      bucketId: d.id,
      percent: d.get("percent") as number,
    }));
    const total = rules.reduce((s, r) => s + r.percent, 0);
    if (Math.abs(total - 100) >= 0.001) return false;
    let allocs;
    try {
      allocs = splitIncome(balanceCents, rules);
    } catch {
      return false;
    }
    for (const a of allocs) {
      tx.update(db.doc(`users/${uid}/buckets/${a.bucketId}`), {
        remaining: a.amount,
        allocated: a.amount,
      });
    }
    tx.set(metaRef, { anchoredAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}
```
(`SplitRule`/`splitIncome` are already imported in store.ts.)

- [ ] **Step 6: Typecheck** — `cd functions && pnpm exec tsc --noEmit` clean; root `pnpm exec tsc --noEmit` clean.

- [ ] **Step 7: Commit**
```bash
git add functions/src/store.ts lib/data/anchor.ts lib/data/anchor.test.ts
git commit -m "feat(store): anchorBucketsToBalance (replace by %) + currentBalance meta"
```

---

## Task 3: Wire balance into connect + sync (MONEY-ADJACENT)

**Files:**
- Modify: `functions/src/bank.ts`
- Modify: `functions/src/syncCore.ts`

**Interfaces:**
- Consumes: `anchorBucketsToBalance`, `setBankMeta` (Task 2); `adapter.getBalance` (Task 1).

- [ ] **Step 1: `exchangePublicToken` (functions/src/bank.ts)** — after `seedDefaultBucketsIfEmpty(uid)` and BEFORE `syncOneUser`, fetch and anchor. Balance fetch is best-effort (must not crash connect):
```ts
    await seedDefaultBucketsIfEmpty(request.auth.uid);

    // Anchor buckets to the real balance (first connect only), before the first sync.
    try {
      const balance = await adapter.getBalance(accessToken);
      await setBankMeta(request.auth.uid, { currentBalance: balance });
      await anchorBucketsToBalance(request.auth.uid, balance, { onlyIfFirstConnect: true });
    } catch (err) {
      console.warn(`exchangePublicToken: balance/anchor skipped:`, err instanceof Error ? err.message : err);
    }

    await syncOneUser(request.auth.uid);
```
Add `setBankMeta, anchorBucketsToBalance` to the `./store` import. `adapter` is already the `createPlaidAdapter()` instance in scope; `accessToken` is already destructured.

- [ ] **Step 2: `syncOneUser` (functions/src/syncCore.ts)** — refresh stored balance each run (for drift display), no re-anchor. Add `anchorBucketsToBalance` is NOT called here. After the categorization loop, extend the existing `setBankMeta` call:
```ts
  // Refresh the real balance for the drift indicator (best-effort; never re-anchor here).
  let currentBalance: number | undefined;
  try {
    const conns = connections; // already fetched at top
    if (conns.length > 0) currentBalance = await adapter.getBalance(conns[0].accessToken);
  } catch (err) {
    console.warn(`syncOneUser(${uid}): balance refresh skipped:`, err instanceof Error ? err.message : err);
  }
  await setBankMeta(uid, { lastSyncedAt: new Date().toISOString(), ...(currentBalance !== undefined ? { currentBalance } : {}) });
```
Replace the existing final `await setBankMeta(uid, { lastSyncedAt: ... })` with the above. (`adapter` and `connections` are already in scope at the top of `syncOneUser`.)

- [ ] **Step 3: Typecheck + build** — `cd functions && pnpm exec tsc --noEmit` clean; `pnpm run build`; root `pnpm exec tsc --noEmit` clean.

- [ ] **Step 4: Commit**
```bash
git add functions/src/bank.ts functions/src/syncCore.ts
git commit -m "feat(bank): anchor to real balance on connect; refresh balance each sync"
```

---

## Task 4: Synced income → pendingIncome (stop auto-split) (MONEY-ADJACENT)

**Files:**
- Modify: `functions/src/store.ts` (add `writePendingIncome`)
- Modify: `functions/src/syncCore.ts` (income branch)

**Interfaces:**
- Produces (store): `writePendingIncome(uid: string, income: { incomeTxId: string; amount: number; description: string; bookedAt: string }): Promise<void>` — idempotent set to `users/{uid}/pendingIncome/{incomeTxId}` with `{ amount, description, bookedAt, createdAt: <ISO>, resolved: false }`. Uses the txn id as the doc id, so re-sync never duplicates.

- [ ] **Step 1: Add `writePendingIncome` to `functions/src/store.ts`**
```ts
// New income is NOT auto-split — record it as pending so the client can prompt
// the user to confirm the split (confirm-first). Idempotent by incomeTxId.
export async function writePendingIncome(
  uid: string,
  income: { incomeTxId: string; amount: number; description: string; bookedAt: string },
): Promise<void> {
  await getFirestore()
    .doc(`users/${uid}/pendingIncome/${income.incomeTxId}`)
    .set(
      {
        amount: income.amount,
        description: income.description,
        bookedAt: income.bookedAt,
        createdAt: new Date().toISOString(),
        resolved: false,
      },
      { merge: true },
    );
}
```

- [ ] **Step 2: Change the income branch in `functions/src/syncCore.ts`** — replace the auto-split loop:
```ts
  // 1) Income is NOT auto-split — record pending so the user confirms the split.
  for (const txn of created) {
    if (txn.isIncome) {
      await writePendingIncome(uid, {
        incomeTxId: txn.providerTxnId,
        amount: txn.amount,
        description: txn.description,
        bookedAt: txn.bookedAt,
      });
    }
  }
```
Update the `./store` import: remove `applyIncomeAdmin`, add `writePendingIncome`. (Leave `applyIncomeAdmin` exported in store.ts — the manual SimulateIncome path in `lib/data/buckets.ts applyIncome` is client-side and separate; do not touch it. If `applyIncomeAdmin` becomes entirely unused across functions, that's fine — leave it; removing it is out of scope.)

- [ ] **Step 3: Typecheck + build** — functions tsc clean; `pnpm run build`; root tsc clean.

- [ ] **Step 4: Commit**
```bash
git add functions/src/store.ts functions/src/syncCore.ts
git commit -m "feat(income): synced income writes pendingIncome instead of auto-splitting"
```

---

## Task 5: Client — confirm/adjust pending income + re-anchor (MONEY-ADJACENT)

**Files:**
- Create: `lib/data/pendingIncome.ts` (hook)
- Modify: `lib/data/buckets.ts` (`confirmPendingIncome`, client `anchorBucketsToBalance`)
- Test: `lib/data/pendingIncome.test.ts` (confirm applies split + resolves, idempotent)

**Interfaces:**
- Produces: `usePendingIncome(): { pending: PendingIncome[]; loading: boolean }` where `PendingIncome = { id: string; amount: number; description: string; bookedAt: string; resolved: boolean }`; streams `users/{uid}/pendingIncome` where `resolved === false` (filter client-side; small collection).
- Produces (buckets.ts): `confirmPendingIncome(uid: string, pendingId: string, rules: SplitRule[]): Promise<void>` — in a transaction: read the pending doc; if missing or `resolved === true`, no-op; else `splitIncome(pending.amount, rules)`, increment each bucket `remaining`+`allocated` by its share, write allocation docs (mirror `applyIncome`), and set the pending doc `resolved: true`. Idempotent via the resolved flag.
- Produces (buckets.ts): `anchorBucketsToBalance(uid: string, balanceCents: number): Promise<void>` — CLIENT re-anchor for the drift button: transaction that SETs each bucket remaining+allocated to its `balanceShares` (reuse `@/lib/data/anchor` `balanceShares`). Always replaces (explicit user action).

- [ ] **Step 1: Write the failing test**

`lib/data/pendingIncome.test.ts` — stable module-level mocks of `firebase/firestore` (`runTransaction`, `doc`, `collection`, `increment`) + `getDb`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const txGet = vi.fn();
const txSet = vi.fn();
const txUpdate = vi.fn();
const runTransaction = vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
  await fn({ get: txGet, set: txSet, update: txUpdate });
});
vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => ({ __col: a }),
  doc: (...a: unknown[]) => ({ __doc: a }),
  runTransaction: (...a: [unknown, (tx: unknown) => Promise<void>]) => runTransaction(...a),
  increment: (n: number) => ({ __inc: n }),
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));

import { confirmPendingIncome } from "@/lib/data/buckets";

const rules = [{ bucketId: "bills", percent: 40 }, { bucketId: "savings", percent: 60 }];

beforeEach(() => { txGet.mockReset(); txSet.mockClear(); txUpdate.mockClear(); });

it("applies the split and marks the pending income resolved", async () => {
  txGet.mockResolvedValue({ exists: () => true, data: () => ({ amount: 100000, resolved: false }) });
  await confirmPendingIncome("u1", "inc1", rules);
  // buckets incremented (2 updates) + pending resolved (1 update or set) — assert increments present
  const incCalls = txUpdate.mock.calls.filter((c) => c[1]?.remaining?.__inc !== undefined);
  expect(incCalls.length).toBe(2);
  expect(incCalls.some((c) => c[1].remaining.__inc === 40000)).toBe(true);  // bills 40%
  expect(incCalls.some((c) => c[1].remaining.__inc === 60000)).toBe(true);  // savings 60%
});

it("is a no-op when already resolved", async () => {
  txGet.mockResolvedValue({ exists: () => true, data: () => ({ amount: 100000, resolved: true }) });
  await confirmPendingIncome("u1", "inc1", rules);
  expect(txUpdate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement `confirmPendingIncome` + client `anchorBucketsToBalance` in `lib/data/buckets.ts`** — reuse existing imports (`doc`, `collection`, `runTransaction`, `increment`, `getDb`, `bucketsCol`, `allocationsCol`, `splitIncome`); add `balanceShares` import from `@/lib/data/anchor`:
```ts
import { balanceShares } from "@/lib/data/anchor";
import type { SplitRule } from "@/lib/split/engine";

export async function confirmPendingIncome(uid: string, pendingId: string, rules: SplitRule[]): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const pendingRef = doc(db, `users/${uid}/pendingIncome/${pendingId}`);
    const snap = await tx.get(pendingRef);
    if (!snap.exists() || snap.data()?.resolved === true) return;
    const amount = snap.data()?.amount as number;
    const splits = splitIncome(amount, rules);
    for (const s of splits) {
      const allocRef = doc(collection(db, allocationsCol(uid)));
      tx.set(allocRef, { bucketId: s.bucketId, amount: s.amount, incomeTxId: pendingId, createdAt: new Date().toISOString() });
      tx.update(doc(db, bucketsCol(uid), s.bucketId), { remaining: increment(s.amount), allocated: increment(s.amount) });
    }
    tx.update(pendingRef, { resolved: true });
  });
}

// Re-anchor (drift button): REPLACE bucket balances with the balance partitioned by %.
export async function anchorBucketsToBalance(uid: string, balanceCents: number): Promise<void> {
  const buckets = await listBuckets(uid);
  const rules = deriveRules(buckets);
  const shares = balanceShares(balanceCents, rules);
  const db = getDb();
  await runTransaction(db, async (tx) => {
    for (const [bucketId, cents] of shares) {
      tx.update(doc(db, bucketsCol(uid), bucketId), { remaining: cents, allocated: cents });
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Implement `lib/data/pendingIncome.ts`** — mirror `useBuckets` (onSnapshot over the collection, filter unresolved):
```ts
"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface PendingIncome {
  id: string; amount: number; description: string; bookedAt: string; resolved: boolean;
}

export function usePendingIncome(): { pending: PendingIncome[]; loading: boolean } {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingIncome[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const q = collection(getDb(), `users/${user.uid}/pendingIncome`);
    return onSnapshot(q, (snap) => {
      setPending(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PendingIncome, "id">) }))
          .filter((p) => !p.resolved),
      );
      setLoading(false);
    });
  }, [user]);
  return { pending, loading };
}
```

- [ ] **Step 6: Verify** — `pnpm test lib/data/pendingIncome.test.ts` PASS; `pnpm exec tsc --noEmit` clean.

- [ ] **Step 7: Commit**
```bash
git add lib/data/pendingIncome.ts lib/data/pendingIncome.test.ts lib/data/buckets.ts
git commit -m "feat(income): confirmPendingIncome + usePendingIncome + client re-anchor"
```

---

## Task 6: Dashboard — pending-income prompt + balance/drift

**Files:**
- Create: `app/(app)/dashboard/PendingIncomePrompt.tsx`
- Modify: `lib/data/useBankStatus.ts` (add `currentBalance?`)
- Modify: `app/(app)/dashboard/page.tsx`
- Test: `app/(app)/dashboard/PendingIncomePrompt.test.tsx`

**Interfaces:**
- Consumes: `usePendingIncome`, `confirmPendingIncome`, `anchorBucketsToBalance` (client), `deriveRules` (buckets.ts), `SplitList`, `splitIncome`, `useBankStatus` (+ currentBalance), `formatEuros`.
- `PendingIncomePrompt({ pending, buckets })` — for each pending income, a banner: "You received {formatEuros(amount)}" + `SplitList` preview (from `splitIncome(amount, deriveRules(buckets))`) + **Confirm** (calls `confirmPendingIncome(uid, pending.id, deriveRules(buckets))`) and **Adjust** (opens the existing `SimulateIncomeDialog`-style editor prefilled — for THIS plan, "Adjust" links to `/buckets` to change percentages, then Confirm; a bespoke per-income editor is out of scope/YAGNI). Confirm-first: nothing applies until Confirm.

- [ ] **Step 1: Add `currentBalance?` to `useBankStatus.ts`** — extend the `BankStatus` interface:
```ts
export interface BankStatus {
  connectedAt?: string;
  lastSyncedAt?: string;
  currentBalance?: number;
}
```

- [ ] **Step 2: Write the failing test**

`app/(app)/dashboard/PendingIncomePrompt.test.tsx` — stable module-level mocks of `useAuth`, `confirmPendingIncome`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const confirmPendingIncome = vi.fn().mockResolvedValue(undefined);
const mockAuth = { user: { uid: "u1", email: "e" }, loading: false };
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/data/buckets", () => ({
  confirmPendingIncome: (...a: unknown[]) => confirmPendingIncome(...a),
  deriveRules: (bs: { id: string; percent: number }[]) => bs.map((b) => ({ bucketId: b.id, percent: b.percent })),
}));

import { PendingIncomePrompt } from "@/app/(app)/dashboard/PendingIncomePrompt";

const buckets = [
  { id: "bills", name: "Bills", colorIndex: 0, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
  { id: "savings", name: "Savings", colorIndex: 1, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
];
const pending = [{ id: "inc1", amount: 100000, description: "ACME PAY", bookedAt: "2026-07-14", resolved: false }];

beforeEach(() => confirmPendingIncome.mockClear());

it("shows the received amount and a Confirm that applies the split", () => {
  render(<PendingIncomePrompt pending={pending} buckets={buckets} />);
  expect(screen.getByText(/received/i)).toBeInTheDocument();
  expect(screen.getByText("€1,000.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
  expect(confirmPendingIncome).toHaveBeenCalledWith("u1", "inc1", [
    { bucketId: "bills", percent: 40 },
    { bucketId: "savings", percent: 60 },
  ]);
});
```

- [ ] **Step 3: Run test to verify it fails** — FAIL.

- [ ] **Step 4: Implement `app/(app)/dashboard/PendingIncomePrompt.tsx`**
```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { confirmPendingIncome, deriveRules } from "@/lib/data/buckets";
import { splitIncome } from "@/lib/split/engine";
import { SplitList } from "@/components/buckets/SplitList";
import { formatEuros } from "@/lib/model/money";
import type { Bucket } from "@/lib/model/types";
import type { PendingIncome } from "@/lib/data/pendingIncome";

export function PendingIncomePrompt({ pending, buckets }: { pending: PendingIncome[]; buckets: Bucket[] }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  if (pending.length === 0) return null;
  const rules = deriveRules(buckets);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
      {pending.map((p) => {
        let preview: { bucketId: string; amount: number }[] = [];
        try { preview = splitIncome(p.amount, rules); } catch { preview = []; }
        return (
          <div key={p.id} className="rounded-2xl p-4" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
            <div style={{ color: "var(--color-text)", fontWeight: 600 }}>
              You received {formatEuros(p.amount)}
            </div>
            <div style={{ color: "var(--color-muted)", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>{p.description}</div>
            <SplitList allocations={preview} buckets={buckets} />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                onClick={async () => { if (!user) return; setBusy(p.id); try { await confirmPendingIncome(user.uid, p.id, rules); } finally { setBusy(null); } }}
                disabled={busy === p.id}
                className="flex-1 rounded-lg py-2 px-4 font-semibold"
                style={{ background: "var(--grad-brand)", color: "var(--color-text)", cursor: busy === p.id ? "not-allowed" : "pointer" }}
              >
                {busy === p.id ? "Applying..." : "Confirm split"}
              </button>
              <Link href="/buckets" className="rounded-lg py-2 px-4 font-semibold" style={{ background: "var(--color-border)", color: "var(--color-text)" }}>
                Adjust
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify pass** — PASS.

- [ ] **Step 6: Wire into `app/(app)/dashboard/page.tsx`** — add imports + hooks + render. Near the top with other hooks:
```tsx
import { usePendingIncome } from "@/lib/data/pendingIncome";
import { PendingIncomePrompt } from "./PendingIncomePrompt";
import { anchorBucketsToBalance } from "@/lib/data/buckets";
```
```tsx
  const { pending } = usePendingIncome();
```
Render the prompt right under the hero (before the bucket list):
```tsx
      <PendingIncomePrompt pending={pending} buckets={buckets} />
```
Add the Account-balance + drift block inside the hero area — after `<SafeToSpendHero .../>`:
```tsx
      {bankStatus?.currentBalance !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 1rem" }}>
          <span style={{ color: "var(--color-muted)", fontSize: "0.8125rem" }}>
            Account balance: {formatEuros(bankStatus.currentBalance)}
          </span>
          {Math.abs(bankStatus.currentBalance - safeToSpend) > 0 && (
            <button
              onClick={() => { if (user && bankStatus.currentBalance !== undefined) void anchorBucketsToBalance(user.uid, bankStatus.currentBalance); }}
              className="rounded-lg py-1 px-2 text-xs font-semibold"
              style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)", cursor: "pointer" }}
            >
              Re-sync buckets to balance
            </button>
          )}
        </div>
      )}
```
`safeToSpend` and `user` are already in scope. Ensure `user` comes from `useAuth()` (it was removed in a prior task if unused — re-add `const { user } = useAuth();` if not present; `useAuth` import may need re-adding).

- [ ] **Step 7: Run tests + full suite + typecheck** — `pnpm test app/\(app\)/dashboard && pnpm test && pnpm exec tsc --noEmit` → PASS + clean.

- [ ] **Step 8: Commit**
```bash
git add "app/(app)/dashboard/PendingIncomePrompt.tsx" "app/(app)/dashboard/PendingIncomePrompt.test.tsx" lib/data/useBankStatus.ts "app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): pending-income prompt + real balance + drift re-anchor"
```

---

## Task 7: Full-suite + typecheck gate + rules verification

**Files:** none (verification only)

- [ ] **Step 1: Verify firestore.rules** — confirm `users/{uid}/pendingIncome/**` is covered by the existing `match /users/{uid}/{sub=**} { allow read, write: if request.auth.uid == uid }` rule (owner-scoped). No change expected; if not covered, STOP and report.
- [ ] **Step 2: Full suite** — `pnpm test` → all pass (prior 108 + new tests; no regressions).
- [ ] **Step 3: Typecheck** — root `pnpm exec tsc --noEmit` clean AND `cd functions && pnpm exec tsc --noEmit` clean.
- [ ] **Step 4: Functions build** — `cd functions && pnpm run build`.
- [ ] **Step 5: Confirm no stray auto-split** — grep that `syncOneUser` no longer calls `applyIncomeAdmin` (income now writes pendingIncome). Report.

---

## Self-Review

- **Spec coverage:** getBalance (T1); store balance + anchor (T2); wire connect+sync (T3); synced income→pending (T4); client confirm + re-anchor (T5); dashboard prompt + balance + drift (T6); gate + rules (T7). All 5 spec IN-scope items mapped.
- **Invariant:** anchor REPLACES (Σ remaining = balance); income/spends INCREMENT/DECREMENT; sync never re-anchors (T3 explicitly stores balance only). No double-count.
- **Type consistency:** `getBalance(accessToken): Promise<number>` (T1) used in T3; `anchorBucketsToBalance(uid, cents, opts?)` server (T2) vs client `anchorBucketsToBalance(uid, cents)` (T5) — DELIBERATELY different (server has first-connect guard; client re-anchor always replaces) — both documented. `confirmPendingIncome(uid, pendingId, rules)` (T5) matches its call in T6. `PendingIncome` shape shared (T5 hook) and consumed (T6). `BankStatus.currentBalance?` (T6) matches store writes (T2/T3).
- **Placeholder scan:** no TBD; every code step has full code. "Adjust" deliberately links to /buckets (bespoke per-income editor is YAGNI, stated).
- **DRY:** `splitIncome` reused for anchor + income + preview; `balanceShares` shared by client re-anchor + tested pure.

## Verification (emulator, fresh user)

1. Connect bank → buckets seed → anchor: **Σ remaining == real balance**, split by % (no negative spiral).
2. Sync → spends draw down buckets; income does NOT auto-apply — a "You received €X" prompt appears on the dashboard.
3. Confirm the prompt → buckets rise by the split; the pending prompt clears (resolved).
4. Dashboard shows real **Account balance**; when it differs from Σ remaining, "Re-sync buckets to balance" appears and re-anchors on click.
5. `pnpm test` + root tsc + functions tsc all clean; `firestore.rules` unchanged.
