# MyBuckets — Senior Owner's Ramp-Up Brief

> Written for a new lead engineer taking ownership. Reads top-to-bottom in ~15 min.
> Filepath references use `path:line` so you can jump straight to the code.

---

## 1. What we're building

**MyBuckets** is an EU-first personal-finance PWA that:

1. Connects a user's bank via **Plaid** (`functions/src/bank.ts:37`).
2. **Auto-splits** every incoming paycheck across envelope-style **buckets** using deterministic percentages (`lib/split/engine.ts:38`).
3. Draws every **spend** down from the correct bucket — cheap deterministic rules first, Gemini bulk categorization for misses (`functions/src/syncCore.ts:56`).
4. Shows a live **"Safe to spend"** number = `Σ bucket.remaining` (`app/(app)/dashboard/page.tsx:50`).
5. Offers an AI **Coach** (streaming Gemini) that reads current state and proposes one-tap **rebalances** between buckets (`functions/src/coach.ts:24`).

Design north stars — all real:
- **Real money, real numbers.** Integer cents everywhere, deterministic math, idempotent writes. AI never moves money without a validated apply-time re-check.
- **Confirm-first for income.** New paychecks land as `pendingIncome` — the user confirms the split, we don't silently deploy their salary.
- **Safe by default.** `bankConnections/**` is deny-all to clients (holds Plaid access tokens); premium flag is server-authoritative and locked at the Firestore rule (`firestore.rules:11`).

---

## 2. Stack in 30 seconds

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 16.2** (App Router) + **React 19** + Tailwind 4 | PWA-installable, EU hostable, one language front-to-back |
| Auth / DB | **Firebase Auth + Firestore** (EU region) | Cheap, per-user isolation trivial via `users/{uid}/…`, real-time listeners for free |
| Backend | **Firebase Cloud Functions v2** (`nodejs20`) — `functions/` | Callable + scheduled, admin SDK bypasses rules for server-authoritative writes |
| Bank data | **Plaid** wrapped behind a `BankProvider` interface (`lib/bank/provider.ts`, adapter at `lib/bank/plaidAdapter.ts`) | Interface exists so we can swap in TrueLayer / GoCardless later without touching sync logic |
| AI | **Gemini 2.5 Flash** (`@google/genai`) — one model, two jobs: batch tx categorization + coach chat | No agent frameworks. Deterministic math > LLM math. |
| Payments | **Stripe** subscription; webhook flips `users/{uid}.premium` | Client can never self-grant premium (see rules) |
| Tests | **Vitest** + Testing Library, jsdom | See `vitest.config.ts`, tons of `*.test.ts(x)` colocated with source |

Package manager is **pnpm** with a workspace (`pnpm-workspace.yaml`). Functions is its own package under `functions/`.

> ⚠️ `CLAUDE.md` / `AGENTS.md` warn: **this is Next 16 — not the Next.js in your training data.** Read `node_modules/next/dist/docs/` for anything App-Router-shaped before writing.

---

## 3. Directory map (only what matters)

