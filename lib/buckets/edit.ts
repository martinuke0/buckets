import type { Bucket } from "../model/types";

export function bucketCapFor(premium: boolean): number {
  return premium ? 15 : 5;
}

export function canAddBucket(buckets: Bucket[], premium: boolean): boolean {
  return buckets.length < bucketCapFor(premium);
}

export function resplitAdjacent(
  buckets: Bucket[],
  leftIndex: number,
  newLeftPercent: number
): Bucket[] {
  const left = buckets[leftIndex];
  const right = buckets[leftIndex + 1];

  if (!left || !right) {
    throw new Error("Invalid indices for resplit");
  }

  const pair = left.percent + right.percent;
  const clampedNewLeft = Math.max(0, Math.min(Math.round(newLeftPercent), pair));
  const newRight = pair - clampedNewLeft;

  return buckets.map((bucket, index) => {
    if (index === leftIndex) {
      return { ...bucket, percent: clampedNewLeft };
    }
    if (index === leftIndex + 1) {
      return { ...bucket, percent: newRight };
    }
    return bucket;
  });
}

// Set one bucket's percent (e.g. from the number input), conserving total=100 by
// re-splitting against a recipient bucket. The recipient is Savings (case-insensitive,
// excluding the edited bucket itself) or the first other bucket — never the edited
// bucket, so total is always preserved. Reuses resplitAdjacent's clamp semantics.
export function setBucketPercent(buckets: Bucket[], bucketId: string, newPercent: number): Bucket[] {
  const editedIndex = buckets.findIndex((b) => b.id === bucketId);
  if (editedIndex === -1) return buckets;

  const recipient =
    buckets.find((b, i) => i !== editedIndex && b.name.toLowerCase() === "savings") ??
    buckets.find((_, i) => i !== editedIndex);
  if (!recipient) return buckets; // only one bucket — nothing to re-split against

  const recipientIndex = buckets.findIndex((b) => b.id === recipient.id);
  // Preserve the edited+recipient pair sum: edited := clamp(round(newPercent), 0, pair);
  // recipient := pair - edited. Total stays 100 because only these two change.
  const pair = buckets[editedIndex].percent + buckets[recipientIndex].percent;
  const editedPercent = Math.max(0, Math.min(Math.round(newPercent), pair));
  const recipientPercent = pair - editedPercent;
  return buckets.map((b, i) => {
    if (i === editedIndex) return { ...b, percent: editedPercent };
    if (i === recipientIndex) return { ...b, percent: recipientPercent };
    return b;
  });
}

export function deleteBucket(buckets: Bucket[], bucketId: string): Bucket[] {
  if (buckets.length === 1) {
    throw new Error("Cannot delete the last remaining bucket");
  }

  const targetBucket = buckets.find((b) => b.id === bucketId);
  if (!targetBucket) {
    throw new Error(`Bucket with id ${bucketId} not found`);
  }

  // Find the Savings bucket (case-insensitive), or fallback to the first remaining bucket
  const savingsCandidate = buckets.find(
    (b) => b.id !== bucketId && b.name.toLowerCase() === "savings"
  );
  const recipientBucket = savingsCandidate || buckets.find((b) => b.id !== bucketId);

  if (!recipientBucket) {
    throw new Error("No recipient bucket found");
  }

  return buckets
    .filter((b) => b.id !== bucketId)
    .map((bucket) => {
      if (bucket.id === recipientBucket.id) {
        return {
          ...bucket,
          percent: bucket.percent + targetBucket.percent,
          remaining: bucket.remaining + targetBucket.remaining,
          allocated: bucket.allocated + targetBucket.allocated,
        };
      }
      return bucket;
    });
}
