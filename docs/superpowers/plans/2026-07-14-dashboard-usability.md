# Dashboard Usability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard read correctly and feel like a real banking app — auto-seed default buckets, hero shows total remaining, tappable transactions with a reclassify detail page, "Load more" pagination, and tappable bucket rows.

**Architecture:** All client-side React (Next.js 16 App Router) + Firestore reads/writes through existing hooks and the existing `recategorize` transaction. One new seed hook, one shared defaults module, two new/edited routes, plus small edits to the transaction list and bucket rows. No Cloud Functions changes, no money-math changes.

**Tech Stack:** Next.js 16 (App Router, `"use client"`), React 19, TypeScript strict, Firestore (`firebase/firestore`), Vitest + React Testing Library.

## Global Constraints

- Money is integer cents everywhere; display via `formatEuros` from `@/lib/model/money`. No split/balance math changes.
- Dark design tokens only (`var(--color-*)`, `var(--grad-*)`); no hardcoded hex, no emojis; inline SVG only.
- TypeScript strict; no `any`. `"use client"` only where hooks/interactivity require it.
- Tests use stable module-level mock objects (never a fresh object returned per call — this prevents an infinite-resubscribe OOM).
- GIT: local commit ONLY. NEVER push, never add a remote.
- Firestore access stays within existing per-user rules (`users/{uid}/**` owner read/write; `users/{uid}/meta/*` included). No rules change.
- Default bucket set is exactly: Bills 40, Savings 25, Food 20, Fun 10, Others 5 (percent sums to 100), all `type: "virtual"`, `remaining: 0`, `allocated: 0`, `colorIndex` 0..4 in that order.

---

## File Structure

- `lib/data/defaultBuckets.ts` — NEW. Single source of the default bucket set (`DEFAULT_BUCKETS`). Imported by the Buckets page and the seeder (DRY).
- `lib/data/ensureBuckets.ts` — NEW. Pure-ish async `ensureBuckets(uid)` that seeds defaults once when the user has none and hasn't been seeded before.
- `lib/data/useEnsureBuckets.ts` — NEW. Thin `"use client"` hook that calls `ensureBuckets(uid)` once per session after auth resolves.
- `app/(app)/layout.tsx` — MODIFY. Mount `useEnsureBuckets()`.
- `app/(app)/buckets/page.tsx` — MODIFY. Import `DEFAULT_BUCKETS` from the shared module instead of the local literal.
- `components/buckets/SafeToSpendHero.tsx` — already updated (label "Safe to spend", no payday line). Task 2 only adds//confirms the test.
- `app/(app)/dashboard/page.tsx` — MODIFY. Pass paginated behaviour is inside TransactionList; row tap handled in TransactionList. Remove `onRecategorize` inline select wiring (rows become links).
- `components/tx/TransactionList.tsx` — MODIFY. Remove inline `<select>`; rows become `Link`s to `/dashboard/tx/[id]`; add "Load more" (20 at a time).
- `app/(app)/dashboard/tx/[id]/page.tsx` — NEW. Transaction detail + "Move to bucket" picker calling `recategorize`.
- `components/buckets/BucketRow.tsx` — MODIFY. Make the bucket NAME a `Link` to `/dashboard/bucket/[id]` without hijacking drag/%/menu. Gated by an optional `href` prop so the setup screen can still be used without navigation in tests.

---

## Task 1: Shared default buckets module

**Files:**
- Create: `lib/data/defaultBuckets.ts`
- Modify: `app/(app)/buckets/page.tsx:11-17` (replace local literal with import)
- Test: `lib/data/defaultBuckets.test.ts`

**Interfaces:**
- Produces: `export const DEFAULT_BUCKETS: Omit<Bucket, "id">[]` — the 5 defaults (Bills 40, Savings 25, Food 20, Fun 10, Others 5).

- [ ] **Step 1: Write the failing test**

