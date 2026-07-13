import type { Bucket } from "@/lib/model/types";

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
