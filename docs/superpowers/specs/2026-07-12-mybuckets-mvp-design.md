# MyBuckets AI — MVP Design Spec

_Date: 2026-07-12 · Status: approved_

## Context
An AI-native personal finance app that auto-splits income into envelope-style "buckets"
and shows live remaining balances so users never hit month-end surprises. Goal: a **real,
usable MVP** launched in ~30 days that can acquire paying EU customers. This spec scopes the
originally-broad idea (6 subsystems) down to ONE polished vertical slice — **automatic income
splitting + live bucket balances** — with clean interfaces so deferred features bolt on later.

## Decisions (locked with user)
- **Deliverable:** real usable MVP (correctness + privacy > demo flash).
- **Bank data:** GoCardless Bank Account Data (ex-Nordigen) — free self-serve start, EU coverage,
  pay-per-active-user scaling. Wrapped behind a `BankProvider` interface so TrueLayer / Salt Edge
  can be added later as new adapters with no other code changes.
- **Platform:** PWA now (Next.js/React) — web + installable mobile + web-push. Native (Expo) deferred.
- **AI:** single Gemini + deterministic rules. NO Vertex multi-agent framework. Splitting is
  deterministic arithmetic; Gemini handles categorization, split suggestions, and coaching chat.
- **Backend:** Firebase / GCP (Auth + Firestore + Cloud Functions), EU region.
- **Payments:** Stripe subscription now (free core + premium AI automation). x402 deferred as a hook.
- **Hero loop:** income lands → auto-split → live balances draw down per transaction.
- **Split logic:** user sets % / amounts; Gemini suggests a starting split from history and flags drift.
  AI advises, user controls — Gemini never silently moves real money.

## Scope
**IN:** GoCardless sync behind provider interface · user-% splits w/ Gemini suggestion ·
live bucket balances · Gemini transaction categorization · lightweight coach view ·
Stripe premium subscription · Firebase auth/data · consent-expiry handling.

**DEFERRED (documented hooks only, NOT built):** Vertex multi-agent swarm · x402 micropayments ·
native app · additional aggregators · real-time terminal push notifications ·
**crypto savings bucket** (see below).

### Deferred roadmap: x402 agentic marketplace (post-MVP)
A two-sided agent economy where MyBuckets both **sells** its finance skills to other AI agents and
**buys** external agent services — all settling in **USDC on Solana** (same wallet as the crypto
savings bucket below, so there is ONE wallet story). x402 = HTTP 402 "Payment Required" revived:
agents pay per-request over crypto rails.

- **v2 — SELL first (earn before you spend):** expose existing MyBuckets capabilities
  (`suggest a split`, `analyze this budget`, `categorize these transactions`) as x402-metered
  HTTP endpoints that other agents call and pay per-request via USDC on Solana. Reuses `SplitEngine`,
  `Categorizer`, `Coach` logic already built for the MVP — mostly a metering + settlement wrapper.
- **v3 — BUY later:** MyBuckets' coach pays external agents/APIs per-call via x402 for premium
  enrichment (market data, deals). Completes the marketplace.
- **Cheap MVP hooks (build now, near-zero cost):** keep core capabilities as clean server-side
  functions (not tangled into UI handlers) so v2 can wrap them as metered endpoints without a
  refactor; the deferred Solana wallet doubles as the x402 settlement account.
- **Fully deferred:** x402 facilitator integration, per-request metering/quotas, wallet custody,
  endpoint pricing, and any real settlement.

### Deferred: Solana crypto savings bucket (v2/v3)
A future bucket type that auto-routes a % of income into a **self-custody Solana wallet**
(e.g. stablecoin/SOL savings) via **pay.sh** as the transfer rail — envelope budgeting extended
on-chain. Sits with x402 in the v2/v3 layer, NOT the MVP.
**Cheap MVP hook (build now):** give every bucket a `type`/`destination` field
(`virtual` = tracked, money stays in bank — the only value used in MVP; `onchain` = routes funds out).
`SplitEngine` already only emits allocations and is agnostic to bucket type, so v2 adds an on-chain
*settlement* step, not a rewrite. Fully deferred: wallet key custody, pay.sh integration, on-chain
settlement, volatility/tax disclaimers, and any real fund movement.

## Architecture
```
PWA (Next.js/React, web-push) ──> Firebase Auth
        │
        ▼
Cloud Functions (API) ──> Firestore (users, buckets, transactions, allocations, consents)
        │                        ▲
        ├──> BankProvider iface ──┴── GoCardlessAdapter (poll tx, balances, consent)
        ├──> SplitEngine (deterministic % rules — pure, tested)
        ├──> Gemini (categorize tx · suggest splits · coach chat)
        └──> Stripe (premium subscription + webhook)
```

