import type { Bucket } from "@/lib/model/types";

// The universal starter set seeded for new users and offered on the Buckets tab.
// Percentages sum to 100. Keep names generic (no lifestyle assumptions).
export const DEFAULT_BUCKETS: Omit<Bucket, "id">[] = [
  { name: "Bills", colorIndex: 0, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Savings", colorIndex: 1, percent: 25, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Fun", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Others", colorIndex: 4, percent: 5, type: "virtual", remaining: 0, allocated: 0 },
];
