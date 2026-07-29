export interface DriftResult {
  drift: number; // integer cents, signed: currentBalance - sum(remaining)
  byBucket: { bucketId: string; remaining: number }[];
}

export function explainDrift(
  currentBalance: number,
  buckets: { id: string; remaining: number }[],
): DriftResult {
  const sumRemaining = buckets.reduce((t, b) => t + b.remaining, 0);
  return {
    drift: currentBalance - sumRemaining,
    byBucket: buckets.map((b) => ({ bucketId: b.id, remaining: b.remaining })),
  };
}
