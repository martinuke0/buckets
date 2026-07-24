 🪣  The roast

  You built YNAB, but with a chatbot that's legally not allowed to touch your money.

  The main idea is envelope budgeting. Envelope budgeting was invented by people with literal paper envelopes and a shoebox during the Great Depression. The innovation here is
  that the shoebox now costs €99/year, requires a Plaid connection, and phones Gemini every time you buy a coffee. Your grandmother's system had a100% uptime SLA and never hit
  a rate limit at 5 requests/minute.

  The "AI Coach" is the tell. You spent real engineering effort making sure the LLM can't move money without a deterministic re-check at apply time — server-side validation,
  then a second validation inside the transaction, idempotency markers, the works. Which is correct! But step back: you built an AI whose every suggestion is so untrustworthy it
  needs two independent guards and a one-tap human confirmation. That's not an assistant. That's an intern you've handcuffed to a radiator. The honest version of this feature
  is a button that says "move €50 from Fun to Rent" — no tokens, no streaming, no ---META--- delimiter contract. The Coach's whole job is to generate a suggestion that a pure
  function then decides is valid. You could've skipped the séance.

  ---META---. You are streaming plain text from an LLM and then splitting on a magic string to recover structured data. In 2026. With a model thatdoes native structured output.
  You built a fragile little wire protocol on top of prose and then wrote a shared pure parser imported by both client and server so the fragility is at least consistent on 
  both ends. Beautiful discipline in service of a decision that a responseSchema would have deleted.

  The roadmap is where the plot fully escapes. A personal-finance envelope app has, in its committed specs:
  - an "x402 agentic marketplace" where the Coach pays external APIs (v3),
  - a Solana on-chain savings bucket (type: "onchain" is already reserved on the model — you've allocated a database field to a feature that is pure vibes),
  - metered endpoints so other agents can buy access to your SplitEngine.

  Sir. This is a spreadsheet that divides a paycheck by percentages. The SplitEngine you want to sell as a metered agentic service is largest-remainder rounding — an algorithm
  from apportioning seats in legislatures, ~1792. Nobody is going to pay your Coach to call it over x402. The crypto bucket exists so the pitch deck has a Solana logo on it.

  "EU-first." The one genuinely defensible product decision, and it's phrased like a growth-hack instead of "we did GDPR because we hold bank tokens and had no choice."

  ---
  What's actually good (so this is a roast, not a hit piece)

  - Money is integer cents with conservation invariants and a parity test that fails the build if the two DEFAULT_BUCKETS copies drift. That's more rigor than most fintechs
  ship.
  - bankConnections/** having no rule block at all so clients physically cannot reach Plaid tokens — genuinely the right instinct.
  - Confirm-first income. Not silently deploying someone's salary is a real, humane call.

  The engineering is a 9. The premise is a 4. You've built a beautifully-torqued titanium chassis around a bicycle that competes with a free car (YNAB, Monarch, every neobank's 
  built-in "spaces").