## Components (each independently testable)
1. **`BankProvider` interface + `GoCardlessAdapter`** — `listAccounts`, `fetchTransactions`,
   `getBalances`, `refreshConsent`. Adding an aggregator = new adapter only.
2. **`SplitEngine`** — pure fn `(income, bucketRules[]) → allocations[]`. Deterministic, unit-tested
   (percentages sum to 100, rounding remainder → configured bucket, zero/negative guards).
3. **`Categorizer`** — Gemini call mapping transaction → bucket using rules/history as context;
   user corrections persist and feed future context.
4. **Balance projection** — Firestore doc structure storing per-bucket `remaining` so balances
   render without scanning all transactions; updated transactionally on each tx/allocation.
   Each bucket carries a `type`/`destination` field (`virtual` in MVP; `onchain` reserved for the
   deferred Solana savings bucket) so v2 adds settlement without a data migration.
5. **Coach** — Gemini chat over current bucket state; read-only advice + shortfall prediction.
6. **Billing** — Stripe Checkout subscription; webhook flips a `premium` flag gating AI automation.

## Hero data flow
Income tx detected → `SplitEngine` allocates per user rules → bucket balances updated →
spend transactions categorized (`Categorizer`) → drawn from matching bucket →
user sees live remaining + in-app alert when a bucket runs low.

## Hard constraints (baked into design)
- **PSD2 consent expires ~90 days** → `consents` store expiry; app prompts re-auth before lapse.
- **Aggregator feeds are not instant** (periodic poll) → near-real-time, not at-terminal;
  messaged honestly in UX. Poll via scheduled Cloud Function.
- **Real money** → SplitEngine + balance math deterministic and tested; Gemini never moves funds.
- **EU data residency** → Firebase EU region (e.g. `europe-west`).
- **Secrets** → GoCardless/Stripe/Gemini keys in server-side config only; never in client bundle.

## UI / UX direction (validated via visual mockups)
- **Aesthetic:** dark crypto-fintech, inspired by Jupiter + Solana. Base `#0E0F13`, cards `#1A1C22`,
  borders `#2A2D35`, text `#E8EAED`/muted `#8A8F98`. Signature **Solana gradient** `#9945FF → #14F195`
  on progress fills and accents; red `#FF8A3D → #FF5E57` for near-empty/over-budget buckets.
- **Bucket cards:** progress-bar cards, rounded (~14px). **No emojis** — bucket identity shown by a
  small **accent-color dot** + plain name (user can color-code). Amount ("€X left") right-aligned,
  colored green normally / red when low.
- **Dashboard = layout A with hero option 4:** a "Safe to spend today" hero card at top —
  dark card with a subtle purple radial corner glow, large amount, an "▲ on track" status chip,
  and a thin month-**pacing bar** (surfaces AI-coach intelligence right in the hero). Bucket cards below.
- **Income split screen (validated):** merge of "flow + confirm" — a gradient "income detected"
  banner, bucket tiles fill in sequence (the pour animation), then it settles into a line-item
  confirm list with % tags, an "▲ on track" note, and **Adjust / Confirm** buttons. If auto-apply
  is on: play pour + "done" toast; if confirm-first: rest on the confirm list.
- **Bucket setup screen (validated):** Gemini proposes a starting split from history, shown as
  **plain slider rows** — one slider per bucket with both € and % labels, "+ Add bucket", and a
  live total. SplitEngine enforces the 100% rule server-side.
- **Screens spec'd in words (not mocked):** onboarding + GoCardless bank-connect consent flow ·
  coach chat view · Stripe billing/paywall · navigation (bottom tab bar: Dashboard · Split/Buckets ·
  Coach · Settings). Follow the same dark/gradient/accent-dot language.
- Mockups persisted in `.superpowers/brainstorm/` for reference during build.

## Critical files (greenfield — to create)
- `lib/bank/provider.ts` — `BankProvider` interface.
- `lib/bank/gocardless.ts` — `GoCardlessAdapter`.
- `lib/split/engine.ts` + `lib/split/engine.test.ts` — deterministic split + tests.
- `lib/ai/categorizer.ts`, `lib/ai/coach.ts` — Gemini calls.
- `functions/` — Cloud Functions: scheduled bank poll, Stripe webhook, API endpoints.
- `firestore.rules` — per-user row security.
- `app/` — Next.js PWA (dashboard w/ live balances, bucket setup, coach view, billing).

## Verification (end-to-end)
1. `SplitEngine` unit tests pass (sum, rounding, edge cases).
2. GoCardless **sandbox**: connect fake bank → pull transactions → see auto-split + live balances draw down.
3. Balance projection: add a spend tx → matching bucket `remaining` decreases correctly.
4. Stripe **test mode**: subscribe → premium AI features unlock; webhook flips flag.
5. Consent-expiry: simulate expired consent → app surfaces re-auth prompt.
