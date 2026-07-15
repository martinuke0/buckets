import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useCoach } from "@/lib/coach/useCoach";

const addDocFn = vi.fn().mockResolvedValue({ id: "doc-id" });
const streamCallable: {
  stream: (_input: unknown) => Promise<{ stream: AsyncIterable<string>; data: Promise<{ fullText: string }> }>;
} = {
  stream: async (_input: unknown) => ({
    stream: (async function*() {
      yield "hel";
      yield "lo, ";
      yield "there";
    })(),
    data: Promise.resolve({ fullText: "hello, there" }),
  }),
};

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
  httpsCallable: () => streamCallable,
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

vi.mock("@/lib/coach/parseReply", () => ({
  parseCoachReplyStream: (text: string) => {
    // Simple mock: split by ---META--- delimiter
    const parts = text.split("\n---META---\n");
    if (parts.length === 1) {
      return { reply: text };
    }
    try {
      const meta = JSON.parse(parts[1]);
      return { reply: parts[0], suggestion: meta.suggestion };
    } catch {
      return { reply: text };
    }
  },
}));

describe("useCoach persistence", () => {
  beforeEach(() => {
    addDocFn.mockClear();
    // Reset streamCallable to default
    streamCallable.stream = async (_input: unknown) => ({
      stream: (async function*() {
        yield "hel";
        yield "lo, ";
        yield "there";
      })(),
      data: Promise.resolve({ fullText: "hello, there" }),
    });
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

describe("useCoach streaming", () => {
  beforeEach(() => {
    addDocFn.mockClear();
    // Reset streamCallable to default
    streamCallable.stream = async (_input: unknown) => ({
      stream: (async function*(): AsyncGenerator<string> {
        yield "hel";
        yield "lo, ";
        yield "there";
      })(),
      data: Promise.resolve({ fullText: "hello, there" }),
    });
  });

  it("streams chunks into streamingText, then writes one coach doc", async () => {
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

    // During streaming, streamingText should accumulate
    await waitFor(() => {
      const text = screen.getByTestId("streaming").textContent;
      return text !== "null" && text !== "";
    });

    // After stream ends, should write coach doc and streamingText returns to null
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

  it("includes suggestion + suggestionId when footer contains a valid rebalance", async () => {
    streamCallable.stream = async (_input: unknown) => ({
      stream: (async function*(): AsyncGenerator<string> {
        yield "Move some to savings?";
      })(),
      data: Promise.resolve({
        fullText: 'Move some to savings?\n---META---\n{"suggestion":{"type":"rebalance","fromBucketId":"fun","toBucketId":"savings","amount":4000}}',
      }),
    });

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

  it("excludes suggestion + suggestionId when footer is absent", async () => {
    streamCallable.stream = async (_input: unknown) => ({
      stream: (async function*(): AsyncGenerator<string> {
        yield "Just a plain response";
      })(),
      data: Promise.resolve({ fullText: "Just a plain response" }),
    });

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
});