`lib/data/defaultBuckets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_BUCKETS } from "@/lib/data/defaultBuckets";

describe("DEFAULT_BUCKETS", () => {
  it("has 5 buckets summing to 100 percent", () => {
    expect(DEFAULT_BUCKETS).toHaveLength(5);
    expect(DEFAULT_BUCKETS.reduce((s, b) => s + b.percent, 0)).toBe(100);
  });
  it("uses the generic universal names in order", () => {
    expect(DEFAULT_BUCKETS.map((b) => b.name)).toEqual(["Bills", "Savings", "Food", "Fun", "Others"]);
  });
  it("all virtual, zeroed, colorIndex 0..4", () => {
    DEFAULT_BUCKETS.forEach((b, i) => {
      expect(b.type).toBe("virtual");
      expect(b.remaining).toBe(0);
      expect(b.allocated).toBe(0);
      expect(b.colorIndex).toBe(i);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm test lib/data/defaultBuckets.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/data/defaultBuckets.ts`**

```ts
import type { Bucket } from "@/lib/model/types";

// The universal starter set seeded for new users and offered on the Buckets tab.
// Percentages sum to 100. Keep names generic (no lifestyle assumptions).
export const DEFAULT_BUCKETS: Omit<Bucket, "id">[] = [
  { name: "Bills", colorIndex: 0, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Savings", colorIndex: 1, percent: 25, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Fun", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Others", colorIndex: 4, percent: 5, type: "virtual", remaining: 0, allocated: 0 },
];
```

- [ ] **Step 4: Update `app/(app)/buckets/page.tsx`** — remove the local `DEFAULT_BUCKETS` literal (lines 11-17) and import it instead:

```ts
import { DEFAULT_BUCKETS } from "@/lib/data/defaultBuckets";
```
Leave the `initial` computation (`DEFAULT_BUCKETS.map((b) => ({ ...b, id: crypto.randomUUID() }))`) unchanged.

- [ ] **Step 5: Run tests to verify pass** — `pnpm test lib/data/defaultBuckets.test.ts app/\(app\)/buckets` → PASS. Then `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib/data/defaultBuckets.ts lib/data/defaultBuckets.test.ts "app/(app)/buckets/page.tsx"
git commit -m "refactor(buckets): extract DEFAULT_BUCKETS to shared module"
```

---

## Task 2: Auto-seed default buckets on first login

**Files:**
- Create: `lib/data/ensureBuckets.ts`
- Create: `lib/data/useEnsureBuckets.ts`
- Modify: `app/(app)/layout.tsx` (mount the hook)
- Test: `lib/data/ensureBuckets.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_BUCKETS` (Task 1), `getDb` (`@/lib/firebase/client`), `bucketsCol`/`userDoc` (`@/lib/model/paths`), `useAuth` (`@/lib/auth/AuthProvider`).
- Produces:
  - `ensureBuckets(uid: string): Promise<"seeded" | "skipped">` — seeds the 5 defaults IFF the user has zero buckets AND `users/{uid}/meta/app.seededBuckets` is not `true`. Sets that marker in the same write. Returns `"seeded"` when it wrote, `"skipped"` otherwise.
  - `useEnsureBuckets(): void` — calls `ensureBuckets(user.uid)` exactly once per session after auth resolves.

**Why a marker (delete-safety):** seeding only on "buckets empty" would re-seed a user who deliberately deleted all buckets. The `meta/app.seededBuckets` flag makes seeding one-time per user.

**Firestore shape:**
- Buckets are written to `users/{uid}/buckets/{autoId}` with the `Omit<Bucket,"id">` fields.
- Marker doc: `users/{uid}/meta/app` with `{ seededBuckets: true }` (merge).

- [ ] **Step 1: Write the failing test**

