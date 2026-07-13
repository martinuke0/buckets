# SplitEngine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, deterministic function that splits an income amount across percentage-based bucket rules into integer-cent allocations that always sum to exactly the income.

**Architecture:** One pure module `lib/split/engine.ts` — no I/O, no Firebase, no dates. It consumes the existing `Cents` type and produces allocation objects. Rounding uses the **largest-remainder method** so the allocations always sum to the input to the cent; ties break by bucket order (deterministic). This module is later consumed by the income-split flow and, per the spec's x402 hook, kept as a clean server-side function so it can be exposed as a metered endpoint without a refactor.

**Tech Stack:** TypeScript (strict), Vitest.

## Global Constraints

- **Money is integer cents** (`Cents = number` from `lib/model/money.ts`). No floats in allocation results.
- **Conservation:** the sum of allocation amounts MUST equal the input income exactly — never create or drop a cent to rounding.
- **Determinism:** identical inputs always produce identical outputs; no `Math.random`, no `Date`. Tie-breaks resolve by bucket array order.
- **Pure:** no side effects, no I/O, no logging. Inputs in, value out; invalid input throws a typed error.
- **Reuse existing types:** import `Cents` from `@/lib/model/money`. Do not redefine it.

---

## File Structure

- `lib/split/engine.ts` — the `splitIncome` function, its input/output types, and validation.
- `lib/split/engine.test.ts` — unit tests (conservation, rounding, guards, determinism).

---

## Task 1: Types + input validation

**Files:**
- Create: `lib/split/engine.ts`
- Test: `lib/split/engine.test.ts`

**Interfaces:**
- Consumes: `Cents` from `@/lib/model/money`.
- Produces:
  - `interface SplitRule { bucketId: string; percent: number }` (percent is 0–100, may be fractional e.g. 12.5)
  - `interface Allocation { bucketId: string; amount: Cents }`
  - `class SplitError extends Error` (thrown on invalid input)
  - `function validateRules(rules: SplitRule[]): void` — throws `SplitError` if rules are invalid; returns void if OK. Rules used by `splitIncome` (Task 2).
  - Validity: non-empty; every `percent >= 0`; percentages sum to exactly 100 (within a 0.001 tolerance for float representation); no duplicate `bucketId`.

- [ ] **Step 1: Write the failing test**

`lib/split/engine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateRules, SplitError, type SplitRule } from "@/lib/split/engine";

const ok: SplitRule[] = [
  { bucketId: "a", percent: 60 },
  { bucketId: "b", percent: 40 },
];

describe("validateRules", () => {
  it("accepts rules summing to 100", () => {
    expect(() => validateRules(ok)).not.toThrow();
  });
  it("accepts fractional percents summing to 100", () => {
    expect(() => validateRules([
      { bucketId: "a", percent: 12.5 },
      { bucketId: "b", percent: 87.5 },
    ])).not.toThrow();
  });
  it("rejects an empty rule set", () => {
    expect(() => validateRules([])).toThrow(SplitError);
  });
  it("rejects percentages that do not sum to 100", () => {
    expect(() => validateRules([{ bucketId: "a", percent: 90 }])).toThrow(SplitError);
  });
  it("rejects a negative percent", () => {
    expect(() => validateRules([
      { bucketId: "a", percent: -10 },
      { bucketId: "b", percent: 110 },
    ])).toThrow(SplitError);
  });
  it("rejects duplicate bucket ids", () => {
    expect(() => validateRules([
      { bucketId: "a", percent: 50 },
      { bucketId: "a", percent: 50 },
    ])).toThrow(SplitError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/split/engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + `validateRules`**

`lib/split/engine.ts`:
```ts
import type { Cents } from "@/lib/model/money";

export interface SplitRule {
  bucketId: string;
  percent: number; // 0–100, may be fractional
}

