import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useCoach } from "@/lib/coach/useCoach";

const addDocFn = vi.fn().mockResolvedValue({ id: "doc-id" });
type CoachReplyResult = { reply: string; suggestion?: unknown; memory?: string };
// The callable resolves directly to { data: CoachReply } — no streaming.
const callableFn = vi.fn(async (_input: unknown) => ({ data: { reply: "hello, there" } as CoachReplyResult }));

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

const setDocFn = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  addDoc: (...a: unknown[]) => addDocFn(...a),
  doc: () => ({}),
  setDoc: (...a: unknown[]) => setDocFn(...a),
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
  httpsCallable: () => callableFn,
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
    callableFn.mockClear();
    callableFn.mockImplementation(async (_input: unknown) => ({ data: { reply: "hello, there" } }));
  });

  it("exposes streamed messages from snapshot", async () => {
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByText("user: Hello coach | coach: Hi there!")).toBeInTheDocument()
    );
  });

  it("writes user message with correct structure", async () => {
    const db = getDb();
    const col = collection(db, coachMessagesCol("test-uid", "conv-1"));

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
    const col = collection(db, coachMessagesCol("test-uid", "conv-1"));

    // Use the REAL CoachSuggestion shape (rebalance) so this test guards the
    // persisted schema, not an arbitrary object the mock would accept anyway.
    const suggestion = {
      type: "rebalance" as const,
      fromBucketId: "fun",
      toBucketId: "savings",
      amount: 4000,
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

describe("useCoach send", () => {
  beforeEach(() => {
    addDocFn.mockClear();
    callableFn.mockClear();
    callableFn.mockImplementation(async (_input: unknown) => ({ data: { reply: "hello, there" } }));
  });

  it("shows the thinking placeholder during the call, then writes one coach doc", async () => {
    function StreamProbe() {
      const hook = useCoach();
      return (
        <div>
          <div data-testid="streaming">{hook.streamingText ?? "null"}</div>
          <button data-testid="send" onClick={() => hook.send("hi")} />
        </div>
      );
    }

    render(<StreamProbe />);

    // Initially null
    expect(screen.getByTestId("streaming")).toHaveTextContent("null");

    // Trigger send
    screen.getByTestId("send").click();

    // Should write user doc first
    await waitFor(() => expect(addDocFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "user", text: "hi" })
    ));

    // After the call resolves, should write coach doc and streamingText returns to null
    await waitFor(() => {
      expect(addDocFn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: "coach", text: "hello, there" })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("streaming")).toHaveTextContent("null");
    });

    // Should have written exactly 2 docs: user + coach
    expect(addDocFn).toHaveBeenCalledTimes(2);
  });

  it("includes suggestion + suggestionId when the reply carries a valid rebalance", async () => {
    callableFn.mockImplementation(async (_input: unknown) => ({
      data: {
        reply: "Move some to savings?",
        suggestion: { type: "rebalance", fromBucketId: "fun", toBucketId: "savings", amount: 4000 },
      },
    }));

    function StreamProbe() {
      const hook = useCoach();
      return (
        <div>
          <button data-testid="send" onClick={() => hook.send("hi")} />
        </div>
      );
    }

    render(<StreamProbe />);
    screen.getByTestId("send").click();

    // Wait for coach doc with suggestion
    await waitFor(() => {
      const calls = addDocFn.mock.calls;
      const coachCall = calls.find((c) => c[1]?.role === "coach");
      return coachCall && coachCall[1].suggestion;
    });

    const coachCall = addDocFn.mock.calls.find((c) => c[1]?.role === "coach");
    expect(coachCall![1]).toMatchObject({
      role: "coach",
      text: "Move some to savings?",
      suggestion: {
        type: "rebalance",
        fromBucketId: "fun",
        toBucketId: "savings",
        amount: 4000,
      },
    });
    expect(coachCall![1].suggestionId).toMatch(/^[a-f0-9-]+$/); // UUID format
  });

  it("excludes suggestion + suggestionId when the reply carries none", async () => {
    callableFn.mockImplementation(async (_input: unknown) => ({ data: { reply: "Just a plain response" } }));

    function StreamProbe() {
      const hook = useCoach();
      return (
        <div>
          <button data-testid="send" onClick={() => hook.send("hi")} />
        </div>
      );
    }

    render(<StreamProbe />);
    screen.getByTestId("send").click();

    // Wait for coach doc
    await waitFor(() => {
      const calls = addDocFn.mock.calls;
      return calls.find((c) => c[1]?.role === "coach");
    });

    const coachCall = addDocFn.mock.calls.find((c) => c[1]?.role === "coach");
    expect(coachCall![1]).toMatchObject({
      role: "coach",
      text: "Just a plain response",
    });
    expect(coachCall![1]).not.toHaveProperty("suggestion");
    expect(coachCall![1]).not.toHaveProperty("suggestionId");
  });

  it("persists citations when the reply carries them", async () => {
    callableFn.mockImplementation(async () => ({
      data: { reply: "You spent €42 at Tesco.", citations: [{ label: "€42 at Tesco", txnId: "tx_abc" }] },
    }));

    function StreamProbe() {
      const hook = useCoach();
      return <button data-testid="send" onClick={() => hook.send("hi")} />;
    }
    render(<StreamProbe />);
    screen.getByTestId("send").click();

    await waitFor(() => {
      const coachCall = addDocFn.mock.calls.find((c) => c[1]?.role === "coach");
      expect(coachCall?.[1]?.citations).toEqual([{ label: "€42 at Tesco", txnId: "tx_abc" }]);
    });
  });
});