```
app/                    Next.js App Router
├── (app)/              Authed shell (redirects to /sign-in if signed out)
│   ├── dashboard/      Hero "Safe to spend", bucket cards, tx list, Refresh
│   ├── buckets/        Bucket setup + per-bucket detail
│   ├── coach/          Streaming chat + suggestion cards
│   ├── settings/       Bank connect, premium, memories
│   └── layout.tsx      Auth gate + AppShell + BottomTabBar
├── (auth)/sign-in/     Firebase auth UI
├── api/billing/        Stripe checkout + webhook route handlers
└── layout.tsx          Root: fonts + <AuthProvider>

components/             Presentational only, no data fetching
├── buckets/  coach/  tx/  nav/  billing/  ui/  observability/

lib/                    ⭐ Shared logic — SINGLE SOURCE OF TRUTH
├── model/              Types (Bucket, Transaction, Cents), Firestore path helpers
├── split/engine.ts     ⭐ Pure deterministic income splitter (largest-remainder)
├── categorize/         normalizeMerchant + chooseBucket rules + Gemini batch parser
├── buckets/edit.ts     Pure functions: add/delete/setPercent/resplitAdjacent
├── data/               Firestore reads/writes + React hooks (useBuckets, usePendingIncome…)
├── bank/               Plaid adapter, provider interface, useBankSync hook
├── coach/              parseReply (---META--- contract), suggestion validator, useCoach
├── auth/               AuthProvider + useAuth
├── firebase/client.ts  App/Auth/Firestore singletons + emulator wiring
├── billing/            Stripe checkout + usePremium hook
└── observability/      Breadcrumbs + Report-a-problem

functions/src/          Cloud Functions (admin SDK, bypasses Firestore rules)
├── index.ts            Barrel — registers callables/scheduled
├── bank.ts             createLinkToken · exchangePublicToken · syncTransactions · scheduledSync
├── syncCore.ts         The sync pipeline: fetch → write → categorize → apply
├── store.ts            ⭐ All Firestore writes lives here (transactions, anchor, income, rebalance)
├── coach.ts            coachReply (streaming) + applyCoachSuggestion (validated write)
├── coachContext.ts     Prompt template + ---META--- contract
├── spendSummary.ts     Reduces txns → per-bucket month summary
├── categorizer.ts      Gemini bulk-categorize call (best-effort, degrades to null)
└── defaultBuckets.ts   Server-side copy of DEFAULT_BUCKETS (parity-tested)

docs/superpowers/       Design specs & implementation plans (dated)
├── specs/              What we're building & why (design docs)
└── plans/              How we built each subsystem, task-by-task
```

**Rule of thumb:** if logic runs in *both* client and Cloud Functions (splitting, categorization keys, merchant normalization, suggestion validation) it lives in `lib/` and is imported by both sides. Do not copy — that's spelled out in the maintainability memory.

---

## 4. The 8 core concepts (the mental model)

### C1. Buckets are percentage-partitioned envelopes

A user has 1–15 buckets (`bucketCapFor` in `lib/buckets/edit.ts:3` — 5 free, 15 premium). Each has:
- `percent` (0–100; **all buckets sum to 100** — invariant enforced everywhere)
- `remaining` (Cents, integer, mutable)
- `allocated` (Cents, integer, cumulative — sum ever put in)
- `type`: `"virtual"` today, `"onchain"` reserved for the future Solana savings bucket.

Everything downstream assumes `Σ percent == 100 ± 0.001`. Violations are surfaced as `SplitError` and cause writes to abort.

### C2. Money is always integer cents

`type Cents = number` (`lib/model/money.ts:1`). We never store fractional cents. The split engine uses **largest-remainder** so `Σ allocations == income` exactly (`lib/split/engine.ts:38`). Formatting to `€X.XX` is display-only via `formatEuros`.

### C3. Two write paths: client (rules-gated) vs admin (rules-bypass)

Firestore is the source of truth. Two ways in:
- **Client SDK** (`lib/data/*`) — subject to `firestore.rules`. Users can write their own `users/{uid}/…` docs *except* `premium`.
- **Admin SDK** in Cloud Functions (`functions/src/store.ts`) — bypasses rules. Used for anything server-authoritative: writing transactions from Plaid, splitting confirmed income, anchoring buckets, applying coach rebalances, flipping `premium`.

`bankConnections/**` has **no rule match block** on purpose — clients cannot read/write Plaid access tokens. Only the admin SDK touches them.

### C4. Idempotency via **marker documents**

Every money-moving Cloud-Function write is idempotent. The pattern:

```
users/{uid}/incomeSplits/{incomeTxId}    marker created when split → skip if exists
users/{uid}/coachActions/{suggestionId}  marker created when rebalance → skip if exists
users/{uid}/transactions/{providerTxnId} `categorizedAt` set → skip if bucket unchanged
```