export interface Allocation {
  bucketId: string;
  amount: Cents;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

const PERCENT_TOLERANCE = 0.001;

export function validateRules(rules: SplitRule[]): void {
  if (rules.length === 0) throw new SplitError("at least one bucket rule is required");

  const seen = new Set<string>();
  let total = 0;
  for (const r of rules) {
    if (seen.has(r.bucketId)) throw new SplitError(`duplicate bucketId: ${r.bucketId}`);
    seen.add(r.bucketId);
    if (!(r.percent >= 0)) throw new SplitError(`percent must be >= 0 for ${r.bucketId}`);
    total += r.percent;
  }
  if (Math.abs(total - 100) > PERCENT_TOLERANCE) {
    throw new SplitError(`percentages must sum to 100 (got ${total})`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/split/engine.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/split/engine.ts lib/split/engine.test.ts
git commit -m "feat: split rule types + validation"
```

---

## Task 2: splitIncome with largest-remainder rounding

**Files:**
- Modify: `lib/split/engine.ts`
- Test: `lib/split/engine.test.ts` (add cases)

**Interfaces:**
- Consumes: `validateRules`, `SplitRule`, `Allocation`, `Cents` (Task 1).
- Produces: `function splitIncome(income: Cents, rules: SplitRule[]): Allocation[]`
  - `income` must be a non-negative integer (cents). Throws `SplitError` otherwise.
  - Returns one `Allocation` per rule, in the same order as `rules`.
  - **Conservation guarantee:** `sum(allocations.amount) === income` exactly.
  - Rounding: floor each bucket's ideal share, then distribute the leftover cents one-by-one to the buckets with the largest fractional remainders; ties break by earlier array index.

- [ ] **Step 1: Write the failing tests**

Add to `lib/split/engine.test.ts`:
```ts
import { splitIncome } from "@/lib/split/engine";

function sum(a: { amount: number }[]) { return a.reduce((t, x) => t + x.amount, 0); }

describe("splitIncome", () => {
  it("splits an evenly-divisible income", () => {
    const out = splitIncome(100000, ok); // €1000, 60/40
    expect(out).toEqual([
      { bucketId: "a", amount: 60000 },
      { bucketId: "b", amount: 40000 },
    ]);
  });

  it("conserves every cent when the split does not divide evenly", () => {
    // €10.00 split three ways at 33.33/33.33/33.34 -> must total 1000 cents
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 33.33 },
      { bucketId: "b", percent: 33.33 },
      { bucketId: "c", percent: 33.34 },
    ];
    const out = splitIncome(1000, rules);
    expect(sum(out)).toBe(1000);
  });

  it("distributes leftover cents by largest remainder, ties by order", () => {
    // €0.10 (10 cents) split 3 equal ways: ideal 3.333 each.
    // floors: 3,3,3 = 9; 1 leftover cent -> largest remainder tie -> first bucket.
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 33.34 },
      { bucketId: "b", percent: 33.33 },
      { bucketId: "c", percent: 33.33 },
    ];
    const out = splitIncome(10, rules);
    expect(out).toEqual([
      { bucketId: "a", amount: 4 },
      { bucketId: "b", amount: 3 },
      { bucketId: "c", amount: 3 },
    ]);
    expect(sum(out)).toBe(10);
  });

  it("handles zero income by allocating zero to every bucket", () => {
    const out = splitIncome(0, ok);
    expect(out).toEqual([
      { bucketId: "a", amount: 0 },
      { bucketId: "b", amount: 0 },
    ]);
  });

  it("rejects negative income", () => {
    expect(() => splitIncome(-1, ok)).toThrow(SplitError);
  });

  it("rejects non-integer income", () => {
    expect(() => splitIncome(100.5, ok)).toThrow(SplitError);
  });

  it("is deterministic across repeated calls", () => {
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 33.33 },
      { bucketId: "b", percent: 33.33 },
      { bucketId: "c", percent: 33.34 },
    ];
    expect(splitIncome(9999, rules)).toEqual(splitIncome(9999, rules));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/split/engine.test.ts`
Expected: FAIL — `splitIncome` is not exported.

- [ ] **Step 3: Implement `splitIncome`**

Add to `lib/split/engine.ts`:
```ts
export function splitIncome(income: Cents, rules: SplitRule[]): Allocation[] {
  if (!Number.isInteger(income)) throw new SplitError("income must be an integer number of cents");
  if (income < 0) throw new SplitError("income must be >= 0");
  validateRules(rules);

  // Ideal (fractional) share per bucket, then floor; track remainders.
  const ideal = rules.map((r) => (income * r.percent) / 100);
  const floors = ideal.map((x) => Math.floor(x));
  let distributed = floors.reduce((t, x) => t + x, 0);
  let leftover = income - distributed; // number of whole cents still to hand out

  // Largest-remainder order; ties break by original index (stable).
  const order = rules
    .map((_, i) => i)
    .sort((i, j) => {
      const fi = ideal[i] - floors[i];
      const fj = ideal[j] - floors[j];
      if (fj !== fi) return fj - fi; // larger remainder first
      return i - j;                  // tie -> earlier index first
    });

  const amounts = floors.slice();
  for (let k = 0; k < order.length && leftover > 0; k++) {
    amounts[order[k]] += 1;
    leftover -= 1;
  }

  return rules.map((r, i) => ({ bucketId: r.bucketId, amount: amounts[i] }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/split/engine.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Property check — conservation over many amounts**

Add one more test that loops a range of incomes and asserts conservation, so the guarantee is enforced beyond the hand-picked cases:
```ts
describe("splitIncome conservation property", () => {
  it("always sums to income across a range", () => {
    const rules: SplitRule[] = [
      { bucketId: "a", percent: 14.28 },
      { bucketId: "b", percent: 28.57 },
      { bucketId: "c", percent: 57.15 },
    ];
    for (let income = 0; income <= 5000; income++) {
      const out = splitIncome(income, rules);
      expect(out.reduce((t, x) => t + x.amount, 0)).toBe(income);
    }
  });
});
```

- [ ] **Step 6: Run the full suite**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/split/engine.ts lib/split/engine.test.ts
git commit -m "feat: splitIncome with largest-remainder rounding (cent-conserving)"
```

---

## Self-Review

- **Spec coverage:** spec's SplitEngine requirements — pure `(income, rules) → allocations`, percentages sum to 100 (Task 1 validation), rounding-remainder distribution (Task 2 largest-remainder), zero/negative guards (Task 2). ✅
- **Conservation:** guaranteed by construction (floors + integer leftover distribution) and enforced by the property test (Task 2 Step 5).
- **Determinism:** stable remainder ordering with index tie-break; property test also asserts repeat-call equality.
- **Type consistency:** `Cents` imported from `@/lib/model/money` (defined in the foundation plan Task 3); not redefined.
- **Placeholders:** none — full code in every step.

## Verification (whole plan)

1. `pnpm test lib/split/engine.test.ts` — all unit + property tests pass.
2. `pnpm exec tsc --noEmit` — no type errors.
3. Manual sanity: `splitIncome(200000, [{bucketId:"rent",percent:35},{bucketId:"save",percent:30},{bucketId:"food",percent:15},{bucketId:"fun",percent:10},{bucketId:"gym",percent:10}])` returns amounts totalling exactly 200000.
