interface Bucket {
  id: string;
  name: string;
  remaining: number;
  allocated: number;
}

interface Transaction {
  description: string;
  amount: number;
  bookedAt: string;
}

export function buildCoachContext(
  buckets: Bucket[],
  recentTxns: Transaction[]
): { prompt: string; bucketIds: string[] } {
  const bucketIds = buckets.map((b) => b.id);

  // Format amounts from cents to euros
  const formatEuros = (cents: number): string => {
    const euros = cents / 100;
    return `€${euros.toFixed(2)}`;
  };

  // Build bucket summary
  const bucketSummary = buckets
    .map((b) => {
      return `- ${b.name}: ${formatEuros(b.remaining)} remaining of ${formatEuros(b.allocated)} allocated`;
    })
    .join("\n");

  // Build transaction summary (limited to most recent)
  const txnSummary =
    recentTxns.length > 0
      ? recentTxns
          .slice(0, 5)
          .map((t) => {
            const sign = t.amount >= 0 ? "+" : "";
            return `- ${t.description} (${sign}${formatEuros(t.amount)}, ${t.bookedAt})`;
          })
          .join("\n")
      : "(No recent transactions)";

  const prompt = `You are a financial coach helping a user manage their budget buckets.

Current bucket state:
${bucketSummary}

Recent transactions:
${txnSummary}

Your role is to:
- Answer the user's questions conversationally about their budget
- Identify potential issues (e.g., buckets running low, overspending patterns)
- If you see a concrete rebalance that would clearly help (e.g., moving money from a bucket with excess to one that's short), include a suggestion in your response

When suggesting a rebalance:
- Only suggest if the benefit is clear and the user has sufficient funds in the source bucket
- The amount should be in cents (integer)
- Use the exact bucket IDs provided

Reply in a friendly, conversational tone. Keep responses concise (2-3 sentences for simple questions).`;

  return { prompt, bucketIds };
}
