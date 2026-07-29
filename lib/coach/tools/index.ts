import { Type, type FunctionDeclaration } from "@google/genai";
import type { SplitRule } from "@/lib/split/engine";
import { findRecurringCharges } from "./recurring";
import { simulateMonth } from "./simulate";
import { explainDrift } from "./drift";

export interface CoachToolCtx {
  txns: { description: string; amount: number; bookedAt: string; isIncome: boolean }[];
  currentRules: SplitRule[];
  income: number;
  currentBalance: number;
  buckets: { id: string; remaining: number }[];
}

export function runCoachTool(name: string, args: Record<string, unknown>, ctx: CoachToolCtx): unknown {
  switch (name) {
    case "find_recurring_charges":
      return findRecurringCharges(ctx.txns);
    case "simulate_month":
      return simulateMonth(
        ctx.income,
        ctx.currentRules,
        (args.changes as { bucketId: string; percent: number }[]) ?? [],
      );
    case "explain_drift":
      return explainDrift(ctx.currentBalance, ctx.buckets);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

export const coachToolDeclarations: FunctionDeclaration[] = [
  {
    name: "find_recurring_charges",
    description: "List merchants charging the user on a roughly monthly cadence, with the most recent amount (integer cents) and how many times seen. Takes no arguments.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "simulate_month",
    description: "Recompute how this month's income would split across buckets if the given bucket percentages changed. Percentages across all buckets must still total 100.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        changes: {
          type: Type.ARRAY,
          description: "Bucket percentage overrides to apply before splitting.",
          items: {
            type: Type.OBJECT,
            properties: {
              bucketId: { type: Type.STRING },
              percent: { type: Type.NUMBER },
            },
            required: ["bucketId", "percent"],
          },
        },
      },
      required: ["changes"],
    },
  },
  {
    name: "explain_drift",
    description: "Compute the drift between the account's current balance and the sum of all bucket remaining amounts (integer cents, signed). Takes no arguments.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];
