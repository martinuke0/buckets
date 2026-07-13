import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin SDK
initializeApp();

// Export store functions for testing / future callable functions
export * from "./store";

// Export callable and scheduled functions
export { createLinkToken, exchangePublicToken, syncTransactions, scheduledSync } from "./bank";
export { coachReply } from "./coach";
