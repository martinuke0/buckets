import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useCoachMemories } from "@/lib/data/coachMemories";

const deleteDocFn = vi.fn().mockResolvedValue(undefined);

// Stable references to prevent resubscribe loop
const mockAuth = { user: { uid: "u1", email: null }, loading: false };
const stableSnapshot = {
  docs: [{ id: "m1", data: () => ({ text: "Saving for a car" }) }],
};
const stableUnsubscribe = () => {};

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => mockAuth }));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  deleteDoc: (...a: unknown[]) => deleteDocFn(...a),
  onSnapshot: (_q: unknown, cb: (snap: unknown) => void) => {
    cb(stableSnapshot);
    return stableUnsubscribe;
  },
}));

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
}));

import { deleteCoachMemory } from "@/lib/data/coachMemories";

function Probe() {
  const { memories, loading } = useCoachMemories();
  if (loading) return <div>loading</div>;
  return <div>{memories.map((m) => m.text).join(",")}</div>;
}

describe("coachMemories", () => {
  it("exposes streamed memories from snapshot", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByText("Saving for a car")).toBeInTheDocument());
  });

  it("deleteCoachMemory calls deleteDoc", async () => {
    await deleteCoachMemory("u1", "m1");
    expect(deleteDocFn).toHaveBeenCalled();
  });
});
