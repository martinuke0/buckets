# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MyBuckets visible and demoable — the validated dashboard (safe-to-spend hero + bucket cards), bucket setup (slider rows), and the income-split moment (pour → confirm) — driven by SplitEngine and Firestore, with a manual "simulate income" action standing in for bank sync until that subsystem lands.

**Architecture:** A thin per-user Firestore data layer (`lib/data/buckets.ts`) reads/writes buckets and applies allocations transactionally, keeping each bucket's `remaining`/`allocated` current so the dashboard never scans all transactions. UI is built from small focused components using the existing design tokens. SplitEngine (pure) computes allocations; the data layer persists them. A "simulate income" button on the dashboard exercises the full hero loop today; the future bank adapter becomes just another caller of `applyIncome`, no UI change.

**Tech Stack:** Next.js 16 (App Router, "use client" for interactive screens), React 19, Firebase Firestore (client SDK), Vitest + React Testing Library, `@firebase/rules-unit-testing` (emulator) for the data-layer test where feasible.

## Global Constraints

- **This is Next.js 16.** Before writing components, skim `node_modules/next/dist/docs/01-app/` (the project's `AGENTS.md` warns APIs differ from training data). Follow v16 conventions for `"use client"`, navigation, and route groups.
- **Money is integer cents** everywhere; format for display only via `formatEuros` from `@/lib/model/money`.
- **Dark theme via design tokens** (`var(--color-*)`, `var(--grad-brand)`, `var(--grad-danger)`); **NO emojis** — bucket identity is an accent-color dot (`pickDotColor`) + plain name.
- **Reuse existing code:** `splitIncome`/`SplitRule`/`Allocation` from `@/lib/split/engine`; `Bucket`/`Transaction`/`Allocation` types and path helpers from `@/lib/model/*`; `formatEuros` from `@/lib/model/money`; `pickDotColor`/`BUCKET_DOT_COLORS` from `@/lib/theme`; `useAuth` from `@/lib/auth/AuthProvider`; `getDb` from `@/lib/firebase/client`.
- **Per-user isolation:** all Firestore reads/writes go under `users/{uid}/…` using the path helpers; never a top-level query.
- **Conservation:** applying income must persist allocations that sum to the income; bucket `remaining` increases by exactly its allocation.
- **Dashboard = hero option 4 + accent-dot bucket cards.** Bucket setup = **plain slider rows**. Split moment = pour animation → confirm list. (From the design spec.)

---

## File Structure

- `lib/data/buckets.ts` — per-user Firestore data layer: `listBuckets`, `saveBuckets`, `applyIncome`, `applySpend`. One responsibility: persist bucket/allocation state consistently.
- `lib/data/useBuckets.ts` — a client hook subscribing to the user's buckets (loading/live state) for the screens.
- `components/buckets/BucketCard.tsx` — one bucket row (dot + name + remaining + progress bar).
- `components/buckets/SafeToSpendHero.tsx` — hero card (option 4: amount, on-track chip, pacing bar).
- `components/buckets/SplitList.tsx` — the line-item split list used by the confirm step.
- `app/(app)/dashboard/page.tsx` — hero + bucket cards + "Simulate income" action (replaces placeholder).
- `app/(app)/buckets/page.tsx` — bucket setup: slider rows + add bucket + live total (replaces placeholder).
- `app/(app)/dashboard/SimulateIncomeDialog.tsx` — enter an amount → pour → confirm → `applyIncome`.

---

## Task 1: Buckets data layer

**Files:**
- Create: `lib/data/buckets.ts`
- Test: `lib/data/buckets.test.ts`

**Interfaces:**
- Consumes: `getDb` (`@/lib/firebase/client`), path helpers (`@/lib/model/paths`), `Bucket`/`Allocation` (`@/lib/model/types`), `Cents` (`@/lib/model/money`), `splitIncome`/`SplitRule` (`@/lib/split/engine`).
- Produces:
  - `listBuckets(uid): Promise<Bucket[]>`
  - `saveBuckets(uid, buckets: Bucket[]): Promise<void>` (writes the full set; used by setup screen)
  - `applyIncome(uid, income: Cents): Promise<Allocation[]>` — reads buckets, derives `SplitRule[]` from each bucket's `percent`, calls `splitIncome`, then in a Firestore transaction writes an income Transaction + per-bucket Allocations and increments each bucket's `remaining` and `allocated`. Returns the allocations.
  - `applySpend(uid, bucketId, amount: Cents): Promise<void>` — decrements a bucket's `remaining` (used later; keep minimal now).

**Note on testing:** the pure split math is already covered by SplitEngine's own tests. Here, test the *rule derivation + conservation wiring* — that `applyIncome` produces allocations summing to income — by testing the pure helper `deriveRules(buckets)` and by asserting `splitIncome(income, deriveRules(buckets))` conserves. Full Firestore-transaction behavior is verified end-to-end in the emulator (Verification section), not mocked into a false-confidence unit test.

- [ ] **Step 1: Write the failing test (pure helper)**

`lib/data/buckets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deriveRules } from "@/lib/data/buckets";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

describe("deriveRules", () => {
  it("maps buckets to split rules by id and percent", () => {
    expect(deriveRules(buckets)).toEqual([
      { bucketId: "a", percent: 60 },
      { bucketId: "b", percent: 40 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/data/buckets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the data layer**

`lib/data/buckets.ts`:
```ts
import {
  collection, doc, getDocs, writeBatch, runTransaction, increment,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol, txCol, allocationsCol } from "@/lib/model/paths";
import type { Bucket, Allocation } from "@/lib/model/types";
import type { Cents } from "@/lib/model/money";
import { splitIncome, type SplitRule } from "@/lib/split/engine";

export function deriveRules(buckets: Bucket[]): SplitRule[] {
  return buckets.map((b) => ({ bucketId: b.id, percent: b.percent }));
}

export async function listBuckets(uid: string): Promise<Bucket[]> {
  const snap = await getDocs(collection(getDb(), bucketsCol(uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bucket, "id">) }));
}