`lib/data/ensureBuckets.test.ts` — stable module-level mocks; assert seed happens once and is skipped when already-seeded or buckets exist:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stable mock fns (module-level; OOM guard)
const getDocs = vi.fn();
const getDoc = vi.fn();
const setDoc = vi.fn().mockResolvedValue(undefined);
const addDoc = vi.fn().mockResolvedValue({ id: "new" });
vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => ({ __col: a }),
  doc: (...a: unknown[]) => ({ __doc: a }),
  getDocs: (...a: unknown[]) => getDocs(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  addDoc: (...a: unknown[]) => addDoc(...a),
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));

import { ensureBuckets } from "@/lib/data/ensureBuckets";

beforeEach(() => {
  getDocs.mockReset(); getDoc.mockReset();
  setDoc.mockClear(); addDoc.mockClear();
});

it("seeds 5 buckets + marker when empty and unseeded", async () => {
  getDoc.mockResolvedValue({ exists: () => false, data: () => undefined }); // marker absent
  getDocs.mockResolvedValue({ empty: true, size: 0 });                       // no buckets
  const r = await ensureBuckets("u1");
  expect(r).toBe("seeded");
  expect(addDoc).toHaveBeenCalledTimes(5);   // 5 default buckets
  expect(setDoc).toHaveBeenCalledTimes(1);   // marker
});

it("skips when already seeded (marker true)", async () => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ seededBuckets: true }) });
  getDocs.mockResolvedValue({ empty: true, size: 0 });
  const r = await ensureBuckets("u1");
  expect(r).toBe("skipped");
  expect(addDoc).not.toHaveBeenCalled();
});