See `applyIncomeAdmin` (`functions/src/store.ts:116`), `applyRebalance` (`store.ts:256`), `applySpendCategorization` (`store.ts:213`). All wrapped in `runTransaction` with **reads before writes** and **re-validation inside the tx** — the classic "check-then-act" trap is closed.

### C5. Anchoring: `Σ remaining == real balance`

The Plaid balance is truth. On **first connect** we:

1. Write historical txns (`recordOnly: true` — no drawdown, no income prompts). See `syncCore.ts:103`.
2. Call `anchorBucketsToBalance` (`store.ts:358`): **REPLACE** each bucket's `remaining` with `balance × percent` (via `splitIncome`) so the sum equals the true balance to the cent.
3. Write `users/{uid}/meta/bank.anchoredAt` — the anchor marker.

After that, drift can happen (rounding, out-of-band tx, missed sync). The dashboard shows a **"Re-sync buckets to balance"** button (`dashboard/page.tsx:74`) when `|balance - Σremaining| > 1 cent`. That re-anchors — but the client version reads buckets **inside the transaction** to force contention retries against concurrent spends (`lib/data/buckets.ts:147`). Skipping that would let a stale partition commit.

The `isPreAnchor` flag on transactions (`coachContext.ts:9`) tells the Coach: "these are historical, they don't draw current buckets — informational only for advice."

### C6. Income is confirm-first (never auto-split from the bank)

When Plaid delivers an income tx during sync, we do **not** call the split engine automatically. Instead we write a `pendingIncome` doc (`store.ts:321`) and surface it as a `PendingIncomePrompt` on the dashboard. The user picks "split by my percentages" or edits, then `confirmPendingIncome` runs in a transaction (`lib/data/buckets.ts:129`).

There's a subtle rule at `store.ts:328`: re-syncing an already-resolved pending income must NOT flip `resolved: false`. The transaction reads first and only sets `resolved:false` when creating a new document — merges preserve prior state.

Manual "Simulate income" (`SimulateIncomeDialog.tsx`) does split immediately via `applyIncome` (client, `lib/data/buckets.ts:34`) — this is for testing and demo, real bank income always goes pending.

### C7. Categorization: cheap rules → bulk AI

Every spend passes through `chooseBucket` (`lib/categorize/rules.ts:12`):

1. `normalizeMerchant(description)` strips digits, processor suffixes (`*` / `#`), lowercases.
2. Look up in per-user `categoryRules/{uid}/rules/{merchant}` — an exact-match learned rule.
3. Hit → done, deterministic and free.
4. Miss → collect the batch, send **one** Gemini call with a structured-JSON schema (`functions/src/categorizer.ts:13`).

The Gemini call is **best-effort**: rate-limit hit, malformed JSON, length mismatch → falls back to all-null (uncategorized). It never blocks the sync. Failures per-txn during apply are logged and continue — one bad apply must not roll back income splitting.

When a user re-categorizes a tx in the UI (`lib/data/recategorize.ts`), we save the merchant→bucket mapping into `categoryRules` so the next sync places it deterministically. That's why the same feature ships correctness (right bucket) and cost reduction (fewer AI calls) at once.

### C8. Coach: streaming text + `---META---` structured footer

The Coach is a Gemini streaming call (`functions/src/coach.ts:93`). The prompt template (`coachContext.ts:48`) tells the model:

> Reply as plain conversational text. If (and only if) you have a rebalance suggestion or a durable goal to remember, append `\n---META---\n` then a JSON object with `suggestion` and/or `memory` keys.

Client streams the text chunk-by-chunk into the UI. When the stream ends, both server and client parse the delimiter with `parseCoachReplyStream` (`lib/coach/parseReply.ts:6`) — same pure function, imported by both sides. Any parse failure degrades to "reply only" — never crashes.