export async function saveBuckets(uid: string, buckets: Bucket[]): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  for (const b of buckets) {
    const { id, ...rest } = b;
    batch.set(doc(db, bucketsCol(uid), id), rest);
  }
  await batch.commit();
}

export async function applyIncome(uid: string, income: Cents): Promise<Allocation[]> {
  const buckets = await listBuckets(uid);
  const allocations = splitIncome(income, deriveRules(buckets));
  const db = getDb();

  await runTransaction(db, async (tx) => {
    const incomeRef = doc(collection(db, txCol(uid)));
    tx.set(incomeRef, {
      amount: income, description: "Income", bookedAt: new Date().toISOString(),
      bucketId: null, isIncome: true,
    });
    for (const a of allocations) {
      const allocRef = doc(collection(db, allocationsCol(uid)));
      tx.set(allocRef, {
        bucketId: a.bucketId, amount: a.amount,
        incomeTxId: incomeRef.id, createdAt: new Date().toISOString(),
      });
      const bRef = doc(db, bucketsCol(uid), a.bucketId);
      tx.update(bRef, { remaining: increment(a.amount), allocated: increment(a.amount) });
    }
  });

  return allocations;
}

export async function applySpend(uid: string, bucketId: string, amount: Cents): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const bRef = doc(db, bucketsCol(uid), bucketId);
    tx.update(bRef, { remaining: increment(-amount) });
  });
}
```
(`new Date().toISOString()` here is a persistence timestamp for stored records, not control flow — acceptable. Do not use it in SplitEngine.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/data/buckets.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add lib/data/buckets.ts lib/data/buckets.test.ts
git commit -m "feat: per-user buckets data layer (applyIncome via SplitEngine)"
```

---

## Task 2: useBuckets hook

**Files:**
- Create: `lib/data/useBuckets.ts`
- Test: `lib/data/useBuckets.test.tsx`

**Interfaces:**
- Consumes: `getDb`, `bucketsCol`, `Bucket`, `useAuth`.
- Produces: `useBuckets(): { buckets: Bucket[]; loading: boolean }` — subscribes with `onSnapshot` to the signed-in user's buckets collection and unsubscribes on unmount / uid change.

- [ ] **Step 1: Write the failing test**

`lib/data/useBuckets.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useBuckets } from "@/lib/data/useBuckets";

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "u1", email: null }, loading: false }) }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  onSnapshot: (_q: unknown, cb: (snap: unknown) => void) => {
    cb({ docs: [{ id: "a", data: () => ({ name: "Rent", colorIndex: 0, percent: 100, type: "virtual", remaining: 500, allocated: 500 }) }] });
    return () => {};
  },
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));

function Probe() {
  const { buckets, loading } = useBuckets();
  return <div>{loading ? "loading" : buckets.map((b) => b.name).join(",")}</div>;
}

describe("useBuckets", () => {
  it("exposes the user's buckets from a snapshot", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByText("Rent")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/data/useBuckets.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

`lib/data/useBuckets.ts`:
```ts
"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { bucketsCol } from "@/lib/model/paths";
import type { Bucket } from "@/lib/model/types";
import { useAuth } from "@/lib/auth/AuthProvider";