it("skips when the user already has buckets", async () => {
  getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
  getDocs.mockResolvedValue({ empty: false, size: 3 });
  const r = await ensureBuckets("u1");
  expect(r).toBe("skipped");
  expect(addDoc).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Implement `lib/data/ensureBuckets.ts`**

```ts
import { collection, doc, getDocs, getDoc, addDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol } from "@/lib/model/paths";
import { DEFAULT_BUCKETS } from "@/lib/data/defaultBuckets";

// Seed the default bucket set exactly once per user. Guarded by both "no buckets
// yet" AND a one-shot marker (users/{uid}/meta/app.seededBuckets) so a user who
// deletes all their buckets is not re-seeded. Best-effort: callers ignore the
// result; failures must not block render.
export async function ensureBuckets(uid: string): Promise<"seeded" | "skipped"> {
  const db = getDb();
  const markerRef = doc(db, `users/${uid}/meta/app`);
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists() && markerSnap.data()?.seededBuckets === true) {
    return "skipped";
  }

  const bucketsSnap = await getDocs(collection(db, bucketsCol(uid)));
  if (!bucketsSnap.empty) {
    // Buckets already exist (created manually): record the marker, don't seed.
    await setDoc(markerRef, { seededBuckets: true }, { merge: true });
    return "skipped";
  }

  const col = collection(db, bucketsCol(uid));
  for (const b of DEFAULT_BUCKETS) {
    await addDoc(col, b);
  }
  await setDoc(markerRef, { seededBuckets: true }, { merge: true });
  return "seeded";
}
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm test lib/data/ensureBuckets.test.ts` → PASS.

- [ ] **Step 5: Implement `lib/data/useEnsureBuckets.ts`**

```ts
"use client";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ensureBuckets } from "@/lib/data/ensureBuckets";

// Runs the one-time bucket seed once per session after auth resolves.
// Best-effort: a seed failure is logged, never thrown (dashboard still renders).
export function useEnsureBuckets(): void {
  const { user } = useAuth();
  const ran = useRef(false);
  useEffect(() => {
    if (!user || ran.current) return;
    ran.current = true;
    void ensureBuckets(user.uid).catch((e) =>
      console.warn("ensureBuckets failed:", e instanceof Error ? e.message : e),
    );
  }, [user]);
}
```

- [ ] **Step 6: Mount in `app/(app)/layout.tsx`** — add the import and call the hook inside `AppLayout` (before the `loading` early-return is fine; the hook internally waits for `user`):

```ts
import { useEnsureBuckets } from "@/lib/data/useEnsureBuckets";
```
and inside the component body, after `const router = useRouter();`:
```ts
  useEnsureBuckets();
```

- [ ] **Step 7: Verify** — `pnpm test lib/data/ensureBuckets.test.ts && pnpm exec tsc --noEmit` → PASS + clean.

- [ ] **Step 8: Commit**

```bash
git add lib/data/ensureBuckets.ts lib/data/ensureBuckets.test.ts lib/data/useEnsureBuckets.ts "app/(app)/layout.tsx"
git commit -m "feat(buckets): auto-seed default buckets once for new users"
```

---

## Task 3: Hero shows total remaining (label + test)

**Files:**
- Modify: `components/buckets/SafeToSpendHero.tsx` (confirm label "Safe to spend"; already edited to drop payday)
- Test: `components/buckets/SafeToSpendHero.test.tsx`

**Interfaces:**
- Consumes: `SafeToSpendHero({ safeToSpend, onTrack, monthProgress })` — note `daysToPayday` was removed.

**Context:** `dashboard/page.tsx` already computes `safeToSpend = buckets.reduce((s,b)=>s+b.remaining,0)` and passes it. This task pins the label and the sum via a test; the component change (label to "Safe to spend", no payday) is already in the tree — verify it, add the test.

- [ ] **Step 1: Write the failing test**

`components/buckets/SafeToSpendHero.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeToSpendHero } from "@/components/buckets/SafeToSpendHero";

describe("SafeToSpendHero", () => {
  it("renders the total-remaining label (not 'today') and no payday line", () => {
    render(<SafeToSpendHero safeToSpend={12345} onTrack monthProgress={0.5} />);
    expect(screen.getByText(/safe to spend/i)).toBeInTheDocument();
    expect(screen.queryByText(/today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payday/i)).not.toBeInTheDocument();
  });
  it("shows the formatted euro amount passed in", () => {
    render(<SafeToSpendHero safeToSpend={12345} onTrack={false} monthProgress={0.2} />);
    expect(screen.getByText("€123.45")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test** — `pnpm test components/buckets/SafeToSpendHero.test.tsx`. If the label still reads "Safe to spend today" it will FAIL on the `today` assertion — in that case change the label in `SafeToSpendHero.tsx` from `Safe to spend today` to `Safe to spend`. (Expected: already "Safe to spend"; confirm PASS.)

- [ ] **Step 3: Ensure label is exactly "Safe to spend"** — the `<div>` currently rendering the uppercase label must read `Safe to spend` (no "today"). Verify no `payday`/`daysToPayday` remains in the component.

- [ ] **Step 4: Run test to verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/buckets/SafeToSpendHero.tsx components/buckets/SafeToSpendHero.test.tsx
git commit -m "test(hero): pin 'Safe to spend' = total remaining, no payday line"
```

---

## Task 4: "Load more" pagination + rows link to tx detail

**Files:**
- Modify: `components/tx/TransactionList.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (drop `onRecategorize` wiring on the main list — rows now navigate)
- Modify: `app/(app)/dashboard/bucket/[id]/page.tsx` (same: it renders TransactionList; keep it compiling with the new prop shape)
- Test: `components/tx/TransactionList.test.tsx`

**Interfaces:**
- Produces: `TransactionList({ transactions, pageSize? }: { transactions: Transaction[]; pageSize?: number })` — renders up to `pageSize` (default 20) rows, each a `Link` to `/dashboard/tx/${tx.id}`; a "Load more" button reveals the next `pageSize`. The `buckets`/`onRecategorize` props are REMOVED (reclassify now lives on the detail page).

**Note on callers:** both `dashboard/page.tsx` and `dashboard/bucket/[id]/page.tsx` currently pass `buckets` + `onRecategorize`. After this task they pass only `transactions`. Reclassification moves entirely to Task 5's detail page.

- [ ] **Step 1: Write the failing test**

`components/tx/TransactionList.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionList } from "@/components/tx/TransactionList";
import type { Transaction } from "@/lib/model/types";

function makeTxns(n: number): Transaction[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, amount: -1000, description: `Merchant ${i}`,
    bookedAt: "2026-07-14", bucketId: null, isIncome: false,
  }));
}

