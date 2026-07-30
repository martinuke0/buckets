export type CoachSuggestion = {
  type: "rebalance";
  fromBucketId: string;
  toBucketId: string;
  amount: number;
};

export type CoachReply = {
  reply: string;
  suggestion?: CoachSuggestion;
  memory?: string;
  citations?: { label: string; txnId: string }[];
};

export function validateSuggestion(
  s: CoachSuggestion,
  buckets: { id: string; remaining: number }[]
): { ok: true } | { ok: false; reason: string } {
  // Check if amount is positive and an integer
  if (s.amount <= 0) {
    return { ok: false, reason: "Amount must be positive" };
  }
  if (!Number.isInteger(s.amount)) {
    return { ok: false, reason: "Amount must be an integer" };
  }

  // Check if fromBucketId and toBucketId are the same
  if (s.fromBucketId === s.toBucketId) {
    return { ok: false, reason: "Cannot move funds to the same bucket" };
  }

  // Find the buckets
  const fromBucket = buckets.find((b) => b.id === s.fromBucketId);
  const toBucket = buckets.find((b) => b.id === s.toBucketId);

  // Check if both buckets exist
  if (!fromBucket) {
    return { ok: false, reason: `Bucket '${s.fromBucketId}' not found` };
  }
  if (!toBucket) {
    return { ok: false, reason: `Bucket '${s.toBucketId}' not found` };
  }

  // Check if amount exceeds available funds
  if (s.amount > fromBucket.remaining) {
    return { ok: false, reason: "Amount exceeds available funds in source bucket" };
  }

  return { ok: true };
}