export function useBuckets(): { buckets: Bucket[]; loading: boolean } {
  const { user } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = collection(getDb(), bucketsCol(user.uid));
    return onSnapshot(q, (snap) => {
      setBuckets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Bucket, "id">) })));
      setLoading(false);
    });
  }, [user]);

  return { buckets, loading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/data/useBuckets.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/useBuckets.ts lib/data/useBuckets.test.tsx
git commit -m "feat: useBuckets live subscription hook"
```

---

## Task 3: BucketCard + SafeToSpendHero components

**Files:**
- Create: `components/buckets/BucketCard.tsx`, `components/buckets/SafeToSpendHero.tsx`
- Test: `components/buckets/BucketCard.test.tsx`

**Interfaces:**
- Consumes: `Bucket`, `formatEuros`, `pickDotColor`.
- Produces:
  - `<BucketCard bucket={Bucket} />` — accent dot (`pickDotColor(bucket.colorIndex)`), name, `formatEuros(bucket.remaining)` right-aligned (green normally, danger color when `remaining <= 0.1 * allocated`), and a progress bar (`remaining/allocated`), gradient fill (brand normally, danger when low).
  - `<SafeToSpendHero safeToSpend={Cents} onTrack={boolean} daysToPayday={number} monthProgress={number} />` — hero option 4: label, big `formatEuros(safeToSpend)`, an "▲ on track" chip when `onTrack`, and a thin pacing bar at `monthProgress` (0–1).

- [ ] **Step 1: Write the failing test**

`components/buckets/BucketCard.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BucketCard } from "@/components/buckets/BucketCard";
import type { Bucket } from "@/lib/model/types";

const bucket: Bucket = { id: "a", name: "Food", colorIndex: 2, percent: 15, type: "virtual", remaining: 18000, allocated: 30000 };

describe("BucketCard", () => {
  it("shows the bucket name and remaining amount", () => {
    render(<BucketCard bucket={bucket} />);
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("€180.00")).toBeInTheDocument();
  });
  it("marks a nearly-empty bucket as low", () => {
    render(<BucketCard bucket={{ ...bucket, remaining: 1000 }} />); // <=10% of 30000
    expect(screen.getByTestId("bucket-a")).toHaveAttribute("data-low", "true");
  });
});
```
(Use `data-testid={`bucket-${bucket.id}`}` and `data-low` on the card root.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/buckets/BucketCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the components**

`components/buckets/BucketCard.tsx`:
```tsx
import type { Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";
import { pickDotColor } from "@/lib/theme";

export function BucketCard({ bucket }: { bucket: Bucket }) {
  const low = bucket.allocated > 0 && bucket.remaining <= 0.1 * bucket.allocated;
  const pct = bucket.allocated > 0 ? Math.max(0, Math.min(1, bucket.remaining / bucket.allocated)) : 0;
  return (
    <div data-testid={`bucket-${bucket.id}`} data-low={low}
      className="rounded-2xl p-4 mb-2" style={{ background: "var(--color-card)" }}>
      <div className="flex justify-between items-center text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        <span className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: pickDotColor(bucket.colorIndex) }} />
          {bucket.name}
        </span>
        <span style={{ color: low ? "#FF5E57" : "#14F195" }}>{formatEuros(bucket.remaining)}</span>
      </div>
      <div className="mt-2 rounded" style={{ background: "var(--color-border)", height: 8 }}>
        <div style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, background: low ? "var(--grad-danger)" : "var(--grad-brand)" }} />
      </div>
    </div>
  );
}
```

`components/buckets/SafeToSpendHero.tsx`:
```tsx
import { formatEuros } from "@/lib/model/money";
import type { Cents } from "@/lib/model/money";

