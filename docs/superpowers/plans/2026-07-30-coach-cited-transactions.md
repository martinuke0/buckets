# Coach Cited Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the coach cite a number in its reply as a tappable chip that links to that transaction's detail page.

**Architecture:** The coach's phase-2 `responseSchema` gains an optional `citations: [{label, txnId}]` array (txnId enum-constrained to ids actually shown to the model). Transaction ids are threaded into the coach context and prompt so the model can reference them. `MessageBubble` splits the reply text on each citation label and renders the match as a `<Link href="/dashboard/tx/<txnId>">` chip. The existing tx detail route and persisted-chat-in-Firestore give free navigation and back-to-chat.

**Tech Stack:** TypeScript, `@google/genai` (v2.11), Firebase Cloud Functions v2, Next.js 16, Vitest (root config, `@` → repo root; also covers `functions/src`).

## Global Constraints

- Rebalance/suggestion path, money path, and the two-phase tool loop are UNCHANGED. Citations ride alongside `suggestion`/`memory` in the same phase-2 schema.
- Citation shape is exactly `{ label: string; txnId: string }`. `label` = exact substring in `reply` to chip; `txnId` = Firestore transaction doc id.
- Chip target is `/dashboard/tx/<txnId>` (existing route, finds by `t.id === txnId`, works for any txn incl. Uncategorized).
- Client contract additions are ADDITIVE: `CoachReply` and `CoachMessage` gain optional `citations?`. No breaking changes to existing fields.
- Safety (cheap guards only, no accuracy verification): label not found in reply text → skip that chip (no error); txnId not in the known id set → drop that citation server-side; schema enum constrains txnId to shown ids.
- Functions→lib imports use relative paths (`../../lib/...`), NOT the `@/` alias — the `@/` alias has no runtime resolver in the functions build (it crashes the Cloud Function on load). Tests + tsc use `@/`.
- Test style: Vitest, `import { describe, it, expect } from "vitest"`, `@`-aliased imports.
- Firestore rejects `undefined` — only attach `citations` to the persisted doc / returned object when non-empty.

---

### Task 1: Thread transaction ids into coach context + prompt

