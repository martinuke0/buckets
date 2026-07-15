import type { SpendSummary } from "./spendSummary";

const euros = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

export function buildCoachContext(
  summary: SpendSummary,
  memories: string[],
): { prompt: string; bucketIds: string[] } {
  const bucketIds = summary.buckets.map((b) => b.id);

  const bucketLines = summary.buckets
    .map((b) => {
      const base = `- ${b.name}: ${euros(b.spentThisMonth)} spent of ${euros(b.allocated)} (${b.pctUsed}%), ${euros(b.remaining)} remaining`;
      const notable = b.notable.length
        ? ` — notable: ${b.notable.map((n) => `${n.description} ${euros(n.amount)}`).join(", ")}`
        : "";
      return base + notable;
    })
    .join("\n");

  const goalsBlock = memories.length
    ? `\n\nThe user's stated goals/notes (remember these):\n${memories.map((m) => `- ${m}`).join("\n")}`
    : "";

  const prompt = `You are a financial coach helping a user manage their budget buckets.

Current month, ${summary.daysLeftInMonth} days left:
${bucketLines}${goalsBlock}

Your role is to:
- Answer conversationally about their budget, grounded in the figures above.
- Flag issues (a bucket over its allocation, low remaining) and pacing given days left.
- If a concrete rebalance clearly helps (excess bucket -> short bucket, sufficient funds), include a suggestion.
- If the user states a durable goal or preference (e.g. "saving for a car", "eat out less"), capture it in the "memory" field as a short first-person note so you can remember it next time. Only set memory when they express a real goal/preference, not for every message.

When suggesting a rebalance:
- Only if the benefit is clear and the source bucket has sufficient funds.
- amount is integer cents. Use the exact bucket IDs provided.

Reply in a friendly, concise tone (2-3 sentences for simple questions).`;

  return { prompt, bucketIds };
}