export function SafeToSpendHero({
  safeToSpend, onTrack, daysToPayday, monthProgress,
}: { safeToSpend: Cents; onTrack: boolean; daysToPayday: number; monthProgress: number }) {
  return (
    <div className="rounded-2xl p-5 mb-4"
      style={{ background: "radial-gradient(130% 130% at 0% 0%, rgba(153,69,255,.28), transparent 60%), var(--color-card)", border: "1px solid var(--color-border)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>Safe to spend today</div>
      <div className="flex items-baseline gap-2">
        <div className="text-3xl font-extrabold" style={{ color: "var(--color-text)" }}>{formatEuros(safeToSpend)}</div>
        {onTrack && <div className="text-xs" style={{ color: "#14F195" }}>▲ on track</div>}
      </div>
      <div className="mt-2 rounded" style={{ background: "var(--color-border)", height: 6 }}>
        <div style={{ width: `${Math.max(0, Math.min(1, monthProgress)) * 100}%`, height: 6, borderRadius: 3, background: "var(--grad-brand)" }} />
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>payday in {daysToPayday}d</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/buckets/BucketCard.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add components/buckets/BucketCard.tsx components/buckets/SafeToSpendHero.tsx components/buckets/BucketCard.test.tsx
git commit -m "feat: BucketCard + SafeToSpendHero components"
```

---

## Task 4: Bucket setup screen (slider rows)

**Files:**
- Modify: `app/(app)/buckets/page.tsx`
- Create: `components/buckets/BucketSetup.tsx`
- Test: `components/buckets/BucketSetup.test.tsx`

**Interfaces:**
- Consumes: `useBuckets`, `saveBuckets`, `Bucket`, `pickDotColor`, `formatEuros`, `useAuth`.
- Produces: an editable list of slider rows (one per bucket: name + a range input bound to `percent`), an "+ Add bucket" control, a live **Total %** indicator (green ✓ at 100, danger otherwise), and a Save button that calls `saveBuckets` (disabled unless total is 100 within tolerance). New buckets get the next `colorIndex` via `pickDotColor` ordering.

- [ ] **Step 1: Write the failing test**

`components/buckets/BucketSetup.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BucketSetup } from "@/components/buckets/BucketSetup";
import type { Bucket } from "@/lib/model/types";

const initial: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

describe("BucketSetup", () => {
  it("shows a live total and enables save at 100%", () => {
    render(<BucketSetup initial={initial} onSave={vi.fn()} />);
    expect(screen.getByTestId("total-percent")).toHaveTextContent("100");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
  it("disables save when total is not 100%", () => {
    render(<BucketSetup initial={[{ ...initial[0], percent: 50 }]} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
  it("calls onSave with the edited buckets", () => {
    const onSave = vi.fn();
    render(<BucketSetup initial={initial} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/buckets/BucketSetup.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BucketSetup` (presentational, prop-driven)**

Build `components/buckets/BucketSetup.tsx` as a `"use client"` component taking `{ initial: Bucket[]; onSave: (b: Bucket[]) => void }`. Hold an editable copy in state; render one slider row per bucket (`<input type="range" min={0} max={100} step={1}>` bound to `percent`, name shown with its `pickDotColor` dot, `formatEuros` optional). Compute `total = sum(percent)`; render it in a `data-testid="total-percent"` element (green when `Math.abs(total-100) < 0.001`, else danger). Add "+ Add bucket" (pushes `{ id: crypto.randomUUID(), name: "New bucket", colorIndex: <next>, percent: 0, type: "virtual", remaining: 0, allocated: 0 }`). Save button `disabled={Math.abs(total-100) >= 0.001}` calls `onSave(state)`.

- [ ] **Step 4: Wire the page**

`app/(app)/buckets/page.tsx` (`"use client"`): read `useBuckets()`; while loading show a muted "Loading…"; render `<BucketSetup initial={buckets} onSave={(b) => saveBuckets(user.uid, b)} />` (get `uid` from `useAuth`). If the user has no buckets yet, seed the `initial` prop with a sensible default set (Rent 35, Savings 30, Food 15, Nights out 10, Gym 10) so first-run isn't empty.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm test components/buckets/BucketSetup.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/buckets/page.tsx" components/buckets/BucketSetup.tsx components/buckets/BucketSetup.test.tsx
git commit -m "feat: bucket setup screen with slider rows + live total"
```

---

## Task 5: Dashboard + simulate-income (the hero loop)

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/dashboard/SimulateIncomeDialog.tsx`
- Create: `components/buckets/SplitList.tsx`
- Test: `components/buckets/SplitList.test.tsx`

**Interfaces:**
- Consumes: `useBuckets`, `applyIncome`, `SafeToSpendHero`, `BucketCard`, `SplitList`, `splitIncome`, `deriveRules`, `formatEuros`, `toCents`, `useAuth`.
- Produces:
  - `<SplitList allocations={{bucketId,amount}[]} buckets={Bucket[]} />` — the line-item confirm list (dot + name + `formatEuros(amount)`), used in the split dialog.
  - Dashboard renders `<SafeToSpendHero>` (safeToSpend = sum of bucket `remaining`; `monthProgress`/`daysToPayday` computed from today's date in the page — a display concern, fine here) + a `<BucketCard>` per bucket + a "Simulate income" button opening `SimulateIncomeDialog`.
  - `SimulateIncomeDialog` — amount input (euros → `toCents`), a **preview** via `splitIncome(toCents(amount), deriveRules(buckets))` shown in `SplitList`, and a **Confirm** button calling `applyIncome(uid, cents)` then closing. (This is the manual stand-in for bank sync; the future bank adapter calls `applyIncome` the same way.)

- [ ] **Step 1: Write the failing test**

`components/buckets/SplitList.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplitList } from "@/components/buckets/SplitList";
import type { Bucket } from "@/lib/model/types";

const buckets: Bucket[] = [
  { id: "a", name: "Rent", colorIndex: 0, percent: 60, type: "virtual", remaining: 0, allocated: 0 },
  { id: "b", name: "Food", colorIndex: 1, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
];

describe("SplitList", () => {
  it("renders each allocation with its bucket name and amount", () => {
    render(<SplitList buckets={buckets} allocations={[
      { bucketId: "a", amount: 60000 },
      { bucketId: "b", amount: 40000 },
    ]} />);
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("€600.00")).toBeInTheDocument();
    expect(screen.getByText("€400.00")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/buckets/SplitList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SplitList`**

`components/buckets/SplitList.tsx`: map allocations to rows, look up each bucket by `bucketId` for name + `pickDotColor(colorIndex)`, show `formatEuros(amount)`. Dark tokens, no emojis.

- [ ] **Step 4: Implement the dialog + wire the dashboard**

Build `SimulateIncomeDialog.tsx` (`"use client"`): amount field (parse to number → `toCents`), live preview `splitIncome(cents, deriveRules(buckets))` in `<SplitList>`, Confirm → `await applyIncome(uid, cents)` → close. Guard: if `buckets` is empty or percents ≠ 100, show "Set up your buckets first" linking to `/buckets`.
Rewrite `app/(app)/dashboard/page.tsx` (`"use client"`): `useBuckets()`; compute `safeToSpend = buckets.reduce((t,b)=>t+b.remaining,0)`; render hero + cards + the "Simulate income" button/dialog.

- [ ] **Step 5: Run tests + typecheck + full suite**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" "app/(app)/dashboard/SimulateIncomeDialog.tsx" components/buckets/SplitList.tsx components/buckets/SplitList.test.tsx
git commit -m "feat: dashboard hero loop with simulate-income (drives SplitEngine + applyIncome)"
```

---

## Self-Review

- **Spec coverage:** dashboard hero option 4 (Task 3/5), accent-dot progress-bar cards (Task 3), bucket setup slider rows + live total (Task 4), the split moment as preview→confirm list driven by SplitEngine (Task 5). Pour *animation* polish is deferred to a later polish pass — the functional confirm flow ships now (note this in the demo).
- **Depends on:** SplitEngine plan (must be executed first — `splitIncome`, `deriveRules`), foundation (types, paths, theme, auth, firebase).
- **Bank-sync stand-in:** `applyIncome` is the single seam; the future bank adapter calls it identically — no UI rework. Stated explicitly so it's not mistaken for throwaway.
- **Type consistency:** all field names match the foundation's `Bucket`/`Allocation`; `splitIncome`/`deriveRules` signatures match the SplitEngine plan.
- **Placeholders:** Tasks 1–3 and 5-SplitList carry full code; Tasks 4 and 5-dialog give precise component contracts + props rather than full JSX (interactive screens with many valid layouts — the reviewer checks against the stated contract and the design spec's validated mockups).

## Verification (whole plan)

1. `pnpm test && pnpm exec tsc --noEmit` — all unit tests pass, no type errors.
2. **Emulator end-to-end** (needs Firebase emulator + Java): `pnpm exec firebase emulators:start`, run the app against it, sign in, set up buckets (total 100%), click **Simulate income €2000**, Confirm → dashboard bucket `remaining` values increase by exactly their allocations and sum of allocations = €2000 (conservation).
3. **Live/dev**: `pnpm dev`, sign in with Google, visit `/buckets` (slider rows render, total gates Save), `/dashboard` (hero + cards render, Simulate income preview matches confirmed result).
4. Verify in-browser (Chrome DevTools MCP): dark theme, no emojis, accent dots present, amounts formatted as `€X.XX`.