Suggestions get validated **twice**:
- Server-side inside `coachReply` against real bucket IDs and balances (`coach.ts:114`) — invalid suggestions are dropped before saving to Firestore.
- Again at apply-time in `applyRebalance` (`store.ts:256`) — the tx re-reads bucket state and refuses if funds moved in between.

"Memories" (`coach.ts:134`) are 280-char first-person notes the model captures from user goals ("I want to save for a trip"). Stored at `users/{uid}/coachMemories/*`, re-injected into every future prompt as durable context. Deduped and length-capped so token cost is bounded.

---

## 5. Hero data flow — end-to-end

```
1. User signs in                    → app/(auth)/sign-in            → Firebase Auth
2. Connect bank (Settings)          → createLinkToken (Callable)    → Plaid Link opens
3. Public token from Plaid Link     → exchangePublicToken           →
                                        saveConnection (bankConnections/{uid}/items)
                                        setBankMeta{connectedAt}
                                        seedDefaultBucketsIfEmpty
                                        getBalance → setBankMeta{currentBalance}
                                        syncOneUser({recordOnly:true})   ← historical catchup
                                        anchorBucketsToBalance({onlyIfFirstConnect:true})
4. Dashboard renders                → useBuckets (onSnapshot)       → live bucket cards
                                       useTransactions              → tx list
                                       usePendingIncome             → any unconfirmed paycheck
5. User taps Refresh                → syncTransactions (Callable)   →
                                        Plaid transactions/sync (cursor pagination)
                                        writeTransactions (dedup by providerTxnId)
                                        for income → writePendingIncome (confirm-first)
                                        for spends → chooseBucket → bulk Gemini → applySpendCategorization
                                        setBankMeta{lastSyncedAt, currentBalance}
6. User confirms pending income     → confirmPendingIncome (client tx) →
                                        splitIncome() → increment each bucket, mark resolved
7. User chats coach                 → coachReply (streaming Callable) →
                                        buildSpendSummary + buildCoachContext + memories
                                        Gemini stream → chunks + final ---META--- parse
                                        validate suggestion vs bucket IDs
                                        client renders MessageBubble + SuggestionCard
8. User taps "Apply" on suggestion  → applyCoachSuggestion (Callable) →
                                        applyRebalance (tx: idempotent marker,
                                        re-validate remaining, move funds)
9. Every 3h (scheduled)             → scheduledSync → syncOneUser(uid) per connected user
```

---

## 6. Firestore schema (all money in cents)

```
users/{uid}
  email, premium (server-only!), autoApplySplit

users/{uid}/buckets/{bucketId}
  name, colorIndex, percent, type: "virtual", remaining, allocated, order?

users/{uid}/transactions/{providerTxnId}
  amount (signed cents, +ve = money IN), description, bookedAt (YYYY-MM-DD),
  bucketId (null until categorized), isIncome, categorizedAt?

users/{uid}/allocations/{autoId}
  bucketId, amount, incomeTxId, createdAt        ← audit trail of every split

users/{uid}/pendingIncome/{incomeTxId}
  amount, description, bookedAt, createdAt, resolved: bool

users/{uid}/incomeSplits/{incomeTxId}            ← idempotency marker
users/{uid}/coachActions/{suggestionId}          ← idempotency marker

users/{uid}/meta/bank
  connectedAt?, lastSyncedAt?, currentBalance?, anchoredAt?

users/{uid}/coachMessages/{autoId}                 (client writes; ordered by createdAt Timestamp)
users/{uid}/coachMemories/{autoId}                 (280-char goals for prompt injection)

categoryRules/{uid}/rules/{normalizedMerchant}
  bucketId                                       ← learned mapping, keyed by merchant

bankConnections/{uid}/items/{itemId}             ← ADMIN-ONLY, holds Plaid access tokens
  accessToken, cursor (nullable), createdAt
```

