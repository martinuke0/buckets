import { describe, it, expect, vi, beforeEach } from "vitest";

const addDocFn = vi.fn().mockResolvedValue({ id: "doc-id" });
const coachReplyFn = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  addDoc: (...a: unknown[]) => addDocFn(...a),
  onSnapshot: () => () => {},
  query: () => ({}),
  orderBy: () => ({}),
  Timestamp: {
    now: () => ({ seconds: 1234567890, nanoseconds: 0 }),
  },
}));

vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: () => coachReplyFn,
  connectFunctionsEmulator: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
  getFirebaseApp: () => ({}),
}));

import { coachMessagesCol } from "@/lib/model/paths";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";

describe("useCoach persistence", () => {
  beforeEach(() => {
    addDocFn.mockClear();
    coachReplyFn.mockClear();
  });

  it("writes user message with correct structure", async () => {
    const db = getDb();
    const col = collection(db, coachMessagesCol("test-uid"));

    await addDoc(col, {
      role: "user",
      text: "Hello",
      createdAt: Timestamp.now(),
    });

    expect(addDocFn).toHaveBeenCalledWith(expect.anything(), {
      role: "user",
      text: "Hello",
      createdAt: expect.anything(),
    });
  });

  it("writes coach message with suggestionId when suggestion present", async () => {
    const db = getDb();
    const col = collection(db, coachMessagesCol("test-uid"));

    const suggestion = {
      action: "create_bucket" as const,
      params: { name: "Test", goal: 100 },
    };
    const suggestionId = "test-id";

    await addDoc(col, {
      role: "coach",
      text: "I suggest creating a bucket",
      suggestion,
      suggestionId,
      createdAt: Timestamp.now(),
    });

    expect(addDocFn).toHaveBeenCalledWith(expect.anything(), {
      role: "coach",
      text: "I suggest creating a bucket",
      suggestion,
      suggestionId,
      createdAt: expect.anything(),
    });
  });
});
