// Functions-local copy of the client default bucket set (lib/data/defaultBuckets.ts).
// Functions compile independently and cannot import client @/ modules; a parity
// test asserts these two arrays stay identical. Percentages sum to 100.
export interface DefaultBucket {
  name: string;
  colorIndex: number;
  percent: number;
  type: "virtual";
  remaining: number;
  allocated: number;
}

export const DEFAULT_BUCKETS: DefaultBucket[] = [
  { name: "Bills", colorIndex: 0, percent: 40, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Savings", colorIndex: 1, percent: 25, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Food", colorIndex: 2, percent: 20, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Fun", colorIndex: 3, percent: 10, type: "virtual", remaining: 0, allocated: 0 },
  { name: "Others", colorIndex: 4, percent: 5, type: "virtual", remaining: 0, allocated: 0 },
];