**Read `firestore.rules` in full — it's only 30 lines but every line matters.** The `premium` diff guard (`.diff(resource.data).affectedKeys().hasAny(['premium'])`) is what prevents a client from self-granting premium on an update.

---

## 7. Local development

```bash
pnpm install
pnpm --filter functions install     # if working on Cloud Functions

# Two terminals:
firebase emulators:start            # auth :9099, firestore :8080, functions :5001, UI on browser
pnpm dev                            # Next.js on :3000
```

Emulator wiring is automatic in dev — `lib/firebase/client.ts:22` and `lib/coach/useCoach.ts:44` both check `NODE_ENV === "development"` and connect to `127.0.0.1`.

Env you need locally (`.env.local`):
- `NEXT_PUBLIC_FIREBASE_*` — Firebase web config
- Stripe test keys for `app/api/billing/*`
Env for Cloud Functions (`functions/.env`):
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`
- `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-2.5-flash`)
- Stripe webhook secret

Tests: `pnpm test` (unit + component in Vitest, jsdom for React).
Lint: `pnpm lint`.
Build: `pnpm build`.

---

## 8. Team-culture rules the code assumes

From the maintainability memory (already active on this project):

1. **Best-practices > "just works".** Pay down design/code debt when you're already in the file. The team has explicitly rejected 4-deferrals-and-a-hack (`#14F195` literals were replaced with `--color-success` / `--color-danger` CSS tokens as an example).
2. **Single source of truth.** `lib/split/engine`, `lib/categorize/rules`, `normalizeMerchant`, `parseCoachReplyStream`, `validateSuggestion`, `DEFAULT_BUCKETS` — all imported by both the client and Cloud Functions. **Never copy logic.** The `defaultBuckets.parity.test.ts` file exists specifically to fail a build if the two copies drift.
3. **Design tokens over hex literals.** See `app/globals.css` — `--color-base`, `--color-card`, `--grad-brand`. Never inline a color.
4. **Money code invariants:** integer cents · idempotent writes with marker docs · **conservation** (Σ allocations == income, Σ remaining == balance after anchor).
5. **TDD + subagent review discipline.** Every non-trivial piece of logic in `lib/` has a colocated `.test.ts`. Look at `docs/superpowers/plans/` — every subsystem shipped through a plan with review checkpoints.

---

## 9. Where to look for what

| I need to… | Start at |
|---|---|
| Add a new callable function | `functions/src/index.ts` → wire from a new file next to `bank.ts` / `coach.ts` |
| Change the split algorithm | `lib/split/engine.ts` — but expect to re-run `engine.test.ts` and every anchoring test |
| Add a new bucket property | `lib/model/types.ts` → seeds (`lib/data/defaultBuckets.ts` + `functions/src/defaultBuckets.ts`, parity test) → UI (BucketRow, BucketSetup) → store writes |
| Add a new bank provider | Implement `BankProvider` (`lib/bank/provider.ts`), mirror `PlaidAdapter` shape, register in `functions/src/bank.ts` behind an env flag |
| Change coach prompt / add a tool | `functions/src/coachContext.ts` (template) + `lib/coach/parseReply.ts` (footer contract) + `lib/coach/suggestion.ts` (validator) |
| Add a new Firestore collection | Add path helper to `lib/model/paths.ts` → rules in `firestore.rules` → hook in `lib/data/` |
| Debug a sync issue | `functions/src/syncCore.ts` — logs every stage counter (rule hits / Gemini hits / no-match) |
| Test money invariants | Add a test to `lib/split/engine.test.ts` or `lib/data/anchor.test.ts` |
| Read prior design decisions | `docs/superpowers/specs/` (what+why) and `docs/superpowers/plans/` (how, task-by-task) — files are dated so the timeline is legible |

---

## 10. Product roadmap markers (from the specs)