**Files:**
- Modify: `functions/src/coachContext.ts` (CoachTxn type ~line 3-10; txn line render ~line 44; return signature ~line 19)
- Modify: `functions/src/coach.ts` (rawTxns map ~line 84-90; contextTxns ~line 112-115)
- Test: `lib/coach/coachContext.test.ts` (EXISTS — read first; add cases, don't clobber. It imports `buildCoachContext` from `../../functions/src/coachContext`.)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CoachTxn` gains `id: string`. `buildCoachContext(...)` return type becomes `{ prompt: string; bucketIds: string[]; txnIds: string[] }` where `txnIds` are the ids of the transactions rendered into the prompt (in render order).

- [ ] **Step 1: Read the current files**

Read `functions/src/coachContext.ts` fully and `functions/src/coach.ts:84-123`. Confirm `CoachTxn` (coachContext.ts:3-10) has no `id`, the txn line (coachContext.ts:44) renders no id, and `buildCoachContext` returns `{ prompt, bucketIds }` (coachContext.ts:19,75). Read the EXISTING test `lib/coach/coachContext.test.ts` to match its fixture style and import path (`buildCoachContext` from `../../functions/src/coachContext`, `SpendSummary` from `../../functions/src/spendSummary`).

- [ ] **Step 2: Write the failing test**

Add to the existing `lib/coach/coachContext.test.ts` (do not clobber existing cases; add a new `describe`). Use its import convention:

```typescript
import { buildCoachContext, type CoachTxn } from "../../functions/src/coachContext";
import type { SpendSummary } from "../../functions/src/spendSummary";

const citeSummary: SpendSummary = {
  buckets: [{ id: "fun", name: "Fun", allocated: 60000, remaining: 30000, spentThisMonth: 30000, pctUsed: 50, notable: [] }],
  daysLeftInMonth: 10,
};
const citeTxns: CoachTxn[] = [
  { id: "tx_abc", description: "TESCO STORES", amount: -4200, bookedAt: "2026-07-15", bucketId: "fun", isIncome: false, isPreAnchor: false },
];

describe("buildCoachContext citations support", () => {
  it("renders the txn id token in the transaction line and returns txnIds", () => {
    const { prompt, txnIds } = buildCoachContext(citeSummary, [], citeTxns, "2026-07-20");
    expect(prompt).toContain("[tx_abc]");
    expect(prompt).toContain("TESCO STORES");
    expect(txnIds).toEqual(["tx_abc"]);
  });
});
```

(Reuse the file's existing top-of-file vitest import if present; don't duplicate it. Add `type CoachTxn` to the existing `buildCoachContext` import if the file already imports from that module.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run lib/coach/coachContext.test.ts`
Expected: FAIL — `txnIds` is undefined and prompt lacks `[tx_abc]`.

- [ ] **Step 4: Implement**

In `functions/src/coachContext.ts`:
- Add `id: string;` as the first field of the `CoachTxn` interface.
- In the txn line map (the `.map((t) => {...})` around line 39-45), prepend the id token. Change the returned template string to lead with `[${t.id}] `:
  ```typescript
  return `- [${t.id}] ${t.bookedAt} · ${t.description} · ${sign}€${(absAmount / 100).toFixed(2)} · ${bucket}${tag}`;
  ```
- Add a `txnIds` const before the return: `const txnIds = contextTxns.map((t) => t.id);`
- Add a short prompt instruction so the model knows how to cite. Append to the `Response fields:` section of the prompt string (near the `memory` field description), a `citations` line:
  ```
  - `citations`: optional. For each concrete number in your reply that comes from a specific transaction, add { "label": <exact substring of your reply to make tappable>, "txnId": <the [tx_...] id of that transaction> }. Only cite transactions shown above, by their exact id. Omit if no number maps to a specific transaction.
  ```
- Change the return to `return { prompt, bucketIds, txnIds };`.

In `functions/src/coach.ts`:
- In the `rawTxns` map (line 84-90), add `id: d.id,` as the first field.
- `contextTxns` (line 112-115) spreads `...t`, so `id` flows through automatically. Confirm no explicit field list drops it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run lib/coach/coachContext.test.ts`
Expected: PASS. Then `pnpm exec tsc --noEmit` → exit 0 (adding a required `id` to `CoachTxn` will fail-compile any construction site that omits it — coach.ts's `rawTxns`→`contextTxns` is the only one; the test supplies it).

- [ ] **Step 6: Commit**

```bash
git add functions/src/coachContext.ts functions/src/coach.ts lib/coach/coachContext.test.ts
git commit -m "feat(coach): thread transaction ids into context + prompt for citations"
```

---

### Task 2: Add `citations` to CoachReply type + phase-2 schema + server filter

**Files:**
- Modify: `lib/coach/suggestion.ts` (CoachReply type, line 8-12)
- Modify: `functions/src/coach.ts` (parseStructuredReply ~line 16-28; phase-2 schema ~line 184-202; consume `txnIds` from buildCoachContext ~line 123; build + filter citations; return ~line 224)
- Test: `functions/src/coach.test.ts` (exists — read first; add a citations case)

**Interfaces:**
- Consumes: `txnIds` from `buildCoachContext` (Task 1).
- Produces: `CoachReply` gains `citations?: { label: string; txnId: string }[]`. `coachReply` returns validated citations (txnId ∈ known id set) or omits the field when empty.

- [ ] **Step 1: Write the failing test**

Read `functions/src/coach.test.ts` first to match its GoogleGenAI mock + `handleCoachReply` invocation. Add a test:

```typescript
it("returns citations whose txnId is in the shown set, drops unknown ids", async () => {
  // buckets present; transactions query returns one txn with id tx_abc (match the mock's txn shape,
  // ensuring d.id === "tx_abc" — see how the existing mock builds txn docs and give it an id getter/field).
  generateContent
    .mockResolvedValueOnce({ functionCalls: undefined, candidates: [{ content: { role: "model", parts: [{ text: "" }] } }] })
    .mockResolvedValueOnce({ text: JSON.stringify({
      reply: "You spent €42 at Tesco.",
      citations: [
        { label: "€42 at Tesco", txnId: "tx_abc" },
        { label: "ghost", txnId: "tx_does_not_exist" },
      ],
    }) });

  const result = (await callHandler({ message: "how much at tesco?", history: [] })) as { citations?: { label: string; txnId: string }[] };
  expect(result.citations).toEqual([{ label: "€42 at Tesco", txnId: "tx_abc" }]);
});
```

> Adapt `callHandler` and the txn-doc mock to the existing test file's structure. The existing transactions mock returns `[]`; give the transactions query a doc with `id: "tx_abc"` and the getters the code reads (`description`, `amount`, `bookedAt`, `bucketId`, `isIncome`). If the mock returns the same set for both the month query and the 90-day tool query, that's fine here.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run functions/src/coach.test.ts`
Expected: FAIL — citations undefined (not yet in schema/parse/return).

- [ ] **Step 3: Implement**

In `lib/coach/suggestion.ts`, extend the type:

```typescript
export type CoachReply = {
  reply: string;
  suggestion?: CoachSuggestion;
  memory?: string;
  citations?: { label: string; txnId: string }[];
};
```

In `functions/src/coach.ts`:
- `parseStructuredReply` — carry citations through defensively:
  ```typescript
  const o = JSON.parse(text) as Partial<CoachReply>;
  return {
    reply: typeof o.reply === "string" ? o.reply : "",
    suggestion: o.suggestion,
    memory: typeof o.memory === "string" ? o.memory : undefined,
    citations: Array.isArray(o.citations) ? o.citations : undefined,
  };
  ```
- Destructure `txnIds` from buildCoachContext: `const { prompt, bucketIds, txnIds } = buildCoachContext(...)`.
- Add `citations` to the phase-2 `responseSchema.properties` (sibling of `memory`):
  ```typescript
  citations: {
    type: Type.ARRAY,
    nullable: true,
    items: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        txnId: { type: Type.STRING, enum: txnIds },
      },
      required: ["label", "txnId"],
    },
  },
  ```
  (If `txnIds` is empty, an enum of `[]` forbids all values — acceptable, the model simply can't cite. Guard is unnecessary; Gemini accepts an empty enum by producing no citations.)
- After `parseStructuredReply`, build the validated citation list:
  ```typescript
  const txnIdSet = new Set(txnIds);
  const citations = (parsed.citations ?? [])
    .filter((c) => c && typeof c.label === "string" && typeof c.txnId === "string" && txnIdSet.has(c.txnId))
    .map((c) => ({ label: c.label, txnId: c.txnId }));
  ```
- In the return object (near line 224), add citations only when non-empty:
  ```typescript
  return {
    reply: parsed.reply,
    ...(validSuggestion ? { suggestion: validSuggestion } : {}),
    ...(memory ? { memory } : {}),
    ...(citations.length ? { citations } : {}),
  };
  ```
- Update `logEvent(... outcome:"ok" ...)` to include `hasCitations: citations.length > 0` (match the existing hasSuggestion/hasMemory style).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run functions/src/coach.test.ts`
Expected: PASS. Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/coach/suggestion.ts functions/src/coach.ts
git commit -m "feat(coach): return validated citations from coachReply"
```

---

### Task 3: Carry citations through useCoach (persist + read model)

**Files:**
- Modify: `lib/coach/useCoach.ts` (CoachMessage interface ~line 12-19; onSnapshot map ~line 95-106; coachDoc write ~line 143-153)
- Test: `lib/coach/useCoach.test.tsx` (exists — read first; assert citations persisted + read)

**Interfaces:**
- Consumes: `CoachReply.citations` (Task 2).
- Produces: `CoachMessage` gains `citations?: { label: string; txnId: string }[]`.

- [ ] **Step 1: Write the failing test**

Read `lib/coach/useCoach.test.tsx` first. Add a test in the "useCoach send" describe block that a reply carrying citations writes them onto the coach doc:

```typescript
it("persists citations when the reply carries them", async () => {
  callableFn.mockImplementation(async () => ({
    data: { reply: "You spent €42 at Tesco.", citations: [{ label: "€42 at Tesco", txnId: "tx_abc" }] },
  }));

  function StreamProbe() {
    const hook = useCoach();
    return <button data-testid="send" onClick={() => hook.send("hi")} />;
  }
  render(<StreamProbe />);
  screen.getByTestId("send").click();

  await waitFor(() => {
    const coachCall = addDocFn.mock.calls.find((c) => c[1]?.role === "coach");
    expect(coachCall?.[1]?.citations).toEqual([{ label: "€42 at Tesco", txnId: "tx_abc" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/coach/useCoach.test.tsx`
Expected: FAIL — coachDoc has no citations field.

- [ ] **Step 3: Implement**

In `lib/coach/useCoach.ts`:
- `CoachMessage` interface: add `citations?: { label: string; txnId: string }[];`.
- In the `send` coachDoc build (line 143-153), after the suggestion block, attach citations only when present (Firestore rejects undefined):
  ```typescript
  if (Array.isArray(data.citations) && data.citations.length > 0) {
    coachDoc.citations = data.citations;
  }
  ```
- In the onSnapshot map (line 98-105), read them back:
  ```typescript
  citations: data.citations as CoachMessage["citations"] | undefined,
  ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/coach/useCoach.test.tsx`
Expected: PASS (new test + existing ones). Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/coach/useCoach.ts lib/coach/useCoach.test.tsx
git commit -m "feat(coach): carry citations through useCoach persist + read"
```

---

### Task 4: Render citation chips in MessageBubble

**Files:**
- Modify: `components/coach/MessageBubble.tsx` (props + text render)
- Modify: `app/(app)/coach/page.tsx` (pass `msg.citations` at the MessageBubble call site)
- Test: `components/coach/MessageBubble.test.tsx` (create)

**Interfaces:**
- Consumes: `CoachMessage.citations` (Task 3).
- Produces: `MessageBubble` gains optional `citations?: { label: string; txnId: string }[]` prop.

Rendering rule: if `citations` is present and non-empty and `role === "coach"`, split `text` into segments by locating each citation's `label` (first exact-substring match, left to right, non-overlapping); render matched segments as `<Link href={`/dashboard/tx/${txnId}`}>` styled as a green chip, plain text otherwise. A label not found in the text is silently skipped. User bubbles and citation-less coach bubbles render exactly as today (plain `{text}`).

- [ ] **Step 1: Write the failing test**

Create `components/coach/MessageBubble.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/coach/MessageBubble";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe("MessageBubble citations", () => {
  it("renders a cited label as a link to the transaction, rest as text", () => {
    render(
      <MessageBubble
        role="coach"
        text="You spent €42 at Tesco this week."
        citations={[{ label: "€42 at Tesco", txnId: "tx_abc" }]}
      />
    );
    const link = screen.getByRole("link", { name: "€42 at Tesco" });
    expect(link).toHaveAttribute("href", "/dashboard/tx/tx_abc");
    expect(screen.getByText(/this week\./)).toBeInTheDocument();
  });

  it("renders plain text when a label is not found in the reply", () => {
    render(
      <MessageBubble role="coach" text="No numbers here." citations={[{ label: "€99", txnId: "tx_x" }]} />
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("No numbers here.")).toBeInTheDocument();
  });

  it("renders plain text for a coach message with no citations", () => {
    render(<MessageBubble role="coach" text="Just advice." />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Just advice.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run components/coach/MessageBubble.test.tsx`
Expected: FAIL — MessageBubble has no `citations` prop; no link rendered.

- [ ] **Step 3: Implement**

In `components/coach/MessageBubble.tsx`:
- Add `import Link from "next/link";` at the top.
- Extend props: `citations?: { label: string; txnId: string }[];`.
- Add a pure helper above the component that turns text + citations into an array of React nodes:

```typescript
function renderWithCitations(text: string, citations?: { label: string; txnId: string }[]): React.ReactNode {
  if (!citations || citations.length === 0) return text;
  // Find the first non-overlapping match for each label, left to right.
  type Hit = { start: number; end: number; txnId: string; label: string };
  const hits: Hit[] = [];
  for (const c of citations) {
    if (!c.label) continue;
    const start = text.indexOf(c.label);
    if (start === -1) continue; // label not in reply → skip (no chip)
    hits.push({ start, end: start + c.label.length, txnId: c.txnId, label: c.label });
  }
  hits.sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue; // overlaps a prior chip → skip
    if (h.start > cursor) nodes.push(text.slice(cursor, h.start));
    nodes.push(
      <Link
        key={`${h.txnId}-${h.start}`}
        href={`/dashboard/tx/${h.txnId}`}
        style={{
          color: "var(--color-success)",
          background: "rgba(20,241,149,0.14)",
          border: "1px solid rgba(20,241,149,0.4)",
          borderRadius: "6px",
          padding: "0 0.3rem",
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {h.label}
      </Link>
    );
    cursor = h.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
```

- In the JSX, replace `<div style={bubbleStyle}>{text}</div>` with:
  ```typescript
  <div style={bubbleStyle}>{isUser ? text : renderWithCitations(text, citations)}</div>
  ```

In `app/(app)/coach/page.tsx`, at the `<MessageBubble role={msg.role} text={msg.text} />` call site (around line 197), add the prop: `citations={msg.citations}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run components/coach/MessageBubble.test.tsx`
Expected: PASS (3 tests). Then `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/coach/MessageBubble.tsx "app/(app)/coach/page.tsx" components/coach/MessageBubble.test.tsx
git commit -m "feat(coach): render citation chips linking to transaction detail"
```

---

### Task 5: Full suite + emulator verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `pnpm exec vitest run`
Expected: all pass (prior 170 + new tool/context/bubble tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Rebuild functions + confirm the callable loads**

Run: `pnpm --dir functions run build`, then confirm the functions emulator (if running) reloads `coachReply` without a module-load error. (The relative-import constraint means no `@/` regressions; if the emulator log shows "Cannot find module", a functions→lib import used `@/` — fix to relative.)

- [ ] **Step 4: Drive the callable in the emulator**

With the emulator running and a seeded premium user + at least one transaction (e.g. TESCO −€42 with a known doc id), invoke `coachReply` (via the callable HTTP endpoint `http://127.0.0.1:5001/<project>/us-central1/coachReply` with a Firebase ID token) asking "how much did I spend at Tesco?". Expected: the JSON result includes `citations: [{ label: <substring of reply>, txnId: <the real doc id> }]`, and the label is a substring of `reply`. Confirm a question with no transaction-specific number returns no `citations` field.

- [ ] **Step 5: No commit** (verification; code committed in Tasks 1-4).

---

## Notes for the implementer

- `pnpm exec vitest run <path>` runs one file; `pnpm exec vitest run` runs all. Root `vitest.config.ts` aliases `@` → repo root and covers `functions/src`.
- The functions emulator runs compiled `functions/lib/` — `pnpm --dir functions run build` before expecting `coach.ts` changes to take effect. Functions→lib imports MUST be relative (`../../lib/...`), never `@/` (no runtime resolver — crashes the function on load).
- Do not touch the money/apply path, `lib/coach/suggestion.ts`'s `CoachSuggestion`/`validateSuggestion`, the two-phase tool loop, or the conversations feature. Citations are additive.
- The tx detail route `app/(app)/dashboard/tx/[id]/page.tsx` finds by `t.id === params.id` against `useTransactions` (collection `users/{uid}/transactions`) — the same collection the coach cites from, so cited ids resolve.
