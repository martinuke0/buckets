import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin SDK
initializeApp();

// Export store functions for testing / future callable functions
export * from "./store";