Already deferred with hooks in place (do NOT build without a spec):
- **x402 agentic marketplace** — v2 SELL first (metered endpoints wrapping SplitEngine / Categorizer / Coach), v3 BUY (Coach pays external APIs). Keep those three modules as clean server-side functions so wrapping them is a metering layer, not a rewrite.
- **Solana on-chain savings bucket** — the `type: "onchain"` reservation exists on `Bucket`. Adds a settlement step in v2, not a data migration.
- **Native app (Expo)** — deferred; PWA covers install + push.
- **Additional aggregators** — `BankProvider` interface is the only extension point needed.

Current focus (based on recent commits on `master`):
- Coach v3: streaming replies, tx-aware context, "applied" confirmations, `---META---` contract.
- See `docs/superpowers/specs/2026-07-15-coach-v3-design.md` and `docs/superpowers/plans/2026-07-15-coach-v3.md` for the working set.

---

## 11. Failure modes you should already know

1. **Gemini rate-limit during sync.** Free-tier is 5 req/min — that's why categorization is one bulk call, not per-txn. On failure the sync completes with uncategorized spends; user can recategorize by hand and that saves a rule for next time.
2. **Balance drift.** Rounding + out-of-band bank tx + missed sync all cause `Σremaining ≠ balance`. The re-anchor button + `anchoredAt` marker + tx-scoped bucket reads are what keep it recoverable.
3. **Re-sync of resolved pending income.** If Plaid re-delivers the same income after the user confirmed it, `writePendingIncome` must NOT flip `resolved:false`. See the transaction at `store.ts:328` — the read-first pattern is load-bearing.
4. **Coach hallucinates a bucket ID.** Suggestion is dropped server-side in `coach.ts:114`, validated again at apply time in `store.ts:283`. Two guards on purpose — the server-side drop keeps garbage out of Firestore, the apply-time guard catches races.
5. **Client tries to self-grant premium.** Firestore rule at `firestore.rules:15` refuses the update. Stripe webhook (admin SDK) is the only writer.

---

## 12. Your first two weeks (suggested)

**Week 1 — read + run:**
- Skim every file in `lib/model/`, `lib/split/`, `lib/categorize/`, `functions/src/store.ts` — that's the entire money model in maybe 400 lines.
- Read `docs/superpowers/specs/2026-07-12-mybuckets-mvp-design.md` (the origin doc) and the latest `2026-07-15-coach-v3-design.md`.
- Run the emulator, connect a Plaid sandbox account, watch a sync end-to-end. Add a `console.log` in `syncCore.ts` if you want to see the categorization decisions.
- Read `firestore.rules` — 30 lines, the whole security model.

**Week 2 — ship a small vertical:**
- Pick something from an existing plan doc (they're structured, atomic, TDD-friendly).
- Follow the pattern: pure function in `lib/` with `.test.ts` → client hook in `lib/data/` → UI in `app/(app)/` and `components/` → Firestore rule update if new collection → parity test if the same logic runs on both sides.
- Get a review before merging. `docs/superpowers/plans/` shows the shape.

---

## 13. Tiny glossary

- **Anchor** — the operation that REPLACES bucket `remaining` values with `balance × percent` so `Σremaining == balance`. Done on first connect and via the drift-recovery button.
- **Allocation** — a row of "this many cents went from this income into this bucket". Audit trail.
- **Pending income** — a paycheck the bank surfaced but the user hasn't confirmed to split yet.
- **Marker doc** — a Firestore doc whose *existence* is the idempotency check for a money-moving action.
- **---META---** — the delimiter the Coach appends after chat text; JSON footer with `suggestion` and/or `memory`.
- **Rule hit / Gemini hit / no-match** — the three outcomes of `chooseBucket` for a spend. Log-visible per sync.
- **Pre-anchor tx** — a historical tx `bookedAt < anchoredAt`; shown to the coach as context but never draws current buckets.

---

Anything unclear? The single best signal on this codebase: **read the test next to the file you're editing**. If a test doesn't exist, that's the first PR.
