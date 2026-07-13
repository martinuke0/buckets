# Observability & Problem Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diagnose each user's problem flow. Cloud Functions emit structured logs ({uid, action, outcome, error}) searchable in Cloud Logging; the client keeps a breadcrumb trail of recent user actions and, when something fails, shows a "Report a problem" affordance that writes the failed action + error + breadcrumbs + context to Firestore for support review.

**Architecture:** Two lightweight layers. **Server:** a `logEvent` helper over `firebase-functions/logger` that every callable calls at start/success/error with structured fields — no new dependency, shows up per-uid in Cloud Logging. **Client:** an in-memory breadcrumb ring buffer (`logAction`) that records the sequence of user actions/requests, plus `reportProblem(uid, {...})` that persists a report doc (breadcrumbs + error + app/context) to `users/{uid}/problemReports/{id}` (existing per-user Firestore rules already permit the client to write there; admin SDK / console reads them). A `ReportProblem` UI replaces raw console errors on failed bank/Coach actions with a real "Report a problem" button.

**Tech Stack:** `firebase-functions/logger` (server), Firestore (reports), Next.js 16 client, Vitest.

## Global Constraints

- **No secrets/PII in logs:** never log the Gemini/Stripe/Plaid keys, Plaid access tokens, or full transaction descriptions containing sensitive data. Log uid, action name, outcome, error code/message, and coarse counts only.
- **Breadcrumbs are in-memory + capped** (ring buffer, e.g. last 30) — no unbounded growth, cleared on reload. They travel to Firestore only when the user submits a report.
- **Reports are per-user + rule-covered:** write to `users/{uid}/problemReports/{id}`; the existing `match /users/{uid}/{sub=**}` rule already allows the owner to write. No rules change needed (verify).
- **Money integer cents** unchanged; this is diagnostics only, no business-logic change.
- **Reuse:** existing hooks/components; `friendlyBankError` for user-facing text stays (the report captures the RAW error for diagnosis while the UI shows friendly text). No `any`, dark tokens, no emoji, "use client" only where needed.

---

## Scope

**IN:** server `logEvent` + instrument the 5 callables (createLinkToken, exchangePublicToken, syncTransactions, coachReply, applyCoachSuggestion); client breadcrumb buffer (`logAction`) + `reportProblem` writer; a `ReportProblem` button/dialog surfaced on failed bank/Coach actions (replacing raw console errors) and in Settings; wire breadcrumbs at key client actions (connect bank, sync, send coach message, apply suggestion, save buckets, simulate income).

**DEFERRED (documented, NOT built):**
- A support dashboard to browse reports (read via Firebase console for now).
- Third-party error tracking (Sentry) — the structured logs + reports cover MVP.
- Automatic (non-user-initiated) crash reporting / global error boundary telemetry.
- Log-based alerting.

---

## File Structure

- `lib/observability/breadcrumbs.ts` — pure ring buffer: `logAction(action, meta?)`, `getBreadcrumbs()`, `clearBreadcrumbs()`. Testable.
- `lib/observability/reportProblem.ts` — `reportProblem(uid, { summary, error?, note? })` → writes `users/{uid}/problemReports/{id}` with breadcrumbs + timestamp + coarse app context.
- `functions/src/logging.ts` — `logEvent(action, fields)` over `firebase-functions/logger`; wrap callables.
- `components/observability/ReportProblem.tsx` — the button + small dialog (optional note) that calls `reportProblem`.
- `lib/observability/breadcrumbs.test.ts`, `components/observability/ReportProblem.test.tsx`.

---

## Task 1: Breadcrumb ring buffer (pure)

**Files:**
- Create: `lib/observability/breadcrumbs.ts`
- Test: `lib/observability/breadcrumbs.test.ts`

**Interfaces:**
- `type Breadcrumb = { action: string; at: string; meta?: Record<string, string | number | boolean> }`
- `logAction(action: string, meta?: Breadcrumb["meta"]): void` — pushes to a module-level array capped at `MAX = 30` (drops oldest). Timestamp via `new Date().toISOString()`.
- `getBreadcrumbs(): Breadcrumb[]` — returns a copy (newest last).
- `clearBreadcrumbs(): void`.

- [ ] **Step 1: Write the failing test**

