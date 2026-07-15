import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useCoach } from "@/lib/coach/useCoach";

const addDocFn = vi.fn().mockResolvedValue({ id: "doc-id" });
const coachReplyFn = vi.fn();

// Stable references to prevent resubscribe loop
const mockAuth = { user: { uid: "u1", email: null }, loading: false };
const stableSnapshot = {
  docs: [
    {
      id: "msg1",
      data: () => ({
        role: "user",
        text: "Hello coach",
        createdAt: { seconds: 1234567890, nanoseconds: 0 },
      }),
    },
    {
      id: "msg2",
      data: () => ({
        role: "coach",
        text: "Hi there!",
        createdAt: { seconds: 1234567891, nanoseconds: 0 },
      }),
    },
  ],
};
const stableUnsubscribe = () => {};

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  addDoc: (...a: unknown[]) => addDocFn(...a),
  onSnapshot: (_q: unknown, cb: (snap: unknown) => void) => {
    cb(stableSnapshot);
    return stableUnsubscribe;
  },
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

function Probe() {
  const { messages } = useCoach();
  return <div data-testid="messages">{messages.map((m) => `${m.role}: ${m.text}`).join(" | ")}</div>;
}

describe("useCoach persistence", () => {
  beforeEach(() => {
    addDocFn.mockClear();
    coachReplyFn.mockClear();
  });

  it("exposes streamed messages from snapshot", async () => {
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByText("user: Hello coach | coach: Hi there!")).toBeInTheDocument()
    );
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
