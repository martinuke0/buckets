import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { PlaidAdapter } from "../../lib/bank/plaidAdapter";
import { saveConnection, listConnectedUsers } from "./store";
import { syncOneUser } from "./syncCore";

// Shared Plaid client factory
function createPlaidAdapter(): PlaidAdapter {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";

  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  const client = new PlaidApi(configuration);
  return new PlaidAdapter(client);
}

/**
 * Callable function: Create a Plaid Link token for the authenticated user.
 * Returns { linkToken: string } for initializing Plaid Link in the UI.
 */
export const createLinkToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const adapter = createPlaidAdapter();
  const linkToken = await adapter.createLinkToken(request.auth.uid);

  return { linkToken };
});

/**
 * Callable function: Exchange a public token for an access token.
 * Saves the connection and immediately syncs transactions for the new account.
 * NEVER returns the access token (security: kept server-side only).
 */
export const exchangePublicToken = onCall<{ publicToken: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { publicToken } = request.data;
    if (!publicToken) {
      throw new HttpsError("invalid-argument", "publicToken is required");
    }

    const adapter = createPlaidAdapter();
    const { accessToken, itemId } = await adapter.exchangePublicToken(publicToken);

    // Save the connection
    await saveConnection(request.auth.uid, itemId, accessToken);

    // Sync immediately so the just-connected account populates
    await syncOneUser(request.auth.uid);

    return { ok: true };
  }
);

/**
 * Callable function: Sync transactions for the authenticated user.
 * This is what the dashboard "Refresh" button calls.
 * Returns { added: number } - count of newly-created transactions.
 */
export const syncTransactions = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  return await syncOneUser(request.auth.uid);
});

/**
 * Scheduled function: Sync transactions for all connected users every 3 hours.
 * ponytail: naive poll-every-user. Upgrade to Plaid SYNC_UPDATES_AVAILABLE webhooks when call volume/cost matters.
 */
export const scheduledSync = onSchedule("every 3 hours", async () => {
  const users = await listConnectedUsers();

  for (const uid of users) {
    try {
      const result = await syncOneUser(uid);
      console.log(`Synced user ${uid}: ${result.added} new transactions`);
    } catch (error) {
      console.error(`Failed to sync user ${uid}:`, error);
      // Continue with next user
    }
  }
});