`lib/observability/breadcrumbs.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { logAction, getBreadcrumbs, clearBreadcrumbs } from "@/lib/observability/breadcrumbs";

describe("breadcrumbs", () => {
  beforeEach(() => clearBreadcrumbs());
  it("records actions in order with metadata", () => {
    logAction("connect_bank");
    logAction("sync", { added: 3 });
    const bc = getBreadcrumbs();
    expect(bc.map((b) => b.action)).toEqual(["connect_bank", "sync"]);
    expect(bc[1].meta).toEqual({ added: 3 });
    expect(typeof bc[0].at).toBe("string");
  });
  it("caps at 30, dropping the oldest", () => {
    for (let i = 0; i < 35; i++) logAction(`a${i}`);
    const bc = getBreadcrumbs();
    expect(bc.length).toBe(30);
    expect(bc[0].action).toBe("a5");        // oldest 5 dropped
    expect(bc[29].action).toBe("a34");
  });
  it("getBreadcrumbs returns a copy (caller can't mutate internal state)", () => {
    logAction("x");
    getBreadcrumbs().push({ action: "y", at: "now" });
    expect(getBreadcrumbs().map((b) => b.action)).toEqual(["x"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm test lib/observability/breadcrumbs.test.ts` → FAIL.
- [ ] **Step 3: Implement `breadcrumbs.ts`** — module-level array, cap 30, `getBreadcrumbs` returns a slice/copy.
- [ ] **Step 4: Run test to verify it passes** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: client breadcrumb ring buffer"`

---

## Task 2: reportProblem writer

**Files:**
- Create: `lib/observability/reportProblem.ts`
- Test: `lib/observability/reportProblem.test.ts`

**Interfaces:**
- Consumes: `getDb` (`@/lib/firebase/client`), `getBreadcrumbs`.
- Produces: `reportProblem(uid: string, input: { summary: string; error?: string; note?: string }): Promise<void>` — writes a new doc under `users/{uid}/problemReports` (collection + auto id) `{ summary, error?, note?, breadcrumbs: getBreadcrumbs(), createdAt: ISO, path: location.pathname, userAgent: navigator.userAgent }`. No secrets/PII beyond what breadcrumbs already hold.

- [ ] **Step 1: Write the failing test**