describe("TransactionList", () => {
  it("shows empty state when there are no transactions", () => {
    render(<TransactionList transactions={[]} />);
    expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument();
  });
  it("renders at most 20 rows, then reveals more with Load more", () => {
    render(<TransactionList transactions={makeTxns(25)} />);
    expect(screen.getByText("Merchant 0")).toBeInTheDocument();
    expect(screen.getByText("Merchant 19")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 20")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(screen.getByText("Merchant 20")).toBeInTheDocument();
    expect(screen.getByText("Merchant 24")).toBeInTheDocument();
  });
  it("hides Load more when all are shown", () => {
    render(<TransactionList transactions={makeTxns(5)} />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
  it("links each row to its transaction detail page", () => {
    render(<TransactionList transactions={makeTxns(1)} />);
    expect(screen.getByRole("link", { name: /merchant 0/i })).toHaveAttribute("href", "/dashboard/tx/t0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no Load more / rows not links / prop mismatch).

- [ ] **Step 3: Rewrite `components/tx/TransactionList.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import type { Transaction } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";

interface Props {
  transactions: Transaction[];
  pageSize?: number;
}

export function TransactionList({ transactions, pageSize = 20 }: Props) {
  const [visible, setVisible] = useState(pageSize);

  if (transactions.length === 0) {
    return (
      <div style={{ color: "var(--color-muted)", padding: "2rem", textAlign: "center" }}>
        No transactions yet — connect a bank.
      </div>
    );
  }

  const shown = transactions.slice(0, visible);

  return (
    <div>
      {shown.map((tx) => {
        const amountColor = tx.amount > 0 ? "var(--color-success)" : "var(--color-muted)";
        return (
          <Link
            key={tx.id}
            href={`/dashboard/tx/${tx.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 0",
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-text)",
              textDecoration: "none",
            }}
            className="hover:opacity-80"
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{tx.description}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>{tx.bookedAt}</div>
            </div>
            <div style={{ fontWeight: 600, color: amountColor }}>{formatEuros(tx.amount)}</div>
          </Link>
        );
      })}

      {visible < transactions.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize)}
          className="w-full rounded-lg py-2 px-3 text-sm font-semibold mt-3"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)", cursor: "pointer" }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `app/(app)/dashboard/page.tsx`** — the main list now navigates instead of inline-recategorizing. Replace the `<TransactionList ... onRecategorize=... />` block with:

```tsx
        {txLoading ? (
          <div style={{ color: "var(--color-muted)" }}>Loading...</div>
        ) : (
          <TransactionList transactions={transactions} />
        )}
```
Then remove the now-unused `recategorize` import and the `user`/`buckets` references that only served `onRecategorize` IF they are unused afterward (keep `buckets` — it's still used for `safeToSpend`; remove the `recategorize` import if no longer referenced). Run `tsc` to confirm no unused-import errors.

- [ ] **Step 5: Update `app/(app)/dashboard/bucket/[id]/page.tsx`** — it renders `TransactionList` with `buckets`/`onRecategorize`; change to the new prop shape:

```tsx
          <TransactionList transactions={filteredTransactions} />
```
Remove the now-unused `recategorize` import and the `onRecategorize` closure in that file. Keep `useBuckets` (still used to resolve `bucket`). Run `tsc`.

- [ ] **Step 6: Run tests + typecheck** — `pnpm test components/tx/TransactionList.test.tsx && pnpm exec tsc --noEmit` → PASS + clean. (If any existing TransactionList test referenced `onRecategorize`/`recat-` testids, update it to the new link-based behaviour.)

- [ ] **Step 7: Commit**

```bash
git add components/tx/TransactionList.tsx components/tx/TransactionList.test.tsx "app/(app)/dashboard/page.tsx" "app/(app)/dashboard/bucket/[id]/page.tsx"
git commit -m "feat(tx): paginate transaction list + rows link to detail"
```

---

## Task 5: Transaction detail page with "Move to bucket"

**Files:**
- Create: `app/(app)/dashboard/tx/[id]/page.tsx`
- Test: `app/(app)/dashboard/tx/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `useParams` (`next/navigation`), `useTransactions`/`useBuckets` (existing hooks), `recategorize(uid, txn, newBucketId, buckets)` (`@/lib/data/recategorize`), `useAuth`, `formatEuros`, `pickDotColor` (`@/lib/theme`).
- Behaviour: resolve the txn by `params.id`. Show description, `bookedAt`, `formatEuros(amount)`, current bucket name (or "Uncategorized"). For a SPEND (`!tx.isIncome`), render a "Move to bucket" list of the user's buckets; clicking one calls `recategorize(user.uid, txn, bucket.id, buckets)`. Income transactions show no picker (they are split, not classified). Not-found → "Transaction not found" + back link.

- [ ] **Step 1: Write the failing test**

`app/(app)/dashboard/tx/[id]/page.test.tsx` — stable module-level mocks:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const recategorize = vi.fn().mockResolvedValue(undefined);
const mockTxns = {
  transactions: [
    { id: "t1", amount: -899, description: "Pet Shop", bookedAt: "2026-07-14", bucketId: null, isIncome: false },
  ],
  loading: false,
};
const mockBuckets = {
  buckets: [
    { id: "food", name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 },
    { id: "fun", name: "Fun", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  ],
  loading: false,
};
const mockAuth = { user: { uid: "u1", email: "e" }, loading: false };

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "t1" }) }));
vi.mock("@/lib/data/useTransactions", () => ({ useTransactions: () => mockTxns }));
vi.mock("@/lib/data/useBuckets", () => ({ useBuckets: () => mockBuckets }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/data/recategorize", () => ({ recategorize: (...a: unknown[]) => recategorize(...a) }));

import TxDetailPage from "@/app/(app)/dashboard/tx/[id]/page";

beforeEach(() => recategorize.mockClear());

it("shows the transaction and a Move to bucket picker for a spend", () => {
  render(<TxDetailPage />);
  expect(screen.getByText("Pet Shop")).toBeInTheDocument();
  expect(screen.getByText("€-8.99")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /food/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /fun/i })).toBeInTheDocument();
});

it("calls recategorize with the chosen bucket", () => {
  render(<TxDetailPage />);
  fireEvent.click(screen.getByRole("button", { name: /food/i }));
  expect(recategorize).toHaveBeenCalledWith("u1", expect.objectContaining({ id: "t1" }), "food", mockBuckets.buckets);
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Implement `app/(app)/dashboard/tx/[id]/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTransactions } from "@/lib/data/useTransactions";
import { useBuckets } from "@/lib/data/useBuckets";
import { useAuth } from "@/lib/auth/AuthProvider";
import { recategorize } from "@/lib/data/recategorize";
import { formatEuros } from "@/lib/model/money";
import { pickDotColor } from "@/lib/theme";

export default function TxDetailPage() {
  const params = useParams();
  const txnId = params.id as string;
  const { user } = useAuth();
  const { transactions, loading: txLoading } = useTransactions();
  const { buckets, loading: bLoading } = useBuckets();
  const [error, setError] = useState<string | null>(null);

  if (txLoading || bLoading) {
    return <div style={{ padding: "1rem", color: "var(--color-muted)" }}>Loading...</div>;
  }

  const txn = transactions.find((t) => t.id === txnId);
  if (!txn) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ color: "var(--color-text)", marginBottom: "1rem" }}>Transaction not found</div>
        <Link href="/dashboard" style={{ color: "var(--color-brand)", textDecoration: "underline" }}>Back to dashboard</Link>
      </div>
    );
  }

  const currentBucket = buckets.find((b) => b.id === txn.bucketId);

  const onMove = async (bucketId: string) => {
    if (!user) return;
    try {
      setError(null);
      await recategorize(user.uid, txn, bucketId, buckets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move this transaction.");
    }
  };

  return (
    <div style={{ padding: "1rem" }}>
      <Link href="/dashboard" style={{ color: "var(--color-brand)", textDecoration: "underline", fontSize: "0.875rem", display: "inline-block", marginBottom: "1rem" }}>
        ← Back to dashboard
      </Link>

      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--color-card)" }}>
        <div style={{ fontWeight: 600, fontSize: "1.125rem", color: "var(--color-text)" }}>{txn.description}</div>
        <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginTop: "0.25rem" }}>{txn.bookedAt}</div>
        <div style={{ fontWeight: 700, fontSize: "1.5rem", marginTop: "0.5rem", color: txn.amount > 0 ? "var(--color-success)" : "var(--color-text)" }}>
          {formatEuros(txn.amount)}
        </div>
        <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
          {currentBucket ? `In ${currentBucket.name}` : "Uncategorized"}
        </div>
      </div>

      {!txn.isIncome && (
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.75rem" }}>
            Move to bucket
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {buckets.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { void onMove(b.id); }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left"
                style={{
                  background: b.id === txn.bucketId ? "var(--grad-brand)" : "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: pickDotColor(b.colorIndex) }} />
                {b.name}
              </button>
            ))}
          </div>
          {error && (
            <div style={{ color: "var(--color-danger)", fontSize: "0.875rem", marginTop: "0.75rem" }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass** — `pnpm test "app/(app)/dashboard/tx/[id]/page.test.tsx"` → PASS.

- [ ] **Step 5: Typecheck** — `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/tx/[id]/page.tsx" "app/(app)/dashboard/tx/[id]/page.test.tsx"
git commit -m "feat(tx): transaction detail page with Move to bucket"
```

---

## Task 6: Tappable bucket rows → bucket detail

**Files:**
- Modify: `components/buckets/BucketRow.tsx` (make the name a `Link` when an `href` is provided)
- Test: `components/buckets/BucketRow.test.tsx`

**Interfaces:**
- Produces: `BucketRow` gains an optional prop `href?: string`. When set, the bucket NAME renders as a `next/link` `Link` to `href`; when unset, it renders as the current plain `<span>` (so nothing else that mounts BucketRow is forced to navigate). Drag handle, % input, and menu keep their existing handlers and are NOT wrapped by the link.
- The Buckets tab passes `href={\`/dashboard/bucket/${bucket.id}\`}`. Because BucketSetup builds rows for editing (including brand-new unsaved buckets with random ids), only pass `href` for buckets that exist server-side is unnecessary complexity — pass it for all; a not-yet-saved bucket's detail page will simply show "not found", which is acceptable and rare. (ponytail: no gating; YAGNI.)

**Wiring note:** `BucketRow` is rendered via `SortableBucketRow` inside `BucketSetup`. Thread an optional `href` down: `BucketSetup` → `SortableBucketRow` → `BucketRow`. `BucketSetup` computes it from `bucket.id`.

- [ ] **Step 1: Write the failing test**

`components/buckets/BucketRow.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BucketRow } from "@/components/buckets/BucketRow";
import type { Bucket } from "@/lib/model/types";

const bucket: Bucket = { id: "food", name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 };
const noop = () => {};

describe("BucketRow", () => {
  it("links the name to the detail page when href is provided", () => {
    render(<BucketRow bucket={bucket} href="/dashboard/bucket/food" onPercentChange={noop} onRename={noop} onRecolor={noop} onDelete={noop} />);
    expect(screen.getByRole("link", { name: /food/i })).toHaveAttribute("href", "/dashboard/bucket/food");
  });
  it("renders the name as plain text when href is absent", () => {
    render(<BucketRow bucket={bucket} onPercentChange={noop} onRename={noop} onRecolor={noop} onDelete={noop} />);
    expect(screen.queryByRole("link", { name: /food/i })).not.toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });
  it("keeps the percentage input usable (not wrapped in the link)", () => {
    render(<BucketRow bucket={bucket} href="/dashboard/bucket/food" onPercentChange={noop} onRename={noop} onRecolor={noop} onDelete={noop} />);
    expect(screen.getByLabelText(/food percentage/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (no `href` support).

- [ ] **Step 3: Modify `components/buckets/BucketRow.tsx`** — add `href?: string` to props, import `Link`, and render the name conditionally. Replace the name `<span className="flex-1 ...">{bucket.name}</span>` with:

```tsx
      {href ? (
        <Link href={href} className="flex-1 text-sm hover:opacity-80" style={{ color: "var(--color-text)", textDecoration: "none" }}>
          {bucket.name}
        </Link>
      ) : (
        <span className="flex-1 text-sm" style={{ color: "var(--color-text)" }}>{bucket.name}</span>
      )}
```
Add `import Link from "next/link";` at the top and `href?: string;` to `BucketRowProps`, and accept `href` in the destructured params.

- [ ] **Step 4: Thread `href` through BucketSetup** — in `components/buckets/BucketSetup.tsx`:
  - add `href?: string` to `SortableBucketRow`'s props and pass it to `<BucketRow href={href} ... />`;
  - where `<SortableBucketRow ... />` is rendered in the map, add `href={\`/dashboard/bucket/${bucket.id}\`}`.

- [ ] **Step 5: Run tests + typecheck** — `pnpm test components/buckets && pnpm exec tsc --noEmit` → PASS + clean. (If a BucketSetup test asserts the name is a plain textnode, it still passes because BucketSetup now passes href → it becomes a link; update that assertion to `getByRole("link")` if present.)

- [ ] **Step 6: Commit**

```bash
git add components/buckets/BucketRow.tsx components/buckets/BucketRow.test.tsx components/buckets/BucketSetup.tsx
git commit -m "feat(buckets): tappable bucket name links to detail page"
```

---

## Task 7: Full-suite + typecheck gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite** — `pnpm test` → all pass (expect existing 86 + the new tests from Tasks 1–6; no regressions).
- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` → clean.
- [ ] **Step 3: Functions untouched check** — confirm `git status` shows no changes under `functions/` (this plan is client-only).
- [ ] **Step 4: If anything fails, fix under the owning task and re-run.** No commit needed if 1–3 are clean and already committed.

---

## Self-Review

- **Spec coverage:** (1) auto-seed → Task 2 (defaults module Task 1); (2) hero total remaining → Task 3; (3) tap-to-reclassify via tx detail → Tasks 4+5; (4) load-more pagination → Task 4; (5) tappable bucket rows → Task 6. All five spec components mapped. The removed "payday" line is reflected in Task 3.
- **Type consistency:** `TransactionList` prop shape changes in Task 4 and every caller (dashboard, bucket detail) is updated in the same task. `BucketRow` gains `href?` in Task 6 and BucketSetup threads it. `ensureBuckets` returns `"seeded" | "skipped"` consistently. `SafeToSpendHero` signature (no `daysToPayday`) matches the already-edited component.
- **Placeholder scan:** no TBD/TODO; every code step has full code.
- **DRY:** `DEFAULT_BUCKETS` centralized (Task 1) and reused by the seeder and Buckets page.

## Verification (whole plan, emulator)

1. Fresh dev user → dashboard: 5 buckets auto-seeded (Bills/Savings/Food/Fun/Others); after a sync with income, hero shows non-zero total remaining.
2. Transaction list caps at 20 with a working "Load more".
3. Tap a transaction → detail → "Move to bucket" → bucket `remaining` updates; the txn shows the new bucket on return.
4. Buckets tab → tap a bucket name → its detail page lists transactions classified into it; editing a bucket (rename/slider/drag) does not navigate.
5. `pnpm test` + `pnpm exec tsc --noEmit` clean; no `functions/` changes.
