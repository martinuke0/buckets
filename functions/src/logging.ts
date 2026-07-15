import { logger } from "firebase-functions/v2";

type Outcome = "start" | "ok" | "error";

function normalizeError(err: unknown): { message: string; code?: string } | undefined {
  if (err === undefined) return undefined;
  const e = err as { message?: unknown; code?: unknown };
  return {
    message: typeof e?.message === "string" ? e.message : String(err),
    ...(typeof e?.code === "string" ? { code: e.code } : {}),
  };
}

export function logEvent(
  action: string,
  fields: { uid?: string; outcome: Outcome; error?: unknown; [k: string]: unknown },
): void {
  const { error, outcome, ...rest } = fields;
  const payload = { action, outcome, ...rest, ...(error !== undefined ? { error: normalizeError(error) } : {}) };
  if (outcome === "error") logger.error(payload);
  else logger.info(payload);
}