`lib/observability/reportProblem.test.ts` — mock `firebase/firestore` (`collection`, `addDoc`) + `@/lib/firebase/client` (`getDb`) with stable module-level mocks; mock `@/lib/observability/breadcrumbs` `getBreadcrumbs` to return a fixed array. Assert `addDoc` called with an object containing `summary`, `breadcrumbs`, `createdAt`. Example:
```ts
import { describe, it, expect, vi } from "vitest";
const addDoc = vi.fn().mockResolvedValue({ id: "r1" });
vi.mock("firebase/firestore", () => ({ collection: () => ({}), addDoc }));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/observability/breadcrumbs", () => ({ getBreadcrumbs: () => [{ action: "sync", at: "t" }] }));
import { reportProblem } from "@/lib/observability/reportProblem";
it("writes a problem report with breadcrumbs", async () => {
  await reportProblem("u1", { summary: "sync failed", error: "internal" });
  expect(addDoc).toHaveBeenCalled();
  const doc = addDoc.mock.calls[0][1];
  expect(doc.summary).toBe("sync failed");
  expect(doc.error).toBe("internal");
  expect(doc.breadcrumbs).toEqual([{ action: "sync", at: "t" }]);
  expect(typeof doc.createdAt).toBe("string");
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.
- [ ] **Step 3: Implement `reportProblem.ts`** — build the doc, `addDoc(collection(getDb(), \`users/${uid}/problemReports\`), doc)`. Guard `location`/`navigator` for non-browser (use `typeof window !== "undefined"` fallbacks).
- [ ] **Step 4: Run test to verify it passes** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: reportProblem writer (per-user problemReports)"`

---

## Task 3: Server structured logging + instrument callables

**Files:**
- Create: `functions/src/logging.ts`
- Modify: `functions/src/bank.ts`, `functions/src/coach.ts` (the 5 callables)
- Test: functions tsc (logging is glue over firebase-functions/logger; verified in emulator).

**Interfaces:**
- `logEvent(action: string, fields: { uid?: string; outcome: "start" | "ok" | "error"; error?: unknown; [k: string]: unknown }): void` — calls `logger.info`/`logger.error` (error outcome → error level) with a structured payload `{ action, ...fields, error: normalizeError(error) }`. `normalizeError` extracts `{ message, code }` only — NEVER logs secrets/tokens.
- Instrument each callable: `logEvent(action, { uid, outcome: "start" })` after auth-gate; `"ok"` before returning (with a coarse count where relevant, e.g. `{ added }`); on catch, `"error"` with the error, then rethrow the HttpsError.

- [ ] **Step 1: Implement `functions/src/logging.ts`** — import `{ logger } from "firebase-functions/v2"` (or `firebase-functions/logger`), `normalizeError`, `logEvent`. No `any` (use `unknown` for error).
- [ ] **Step 2: Instrument the 5 callables** — createLinkToken, exchangePublicToken, syncTransactions (bank.ts); coachReply, applyCoachSuggestion (coach.ts). start/ok/error with uid + action; coarse metadata only; NO secrets. For syncTransactions also log `{ added }` on ok; for coachReply log whether a suggestion was returned/dropped (boolean), not its contents.
- [ ] **Step 3: Typecheck** — `cd functions && pnpm exec tsc --noEmit` clean; root `pnpm exec tsc --noEmit` clean.
- [ ] **Step 4: Commit** — `git commit -m "feat: structured server logging on callables (firebase logger)"`

---

## Task 4: ReportProblem UI + wire breadcrumbs into client actions

**Files:**
- Create: `components/observability/ReportProblem.tsx`
- Test: `components/observability/ReportProblem.test.tsx`
- Modify: `lib/bank/useBankConnection.ts`, `lib/bank/useBankSync.ts`, `lib/coach/useCoach.ts` (log breadcrumbs at actions; expose a way to trigger the report on error), and surface `<ReportProblem>` where those errors show (Settings connect area, dashboard Refresh, Coach). Also breadcrumb `save buckets` + `simulate income`.

**Interfaces:**
- `<ReportProblem summary error? />` — a small "Report a problem" button; on click opens a dialog with an optional note textarea + Submit; Submit calls `reportProblem(uid, { summary, error, note })` (uid from `useAuth`) and shows a "Thanks — reported" confirmation. Dark tokens, no emoji, no `any`.
- Client actions call `logAction("connect_bank")`, `logAction("sync", { added })`, `logAction("coach_send")`, `logAction("apply_suggestion")`, `logAction("save_buckets")`, `logAction("simulate_income", { amount })` at their call sites.
- On a failed bank/Coach action, the existing friendly error text is shown ALONGSIDE a `<ReportProblem>` (summary = the action, error = the raw error message) — replacing the bare console error as the user-facing path.

- [ ] **Step 1: Write the failing test**

`components/observability/ReportProblem.test.tsx` — mock `@/lib/observability/reportProblem` (`reportProblem` = vi.fn) + `useAuth` (stable module-level object). Assert: clicking "Report a problem" opens the dialog; Submit calls `reportProblem` with the summary/error; a confirmation renders. (Stable mocks — OOM guard.)
```tsx
// clicking Report a problem → dialog; type note → Submit → reportProblem called with {summary, error, note}; "reported" confirmation shows.
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.
- [ ] **Step 3: Implement `ReportProblem.tsx`** — button + dialog + submit + confirmation; typed; tokens; no emoji.
- [ ] **Step 4: Wire breadcrumbs + surface the button** — add `logAction(...)` at the listed client action sites; render `<ReportProblem>` next to the friendly error in Settings connect, dashboard Refresh, and Coach. Keep `friendlyBankError` for the user-facing text.
- [ ] **Step 5: Run tests + full suite + typecheck** — `pnpm test && pnpm exec tsc --noEmit` → all PASS, clean.
- [ ] **Step 6: Commit** — `git commit -m "feat: Report a problem UI + action breadcrumbs"`

---

## Self-Review

- **Goal coverage:** server per-uid structured logs (Task 3) + client breadcrumb flow (Task 1) + persisted problem reports (Task 2) + user-facing "Report a problem" replacing console errors (Task 4). Diagnoses "each user's problem flow and requests/actions."
- **Privacy:** no secrets/tokens/PII in logs or reports (Global Constraints; `normalizeError` strips to message/code; breadcrumbs are action names + coarse meta).
- **Rules:** reports under `users/{uid}/problemReports` — covered by existing per-user rule (verify in Task 2; no rules change expected).
- **Maintainability:** pure breadcrumb buffer (tested); single `reportProblem` + single `logEvent`; reuse `friendlyBankError`; no `any`; tokens; OOM-safe stable mocks.
- **Placeholders:** Tasks 1,2,4 carry test code; Task 3 is logger glue (emulator/console-verified) with exact instrumentation contract.

## Verification (whole plan)

1. `pnpm test && pnpm exec tsc --noEmit` — breadcrumb, reportProblem, ReportProblem tests pass; no type errors.
2. `cd functions && pnpm exec tsc --noEmit` — clean.
3. **Emulator (once Java installed):** trigger a bank sync in dev → the callable logs `{action:"syncTransactions", uid, outcome}` in the emulator Functions log; force an error → `outcome:"error"` with a normalized (secret-free) error.
4. **Client report:** cause a failed action → friendly error + "Report a problem" shows → submit with a note → a doc appears under `users/{uid}/problemReports` containing the breadcrumb trail (the actions leading up to it), the raw error, note, path, and timestamp.
5. **Privacy check:** grep the logged/reported payloads — no Gemini/Stripe/Plaid keys, no access tokens.
