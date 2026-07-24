import type { SpendSummary } from "./spendSummary";

export interface CoachTxn {
  description: string;
  amount: number;      // integer cents, signed (spend negative, income positive)
  bookedAt: string;    // ISO date
  bucketId: string | null;
  isIncome: boolean;
  isPreAnchor: boolean;
}

const euros = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

export function buildCoachContext(
  summary: SpendSummary,
  memories: string[],
  contextTxns: CoachTxn[] = [],
  today?: string, // ISO date YYYY-MM-DD — grounds the coach in real time so it doesn't hallucinate "yesterday"
): { prompt: string; bucketIds: string[] } {
  const bucketIds = summary.buckets.map((b) => b.id);
  const nameById = new Map(summary.buckets.map((b) => [b.id, b.name]));

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

  const txnsBlock = contextTxns.length
    ? `\n\nRecent transactions (most recent shown; \`pre\` = pre-anchor / historical):\n${contextTxns
        .map((t) => {
          const bucket = t.bucketId ? (nameById.get(t.bucketId) ?? "Uncategorized") : "Uncategorized";
          const tag = t.isPreAnchor ? " · pre" : "";
          const sign = t.amount < 0 ? "-" : "";
          const absAmount = Math.abs(t.amount);
          return `- ${t.bookedAt} · ${t.description} · ${sign}€${(absAmount / 100).toFixed(2)} · ${bucket}${tag}`;
        })
        .join("\n")}\n\nPre-anchor entries are historical — informational for spending patterns and advice, but they do NOT draw current buckets. Rebalance suggestions must be based on the bucket state above.`
    : "";

  const dateHeader = today ? `Today is ${today}. ` : "";

  const prompt = `You are a financial coach helping a user manage their budget buckets.

${dateHeader}Current month, ${summary.daysLeftInMonth} days left:
${bucketLines}${goalsBlock}${txnsBlock}

Your role:
- Answer conversationally about their budget, grounded in the figures above.
- Flag issues (bucket over its allocation, low remaining, pacing given days left).
- If a concrete rebalance clearly helps (excess bucket -> short bucket, sufficient funds), include a suggestion in the footer (see contract below).
- If the user states a durable goal or preference (e.g. "saving for a car", "eat out less"), record it in the footer's \`memory\` field as a short first-person note. Only set memory when they express a real goal/preference — not for every message.

CRITICAL — you cannot move money yourself:
- The app moves money ONLY when the user clicks the Apply button on a suggestion pill. You have NO other way to move money. Ever.
- NEVER say "I've done it", "transfers are complete", "moved successfully", "processed", or any past-tense claim of action. If the user hasn't clicked Apply, nothing has happened.
- If the user says "yes", "do it", "confirm", etc. and you haven't emitted a suggestion in your PREVIOUS turn, they have nothing to confirm — explain that and emit the suggestion now.
- You can propose only ONE rebalance per turn (one from-bucket, one to-bucket, one amount). If the user asks for multiple transfers (e.g. "move all from A and B to C"), propose the FIRST transfer and tell them you'll queue the next one after they apply this one.

Response fields:
- \`reply\`: plain conversational text (2-3 sentences for simple questions). Never mention buckets by their ID — use their names.
- \`suggestion\`: set ONLY when a concrete rebalance clearly helps (excess bucket -> short bucket, sufficient funds). Use the exact bucket IDs. Amount is integer cents. Leave null otherwise.
- \`memory\`: set ONLY when the user expresses a durable goal/preference — a short first-person note. Leave null otherwise.

Keep replies friendly and concise.`;

  return { prompt, bucketIds };
}
