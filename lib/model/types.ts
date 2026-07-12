import type { Cents } from "./money";

export type BucketType = "virtual" | "onchain";

export interface Bucket {
  id: string;
  name: string;
  colorIndex: number;
  percent: number;       // 0-100; all buckets for a user sum to 100
  type: BucketType;      // "virtual" in MVP
  remaining: Cents;
  allocated: Cents;
}

export interface Transaction {
  id: string;
  amount: Cents;         // positive = money in, negative = money out
  description: string;
  bookedAt: string;      // ISO date
  bucketId: string | null;
  isIncome: boolean;
}

export interface Allocation {
  id: string;
  bucketId: string;
  amount: Cents;
  incomeTxId: string;
  createdAt: string;
}

export interface Consent {
  id: string;
  provider: string;      // e.g. "gocardless"
  status: "active" | "expired";
  expiresAt: string;     // ISO date — PSD2 ~90 day expiry
}

export interface UserProfile {
  id: string;
  email: string;
  premium: boolean;
  autoApplySplit: boolean;
}
